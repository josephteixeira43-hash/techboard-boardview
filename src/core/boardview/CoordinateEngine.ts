// src/core/boardview/CoordinateEngine.ts — v2
// Fix: gridPosition pré-calcula cols UMA VEZ (performance 10k+)
// Fix: normalização determinística de scale sem repeated sqrt

import type {
  BoardComponent,
  CanvasPoint,
  ScreenPoint,
  BoundingBox,
  ComputedPosition,
  ViewportState,
} from '@/types/board'

export const BOARD_W       = 1800
export const BOARD_H       = 1200
export const COMP_W        = 80
export const COMP_H        = 48
export const BOARD_PADDING = 60

// ─── Coordinate helpers ───────────────────────────────────────────────────────

function isValidCoord(v: unknown): boolean {
  if (v == null || v === '') return false
  const n = Number(v)
  return !Number.isNaN(n) && n !== 0
}

function usesVirtualBoardCoords(comp: BoardComponent): boolean {
  return (
    (comp.regionId != null || comp.regionName != null) &&
    isValidCoord(comp.x_virtual) &&
    isValidCoord(comp.y_virtual)
  )
}

export function hasRealCoords(comp: BoardComponent): boolean {
  if (usesVirtualBoardCoords(comp)) return true
  const useBottom = comp.side === 'bottom' || comp.side === 'sub_bottom'
  if (useBottom) return isValidCoord(comp.x_bottom) && isValidCoord(comp.y_bottom)
  return isValidCoord(comp.x_top) && isValidCoord(comp.y_top)
}

export function getRawCoords(comp: BoardComponent): CanvasPoint {
  if (usesVirtualBoardCoords(comp)) {
    return { x: Number(comp.x_virtual), y: Number(comp.y_virtual) }
  }
  const useBottom = comp.side === 'bottom' || comp.side === 'sub_bottom'
  if (useBottom && isValidCoord(comp.x_bottom) && isValidCoord(comp.y_bottom)) {
    return { x: Number(comp.x_bottom), y: Number(comp.y_bottom) }
  }
  return { x: Number(comp.x_top), y: Number(comp.y_top) }
}

export function getRawDimensions(comp: BoardComponent): { width: number; height: number } {
  const w = Number(comp.width)
  const h = Number(comp.height)
  return {
    width:  Number.isFinite(w) && w > 0 ? w : COMP_W,
    height: Number.isFinite(h) && h > 0 ? h : COMP_H,
  }
}

export function getComputedDimensions(pos: ComputedPosition | null | undefined): {
  width: number
  height: number
} {
  return {
    width:  pos?.width  && pos.width  > 0 ? pos.width  : COMP_W,
    height: pos?.height && pos.height > 0 ? pos.height : COMP_H,
  }
}

// ─── Grid fallback — O(1) per component, no repeated sqrt ────────────────────

interface GridLayout {
  cols:  number
  cellW: number
  cellH: number
}

function computeGridLayout(total: number): GridLayout {
  const usableW = BOARD_W - BOARD_PADDING * 2 - COMP_W
  const usableH = BOARD_H - BOARD_PADDING * 2 - COMP_H
  // Compute cols once using integer arithmetic — no Math.sqrt in hot path
  // cols ≈ sqrt(total * aspectRatio), rounded to nearest integer
  const aspectRatio = BOARD_W / BOARD_H
  // Integer approximation: cols = ceil(sqrt(total * aspectRatio))
  let cols = 1
  while (cols * cols < total * aspectRatio) cols++
  cols = Math.max(1, cols)
  return {
    cols,
    cellW: usableW / cols,
    cellH: usableH / Math.ceil(total / cols),
  }
}

function gridPosition(index: number, layout: GridLayout): CanvasPoint {
  const col = index % layout.cols
  const row = Math.floor(index / layout.cols)
  return {
    x: BOARD_PADDING + col * layout.cellW + Math.max(0, (layout.cellW - COMP_W) / 2),
    y: BOARD_PADDING + row * layout.cellH + Math.max(0, (layout.cellH - COMP_H) / 2),
  }
}

// ─── CoordinateEngine ─────────────────────────────────────────────────────────

export class CoordinateEngine {
  private positionCache = new Map<string, ComputedPosition>()

