import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2, ScanSearch, Search } from 'lucide-react'
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
        <img src="/logo.png" alt="ChartScope" className="size-6 rounded" />
        <span className="hidden md:inline">ChartScope</span>
      </div>

      <SymbolPicker symbols={symbols} symbol={symbol} onSymbolChange={onSymbolChange} />

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

interface SymbolPickerProps {
  symbols: SymbolInfo[]
  symbol: string
  onSymbolChange: (symbol: string) => void
}

function SymbolPicker({ symbols, symbol, onSymbolChange }: SymbolPickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const disabled = symbols.length === 0

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-full bg-muted pl-3 pr-3 text-sm font-semibold outline-none transition-colors hover:bg-accent disabled:pointer-events-none disabled:text-muted-foreground"
      >
        <Search className="size-4 text-foreground" aria-hidden />
        <span>{disabled ? 'Actifs indisponibles' : symbolName(symbol)}</span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Actif"
          className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[200px] overflow-hidden rounded-lg border border-border bg-muted py-1 shadow-xl"
        >
          {symbols.map((s) => {
            const selected = s.code === symbol
            return (
              <li key={s.code} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onSymbolChange(s.code)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                    selected ? 'font-semibold text-primary' : 'text-foreground'
                  }`}
                >
                  {symbolName(s.code)}
                  {selected && <Check className="size-4" aria-hidden />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
