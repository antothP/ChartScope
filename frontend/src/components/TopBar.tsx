import { CandlestickChart, ChevronDown, Loader2, ScanSearch, Search } from 'lucide-react'
import { symbolName, TIMEFRAMES, type SymbolInfo, type Timeframe } from '@/api'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'

interface Props {
  symbols: SymbolInfo[]
  symbol: string
  onSymbolChange: (symbol: string) => void
  timeframe: Timeframe
  onTimeframeChange: (timeframe: Timeframe) => void
  onAnalyze: () => void
  analyzing: boolean
  canAnalyze: boolean
}

export function TopBar({ symbols, symbol, onSymbolChange, timeframe, onTimeframeChange, onAnalyze, analyzing, canAnalyze }: Props) {
  return (
    <header className="flex min-h-[46px] flex-wrap items-center gap-1 bg-background px-2 py-1">
      <div className="flex items-center gap-2 px-1.5 font-semibold" title="ChartScope">
        <CandlestickChart className="size-6 text-primary" aria-hidden />
        <span className="hidden md:inline">ChartScope</span>
      </div>

      {/* pastille du symbole, comme la recherche de symbole de TradingView */}
      <label className="relative flex h-9 items-center rounded-full bg-muted pl-8 pr-8 transition-colors hover:bg-accent">
        <span className="sr-only">Actif</span>
        <Search className="pointer-events-none absolute left-3 size-4 text-foreground" aria-hidden />
        <select
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value)}
          disabled={symbols.length === 0}
          className="h-full appearance-none bg-transparent text-sm font-semibold outline-none disabled:text-muted-foreground"
        >
          {symbols.length === 0 && <option>Actifs indisponibles</option>}
          {symbols.map((s) => (
            <option key={s.code} value={s.code} className="bg-muted">
              {symbolName(s.code)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted-foreground" aria-hidden />
      </label>

      <Divider />

      <Segmented<Timeframe>
        ariaLabel="Unité de temps"
        value={timeframe}
        onChange={onTimeframeChange}
        options={TIMEFRAMES.map((tf) => ({ value: tf, label: tf }))}
      />

      <Divider />

      <Button onClick={onAnalyze} disabled={!canAnalyze || analyzing}>
        {analyzing ? <Loader2 className="animate-spin" aria-hidden /> : <ScanSearch aria-hidden />}
        {analyzing ? 'Analyse en cours' : 'Analyser'}
      </Button>
    </header>
  )
}

function Divider() {
  return <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden />
}
