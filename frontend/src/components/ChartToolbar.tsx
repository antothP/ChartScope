import { BarChart3, Crosshair, Eraser, Eye, EyeOff, Magnet, Maximize2, SeparatorHorizontal, Trash, ZoomIn, ZoomOut } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'

// hline : le prochain clic pose une ligne horizontale ; trend : deux clics tracent une ligne de tendance
export type CursorMode = 'crosshair' | 'magnet' | 'hline' | 'trend'

interface Props {
  cursor: CursorMode
  onCursor: (mode: CursorMode) => void
  onZoom: (factor: number) => void
  onFit: () => void
  showPatterns: boolean
  onTogglePatterns: () => void
  showVolume: boolean
  onToggleVolume: () => void
  // le volume n'existe pas pour toutes les données (forex, indices en intraday)
  volumeAvailable: boolean
  drawingCount: number
  hasSelection: boolean
  onDeleteSelected: () => void
  onClearDrawings: () => void
}

// barre verticale de gauche, façon TradingView : uniquement des outils réellement branchés sur le graphique
export function ChartToolbar(p: Props) {
  return (
    <nav aria-label="Outils du graphique" className="hidden w-12 shrink-0 flex-col items-center gap-1 py-2 sm:flex">
      <IconButton label="Réticule" active={p.cursor === 'crosshair'} onClick={() => p.onCursor('crosshair')}>
        <Crosshair />
      </IconButton>
      <IconButton label="Aimant : le réticule colle aux prix des bougies" active={p.cursor === 'magnet'} onClick={() => p.onCursor('magnet')}>
        <Magnet />
      </IconButton>

      <Separator />
      <IconButton
        label="Ligne de tendance (Alt + T)"
        active={p.cursor === 'trend'}
        onClick={() => p.onCursor(p.cursor === 'trend' ? 'crosshair' : 'trend')}
      >
        <TrendLineIcon />
      </IconButton>
      <IconButton
        label="Ligne horizontale : support ou résistance (Alt + H)"
        active={p.cursor === 'hline'}
        onClick={() => p.onCursor(p.cursor === 'hline' ? 'crosshair' : 'hline')}
      >
        <SeparatorHorizontal />
      </IconButton>
      <IconButton label="Supprimer le trait sélectionné (Suppr)" disabled={!p.hasSelection} onClick={p.onDeleteSelected}>
        <Eraser />
      </IconButton>
      <IconButton label="Supprimer tous les traits" disabled={p.drawingCount === 0} onClick={p.onClearDrawings}>
        <Trash />
      </IconButton>

      <Separator />
      <IconButton label="Zoom avant" onClick={() => p.onZoom(0.6)}>
        <ZoomIn />
      </IconButton>
      <IconButton label="Zoom arrière" onClick={() => p.onZoom(1.6)}>
        <ZoomOut />
      </IconButton>
      <IconButton label="Afficher toutes les bougies" onClick={p.onFit}>
        <Maximize2 />
      </IconButton>

      <Separator />
      <IconButton
        label={p.showPatterns ? 'Masquer les figures' : 'Afficher les figures'}
        active={!p.showPatterns}
        onClick={p.onTogglePatterns}
      >
        {p.showPatterns ? <Eye /> : <EyeOff />}
      </IconButton>
      <IconButton
        label={p.volumeAvailable ? (p.showVolume ? 'Masquer le volume' : 'Afficher le volume') : 'Volume non fourni pour ces données'}
        active={p.volumeAvailable && p.showVolume}
        disabled={!p.volumeAvailable}
        onClick={p.onToggleVolume}
      >
        <BarChart3 />
      </IconButton>
    </nav>
  )
}

// l'icône TradingView de l'outil : un trait oblique entre deux poignées
function TrendLineIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M7 17 17 7" />
      <circle cx="5.5" cy="18.5" r="2" />
      <circle cx="18.5" cy="5.5" r="2" />
    </svg>
  )
}

function Separator() {
  return <span className="my-1 h-px w-7 bg-border" aria-hidden />
}
