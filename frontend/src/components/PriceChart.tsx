import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { symbolName, type Candle, type Pattern, type Timeframe } from '@/api'
import { useLevels, useTrends, type TrendPoint } from '@/hooks/useDrawings'
import { chartTickFormatter, chartTimeFormatter, formatPrice, precisionFor } from '@/lib/format'
import { buildBoxes, buildMarkers, buildOverlays, focusRange, RIGHT_OFFSET, toTime } from './chartOverlay'
import { ChartToolbar, type CursorMode } from './ChartToolbar'
import { PatternHighlights } from './patternHighlights'
import { RangeBar } from './RangeBar'
import { TimeMapper, TrendLines } from './trendLines'

interface Props {
  candles: Candle[]
  patterns: Pattern[]
  symbol: string
  timeframe: Timeframe
  // figure choisie dans le panneau : le graphique se recentre dessus
  focused: Pattern | null
  // message affiché par-dessus le graphique (chargement, erreur)
  overlay?: ReactNode
}

// couleurs relevées sur une capture de TradingView (thème sombre)
const THEME = {
  background: '#0F0F0F',
  text: '#DBDBDB',
  grid: 'rgba(242, 242, 242, 0.06)',
  border: '#2E2E2E',
  crosshair: '#9B9B9B',
  crosshairLabel: '#3D3D3D',
  up: '#089981',
  down: '#F23645',
  // volume : couleurs des bougies à mi-opacité, comme TradingView
  volumeUp: 'rgba(8, 153, 129, 0.5)',
  volumeDown: 'rgba(242, 54, 69, 0.5)',
  // traits de l'utilisateur : support sous le prix actuel, résistance au-dessus
  support: '#089981',
  resistance: '#F23645',
  font: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
}

const NO_PATTERNS: Pattern[] = []
const DAY_SECONDS = 86_400

