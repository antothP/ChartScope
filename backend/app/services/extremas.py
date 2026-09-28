import pandas as pd
from scipy.signal import find_peaks

from app.services.detect_chart import extreme_between, has_prior_trend

# un pivot doit dominer son voisinage d'au moins N tailles moyennes de bougie, sinon c'est du bruit
PROMINENCE_CANDLES = 2.0


def find_extrema(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    # en tailles de bougie : s'adapte seul à l'actif et à l'UT (un % fixe donnait 0,35 bougie en H1)
    prominence = PROMINENCE_CANDLES * (df["High"] - df["Low"]).mean()
    peak_idx, _ = find_peaks(df["High"], prominence=prominence)
    trough_idx, _ = find_peaks(-df["Low"], prominence=prominence)
    peaks = df.iloc[peak_idx]
    troughs = df.iloc[trough_idx]
    return peaks, troughs

def mean_candle_range(df: pd.DataFrame) -> float:
    """Taille moyenne d'une bougie en fraction du prix : la volatilité propre à l'actif et à l'UT."""
    return float(((df["High"] - df["Low"]) / df["Close"]).mean())


def _is_double(first: float, second: float, neckline: float, volatility: float, min_depth_k: float, max_asymmetry: float) -> bool:
    heights = abs(first - neckline), abs(second - neckline)
    # la ligne de cou doit être assez loin des deux sommets, en multiple de la taille d'une bougie
    deep_enough = min(heights) / neckline >= min_depth_k * volatility
    # les deux sommets doivent être au même niveau à l'échelle de la figure
    symmetric = abs(first - second) <= max_asymmetry * max(heights)
    return deep_enough and symmetric


def _detect_doubles(
    df: pd.DataFrame,
    pivots: pd.DataFrame,
    opposite: pd.DataFrame,
    column: str,
    opp_column: str,
    lowest_neck: bool,
    volatility: float,
    min_depth_k: float,
    max_asymmetry: float,
) -> pd.DataFrame:
    found = []
    # on part des pivots les plus récents : si des paires se chevauchent (triple sommet), la plus récente prime
    i = len(pivots) - 2
    while i >= 0:
        a, b = pivots.iloc[i], pivots.iloc[i + 1]
        neck = extreme_between(opposite, a.name, b.name, opp_column, lowest=lowest_neck)
        if (
            neck
            and _is_double(a[column], b[column], neck[1], volatility, min_depth_k, max_asymmetry)
            # double sommet : la hausse qui y mène part d'en dessous de la ligne de cou (et inversement)
            and has_prior_trend(df, opposite, a.name, neck[1], lowest_neck, volatility)
        ):
            found += [a, b]
            i -= 2
        else:
            i -= 1
    return pd.DataFrame(found)


def detect_double_extrema(
    df: pd.DataFrame,
    peaks: pd.DataFrame,
    troughs: pd.DataFrame,
    volatility: float,
    min_depth_k: float = 3.0,
    max_asymmetry: float = 0.3,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """(double tops, double bottoms), chacun sous forme de paires de lignes consécutives."""
    double_tops = _detect_doubles(df, peaks, troughs, "High", "Low", True, volatility, min_depth_k, max_asymmetry)
    double_bottoms = _detect_doubles(df, troughs, peaks, "Low", "High", False, volatility, min_depth_k, max_asymmetry)
    return double_tops, double_bottoms
