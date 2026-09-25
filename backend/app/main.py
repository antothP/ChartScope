import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routers import patterns, prices, symbols
from app.services.maket_data_logic import MarketDataUnavailable

logger = logging.getLogger(__name__)

app = FastAPI(title="ChartScope API")


@app.exception_handler(MarketDataUnavailable)
def market_data_unavailable_handler(request: Request, exc: MarketDataUnavailable) -> JSONResponse:
    logger.warning("Market data unavailable: %s", exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "Market data temporarily unavailable, please retry in a moment"},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(symbols.router)
app.include_router(prices.router)
app.include_router(patterns.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