export default function PriceChart({ candles, patterns, symbol, timeframe, focused, overlay }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const overlaySeriesRef = useRef<ISeriesApi<'Line'>[]>([])
  const highlightsRef = useRef<PatternHighlights | null>(null)

  const [cursor, setCursor] = useState<CursorMode>('crosshair')
  const levelStore = useLevels(symbol)
  const trendStore = useTrends(symbol)
  const levels = levelStore.items
  const trends = trendStore.items
  // un seul trait sélectionné à la fois, ligne horizontale ou ligne de tendance
  const [selection, setSelection] = useState<{ kind: 'level' | 'trend'; id: string } | null>(null)
  const selected =
    selection && (selection.kind === 'level' ? levels : trends).some((i) => i.id === selection.id) ? selection : null
  const selectedLevel = selected?.kind === 'level' ? selected.id : null
  const selectedTrend = selected?.kind === 'trend' ? selected.id : null
  // ligne de tendance en cours de tracé : 1er point cliqué + position de la souris
  const [anchor, setAnchor] = useState<TrendPoint | null>(null)
  const [previewEnd, setPreviewEnd] = useState<TrendPoint | null>(null)
  // glisser d'une poignée ou d'un trait : positions provisoires, enregistrées au relâchement
  const [drag, setDrag] = useState<{ id: string; a: TrendPoint; b: TrendPoint } | null>(null)
  const dragRef = useRef<{ id: string; part: 'a' | 'b' | 'line'; start: TrendPoint; a: TrendPoint; b: TrendPoint } | null>(null)
  const dragPosRef = useRef<{ a: TrendPoint; b: TrendPoint } | null>(null)
  // position de l'appui : un relâchement au même endroit est un clic (détecté par nous, car la librairie
  // retient un 2e clic rapide en attendant un éventuel double-clic, ce qui perdait le 2e point d'une ligne)
  const pressRef = useRef<{ x: number; y: number } | null>(null)
  const trendLinesRef = useRef<TrendLines | null>(null)
  const onCrosshairExtraRef = useRef<(param: MouseEventParams<Time>) => void>(() => {})
  const times = useMemo(() => candles.map((c) => toTime(c.timestamp) as number), [candles])
  const priceLinesRef = useRef<IPriceLine[]>([])
  const lastClose = candles.length > 0 ? candles[candles.length - 1].close : 0
  const precision = candles.length > 0 ? precisionFor(candles[0].close) : 2
  const [showPatterns, setShowPatterns] = useState(true)
  const [showVolume, setShowVolume] = useState(true)
  const volumeAvailable = useMemo(() => candles.some((c) => c.volume > 0), [candles])
  const volumeVisible = volumeAvailable && showVolume
  const drawnPatterns = showPatterns ? patterns : NO_PATTERNS

  // bougie sous le curseur, lue par la légende (null = dernière bougie)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const indexByTime = useMemo(() => new Map(candles.map((c, i) => [toTime(c.timestamp) as number, i])), [candles])
  const indexByTimeRef = useRef(indexByTime)
  indexByTimeRef.current = indexByTime

  useEffect(() => {
    const chart = createChart(containerRef.current!, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: THEME.background },
        textColor: THEME.text,
        fontFamily: THEME.font,
        fontSize: 12,
      },
      grid: { vertLines: { color: THEME.grid }, horzLines: { color: THEME.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: THEME.crosshair, style: LineStyle.Dashed, labelBackgroundColor: THEME.crosshairLabel },
        horzLine: { color: THEME.crosshair, style: LineStyle.Dashed, labelBackgroundColor: THEME.crosshairLabel },
      },
      rightPriceScale: { borderColor: THEME.border },
      localization: { locale: 'fr-FR', timeFormatter: chartTimeFormatter },
      // espace à droite de la dernière bougie pour ne pas couper les marqueurs des figures récentes
      timeScale: {
        borderColor: THEME.border,
        timeVisible: true,
        rightOffset: RIGHT_OFFSET,
        tickMarkFormatter: chartTickFormatter,
      },
    })
    chartRef.current = chart
    seriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: THEME.up,
      downColor: THEME.down,
      wickUpColor: THEME.up,
      wickDownColor: THEME.down,
      borderVisible: false,
    })
    // volume en bas du graphique, sur sa propre échelle invisible
    volumeRef.current = chart.addSeries(HistogramSeries, {
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    })
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    markersRef.current = createSeriesMarkers(seriesRef.current, [])
    highlightsRef.current = new PatternHighlights()
    seriesRef.current.attachPrimitive(highlightsRef.current)
    trendLinesRef.current = new TrendLines()
    seriesRef.current.attachPrimitive(trendLinesRef.current)

    const onCrosshair = (param: MouseEventParams<Time>) => {
      const index = param.time === undefined ? undefined : indexByTimeRef.current.get(param.time as number)
      setHoverIndex(index ?? null)
      onCrosshairExtraRef.current(param)
    }
    chart.subscribeCrosshairMove(onCrosshair)
    return () => {
      chart.unsubscribeCrosshairMove(onCrosshair)
      chart.remove()
      // les tracés appartenaient à ce graphique détruit, on ne doit plus tenter de les retirer
      overlaySeriesRef.current = []
      priceLinesRef.current = []
    }
  }, [])

  useEffect(() => {
    seriesRef.current?.applyOptions({
      priceFormat: { type: 'price', precision, minMove: 10 ** -precision },
    })
    // l'échelle de prix ignore la locale : sans ça elle afficherait 25840.00 au lieu de 25 840,00
    chartRef.current?.applyOptions({ localization: { priceFormatter: (p: number) => formatPrice(p, precision) } })
    seriesRef.current?.setData(
      candles.map((c) => ({
        // Lightweight Charts attend des secondes Unix, pas une date ISO
        time: toTime(c.timestamp),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    )
    // un zoom manuel sur l'échelle de prix coupe l'autoScale : sans ça, l'échelle resterait sur l'ancien actif
    seriesRef.current?.priceScale().applyOptions({ autoScale: true })
    chartRef.current?.timeScale().fitContent()
    setHoverIndex(null)
  }, [candles, precision])

  useEffect(() => {
    volumeRef.current?.setData(
      volumeVisible
        ? candles.map((c) => ({
            time: toTime(c.timestamp),
            value: c.volume,
            color: c.close >= c.open ? THEME.volumeUp : THEME.volumeDown,
          }))
        : [],
    )
    // on laisse la place du volume sous les bougies seulement s'il est affiché
    seriesRef.current?.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: volumeVisible ? 0.22 : 0.08 } })
  }, [candles, volumeVisible])

  useEffect(() => {
    chartRef.current?.applyOptions({
      crosshair: { mode: cursor === 'magnet' ? CrosshairMode.MagnetOHLC : CrosshairMode.Normal },
    })
  }, [cursor])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    overlaySeriesRef.current.forEach((s) => chart.removeSeries(s))
    overlaySeriesRef.current = []

    const lineOptions = {
      lineWidth: 3 as const,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: { type: 'price' as const, precision, minMove: 10 ** -precision },
    }

    for (const overlay of buildOverlays(drawnPatterns, candles)) {
      const outline = chart.addSeries(LineSeries, { ...lineOptions, color: overlay.color })
      outline.setData(overlay.outline)
      const neckline = chart.addSeries(LineSeries, {
        ...lineOptions,
        color: overlay.color,
        lineStyle: LineStyle.Dashed,
      })
      neckline.setData(overlay.neckline)
      overlaySeriesRef.current.push(outline, neckline)
    }

    markersRef.current?.setMarkers(buildMarkers(drawnPatterns))
    highlightsRef.current?.setBoxes(buildBoxes(drawnPatterns, candles))
  }, [drawnPatterns, candles, precision])

  // les figures sont récentes et minuscules sur la vue complète : on zoome dessus après l'analyse
  // (effet séparé du dessin : masquer puis réafficher les figures ne doit pas recadrer)
  useEffect(() => {
    const range = focusRange(patterns, candles)
    if (range) chartRef.current?.timeScale().setVisibleLogicalRange(range)
  }, [patterns, candles])

  useEffect(() => {
    const range = focused ? focusRange([focused], candles) : null
    if (range) chartRef.current?.timeScale().setVisibleLogicalRange(range)
  }, [focused, candles])

  const mapper = () => (chartRef.current ? new TimeMapper(times, chartRef.current) : null)

  // point du graphique (date + prix) sous une position de la souris
  function pointAt(x: number, y: number): TrendPoint | null {
    const price = seriesRef.current?.coordinateToPrice(y) ?? null
    const time = mapper()?.xToTime(x) ?? null
    return price === null || time === null ? null : { time, price: Number(price.toFixed(precision)) }
  }

  // clic : pose un trait en mode tracé, sinon sélectionne le trait sous la souris
  function handleClick(x: number, y: number) {
    const series = seriesRef.current
    if (!series) return
    if (cursor === 'hline') {
      const price = series.coordinateToPrice(y)
      if (price === null) return
      levelStore.add({ price: Number(price.toFixed(precision)) })
      setCursor('crosshair')
      return
    }
    if (cursor === 'trend') {
      const p = pointAt(x, y)
      if (!p) return
      if (!anchor) {
        setAnchor(p)
        setPreviewEnd(p)
        return
      }
      const id = trendStore.add({ a: anchor, b: p })
      setAnchor(null)
      setPreviewEnd(null)
      setCursor('crosshair')
      // comme TradingView : la ligne tout juste tracée reste sélectionnée, poignées visibles
      setSelection({ kind: 'trend', id })
      return
    }
    const trendHit = trendLinesRef.current?.findTrend(x, y)
    if (trendHit) return setSelection({ kind: 'trend', id: trendHit.id })
    const levelHit = levels.find((l) => {
      const ly = series.priceToCoordinate(l.price)
      return ly !== null && Math.abs(ly - y) <= 6
    })
    setSelection(levelHit ? { kind: 'level', id: levelHit.id } : null)
  }

  // pendant le tracé, la ligne suit la souris depuis le 1er point
  onCrosshairExtraRef.current = (param) => {
    if (cursor !== 'trend' || !anchor || !param.point) return
    const p = pointAt(param.point.x, param.point.y)
    if (p) setPreviewEnd(p)
  }

  // saisir une poignée (déplace une extrémité) ou le trait (déplace toute la ligne)
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    pressRef.current = { x, y }
    if (cursor === 'hline' || cursor === 'trend') return
    const hit = trendLinesRef.current?.findTrend(x, y)
    const trend = hit && trends.find((t) => t.id === hit.id)
    const start = pointAt(x, y)
    if (!hit || !trend || !start) return
    // le graphique ne doit pas défiler pendant qu'on déplace le trait
    e.stopPropagation()
    chartRef.current?.applyOptions({ handleScroll: false, handleScale: false })
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { id: trend.id, part: hit.part, start, a: trend.a, b: trend.b }
    setSelection({ kind: 'trend', id: trend.id })
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d) return
    const r = e.currentTarget.getBoundingClientRect()
    const p = pointAt(e.clientX - r.left, e.clientY - r.top)
    if (!p) return
    const shift = (q: TrendPoint) => ({
      time: q.time + (p.time - d.start.time),
      price: Number((q.price + (p.price - d.start.price)).toFixed(precision)),
    })
    const pos = d.part === 'a' ? { a: p, b: d.b } : d.part === 'b' ? { a: d.a, b: p } : { a: shift(d.a), b: shift(d.b) }
    dragPosRef.current = pos
    setDrag({ id: d.id, ...pos })
  }

  // fin du glisser : on enregistre la nouvelle position et le graphique redevient déplaçable
  function endDrag() {
    const d = dragRef.current
    if (!d) return
    if (dragPosRef.current) trendStore.update(d.id, dragPosRef.current)
    dragRef.current = null
    dragPosRef.current = null
    setDrag(null)
    chartRef.current?.applyOptions({ handleScroll: true, handleScale: true })
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const press = pressRef.current
    pressRef.current = null
    if (dragRef.current) return endDrag()
    // relâché là où on a appuyé : c'est un clic (sinon l'utilisateur faisait défiler le graphique)
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    if (press && Math.hypot(x - press.x, y - press.y) < 5) handleClick(x, y)
  }

  // quitter l'outil ou changer d'actif abandonne la ligne à moitié tracée
  useEffect(() => {
    if (cursor !== 'trend') {
      setAnchor(null)
      setPreviewEnd(null)
    }
  }, [cursor])
  useEffect(() => {
    setAnchor(null)
    setPreviewEnd(null)
    setSelection(null)
  }, [symbol])

  useEffect(() => {
    const shown = drag ? trends.map((t) => (t.id === drag.id ? { ...t, a: drag.a, b: drag.b } : t)) : trends
    trendLinesRef.current?.setState({
      trends: shown,
      selectedId: selectedTrend,
      preview: anchor && previewEnd ? { a: anchor, b: previewEnd } : null,
      mapper: chartRef.current ? new TimeMapper(times, chartRef.current) : null,
    })
  }, [trends, drag, selectedTrend, anchor, previewEnd, times])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    priceLinesRef.current.forEach((line) => series.removePriceLine(line))
    priceLinesRef.current = levels.map((l) => {
      const resistance = l.price >= lastClose
      return series.createPriceLine({
        price: l.price,
        color: resistance ? THEME.resistance : THEME.support,
        lineWidth: l.id === selectedLevel ? 4 : 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: resistance ? 'Résistance' : 'Support',
      })
    })
  }, [levels, selectedLevel, lastClose])

  function deleteSelected() {
    if (selected?.kind === 'level') levelStore.remove(selected.id)
    if (selected?.kind === 'trend') trendStore.remove(selected.id)
    setSelection(null)
  }
  const deleteSelectedRef = useRef(deleteSelected)
  deleteSelectedRef.current = deleteSelected

  // raccourcis de TradingView : Alt+T tendance, Alt+H horizontale, Suppr efface, Échap annule
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.altKey && (e.code === 'KeyT' || e.code === 'KeyH')) {
        e.preventDefault()
        const tool = e.code === 'KeyT' ? 'trend' : 'hline'
        setCursor((c) => (c === tool ? 'crosshair' : tool))
      } else if (e.key === 'Escape') {
        setCursor((c) => (c === 'hline' || c === 'trend' ? 'crosshair' : c))
        setSelection(null)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelectedRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function zoom(factor: number) {
    const timeScale = chartRef.current?.timeScale()
    const range = timeScale?.getVisibleLogicalRange()
    if (!timeScale || !range) return
    const middle = (range.from + range.to) / 2
    const half = ((range.to - range.from) / 2) * factor
    timeScale.setVisibleLogicalRange({ from: middle - half, to: middle + half })
  }

  function showRange(days: number | null) {
    const timeScale = chartRef.current?.timeScale()
    if (!timeScale || candles.length === 0) return
    if (days === null) return timeScale.fitContent()
    const last = toTime(candles[candles.length - 1].timestamp)
    timeScale.setVisibleRange({ from: (last - days * DAY_SECONDS) as UTCTimestamp, to: last })
  }

  // bandeau bleu d'aide, comme les indications de TradingView pendant un tracé
  const hint =
    cursor === 'hline'
      ? 'Cliquez sur le graphique pour placer la ligne. Échap pour annuler.'
      : cursor === 'trend'
        ? anchor
          ? 'Cliquez pour placer le second point.'
          : 'Cliquez pour placer le premier point de la ligne. Échap pour annuler.'
        : selectedTrend
          ? 'Ligne sélectionnée : faites glisser une poignée ou le trait pour la modifier, Suppr pour l’effacer.'
          : selectedLevel
            ? 'Trait sélectionné : appuyez sur Suppr pour l’effacer.'
            : null

  return (
    <div className="flex h-full gap-[2px] bg-border">
      <div className="bg-background">
        <ChartToolbar
          cursor={cursor}
          onCursor={setCursor}
          onZoom={zoom}
          onFit={() => chartRef.current?.timeScale().fitContent()}
          showPatterns={showPatterns}
          onTogglePatterns={() => setShowPatterns((v) => !v)}
          showVolume={showVolume}
          onToggleVolume={() => setShowVolume((v) => !v)}
          volumeAvailable={volumeAvailable}
          drawingCount={levels.length + trends.length}
          hasSelection={selected !== null}
          onDeleteSelected={deleteSelected}
          onClearDrawings={() => {
            levelStore.clear()
            trendStore.clear()
            setSelection(null)
          }}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <div className="relative min-h-0 flex-1">
          <div
            ref={containerRef}
            className="h-full w-full"
            onPointerDownCapture={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              pressRef.current = null
              endDrag()
            }}
          />
          <Legend candles={candles} index={hoverIndex} symbol={symbol} timeframe={timeframe} showVolume={volumeVisible} />
          {hint && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-[6] -translate-x-1/2 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground shadow-lg">
              {hint}
            </div>
          )}
          {overlay && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">{overlay}</div>
          )}
        </div>
        <RangeBar candles={candles} onRange={showRange} />
      </div>
    </div>
  )
}

