import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  Logical,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitiveHoveredItem,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type { Trend, TrendPoint } from '@/hooks/useDrawings'

type RenderTarget = Parameters<IPrimitivePaneRenderer['draw']>[0]

// bleu et poignées creuses de l'outil « Ligne de tendance » de TradingView
const COLOR = '#2962FF'
const HANDLE_FILL = '#0F0F0F'
const HANDLE_RADIUS = 5
const HIT_DISTANCE = 7

export type TrendHit = { id: string; part: 'a' | 'b' | 'line' }

// Conversion date <-> abscisse. Une ligne tracée en H1 doit rester en place en H4 : sa date ne tombe
// pas forcément sur une bougie de l'autre UT, on interpole donc entre les bougies voisines (et au-delà
// de la dernière, on prolonge avec l'intervalle entre les deux dernières).
export class TimeMapper {
  constructor(
    private readonly times: number[],
    private readonly chart: IChartApi,
  ) {}

  private toLogical(t: number): number | null {
    const ts = this.times
    const n = ts.length
    if (n < 2) return null
    if (t <= ts[0]) return (t - ts[0]) / (ts[1] - ts[0])
    if (t >= ts[n - 1]) return n - 1 + (t - ts[n - 1]) / (ts[n - 1] - ts[n - 2])
    let lo = 0
    let hi = n - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (ts[mid] <= t) lo = mid
      else hi = mid
    }
    return lo + (t - ts[lo]) / (ts[hi] - ts[lo])
  }

  timeToX(t: number): number | null {
    const logical = this.toLogical(t)
    if (logical === null) return null
    // logicalToCoordinate ne gère que les positions entières (il renvoie 0 sinon) : on interpole
    // entre les deux bougies voisines, sinon une ligne tracée en H1 se retrouvait collée à gauche en H4
    const timeScale = this.chart.timeScale()
    const i = Math.floor(logical)
    const x0 = timeScale.logicalToCoordinate(i as Logical)
    const x1 = timeScale.logicalToCoordinate((i + 1) as Logical)
    if (x0 === null || x1 === null) return null
    return x0 + (logical - i) * (x1 - x0)
  }

  xToTime(x: number): number | null {
    const ts = this.times
    const n = ts.length
    const logical = this.chart.timeScale().coordinateToLogical(x)
    if (logical === null || n < 2) return null
    if (logical <= 0) return ts[0] + logical * (ts[1] - ts[0])
    if (logical >= n - 1) return ts[n - 1] + (logical - (n - 1)) * (ts[n - 1] - ts[n - 2])
    const i = Math.floor(logical)
    return ts[i] + (logical - i) * (ts[i + 1] - ts[i])
  }
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export class TrendLines implements ISeriesPrimitive<Time> {
  private trends: Trend[] = []
  private selectedId: string | null = null
  // ligne en cours de tracé : du 1er point cliqué jusqu'à la souris
  private preview: { a: TrendPoint; b: TrendPoint } | null = null
  private mapper: TimeMapper | null = null
  private series: ISeriesApi<SeriesType> | null = null
  private requestUpdate: (() => void) | null = null

  private readonly views: IPrimitivePaneView[] = [
    { zOrder: () => 'top', renderer: () => ({ draw: (t) => this.draw(t) }) },
  ]

  attached({ series, requestUpdate }: SeriesAttachedParameter<Time>) {
    this.series = series
    this.requestUpdate = requestUpdate
  }

  detached() {
    this.series = this.requestUpdate = null
  }

  paneViews() {
    return this.views
  }

  setState(state: {
    trends: Trend[]
    selectedId: string | null
    preview: { a: TrendPoint; b: TrendPoint } | null
    mapper: TimeMapper | null
  }) {
    Object.assign(this, state)
    this.requestUpdate?.()
  }

  private toScreen(p: TrendPoint) {
    const x = this.mapper?.timeToX(p.time) ?? null
    const y = this.series?.priceToCoordinate(p.price) ?? null
    return x === null || y === null ? null : { x, y }
  }

  // appelé par Lightweight Charts au survol : curseur de déplacement sur une ligne, comme TradingView
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const hit = this.findTrend(x, y)
    if (!hit) return null
    return { externalId: hit.id, zOrder: 'top', cursorStyle: hit.part === 'line' ? 'move' : 'grab' }
  }

  // quel trait (et quelle partie) se trouve sous la souris ; les poignées d'abord, pour pouvoir les saisir
  findTrend(x: number, y: number): TrendHit | null {
    for (const t of [...this.trends].reverse()) {
      const a = this.toScreen(t.a)
      const b = this.toScreen(t.b)
      if (!a || !b) continue
      if (Math.hypot(x - a.x, y - a.y) <= HIT_DISTANCE) return { id: t.id, part: 'a' }
      if (Math.hypot(x - b.x, y - b.y) <= HIT_DISTANCE) return { id: t.id, part: 'b' }
      if (distanceToSegment(x, y, a.x, a.y, b.x, b.y) <= HIT_DISTANCE) return { id: t.id, part: 'line' }
    }
    return null
  }

  private draw(target: RenderTarget) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      const items = [
        ...this.trends.map((t) => ({ a: t.a, b: t.b, handles: t.id === this.selectedId })),
        ...(this.preview ? [{ ...this.preview, handles: true }] : []),
      ]
      for (const item of items) {
        const a = this.toScreen(item.a)
        const b = this.toScreen(item.b)
        if (!a || !b) continue
        ctx.strokeStyle = COLOR
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        if (!item.handles) continue
        // poignées creuses, visibles quand la ligne est sélectionnée ou en cours de tracé
        for (const p of [a, b]) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2)
          ctx.fillStyle = HANDLE_FILL
          ctx.fill()
          ctx.stroke()
        }
      }
    })
  }
}
