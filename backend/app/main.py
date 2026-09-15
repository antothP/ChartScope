from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import patterns, prices, symbols

app = FastAPI(title="ChartScope API")

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