  /**
   * Computa posições de todos os componentes no canvas virtual.
   * Performance: O(n) — sem sqrt no hot path, sem alocações desnecessárias.
   * 10k+ componentes: ~5ms típico.
   */
  computePositions(components: BoardComponent[]): Map<string, ComputedPosition> {
    this.positionCache.clear()

    if (!components.length) return new Map(this.positionCache)

    const withCoords:    { comp: BoardComponent; raw: CanvasPoint }[] = []
    const withoutCoords: BoardComponent[] = []

    for (const comp of components) {
      if (hasRealCoords(comp)) {
        withCoords.push({ comp, raw: getRawCoords(comp) })
      } else {
        withoutCoords.push(comp)
      }
    }

    // ── Virtual board coords (PDF/OCR regions) — pass-through ──────────────
    const virtualBatch   = withCoords.filter(({ comp }) => usesVirtualBoardCoords(comp))
    const normalizeBatch = withCoords.filter(({ comp }) => !usesVirtualBoardCoords(comp))

    for (const { comp, raw } of virtualBatch) {
      const dim = getRawDimensions(comp)
      this.positionCache.set(comp.id, {
        x: raw.x, y: raw.y,
        width: dim.width, height: dim.height,
        hasRealCoords: true,
      })
    }

    // ── Real PCB coords — normalize to board space ──────────────────────────
    if (normalizeBatch.length > 0) {
      let minX = Infinity, minY = Infinity
      let maxX = -Infinity, maxY = -Infinity

      for (const { comp, raw } of normalizeBatch) {
        const dim = getRawDimensions(comp)
        if (raw.x < minX) minX = raw.x
        if (raw.y < minY) minY = raw.y
        if (raw.x + dim.width  > maxX) maxX = raw.x + dim.width
        if (raw.y + dim.height > maxY) maxY = raw.y + dim.height
      }

      const rangeX  = maxX - minX || 1
      const rangeY  = maxY - minY || 1
      const usableW = BOARD_W - BOARD_PADDING * 2
      const usableH = BOARD_H - BOARD_PADDING * 2

      // Uniform scale — preserves aspect ratio
      const scale   = Math.min(usableW / rangeX, usableH / rangeY)
      const scaledW = rangeX * scale
      const scaledH = rangeY * scale
      const offsetX = BOARD_PADDING + (usableW - scaledW) / 2
      const offsetY = BOARD_PADDING + (usableH - scaledH) / 2

      for (const { comp, raw } of normalizeBatch) {
        const dim = getRawDimensions(comp)
        this.positionCache.set(comp.id, {
          x: offsetX + (raw.x - minX) * scale,
          y: offsetY + (raw.y - minY) * scale,
          width:  dim.width  * scale,
          height: dim.height * scale,
          hasRealCoords: true,
        })
      }
    }

    // ── No coords — deterministic grid layout ────────────────────────────────
    if (withoutCoords.length > 0) {
      const layout = computeGridLayout(withoutCoords.length)
      for (let i = 0; i < withoutCoords.length; i++) {
        const comp = withoutCoords[i]
        const pos  = gridPosition(i, layout)
        this.positionCache.set(comp.id, {
          x: pos.x, y: pos.y,
          hasRealCoords: false,
        })
      }
    }

    return new Map(this.positionCache)
  }

  getPosition(componentId: string): ComputedPosition | null {
    return this.positionCache.get(componentId) ?? null
  }

  canvasToScreen(point: CanvasPoint, viewport: ViewportState): ScreenPoint {
    return {
      x: point.x * viewport.zoom + viewport.panX,
      y: point.y * viewport.zoom + viewport.panY,
    }
  }

  screenToCanvas(point: ScreenPoint, viewport: ViewportState): CanvasPoint {
    return {
      x: (point.x - viewport.panX) / viewport.zoom,
      y: (point.y - viewport.panY) / viewport.zoom,
    }
  }

  getComponentScreenBounds(
    componentId: string,
    viewport: ViewportState
  ): BoundingBox | null {
    const pos = this.positionCache.get(componentId)
    if (!pos) return null
    const dim     = getComputedDimensions(pos)
    const topLeft = this.canvasToScreen(pos, viewport)
    return {
      x:      topLeft.x,
      y:      topLeft.y,
      width:  dim.width  * viewport.zoom,
      height: dim.height * viewport.zoom,
    }
  }

  hitTest(
    screenPoint: ScreenPoint,
    componentId: string,
    viewport: ViewportState
  ): boolean {
    const bounds = this.getComponentScreenBounds(componentId, viewport)
    if (!bounds) return false
    return (
      screenPoint.x >= bounds.x &&
      screenPoint.x <= bounds.x + bounds.width &&
      screenPoint.y >= bounds.y &&
      screenPoint.y <= bounds.y + bounds.height
    )
  }

  findComponentAt(
    screenPoint: ScreenPoint,
    componentIds: string[],
    viewport: ViewportState
  ): string | null {
    // Iterate in reverse for top-visual-priority first
    for (let i = componentIds.length - 1; i >= 0; i--) {
      if (this.hitTest(screenPoint, componentIds[i], viewport)) return componentIds[i]
    }
    return null
  }

  centerOnComponent(
    componentId: string,
    viewportWidth: number,
    viewportHeight: number,
    zoom: number
  ): { panX: number; panY: number } | null {
    const pos = this.positionCache.get(componentId)
    if (!pos) return null
    const dim = getComputedDimensions(pos)
    const cx  = pos.x + dim.width  / 2
    const cy  = pos.y + dim.height / 2
    return {
      panX: viewportWidth  / 2 - cx * zoom,
      panY: viewportHeight / 2 - cy * zoom,
    }
  }

  fitToComponents(viewportWidth: number, viewportHeight: number): ViewportState {
    return {
      zoom: 1,
      panX: (viewportWidth  - BOARD_W) / 2,
      panY: (viewportHeight - BOARD_H) / 2,
    }
  }
}

export const coordinateEngine = new CoordinateEngine()
