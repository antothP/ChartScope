import { useEffect, useState } from 'react'
import type { Candle } from '@/api'

const DAY = 86_400_000

const RANGES = [
  { id: '1J', days: 1 },
  { id: '5J', days: 5 },
  { id: '1M', days: 30 },
  { id: '3M', days: 91 },
  { id: '6M', days: 182 },
  { id: '1A', days: 365 },
  { id: 'Tout', days: null },
] as const

// une plage n'a de sens que si les données la couvrent et qu'elle contient assez de bougies
function available(candles: Candle[], days: number | null) {
  if (days === null) return candles.length > 0
  if (candles.length === 0) return false
  const last = Date.parse(candles[candles.length - 1].timestamp)
  const covered = last - Date.parse(candles[0].timestamp) >= days * DAY * 0.9
  const inRange = candles.filter((c) => Date.parse(c.timestamp) >= last - days * DAY).length
  return covered && inRange >= 5
}

interface Props {
  candles: Candle[]
  onRange: (days: number | null) => void
}

export function RangeBar({ candles, onRange }: Props) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-border px-2">
      <div className="flex items-center" role="group" aria-label="Période affichée">
        {RANGES.map((r) => {
          const ok = available(candles, r.days)
          return (
            <button
              key={r.id}
              type="button"
              disabled={!ok}
              onClick={() => onRange(r.days)}
              title={ok ? undefined : 'Pas assez d’historique chargé pour cette période'}
              className="h-7 rounded px-2 text-sm text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:text-muted-foreground/40"
            >
              {r.id}
            </button>
          )
        })}
      </div>
      <Clock />
    </div>
  )
}

// heure locale et décalage UTC, comme l'horloge en bas à droite de TradingView
function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const offset = -now.getTimezoneOffset() / 60
  return (
    <span className="text-sm tabular-nums text-foreground" title="Heure locale : les dates du graphique sont dans ce fuseau">
      {now.toLocaleTimeString('fr-FR')} <span className="text-muted-foreground">UTC{offset >= 0 ? '+' : '−'}{Math.abs(offset)}</span>
    </span>
  )
}
