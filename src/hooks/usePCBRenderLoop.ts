'use client'
/**
 * usePCBRenderLoop.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Deterministic PCB Render Loop Hook
 *
 * INTEGRATION ROLE
 * ─────────────────
 * This hook owns the entire lifecycle of the PCB canvas render loop:
 *
 *   1. Acquires the 2D context from a canvas ref
 *   2. Instantiates PCBRenderer (once, via useMemo)
 *   3. Builds a deterministic BoardDescriptor from viewport + board bounds
 *   4. Applies viewport transform (pan/zoom) via ctx.setTransform each frame
 *   5. Clears the canvas deterministically before each frame
 *   6. Calls renderer.render(ctx, board) each animation frame
 *   7. Cancels the rAF loop on unmount — no memory leaks
 *   8. Re-triggers the loop on viewport changes via a stable frameId ref
 *
 * VIEWPORT TRANSFORM
 * ───────────────────
 * The canvas coordinate system is shifted so that board-space (0,0) maps to
 * the correct screen position:
 *
 *   ctx.setTransform(zoom, 0, 0, zoom, panX, panY)
 *
 * This means all layers draw in board-space coordinates and the host
 * transform handles all pan/zoom — no per-layer transform logic needed.
 *
 * DETERMINISM GUARANTEES
 * ───────────────────────
 * • Same viewport state → same pixel output (no random per-frame values)
 * • Frame counter is monotonically increasing — used as the rAF dirty flag
 * • No setState inside the render loop — zero React re-render churn
 * • Canvas clear uses fillRect(0,0,w,h) in identity space — always complete
 *
 * BOARD DESCRIPTOR STRATEGY
 * ──────────────────────────
 * When no external board data is available, a deterministic synthetic board
 * is generated from SYNTHETIC_BOARD_SEED so the canvas is never empty.
 * Real board data replaces this when provided via the `board` prop.
 */

import { useEffect, useRef, useMemo, useCallback } from 'react'
import { PCBRenderer }    from '@/rendering/core/PCBRenderer'
import type { BoardDescriptor, BoardSilhouette, BoardBounds } from '@/rendering/core/RenderLayerRegistry'

// ─── Viewport State Shape ─────────────────────────────────────────────────────
// Matches the ViewportState produced by useBoardEngine / ViewportManager.

export interface ViewportState {
  zoom: number
  panX: number
  panY: number
}

// ─── Board Data Shape ─────────────────────────────────────────────────────────

export interface PCBBoardData {
  /** Deterministic seed for texture/via generation. */
  seed?: number
  /** Board bounding box in board-space units. */
  bounds?: BoardBounds
  /** Optional silhouette path generator. */
  silhouette?: BoardSilhouette | null
}

// ─── Synthetic Board Constants ────────────────────────────────────────────────
// Used when no real board data is provided — ensures the canvas is never black.

const SYNTHETIC_BOARD_SEED   = 0x4c425f50   // 'LB_P'
const SYNTHETIC_BOARD_WIDTH  = 160           // board units
const SYNTHETIC_BOARD_HEIGHT = 120           // board units

/** Synthetic rectangular silhouette — draws the board outline as a path. */
function makeSyntheticSilhouette(bounds: BoardBounds): BoardSilhouette {
  return {
    toCanvasPath(ctx: CanvasRenderingContext2D): void {
      const r = 4 // corner radius in board units
      const { x, y, width: w, height: h } = bounds
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + w - r, y)
      ctx.arcTo(x + w, y,     x + w, y + r,     r)
      ctx.lineTo(x + w, y + h - r)
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
      ctx.lineTo(x + r, y + h)
      ctx.arcTo(x, y + h, x, y + h - r, r)
      ctx.lineTo(x, y + r)
      ctx.arcTo(x, y, x + r, y, r)
      ctx.closePath()
    },
  }
}

