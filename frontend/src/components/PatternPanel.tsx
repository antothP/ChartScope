import { TrendingDown, TrendingUp } from 'lucide-react'
import { symbolName, type Pattern, type Timeframe } from '@/api'
import { formatDateTime, formatPrice } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Segmented } from '@/components/ui/segmented'
import { BIAS_COLORS, PATTERN_NAMES } from './chartOverlay'

export type View = 'pending' | 'confirmed'

interface Props {
  symbol: string
  timeframe: Timeframe
  // null tant que l'analyse n'a pas été lancée pour la sélection actuelle
  patterns: Pattern[] | null
  view: View
  onViewChange: (view: View) => void
  focused: Pattern | null
  onFocus: (pattern: Pattern) => void
  error: string | null
  // pas de graphique chargé : l'analyse n'est pas possible
  unavailable: boolean
}

const EMPTY: Record<View, { title: string; hint: string }> = {
  pending: {
    title: 'Aucune figure en cours sur la période récente.',
    hint: 'Regardez les figures confirmées récemment, ou changez d’unité de temps.',
  },
  confirmed: {
    title: 'Aucune figure confirmée sur la période récente.',
    hint: 'Regardez les figures en cours, ou changez d’unité de temps.',
  },
}

export function PatternPanel({ symbol, timeframe, patterns, view, onViewChange, focused, onFocus, error, unavailable }: Props) {
  const shown = patterns?.filter((p) => p.confirmed === (view === 'confirmed')) ?? []
  const count = (v: View) => patterns?.filter((p) => p.confirmed === (v === 'confirmed')).length

  return (
    <aside aria-label="Figures détectées" className="flex min-h-0 flex-col bg-background lg:w-80 lg:shrink-0">
      <div className="flex h-[46px] items-center justify-between gap-3 px-4">
        <h2 className="text-sm font-semibold">Figures détectées</h2>
        <span className="text-xs text-muted-foreground">
          {symbolName(symbol)} en {timeframe}
        </span>
      </div>

      <div className="border-b border-border px-4">
        <Segmented<View>
          ariaLabel="Figures à afficher"
          variant="underline"
          value={view}
          onChange={onViewChange}
          options={[
            { value: 'pending', label: <>En cours{patterns && <Count n={count('pending')} />}</> },
            { value: 'confirmed', label: <>Confirmées{patterns && <Count n={count('confirmed')} />}</> },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {error ? (
          <p className="px-4 text-sm text-down">{error}</p>
        ) : patterns === null && unavailable ? (
          <p className="px-4 text-sm text-muted-foreground">L’analyse sera possible une fois le graphique chargé.</p>
        ) : patterns === null ? (
          <p className="px-4 text-sm text-muted-foreground">
            Lancez l’analyse pour chercher des figures sur {symbolName(symbol)} en {timeframe}.
          </p>
        ) : shown.length === 0 ? (
          <div className="px-4 text-sm">
            <p>{EMPTY[view].title}</p>
            <p className="mt-1 text-muted-foreground">{EMPTY[view].hint}</p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {shown.map((p) => (
              <li key={`${p.type}-${p.key_points[0].timestamp}`}>
                <PatternCard pattern={p} selected={p === focused} onSelect={() => onFocus(p)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        Données Yahoo Finance, différées de 15 à 20 minutes.
      </p>
    </aside>
  )
}

function Count({ n }: { n: number | undefined }) {
  return <span className="text-xs text-muted-foreground">{n}</span>
}

function PatternCard({ pattern: p, selected, onSelect }: { pattern: Pattern; selected: boolean; onSelect: () => void }) {
  const color = BIAS_COLORS[p.bias]
  const bearish = p.bias === 'bearish'
  const Icon = bearish ? TrendingDown : TrendingUp
  const necks = p.key_points.filter((kp) => kp.role.startsWith('neckline'))
  const neckline = necks.map((kp) => formatPrice(kp.price)).join(' → ')

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title="Centrer le graphique sur cette figure"
      className={cn(
        'w-full border-l-[3px] px-4 py-2.5 text-left transition-colors hover:bg-muted',
        selected && 'bg-accent hover:bg-accent',
      )}
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{PATTERN_NAMES[p.type] ?? p.type}</span>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-xs',
            p.confirmed ? 'bg-foreground/10 text-foreground' : 'border border-dashed border-muted-foreground/60 text-muted-foreground',
          )}
        >
          {p.confirmed ? 'Confirmée' : 'En cours'}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-sm" style={{ color }}>
        <Icon className="size-4" aria-hidden />
        {bearish ? 'Baissier' : 'Haussier'}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs tabular-nums">
        <dt className="text-muted-foreground">{p.breakout_timestamp ? 'Cassée le' : 'Formée le'}</dt>
        <dd className="text-right">{formatDateTime(p.breakout_timestamp ?? p.key_points[p.key_points.length - 1].timestamp)}</dd>
        <dt className="text-muted-foreground">Ligne de cou</dt>
        <dd className="text-right">{neckline}</dd>
        <dt className="text-muted-foreground">Objectif</dt>
        <dd className="text-right font-semibold text-foreground">{formatPrice(p.target_price)}</dd>
      </dl>
    </button>
  )
}
