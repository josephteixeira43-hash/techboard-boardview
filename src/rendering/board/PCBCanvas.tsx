'use client'
/**
 * PCBCanvas.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — PCB Canvas Render Component
 *
 * Self-contained canvas element that:
 *   • Creates the <canvas> DOM element via a ref
 *   • Drives the deterministic PCB render loop via usePCBRenderLoop
 *   • Forwards pointer events to parent handlers
 *   • Handles resize automatically via ResizeObserver inside the hook
 *   • Never causes hydration mismatches (canvas is purely client-side)
 *
 * INTEGRATION PATTERN
 * ────────────────────
 * Drop this into InteractiveBoardCanvas.tsx in place of whatever <canvas>
 * or empty <div> currently occupies the center render area:
 *
 *   import { PCBCanvas } from '@/rendering/board/PCBCanvas'
 *   // ...
 *   <PCBCanvas
 *     viewport={viewport}          // from useBoardEngine
 *     board={boardData}            // optional — synthetic if absent
 *     onPointerMove={handlePointerMove}
 *     onPointerLeave={handlePointerLeave}
 *     onClick={handleCanvasClick}
 *     className="absolute inset-0 w-full h-full"
 *   />
 *
 * VIEWPORT CONTRACT
 * ──────────────────
 * Accepts either:
 *   • { zoom, panX, panY }  — from useBoardEngine ViewportState
 *   • { zoom, offsetX, offsetY } — from ViewportManager (rendering pipeline)
 * Both shapes are handled via the normaliseViewport() utility.
 */

import { useRef, useMemo } from 'react'
import { usePCBRenderLoop } from '@/hooks/usePCBRenderLoop'
import type { PCBBoardData, ViewportState } from '@/hooks/usePCBRenderLoop'

// ─── Flexible Viewport Input ──────────────────────────────────────────────────
// Accept both the useBoardEngine shape and the ViewportManager shape.

type AnyViewport =
  | { zoom: number; panX: number; panY: number }
  | { zoom: number; offsetX: number; offsetY: number }
  | { zoom?: number; panX?: number; panY?: number; scale?: number; translateX?: number; translateY?: number }
  | null
  | undefined

function normaliseViewport(vp: AnyViewport): ViewportState {
  if (!vp) return { zoom: 1, panX: 0, panY: 0 }
  const zoom = (vp as any).zoom ?? (vp as any).scale ?? 1
  const panX = (vp as any).panX ?? (vp as any).offsetX ?? (vp as any).translateX ?? 0
  const panY = (vp as any).panY ?? (vp as any).offsetY ?? (vp as any).translateY ?? 0
  return {
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 1,
    panX: Number.isFinite(panX) ? panX : 0,
    panY: Number.isFinite(panY) ? panY : 0,
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PCBCanvasProps {
  viewport?:      AnyViewport
  board?:         PCBBoardData | null
  enabled?:       boolean
  className?:     string
  style?:         React.CSSProperties
  onPointerMove?: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerLeave?:(e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerUp?:   (e: React.PointerEvent<HTMLCanvasElement>) => void
  onClick?:       (e: React.MouseEvent<HTMLCanvasElement>) => void
  onMouseMove?:   (e: React.MouseEvent<HTMLCanvasElement>) => void
  onMouseLeave?:  (e: React.MouseEvent<HTMLCanvasElement>) => void
  onMouseDown?:   (e: React.MouseEvent<HTMLCanvasElement>) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PCBCanvas({
  viewport,
  board,
  enabled = true,
  className,
  style,
  onPointerMove,
  onPointerLeave,
  onPointerDown,
  onPointerUp,
  onClick,
  onMouseMove,
  onMouseLeave,
  onMouseDown,
}: PCBCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Normalise viewport every render — the hook only reads via ref so
  // this memo purely avoids creating a new object every frame.
  const normVp = useMemo(
    () => normaliseViewport(viewport),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      (viewport as any)?.zoom,
      (viewport as any)?.panX  ?? (viewport as any)?.offsetX  ?? (viewport as any)?.translateX,
      (viewport as any)?.panY  ?? (viewport as any)?.offsetY  ?? (viewport as any)?.translateY,
    ]
  )

  usePCBRenderLoop({ canvasRef, viewport: normVp, board, enabled })

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        display: 'block',
        width:   '100%',
        height:  '100%',
        touchAction: 'none',
        ...style,
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={onClick}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
    />
  )
}
