import pandas as pd
from fastapi import APIRouter, HTTPException

from app.core.config import SYMBOLS, TIMEFRAMES
from app.schemas import Pattern, PatternKeyPoint, PatternsResponse
from app.services.extremas import detect_double_extrema, find_extrema
from app.services.maket_data_logic import fetch_ohlc

router = APIRouter(tags=["patterns"])


def _neckline_between(extrema: pd.DataFrame, start, end) -> tuple:
    """Retourne (timestamp, prix) du creux (ou sommet) le plus marqué entre deux dates."""
    between = extrema[(extrema.index > start) & (extrema.index < end)]
    if "Low" in between.columns:
        row = between.loc[between["Low"].idxmin()]
        return row.name, row["Low"]
    row = between.loc[between["High"].idxmax()]
    return row.name, row["High"]


def _double_tops_to_patterns(double_tops: pd.DataFrame, troughs: pd.DataFrame) -> list[Pattern]:
    patterns = []
    for i in range(0, len(double_tops), 2):
        p1, p2 = double_tops.iloc[i], double_tops.iloc[i + 1]
        neckline_ts, neckline_price = _neckline_between(troughs, p1.name, p2.name)
        height = p1["High"] - neckline_price
        target_price = p2["High"] - height

        patterns.append(
            Pattern(
                type="double_top",
                confirmed=False,
                key_points=[
                    PatternKeyPoint(timestamp=p1.name.isoformat(), price=p1["High"], role="first_top"),
                    PatternKeyPoint(timestamp=neckline_ts.isoformat(), price=neckline_price, role="neckline"),
                    PatternKeyPoint(timestamp=p2.name.isoformat(), price=p2["High"], role="second_top"),
                ],
                bias="bearish",
                target_price=target_price,
            )
        )
    return patterns


def _double_bottoms_to_patterns(double_bottoms: pd.DataFrame, peaks: pd.DataFrame) -> list[Pattern]:
    patterns = []
    for i in range(0, len(double_bottoms), 2):
        t1, t2 = double_bottoms.iloc[i], double_bottoms.iloc[i + 1]
        neckline_ts, neckline_price = _neckline_between(peaks, t1.name, t2.name)
        height = neckline_price - t1["Low"]
        target_price = t2["Low"] + height

        patterns.append(
            Pattern(
                type="double_bottom",
                confirmed=False,
                key_points=[
                    PatternKeyPoint(timestamp=t1.name.isoformat(), price=t1["Low"], role="first_bottom"),
                    PatternKeyPoint(timestamp=neckline_ts.isoformat(), price=neckline_price, role="neckline"),
                    PatternKeyPoint(timestamp=t2.name.isoformat(), price=t2["Low"], role="second_bottom"),
                ],
                bias="bullish",
                target_price=target_price,
            )
        )
    return patterns


@router.get("/patterns/{symbol}", response_model=PatternsResponse)
def get_patterns(symbol: str, timeframe: str = "H1") -> PatternsResponse:
    if symbol not in SYMBOLS:
        raise HTTPException(status_code=404, detail=f"Unknown symbol '{symbol}'")
    if timeframe not in TIMEFRAMES:
        raise HTTPException(status_code=400, detail=f"Unsupported timeframe '{timeframe}'")

    ticker = SYMBOLS[symbol]
    df = fetch_ohlc(ticker, timeframe)
    peaks, troughs = find_extrema(df, timeframe)
    double_tops, double_bottoms = detect_double_extrema(peaks, troughs)

    patterns = _double_tops_to_patterns(double_tops, troughs) + _double_bottoms_to_patterns(double_bottoms, peaks)

    return PatternsResponse(symbol=symbol, timeframe=timeframe, patterns=patterns)
