import pandas as pd
from fastapi import APIRouter, HTTPException

from app.core.config import SYMBOLS, TIMEFRAMES
from app.schemas import Pattern, PatternKeyPoint, PatternsResponse
from app.services.detect_chart import detect_head_and_shoulders, extreme_between, find_breakout, is_invalidated
from app.services.extremas import detect_double_extrema, find_extrema, mean_candle_range
from app.services.maket_data_logic import fetch_ohlc

router = APIRouter(tags=["patterns"])

# seule une figure récente est exploitable. Fenêtre en durée et non en bougies : le forex cote 24h/24,
# 50 bougies H1 n'y couvraient que 2 jours contre 7 pour le DAX
RECENT_WINDOW = {
    "H1": pd.Timedelta(days=7),
    "H4": pd.Timedelta(days=21),
    "D1": pd.Timedelta(days=70),
}


def _double_tops_to_patterns(df: pd.DataFrame, double_tops: pd.DataFrame, troughs: pd.DataFrame) -> list[Pattern]:
    patterns = []
    for i in range(0, len(double_tops), 2):
        p1, p2 = double_tops.iloc[i], double_tops.iloc[i + 1]
        neckline = extreme_between(troughs, p1.name, p2.name, "Low", lowest=True)
        neckline_ts, neckline_price = neckline
        breakout = find_breakout(df, p2.name, neckline, neckline, "down")
        if is_invalidated(df, p2.name, max(p1["High"], p2["High"]), "down", breakout):
            continue
        height = p1["High"] - neckline_price

        patterns.append(
            Pattern(
                type="double_top",
                confirmed=breakout is not None,
                breakout_timestamp=breakout.isoformat() if breakout is not None else None,
                key_points=[
                    PatternKeyPoint(timestamp=p1.name.isoformat(), price=p1["High"], role="first_top"),
                    PatternKeyPoint(timestamp=neckline_ts.isoformat(), price=neckline_price, role="neckline"),
                    PatternKeyPoint(timestamp=p2.name.isoformat(), price=p2["High"], role="second_top"),
                ],
                bias="bearish",
                target_price=neckline_price - height,
            )
        )
    return patterns


def _double_bottoms_to_patterns(df: pd.DataFrame, double_bottoms: pd.DataFrame, peaks: pd.DataFrame) -> list[Pattern]:
    patterns = []
    for i in range(0, len(double_bottoms), 2):
        t1, t2 = double_bottoms.iloc[i], double_bottoms.iloc[i + 1]
        neckline = extreme_between(peaks, t1.name, t2.name, "High", lowest=False)
        neckline_ts, neckline_price = neckline
        breakout = find_breakout(df, t2.name, neckline, neckline, "up")
        if is_invalidated(df, t2.name, min(t1["Low"], t2["Low"]), "up", breakout):
            continue
        height = neckline_price - t1["Low"]

        patterns.append(
            Pattern(
                type="double_bottom",
                confirmed=breakout is not None,
                breakout_timestamp=breakout.isoformat() if breakout is not None else None,
                key_points=[
                    PatternKeyPoint(timestamp=t1.name.isoformat(), price=t1["Low"], role="first_bottom"),
                    PatternKeyPoint(timestamp=neckline_ts.isoformat(), price=neckline_price, role="neckline"),
                    PatternKeyPoint(timestamp=t2.name.isoformat(), price=t2["Low"], role="second_bottom"),
                ],
                bias="bullish",
                target_price=neckline_price + height,
            )
        )
    return patterns


def _span(p: Pattern) -> tuple[pd.Timestamp, pd.Timestamp]:
    return pd.Timestamp(p.key_points[0].timestamp), pd.Timestamp(p.key_points[-1].timestamp)


def _last_event(p: Pattern) -> pd.Timestamp:
    """Ce qui date une figure : sa cassure si elle est confirmée, sinon son dernier point."""
    return pd.Timestamp(p.breakout_timestamp) if p.breakout_timestamp else _span(p)[1]


def _keep_most_recent(patterns: list[Pattern]) -> list[Pattern]:
    """Des figures qui se chevauchent sont deux lectures du même mouvement (double creux + double sommet
    d'un range, creux de la ligne de cou d'un ETE...) : on garde la plus récente, la plus complète si égalité."""
    kept: list[Pattern] = []
    for p in sorted(patterns, key=lambda p: (_last_event(p), len(p.key_points)), reverse=True):
        start, end = _span(p)
        if all(end < k_start or start > k_end for k_start, k_end in map(_span, kept)):
            kept.append(p)
    return kept


@router.get("/patterns/{symbol}", response_model=PatternsResponse)
def get_patterns(symbol: str, timeframe: str = "H1") -> PatternsResponse:
    if symbol not in SYMBOLS:
        raise HTTPException(status_code=404, detail=f"Unknown symbol '{symbol}'")
    if timeframe not in TIMEFRAMES:
        raise HTTPException(status_code=400, detail=f"Unsupported timeframe '{timeframe}'")

    ticker = SYMBOLS[symbol]
    df = fetch_ohlc(ticker, timeframe)
    peaks, troughs = find_extrema(df)
    volatility = mean_candle_range(df)
    double_tops, double_bottoms = detect_double_extrema(df, peaks, troughs, volatility)

    head_and_shoulders = [Pattern(**p) for p in detect_head_and_shoulders(df, peaks, troughs, volatility)]
    doubles = _double_tops_to_patterns(df, double_tops, troughs) + _double_bottoms_to_patterns(df, double_bottoms, peaks)

    cutoff = df.index[-1] - RECENT_WINDOW[timeframe]
    recent = [p for p in doubles + head_and_shoulders if _last_event(p) >= cutoff]
    # le frontend affiche soit les figures en cours, soit les confirmées : chevauchements résolus dans chaque groupe
    patterns = sorted(
        _keep_most_recent([p for p in recent if p.confirmed]) + _keep_most_recent([p for p in recent if not p.confirmed]),
        key=_last_event,
    )

    return PatternsResponse(symbol=symbol, timeframe=timeframe, patterns=patterns)
