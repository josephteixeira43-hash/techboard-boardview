'use client'

import type { ViewportState } from '@/types/board'
import type { VirtualRegion } from '@/types/pdfRegions'

interface Props {
  regions: VirtualRegion[]
  viewport: ViewportState
  visible: boolean
}

/** Overlay leve (SVG) — não altera BoardViewerKonva / canvas engine */
export default function RegionOverlayLayer({ regions, viewport, visible }: Props) {
  if (!visible || !regions.length) return null

  const { zoom, panX, panY } = viewport

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[5]"
      width="100%"
      height="100%"
      aria-hidden
    >
      {regions.map((r) => {
        const x = r.x * zoom + panX
        const y = r.y * zoom + panY
        const w = r.width * zoom
        const h = r.height * zoom
        return (
          <g key={r.regionId}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={r.color}
              fillOpacity={0.06}
              stroke={r.color}
              strokeOpacity={0.35}
              strokeWidth={1}
              strokeDasharray="6 4"
              rx={4}
            />
            <text
              x={x + 6}
              y={y + 14}
              fill={r.color}
              fillOpacity={0.85}
              fontSize={10}
              fontFamily="monospace"
              fontWeight={600}
            >
              {r.regionName}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
