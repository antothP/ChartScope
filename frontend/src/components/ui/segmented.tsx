import { useId, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  // pill : fond sous l'option active ; underline : onglets soulignés (panneaux TradingView)
  variant?: 'pill' | 'underline'
  className?: string
}

// boutons exclusifs dont l'indicateur glisse vers l'option choisie (seule animation : elle répond au clic)
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  variant = 'pill',
  className,
}: SegmentedProps<T>) {
  const id = useId()
  const underline = variant === 'underline'
  return (
    <div role="group" aria-label={ariaLabel} className={cn('flex items-center', underline && 'gap-4', className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex items-center text-sm tabular-nums transition-colors',
              underline ? 'h-9' : 'h-8 rounded px-2.5 hover:bg-accent',
              on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {on && (
              <motion.span
                layoutId={`segmented-${id}`}
                className={cn(
                  'absolute',
                  underline ? 'inset-x-0 bottom-0 h-0.5 rounded-full bg-primary' : 'inset-0 rounded bg-active',
                )}
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