const compactVolume = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 2 })

// légende en haut à gauche, comme TradingView : suit le curseur, sinon la dernière bougie
function Legend({
  candles,
  index,
  symbol,
  timeframe,
  showVolume,
}: {
  candles: Candle[]
  index: number | null
  symbol: string
  timeframe: Timeframe
  showVolume: boolean
}) {
  if (candles.length === 0) return null
  const i = index ?? candles.length - 1
  const c = candles[i]
  const prevClose = i > 0 ? candles[i - 1].close : c.open
  const change = c.close - prevClose
  const up = change >= 0
  const precision = precisionFor(c.close)
  const tone = up ? 'text-up' : 'text-down'
  const fmt = (v: number) => formatPrice(v, precision)
  const sign = up ? '+' : '−'

  return (
    <div className="pointer-events-none absolute left-3 right-20 top-2 z-[5] text-[13px] tabular-nums">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-base text-foreground">
          {symbolName(symbol)} · {timeframe} · Yahoo
        </span>
        <span className="flex flex-wrap gap-x-2">
          {(['open', 'high', 'low', 'close'] as const).map((k) => (
            <span key={k} className="text-foreground">
              {({ open: 'O', high: 'H', low: 'B', close: 'C' } as const)[k]}
              <span className={tone}>{fmt(c[k])}</span>
            </span>
          ))}
          <span className={tone}>
            {sign}
            {fmt(Math.abs(change))} ({sign}
            {Math.abs((change / prevClose) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)
          </span>
        </span>
      </div>
      {showVolume && (
        <div className="mt-1 text-foreground">
          {/* la bougie en cours n'a pas encore de volume chez Yahoo */}
          Vol <span className={tone}>{c.volume > 0 ? compactVolume.format(c.volume) : '—'}</span>
        </div>
      )}
    </div>
  )
}
