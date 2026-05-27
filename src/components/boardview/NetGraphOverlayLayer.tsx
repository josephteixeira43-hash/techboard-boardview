'use client'

import type { ComputedPosition, ViewportState } from '@/types/board'
import { getComputedDimensions } from '@/core/boardview/CoordinateEngine'

interface Props {
  highlightedComponentIds: string[]
  positions: Map<string, ComputedPosition>
  viewport: ViewportState
  visible: boolean
  color?: string
}

/**
 * Overlay leve para highlight de net/trace — irmão do BoardViewer, sem alterar canvas core.
 */
export default function NetGraphOverlayLayer({
  highlightedComponentIds,
  positions,
  viewport,
  visible,
  color = '#00d4ff',
}: Props) {
  if (!visible || !highlightedComponentIds.length) return null

  const { zoom, panX, panY } = viewport
  const idSet = new Set(highlightedComponentIds)

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[6]"
      width="100%"
      height="100%"
      aria-hidden
    >
      {Array.from(idSet).map((id) => {
        const pos = positions.get(id)
        if (!pos) return null
        const dim = getComputedDimensions(pos)
        const x = pos.x * zoom + panX
        const y = pos.y * zoom + panY
        const w = dim.width * zoom
        const h = dim.height * zoom
        return (
          <rect
            key={id}
            x={x - 2}
            y={y - 2}
            width={w + 4}
            height={h + 4}
            fill={color}
            fillOpacity={0.12}
            stroke={color}
            strokeOpacity={0.75}
            strokeWidth={2}
            rx={3}
          />
        )
      })}
    </svg>
  )
}
