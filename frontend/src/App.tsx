import { useEffect, useMemo, useState } from 'react'
import { Loader2, Shapes } from 'lucide-react'
import {
  fetchPatterns,
  fetchPrices,
  fetchSymbols,
  type Candle,
  type Pattern,
  type PatternsResponse,
  type SymbolInfo,
  symbolName,
  type Timeframe,
} from '@/api'
import { PatternPanel, type View } from '@/components/PatternPanel'
import PriceChart from '@/components/PriceChart'
import { TopBar } from '@/components/TopBar'
import { IconButton } from '@/components/ui/icon-button'

// référence stable : un nouveau [] à chaque rendu ferait redessiner le graphique
const NO_PATTERNS: Pattern[] = []

export default function App() {
  const [symbols, setSymbols] = useState<SymbolInfo[]>([])
  const [symbol, setSymbol] = useState('DAX')
  const [timeframe, setTimeframe] = useState<Timeframe>('H1')

  const [candles, setCandles] = useState<Candle[]>([])
  const [pricesLoading, setPricesLoading] = useState(false)
  const [pricesError, setPricesError] = useState<string | null>(null)

  const [analysis, setAnalysis] = useState<PatternsResponse | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [view, setView] = useState<View>('pending')
  const [focused, setFocused] = useState<Pattern | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)

  useEffect(() => {
    fetchSymbols()
      .then(setSymbols)
      .catch((e) => setPricesError(e.message))
  }, [])

  // changer d'actif ou d'UT recharge le graphique mais ne relance pas l'analyse (cahier des charges §5.2)
  useEffect(() => {
    let cancelled = false
    setPricesLoading(true)
    setPricesError(null)
    setAnalysisError(null)

    fetchPrices(symbol, timeframe)
      .then((data) => !cancelled && setCandles(data.candles))
      .catch((e) => {
        if (cancelled) return
        setCandles([])
        setPricesError(e.message)
      })
      .finally(() => !cancelled && setPricesLoading(false))

    // si l'utilisateur change de sélection avant la réponse, on ignore l'ancienne
    return () => {
      cancelled = true
    }
  }, [symbol, timeframe])

  async function handleAnalyze() {
    setAnalyzing(true)
    setAnalysisError(null)
    try {
      setAnalysis(await fetchPatterns(symbol, timeframe))
    } catch (e) {
      setAnalysisError((e as Error).message)
    } finally {
      setAnalyzing(false)
    }
  }

  // l'analyse affichée doit correspondre à la sélection actuelle
  const currentAnalysis =
    analysis && analysis.symbol === symbol && analysis.timeframe === timeframe ? analysis : null

  // filtré côté client : basculer de vue ne relance pas l'analyse
  const shownPatterns = useMemo(
    () => currentAnalysis?.patterns.filter((p) => p.confirmed === (view === 'confirmed')) ?? NO_PATTERNS,
    [currentAnalysis, view],
  )
  // une figure choisie n'a de sens que tant qu'elle est affichée
  const focusedShown = focused && shownPatterns.includes(focused) ? focused : null

  const chartOverlay = pricesError ? (
    <p className="max-w-sm px-4 text-center text-sm text-down">{pricesError}</p>
  ) : pricesLoading ? (
    <span className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      Chargement de {symbolName(symbol)} en {timeframe}
    </span>
  ) : null

  return (
    // les fins filets entre zones sont le fond #2E2E2E qui apparaît dans les espaces de 2 px, comme TradingView
    <div className="flex h-full flex-col gap-[2px] bg-border">
      <TopBar
        symbols={symbols}
        symbol={symbol}
        onSymbolChange={setSymbol}
        timeframe={timeframe}
        onTimeframeChange={setTimeframe}
        onAnalyze={handleAnalyze}
        analyzing={analyzing}
        canAnalyze={!pricesLoading && candles.length > 0}
      />

      <main className="flex min-h-0 flex-1 flex-col gap-[2px] lg:flex-row">
        <section className="h-[65vh] min-h-[340px] lg:h-auto lg:min-w-0 lg:flex-1" aria-label={`Graphique ${symbolName(symbol)} ${timeframe}`}>
          <PriceChart
            candles={candles}
            patterns={shownPatterns}
            symbol={symbol}
            timeframe={timeframe}
            focused={focusedShown}
            overlay={chartOverlay}
          />
        </section>

        {/* toujours visible sur mobile ; repliable sur grand écran via la colonne d'icônes */}
        <div className={panelOpen ? 'contents' : 'contents lg:hidden'}>
          <PatternPanel
            symbol={symbol}
            timeframe={timeframe}
            patterns={currentAnalysis?.patterns ?? null}
            view={view}
            onViewChange={setView}
            focused={focusedShown}
            onFocus={setFocused}
            error={analysisError}
            unavailable={candles.length === 0}
          />
        </div>

        <nav aria-label="Panneaux" className="hidden w-12 shrink-0 flex-col items-center gap-1 bg-background py-2 lg:flex">
          <IconButton
            label={panelOpen ? 'Masquer les figures détectées' : 'Afficher les figures détectées'}
            active={panelOpen}
            onClick={() => setPanelOpen((v) => !v)}
            className="relative"
          >
            <Shapes />
            {currentAnalysis && currentAnalysis.patterns.length > 0 && (
              <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {currentAnalysis.patterns.length}
              </span>
            )}
          </IconButton>
        </nav>
      </main>
    </div>
  )
}
