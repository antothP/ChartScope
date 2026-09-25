import time

import pandas as pd
import yfinance as yf

YFINANCE_INTERVALS = {
    "H1": "1h",
    "D1": "1d",
}

CACHE_TTL_SECONDS = 300
_cache: dict[tuple[str, str], tuple[float, pd.DataFrame]] = {}


class MarketDataUnavailable(Exception):
    """Yahoo Finance n'a pas renvoyé de données exploitables."""


def _download(ticker: str, interval: str) -> pd.DataFrame:
    try:
        df = yf.Ticker(ticker).history(period="60d", interval=interval)
    except Exception as e:
        raise MarketDataUnavailable(f"Yahoo Finance error for {ticker}: {e}") from e
    if df.empty:
        raise MarketDataUnavailable(f"No data returned by Yahoo Finance for {ticker}")
    return df


def resample_to_h4(df: pd.DataFrame) -> pd.DataFrame:
    """Regroupe des bougies H1 en bougies H4."""
    res_df = df.resample("4h").agg(
        {
            "Open": "first",
            "High": "max",
            "Low": "min",
            "Close": "last",
        }
    )
    return res_df.dropna()

def fetch_ohlc(ticker: str, timeframe: str) -> pd.DataFrame:
    """Récupère les bougies OHLC brutes pour un ticker et un timeframe donnés."""
    key = (ticker, timeframe)
    cached = _cache.get(key)
    if cached and time.monotonic() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    if timeframe == "H4" or timeframe == "h4":
        df = resample_to_h4(_download(ticker, "1h"))
    else:
        df = _download(ticker, YFINANCE_INTERVALS[timeframe])

    _cache[key] = (time.monotonic(), df)
    return df
