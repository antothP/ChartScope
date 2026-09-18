import pandas as pd
from scipy.signal import find_peaks

PROMINENCE_PCT_BY_TIMEFRAME = {
    "H1": 0.001,
    "H4": 0.002,
    "D1": 0.005,
}

def find_extrema(df: pd.DataFrame, timeframe: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    prominence = df["High"].mean() * PROMINENCE_PCT_BY_TIMEFRAME[timeframe]
    peak_idx, _ = find_peaks(df["High"], prominence=prominence)
    trough_idx, _ = find_peaks(-df["Low"], prominence=prominence)
    peaks = df.iloc[peak_idx]
    troughs = df.iloc[trough_idx]
    return peaks, troughs

def has_significant_dip_between(extrema: pd.DataFrame, start, end, reference_price: float, min_depth: float) -> bool:
    between = extrema[(extrema.index > start) & (extrema.index < end)]
    if between.empty:
        return False
    if "Low" in between.columns:
        return (between["Low"] <= reference_price * (1 - min_depth)).any()
    return (between["High"] >= reference_price * (1 + min_depth)).any()


def detect_double_extrema(
    peaks: pd.DataFrame,
    troughs: pd.DataFrame,
    tolerance: float = 0.02,
    min_depth: float = 0.01,
) -> tuple[pd.DataFrame, pd.DataFrame]:

    double_tops = []
    double_bottoms = []
    i = 0
    j = 0

    while i < len(peaks) - 1:
        p1, p2 = peaks.iloc[i], peaks.iloc[i + 1]
        gap_top = abs(p1["High"] - p2["High"]) / p1["High"]
        reference = min(p1["High"], p2["High"])
        has_neckline = has_significant_dip_between(troughs, p1.name, p2.name, reference, min_depth)
        if gap_top <= tolerance and has_neckline:
            double_tops.append(p1)
            double_tops.append(p2)
            i += 2
        else:
            i += 1
    while j < len(troughs) - 1:
        t1, t2 = troughs.iloc[j], troughs.iloc[j + 1]
        gap_trough = abs(t1["Low"] - t2["Low"]) / t1["Low"]
        reference = max(t1["Low"], t2["Low"])
        has_neckline = has_significant_dip_between(peaks, t1.name, t2.name, reference, min_depth)
        if gap_trough <= tolerance and has_neckline:
            double_bottoms.append(t1)
            double_bottoms.append(t2)
            j += 2
        else:
            j += 1
    return pd.DataFrame(double_tops), pd.DataFrame(double_bottoms)
