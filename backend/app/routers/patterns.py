from fastapi import APIRouter, HTTPException

from app.core.config import SYMBOLS, TIMEFRAMES
from app.schemas import PatternsResponse

router = APIRouter(tags=["patterns"])


@router.get("/patterns/{symbol}", response_model=PatternsResponse)
def get_patterns(symbol: str, timeframe: str = "H1") -> PatternsResponse:
    if symbol not in SYMBOLS:
        raise HTTPException(status_code=404, detail=f"Unknown symbol '{symbol}'")
    if timeframe not in TIMEFRAMES:
        raise HTTPException(status_code=400, detail=f"Unsupported timeframe '{timeframe}'")

    raise HTTPException(status_code=501, detail="Pattern detection not implemented yet")
