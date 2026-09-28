export type Timeframe = 'H1' | 'H4' | 'D1'

export const TIMEFRAMES: Timeframe[] = ['H1', 'H4', 'D1']

const SYMBOL_NAMES: Record<string, string> = {
  DAX: 'DAX 40',
  EURUSD: 'EUR/USD',
  CAC40: 'CAC 40',
  SP500: 'S&P 500',
}

// nom affiché à l'utilisateur ; le code (DAX, EURUSD…) reste celui de l'API
export const symbolName = (code: string) => SYMBOL_NAMES[code] ?? code

export interface SymbolInfo {
  code: string
  ticker: string
}

export interface Candle {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  // 0 quand Yahoo ne fournit pas de volume (forex, indices en intraday)
  volume: number
}

export interface PricesResponse {
  symbol: string
  timeframe: Timeframe
  candles: Candle[]
}

export interface PatternKeyPoint {
  timestamp: string
  price: number
  role: string
}

export interface Pattern {
  type: string
  confirmed: boolean
  // bougie qui a cassé la ligne de cou, null si la figure est encore en cours
  breakout_timestamp: string | null
  key_points: PatternKeyPoint[]
  bias: string
  target_price: number
}

export interface PatternsResponse {
  symbol: string
  timeframe: Timeframe
  patterns: Pattern[]
}

// passe par le proxy Vite (/api -> http://localhost:8000)
const BACKEND_DOWN = 'Serveur injoignable (le backend FastAPI est-il lancé ?)'

async function getJson<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`)
  } catch {
    throw new Error(BACKEND_DOWN)
  }
  if (!res.ok) {
    // le backend répond 503 quand Yahoo Finance ne renvoie rien : message en français pour l'interface
    if (res.status === 503) throw new Error('Données de marché momentanément indisponibles. Réessayez dans un instant.')
    const body = await res.json().catch(() => null)
    if (body?.detail) throw new Error(body.detail)
    // backend arrêté : le proxy Vite répond 500 sans corps JSON
    throw new Error(res.status >= 500 ? BACKEND_DOWN : `Erreur HTTP ${res.status}`)
  }
  return res.json()
}

export const fetchSymbols = () => getJson<SymbolInfo[]>('/symbols')

export const fetchPrices = (symbol: string, timeframe: Timeframe) =>
  getJson<PricesResponse>(`/prices/${symbol}?timeframe=${timeframe}`)

export const fetchPatterns = (symbol: string, timeframe: Timeframe) =>
  getJson<PatternsResponse>(`/patterns/${symbol}?timeframe=${timeframe}`)
