import type {
  AutoscaleInfo,
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  Logical,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'

export interface HighlightBox {
  from: Time
  to: Time
  top: number
  bottom: number
  color: string
  label: string
  // figure haussière : étiquette sous le cadre, baissière : au-dessus
  labelBelow: boolean
  // figure en cours : flèche du niveau de la ligne de cou (from) jusqu'à l'objectif (to),
  // dessinée juste après la bougie `time` (la dernière), là où se prolonge la ligne de cou
  forecast: { time: Time; from: number; to: number; label: string } | null
}

type RenderTarget = Parameters<IPrimitivePaneRenderer['draw']>[0]

interface Rect {
  x: number
  y: number
  w: number
  h: number
  box: HighlightBox
}

const LABEL_HEIGHT = 24
// les marqueurs (flèche + texte « Sommet 1 »…) dépassent du cadre : l'étiquette se place au-delà
const LABEL_GAP = 40
// hauteur réservée à la légende OHLC en haut du graphique (jusqu'à 3 lignes sur mobile)
const LEGEND_HEIGHT = 64
const LABEL_FONT = '600 12px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif'
// texte sombre : lisible sur le magenta comme sur le cyan
const LABEL_TEXT = '#131722'
// jaune fluo, pour ne jamais se confondre avec le magenta/cyan des figures ni le vert/rouge des bougies
const FORECAST_COLOR = '#f5ff00'
const ARROW_HEAD = 13
const ARROW_MIN = 40 // longueur minimale : lisible même si l'objectif est très proche à l'écran
const FORECAST_FONT = '700 12px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif'

// Encadre chaque figure d'un rectangle surligné + étiquette, dessinés directement sur le canvas du graphique
export class PatternHighlights implements ISeriesPrimitive<Time> {
  private boxes: HighlightBox[] = []
  private chart: IChartApi | null = null
  private series: ISeriesApi<SeriesType> | null = null
  private requestUpdate: (() => void) | null = null

  private readonly views: IPrimitivePaneView[] = [
    // sous les bougies : elles restent lisibles à travers le fond du cadre
    { zOrder: () => 'bottom', renderer: () => ({ draw: (t) => this.drawBoxes(t) }) },
    // au-dessus de tout : l'étiquette et la flèche ne sont jamais masquées
    { zOrder: () => 'top', renderer: () => ({ draw: (t) => this.drawLabels(t) }) },
    { zOrder: () => 'top', renderer: () => ({ draw: (t) => this.drawForecastArrows(t) }) },
  ]

  attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>) {
    this.chart = chart as IChartApi
    this.series = series
    this.requestUpdate = requestUpdate
  }

  detached() {
    this.chart = this.series = this.requestUpdate = null
  }

  paneViews() {
    return this.views
  }

  // comme les projections de TradingView : l'échelle de prix s'élargit pour montrer l'objectif en entier,
  // tant que la flèche (après la dernière bougie) est dans la zone affichée
  autoscaleInfo(startTimePoint: Logical, endTimePoint: Logical): AutoscaleInfo | null {
    if (!this.chart) return null
    const timeScale = this.chart.timeScale()
    const prices: number[] = []
    for (const box of this.boxes) {
      if (!box.forecast) continue
      const index = timeScale.timeToIndex(box.forecast.time, true)
      if (index === null || index < startTimePoint || index > endTimePoint + 1) continue
      prices.push(box.forecast.from, box.forecast.to)
    }
    if (prices.length === 0) return null
    return { priceRange: { minValue: Math.min(...prices), maxValue: Math.max(...prices) } }
  }

  setBoxes(boxes: HighlightBox[]) {
    this.boxes = boxes
    this.requestUpdate?.()
  }

  // recalculé à chaque dessin : suit le zoom et le défilement
  private rects(): Rect[] {
    if (!this.chart || !this.series) return []
    const timeScale = this.chart.timeScale()
    const halfBar = timeScale.options().barSpacing / 2 + 4
    const rects: Rect[] = []
    for (const box of this.boxes) {
      const x1 = timeScale.timeToCoordinate(box.from)
      const x2 = timeScale.timeToCoordinate(box.to)
      const y1 = this.series.priceToCoordinate(box.top)
      const y2 = this.series.priceToCoordinate(box.bottom)
      if (x1 === null || x2 === null || y1 === null || y2 === null) continue
      rects.push({ x: x1 - halfBar, y: y1, w: x2 - x1 + 2 * halfBar, h: y2 - y1, box })
    }
    return rects
  }

  private drawBoxes(target: RenderTarget) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const { x, y, w, h, box } of this.rects()) {
        ctx.fillStyle = `${box.color}1f` // ~12 % d'opacité : les bougies restent lisibles sur fond sombre
        ctx.fillRect(x, y, w, h)
        ctx.lineWidth = 3
        ctx.strokeStyle = box.color
        ctx.strokeRect(x, y, w, h)
      }
    })
  }

  private drawLabels(target: RenderTarget) {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      ctx.font = LABEL_FONT
      ctx.textBaseline = 'middle'
      const placed: { x: number; y: number; w: number }[] = []
      const overlaps = (lx: number, ly: number, lw: number) =>
        placed.some((p) => lx < p.x + p.w && lx + lw > p.x && ly < p.y + LABEL_HEIGHT && ly + LABEL_HEIGHT > p.y)

      for (const { x, y, w, h, box } of this.rects()) {
        // figure hors de l'écran (défilement, écran étroit) : pas d'étiquette orpheline sur un bord
        if (x + w < 0 || x > mediaSize.width) continue
        const width = ctx.measureText(box.label).width + 16
        const labelX = Math.min(Math.max(x, 2), mediaSize.width - width - 2)
        // on garde l'étiquette dans la zone visible même si la figure touche le haut ou le bas
        const clampY = (v: number) => Math.min(Math.max(v, LEGEND_HEIGHT), mediaSize.height - LABEL_HEIGHT - 2)
        let labelY = clampY(box.labelBelow ? y + h + LABEL_GAP : y - LABEL_HEIGHT - LABEL_GAP)
        // deux figures proches : on décale l'étiquette vers l'extérieur plutôt que de les superposer
        const step = (LABEL_HEIGHT + 4) * (box.labelBelow ? 1 : -1)
        for (let tries = 0; tries < 4 && overlaps(labelX, labelY, width); tries++) {
          labelY = clampY(labelY + step)
        }
        placed.push({ x: labelX, y: labelY, w: width })

        // trait qui relie l'étiquette à son cadre
        const anchorX = Math.max(labelX, x) + 12
        ctx.strokeStyle = box.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(anchorX, box.labelBelow ? y + h : y)
        ctx.lineTo(anchorX, box.labelBelow ? labelY : labelY + LABEL_HEIGHT)
        ctx.stroke()

        ctx.fillStyle = box.color
        ctx.beginPath()
        ctx.roundRect(labelX, labelY, width, LABEL_HEIGHT, 6)
        ctx.fill()
        ctx.fillStyle = LABEL_TEXT
        ctx.fillText(box.label, labelX + 8, labelY + LABEL_HEIGHT / 2)
      }
    })
  }

  // flèche de prévision : du bout de la ligne de cou, à droite de la dernière bougie, jusqu'à l'objectif.
  // Se lit « si le prix casse ce niveau, il vise celui-là ». Seulement pour les figures en cours.
  private drawForecastArrows(target: RenderTarget) {
    if (!this.chart || !this.series) return
    const timeScale = this.chart.timeScale()
    const barSpacing = timeScale.options().barSpacing
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const forecasts = this.boxes.filter((b) => b.forecast)
      forecasts.forEach((box, k) => {
        const f = box.forecast!
        const lastX = timeScale.timeToCoordinate(f.time)
        const y0 = this.series!.priceToCoordinate(f.from)
        const yTarget = this.series!.priceToCoordinate(f.to)
        if (lastX === null || y0 === null || yTarget === null) return
        // dans l'espace vide à droite ; plusieurs figures en cours : flèches côte à côte
        const x = lastX + barSpacing * 3 + 12 + k * 26
        if (x < 0 || x > mediaSize.width) return
        const up = yTarget < y0
        const dir = up ? -1 : 1
        const clamp = (v: number) => Math.min(Math.max(v, LEGEND_HEIGHT), mediaSize.height - 4)
        const start = clamp(y0)
        // objectif hors de l'écran : la flèche s'arrête au bord, le texte donne la valeur exacte
        let tip = clamp(yTarget)
        if (Math.abs(tip - start) < ARROW_MIN) tip = clamp(start + dir * ARROW_MIN)

        ctx.save()
        ctx.strokeStyle = FORECAST_COLOR
        ctx.fillStyle = FORECAST_COLOR
        ctx.lineCap = 'round'

        // raccord pointillé depuis le bout de la ligne de cou
        ctx.setLineDash([4, 4])
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(lastX, start)
        ctx.lineTo(x, start)
        ctx.stroke()
        ctx.setLineDash([])

        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(x, start)
        ctx.lineTo(x, tip - dir * ARROW_HEAD)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x, tip)
        ctx.lineTo(x - ARROW_HEAD * 0.75, tip - dir * ARROW_HEAD)
        ctx.lineTo(x + ARROW_HEAD * 0.75, tip - dir * ARROW_HEAD)
        ctx.closePath()
        ctx.fill()

        // objectif écrit au niveau de la pointe, à droite de la flèche (à gauche si pas la place)
        ctx.font = FORECAST_FONT
        ctx.textBaseline = 'middle'
        const w = ctx.measureText(f.label).width
        const tx = x + 10 + w < mediaSize.width ? x + 10 : x - 10 - w
        ctx.fillText(f.label, tx, tip)
        ctx.restore()
      })
    })
  }
}
