import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  // libellé lu par les lecteurs d'écran et affiché au survol
  label: string
  active?: boolean
}

// bouton carré des barres d'outils, façon TradingView
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, active, className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'flex size-9 items-center justify-center rounded text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-5',
        active && 'bg-active',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
)
IconButton.displayName = 'IconButton'
