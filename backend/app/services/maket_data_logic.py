import pandas as pd
import yfinance as yf

YFINANCE_INTERVALS = {
    "H1": "1h",
    "D1": "1d",
}


def resample_to_h4(df: pd.DataFrame) -> pd.DataFrame:
    """Regroupe des bougies H1 en bougies H4."""
    return df.resample("4h").agg(
        {
            "Open": "first",
            "High": "max",
            "Low": "min",
            "Close": "last",
        }
    )


def fetch_ohlc(ticker: str, timeframe: str) -> pd.DataFrame:
    """Récupère les bougies OHLC brutes pour un ticker et un timeframe donnés."""

    data = yf.Ticker(ticker)
    if timeframe == "H4" or timeframe == "h4":
        df = resample_to_h4(data.history(period="60d", interval="1h"))
    else:
        interval = YFINANCE_INTERVALS[timeframe]
        df = data.history(period="60d", interval=interval)
    return df
