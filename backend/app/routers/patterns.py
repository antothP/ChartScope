import pandas as pd
from fastapi import APIRouter, HTTPException

from app.core.config import SYMBOLS, TIMEFRAMES
from app.schemas import Pattern, PatternKeyPoint, PatternsResponse
from app.services.detect_chart import detect_head_and_shoulders, extreme_between, find_breakout
from app.services.extremas import detect_double_extrema, find_extrema
from app.services.maket_data_logic import fetch_ohlc

router = APIRouter(tags=["patterns"])


def _double_tops_to_patterns(df: pd.DataFrame, double_tops: pd.DataFrame, troughs: pd.DataFrame) -> list[Pattern]:
    patterns = []
    for i in range(0, len(double_tops), 2):
        p1, p2 = double_tops.iloc[i], double_tops.iloc[i + 1]
        neckline = extreme_between(troughs, p1.name, p2.name, "Low", lowest=True)
        neckline_ts, neckline_price = neckline
        breakout = find_breakout(df, p2.name, neckline, neckline, "down")
        height = p1["High"] - neckline_price

        patterns.append(
            Pattern(
                type="double_top",
                confirmed=breakout is not None,
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
        height = neckline_price - t1["Low"]

        patterns.append(
            Pattern(
                type="double_bottom",
                confirmed=breakout is not None,
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

    patterns = (
        _double_tops_to_patterns(df, double_tops, troughs)
        + _double_bottoms_to_patterns(df, double_bottoms, peaks)
        + [Pattern(**p) for p in detect_head_and_shoulders(df, peaks, troughs)]
    )

    return PatternsResponse(symbol=symbol, timeframe=timeframe, patterns=patterns)
