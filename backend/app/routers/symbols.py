from fastapi import APIRouter

from app.core.config import SYMBOLS
from app.schemas import SymbolInfo

router = APIRouter(tags=["symbols"])


@router.get("/symbols", response_model=list[SymbolInfo])
def get_symbols() -> list[SymbolInfo]:
    return [SymbolInfo(code=code, ticker=ticker) for code, ticker in SYMBOLS.items()]
