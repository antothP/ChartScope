from fastapi import APIRouter, HTTPException

from app.core.config import SYMBOLS, TIMEFRAMES
from app.schemas import PricesResponse
from app.services import fetch_price_data
from app.schemas import Candle

router = APIRouter(tags=["prices"])


@router.get("/prices/{symbol}", response_model=PricesResponse)
def get_prices(symbol: str, timeframe: str = "H1") -> PricesResponse:
    if symbol not in SYMBOLS:
        raise HTTPException(status_code=404, detail=f"Unknown symbol '{symbol}'")
    if timeframe not in TIMEFRAMES:
        raise HTTPException(status_code=400, detail=f"Unsupported timeframe '{timeframe}'")

    ticker = TIMEFRAMES[timeframe]
    data_fetched = fetch_price_data(symbol, ticker)
    candles = [
        Candle(
            timestamp=i.isoformat(),
            open=row["Open"],
            high=row["High"],
            low=row["Low"],
            close=row["Close"],
        )
        for i, row in data_fetched.iterrows()
    ]
    raise HTTPException(status_code=501, detail="Price fetching not implemented yet")
