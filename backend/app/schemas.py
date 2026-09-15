from pydantic import BaseModel


class SymbolInfo(BaseModel):
    code: str
    ticker: str


class Candle(BaseModel):
    timestamp: str
    open: float
    high: float
    low: float
    close: float


class PricesResponse(BaseModel):
    symbol: str
    timeframe: str
    candles: list[Candle]


class PatternKeyPoint(BaseModel):
    timestamp: str
    price: float
    role: str


class Pattern(BaseModel):
    type: str
    confirmed: bool
    key_points: list[PatternKeyPoint]
    bias: str
    target_price: float


class PatternsResponse(BaseModel):
    symbol: str
    timeframe: str
    patterns: list[Pattern]