/** Build a deterministic synthetic BoardDescriptor for placeholder rendering. */
function buildSyntheticBoard(): BoardDescriptor {
  const bounds: BoardBounds = {
    x:      0,
    y:      0,
    width:  SYNTHETIC_BOARD_WIDTH,
    height: SYNTHETIC_BOARD_HEIGHT,
  }
  return {
    seed:       SYNTHETIC_BOARD_SEED,
    bounds,
    silhouette: makeSyntheticSilhouette(bounds),
  }
}

// ─── Hook Options ─────────────────────────────────────────────────────────────

export interface UsePCBRenderLoopOptions {
  /** Ref to the target <canvas> element. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  /** Current viewport state (zoom, panX, panY). */
  viewport:  ViewportState
  /** Optional real board data. Falls back to synthetic if absent. */
  board?:    PCBBoardData | null
  /** Set false to pause rendering (e.g. hidden tab). Default: true. */
  enabled?:  boolean
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePCBRenderLoop({
  canvasRef,
  viewport,
  board,
  enabled = true,
}: UsePCBRenderLoopOptions): void {

  // PCBRenderer is instantiated once for the lifetime of the component.
  // It holds the registry and all layer instances internally.
  const renderer = useMemo(() => new PCBRenderer(), [])

  // Stable ref to the latest viewport — avoids closure staleness in rAF.
  const vpRef    = useRef<ViewportState>(viewport)
  const boardRef = useRef<PCBBoardData | null | undefined>(board)
  vpRef.current    = viewport
  boardRef.current = board

  // rAF handle — stored in ref to cancel on unmount without setState.
  const rafRef   = useRef<number>(0)

  // Monotonic frame counter used as a dirty flag — incrementing it from
  // outside the loop schedules one additional frame without spamming.
  const frameRef = useRef<number>(0)

  // ── Core draw function ────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { zoom, panX, panY } = vpRef.current
    const safeZoom = (Number.isFinite(zoom) && zoom > 0) ? zoom : 1
    const safePanX = Number.isFinite(panX) ? panX : 0
    const safePanY = Number.isFinite(panY) ? panY : 0

    const dw = canvas.width
    const dh = canvas.height

    // ── 1. Clear in identity space ───────────────────────────────────────
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, dw, dh)
    // Board background — dark PCB green visible behind the board silhouette
    ctx.fillStyle = '#0d1a0f'
    ctx.fillRect(0, 0, dw, dh)
    ctx.restore()

    // ── 2. Apply viewport transform ──────────────────────────────────────
    // All layers draw in board-space; this transform maps board-space to
    // screen-space:  screen = board * zoom + (panX, panY)
    ctx.save()
    ctx.setTransform(safeZoom, 0, 0, safeZoom, safePanX, safePanY)

    // ── 3. Build board descriptor ────────────────────────────────────────
    const bd = boardRef.current
    let boardDesc: BoardDescriptor

    if (bd && bd.bounds && bd.bounds.width > 0 && bd.bounds.height > 0) {
      boardDesc = {
        seed:       bd.seed ?? SYNTHETIC_BOARD_SEED,
        bounds:     bd.bounds,
        silhouette: bd.silhouette ?? makeSyntheticSilhouette(bd.bounds),
      }
    } else {
      boardDesc = buildSyntheticBoard()
    }

    // ── 4. Render all layers ─────────────────────────────────────────────
    renderer.render(ctx, boardDesc)

    ctx.restore()
  }, [canvasRef, renderer])

  // ── rAF loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return

    let running = true

    const loop = () => {
      if (!running) return
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      running = false
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
    }
  }, [draw, enabled])

  // ── Canvas resize observer ────────────────────────────────────────────────
  // Keeps canvas pixel dimensions in sync with its CSS layout size.
  // Uses a ResizeObserver so we never read offsetWidth inside the rAF loop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === 'undefined') return

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        const w = Math.max(1, Math.round(width))
        const h = Math.max(1, Math.round(height))
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width  = w
          canvas.height = h
          frameRef.current++
        }
      }
    })

    ro.observe(canvas)
    return () => ro.disconnect()
  }, [canvasRef])
}
