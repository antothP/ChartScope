import pandas as pd
import yfinance as yf

YFINANCE_INTERVALS = {
    "H1": "1h",
    "D1": "1d",
}


def fetch_ohlc(ticker: str, timeframe: str) -> pd.DataFrame:
    """Récupère les bougies OHLC brutes pour un ticker et un timeframe donnés."""
    interval = YFINANCE_INTERVALS[timeframe]

    data = yf.Ticker(ticker)
    df = data.history(period="60d", interval=interval)

    return df
