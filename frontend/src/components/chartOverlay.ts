import type { LineData, SeriesMarker, UTCTimestamp } from 'lightweight-charts'
import type { Candle, Pattern, PatternKeyPoint } from '../api'
import { formatPrice } from '@/lib/format'
import type { HighlightBox } from './patternHighlights'

// nombre de bougies vides laissées à droite de la dernière
// (assez large pour loger la flèche de prévision et son objectif à droite de la dernière bougie)
export const RIGHT_OFFSET = 14

// couleurs vives sur fond sombre, distinctes du vert/rouge des bougies et du bleu de l'interface
export const BIAS_COLORS: Record<string, string> = {
  bearish: '#ff2ec4',
  bullish: '#00d2ff',
}

export const PATTERN_NAMES: Record<string, string> = {
  double_top: 'Double sommet',
  double_bottom: 'Double creux',
  head_and_shoulders: 'Épaule-Tête-Épaule',
  inverse_head_and_shoulders: 'Épaule-Tête-Épaule inversée',
}

export const BIAS_LABELS: Record<string, string> = {
  bearish: 'baissier ↘',
  bullish: 'haussier ↗',
}

export const patternLabel = (p: Pattern) =>
  `${PATTERN_NAMES[p.type] ?? p.type} · ${BIAS_LABELS[p.bias] ?? p.bias} · ${p.confirmed ? 'confirmée' : 'en cours'}`

const ROLE_LABELS: Record<string, string> = {
  first_top: 'Sommet 1',
  second_top: 'Sommet 2',
  first_bottom: 'Creux 1',
  second_bottom: 'Creux 2',
  left_shoulder: 'Épaule G',
  head: 'Tête',
  right_shoulder: 'Épaule D',
}

export interface PatternOverlay {
  color: string
  outline: LineData[]
  neckline: LineData[]
}

export const toTime = (iso: string) => (Date.parse(iso) / 1000) as UTCTimestamp

const isNeckline = (kp: PatternKeyPoint) => kp.role.startsWith('neckline')

function necklineLine(pattern: Pattern, candles: Candle[]): LineData[] {
  const necks = pattern.key_points.filter(isNeckline)
  const index = (ts: string) => candles.findIndex((c) => c.timestamp === ts)
  // jusqu'à la cassure si confirmée ; sinon jusqu'à la dernière bougie, où démarre la flèche de prévision.
  // Sans risque d'écraser l'échelle : une figure en cours est récente et sa ligne de cou peu penchée
  const end = pattern.breakout_timestamp ? index(pattern.breakout_timestamp) : candles.length - 1
  const endTime = toTime(candles[end].timestamp)

  // double : ligne horizontale depuis le 1er sommet
  if (necks.length === 1) {
    const price = necks[0].price
    return [
      { time: toTime(pattern.key_points[0].timestamp), value: price },
      { time: endTime, value: price },
    ]
  }

  // ETE : droite passant par les deux points de cou, prolongée en nombre de bougies (comme côté backend)
  const [a, b] = necks
  const ia = index(a.timestamp)
  const ib = index(b.timestamp)
  const slope = (b.price - a.price) / (ib - ia)
  return [
    { time: toTime(a.timestamp), value: a.price },
    { time: toTime(b.timestamp), value: b.price },
    { time: endTime, value: a.price + slope * (end - ia) },
  ]
}

export function buildOverlays(patterns: Pattern[], candles: Candle[]): PatternOverlay[] {
  if (candles.length === 0) return []
  return patterns.map((p) => ({
    color: BIAS_COLORS[p.bias],
    outline: p.key_points.map((kp) => ({ time: toTime(kp.timestamp), value: kp.price })),
    neckline: necklineLine(p, candles),
  }))
}

// cadre englobant tous les points clés (ligne de cou comprise), avec une petite marge verticale
// niveau de la ligne de cou à la dernière bougie (point de départ de la flèche de prévision)
function neckEnd(p: Pattern, candles: Candle[]) {
  const line = necklineLine(p, candles)
  return line[line.length - 1].value
}

export function buildBoxes(patterns: Pattern[], candles: Candle[]): HighlightBox[] {
  return patterns.map((p) => {
    const prices = p.key_points.map((kp) => kp.price)
    const top = Math.max(...prices)
    const bottom = Math.min(...prices)
    const margin = (top - bottom) * 0.08
    return {
      from: toTime(p.key_points[0].timestamp),
      to: toTime(p.key_points[p.key_points.length - 1].timestamp),
      top: top + margin,
      bottom: bottom - margin,
      color: BIAS_COLORS[p.bias],
      label: patternLabel(p),
      labelBelow: p.bias === 'bullish',
      // figure en cours : flèche du bout de la ligne de cou (à droite de la dernière bougie) jusqu'à l'objectif
      forecast:
        !p.confirmed && candles.length > 0
          ? {
              time: toTime(candles[candles.length - 1].timestamp),
              from: neckEnd(p, candles),
              to: p.target_price,
              label: `Objectif ${formatPrice(p.target_price)}`,
            }
          : null,
    }
  })
}

// plage (en index de bougie) qui cadre toutes les figures, avec de la marge de chaque côté
export function focusRange(patterns: Pattern[], candles: Candle[]): { from: number; to: number } | null {
  if (patterns.length === 0 || candles.length === 0) return null
  const lastIndex = candles.length - 1
  const indexOf = new Map(candles.map((c, i) => [c.timestamp, i]))
  const first = Math.min(...patterns.map((p) => indexOf.get(p.key_points[0].timestamp) ?? lastIndex))
  const padding = Math.max(15, Math.round((lastIndex - first) * 0.6))
  return { from: first - padding, to: lastIndex + RIGHT_OFFSET }
}

export function buildMarkers(patterns: Pattern[]): SeriesMarker<UTCTimestamp>[] {
  const markers = patterns.flatMap((p) =>
    p.key_points
      .filter((kp) => !isNeckline(kp))
      .map((kp): SeriesMarker<UTCTimestamp> => {
        // figure baissière : les points clés sont des sommets, haussière : des creux
        const isHigh = p.bias === 'bearish'
        return {
          time: toTime(kp.timestamp),
          position: isHigh ? 'aboveBar' : 'belowBar',
          shape: isHigh ? 'arrowDown' : 'arrowUp',
          color: BIAS_COLORS[p.bias],
          text: ROLE_LABELS[kp.role] ?? kp.role,
          size: 1.5,
        }
      }),
  )
  // figure confirmée : on montre la bougie qui a cassé la ligne de cou, du côté où le prix est parti
  for (const p of patterns) {
    if (!p.breakout_timestamp) continue
    markers.push({
      time: toTime(p.breakout_timestamp),
      position: p.bias === 'bearish' ? 'belowBar' : 'aboveBar',
      shape: 'circle',
      color: BIAS_COLORS[p.bias],
      text: 'Cassure',
      size: 1.5,
    })
  }
  // Lightweight Charts exige des marqueurs triés par date
  return markers.sort((m1, m2) => m1.time - m2.time)
}
