// src/core/boardview/CoordinateEngine.ts
// Transformation matrix unificada para o BoardView
// Resolve o problema de coordenadas PCB → Canvas → Screen

import type {
  BoardComponent,
  CanvasPoint,
  ScreenPoint,
  BoundingBox,
  ComputedPosition,
  ViewportState,
} from '@/types/board'

// ─── Constantes do board virtual ──────────────────────────────────────────────

export const BOARD_W       = 1800
export const BOARD_H       = 1200
export const COMP_W        = 80
export const COMP_H        = 48
export const BOARD_PADDING = 60

// ─── Helpers de coordenadas brutas ────────────────────────────────────────────

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
    width: Number.isFinite(w) && w > 0 ? w : COMP_W,
    height: Number.isFinite(h) && h > 0 ? h : COMP_H,
  }
}

export function getComputedDimensions(pos: ComputedPosition | null | undefined): {
  width: number
  height: number
} {
  return {
    width: pos?.width && pos.width > 0 ? pos.width : COMP_W,
    height: pos?.height && pos.height > 0 ? pos.height : COMP_H,
  }
}

// ─── Grid fallback ────────────────────────────────────────────────────────────

function gridPosition(index: number, total: number): CanvasPoint {
  const usableW = BOARD_W - BOARD_PADDING * 2 - COMP_W
  const usableH = BOARD_H - BOARD_PADDING * 2 - COMP_H
  const cols = Math.max(1, Math.ceil(Math.sqrt(total * (BOARD_W / BOARD_H))))
  const cellW = usableW / cols
  const cellH = usableH / Math.ceil(total / cols)
  const col = index % cols
  const row = Math.floor(index / cols)
  return {
    x: BOARD_PADDING + col * cellW + Math.max(0, (cellW - COMP_W) / 2),
    y: BOARD_PADDING + row * cellH + Math.max(0, (cellH - COMP_H) / 2),
  }
}

// ─── CoordinateEngine ─────────────────────────────────────────────────────────

export class CoordinateEngine {
  private positionCache = new Map<string, ComputedPosition>()

  /**
   * Computa posições de todos os componentes no canvas virtual.
   * Normaliza coordenadas reais PCB para o espaço do board (BOARD_W x BOARD_H).
   * Componentes sem coordenadas reais vão para grid automático.
   */
  computePositions(components: BoardComponent[]): Map<string, ComputedPosition> {
    this.positionCache.clear()

    const withCoords: { comp: BoardComponent; raw: CanvasPoint }[] = []
    const withoutCoords: { comp: BoardComponent; index: number }[] = []

    components.forEach((comp, index) => {
      if (hasRealCoords(comp)) {
        withCoords.push({ comp, raw: getRawCoords(comp) })
      } else {
        withoutCoords.push({ comp, index })
      }
    })

    const virtualBoard = withCoords.filter(({ comp }) => usesVirtualBoardCoords(comp))
    const normalizeBatch = withCoords.filter(({ comp }) => !usesVirtualBoardCoords(comp))

    virtualBoard.forEach(({ comp, raw }) => {
      const dim = getRawDimensions(comp)
      this.positionCache.set(comp.id, {
        x: raw.x,
        y: raw.y,
        width: dim.width,
        height: dim.height,
        hasRealCoords: true,
      })
    })

    // Normaliza coordenadas reais para o espaço do board (inclui width/height)
    if (normalizeBatch.length > 0) {
      let minX = Infinity, minY = Infinity
      let maxX = -Infinity, maxY = -Infinity

      normalizeBatch.forEach(({ comp, raw }) => {
        const dim = getRawDimensions(comp)
        minX = Math.min(minX, raw.x)
        minY = Math.min(minY, raw.y)
        maxX = Math.max(maxX, raw.x + dim.width)
        maxY = Math.max(maxY, raw.y + dim.height)
      })

      const rangeX = maxX - minX || 1
      const rangeY = maxY - minY || 1
      const usableW = BOARD_W - BOARD_PADDING * 2
      const usableH = BOARD_H - BOARD_PADDING * 2

      const scale = Math.min(usableW / rangeX, usableH / rangeY)

      const scaledW = rangeX * scale
      const scaledH = rangeY * scale
      const offsetX = BOARD_PADDING + (usableW - scaledW) / 2
      const offsetY = BOARD_PADDING + (usableH - scaledH) / 2

      normalizeBatch.forEach(({ comp, raw }) => {
        const dim = getRawDimensions(comp)
        this.positionCache.set(comp.id, {
          x: offsetX + (raw.x - minX) * scale,
          y: offsetY + (raw.y - minY) * scale,
          width: dim.width * scale,
          height: dim.height * scale,
          hasRealCoords: true,
        })
      })
    }

    // Componentes sem coordenadas → grid
    withoutCoords.forEach(({ comp }, i) => {
      this.positionCache.set(comp.id, {
        ...gridPosition(i, withoutCoords.length),
        hasRealCoords: false,
      })
    })

    return new Map(this.positionCache)
  }

  /**
   * Retorna a posição de um componente específico.
   */
  getPosition(componentId: string): ComputedPosition | null {
    return this.positionCache.get(componentId) ?? null
  }

  /**
   * Converte ponto do canvas virtual para coordenada de tela.
   * canvas → screen: aplica zoom e pan
   */
  canvasToScreen(point: CanvasPoint, viewport: ViewportState): ScreenPoint {
    return {
      x: point.x * viewport.zoom + viewport.panX,
      y: point.y * viewport.zoom + viewport.panY,
    }
  }

  /**
   * Converte ponto da tela para coordenada do canvas virtual.
   * screen → canvas: inverte zoom e pan
   */
  screenToCanvas(point: ScreenPoint, viewport: ViewportState): CanvasPoint {
    return {
      x: (point.x - viewport.panX) / viewport.zoom,
      y: (point.y - viewport.panY) / viewport.zoom,
    }
  }

  /**
   * Retorna a bounding box de um componente em coordenadas de tela.
   * Usado para posicionar tooltips, highlights e overlays.
   */
  getComponentScreenBounds(
    componentId: string,
    viewport: ViewportState
  ): BoundingBox | null {
    const pos = this.positionCache.get(componentId)
    if (!pos) return null

    const dim = getComputedDimensions(pos)
    const topLeft = this.canvasToScreen(pos, viewport)
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: dim.width * viewport.zoom,
      height: dim.height * viewport.zoom,
    }
  }

  /**
   * Verifica se um ponto de tela está dentro de um componente.
   * Usado para detecção de clique/hover.
   */
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

  /**
   * Encontra o componente em um ponto de tela.
   * Retorna o primeiro componente que contém o ponto.
   */
  findComponentAt(
    screenPoint: ScreenPoint,
    componentIds: string[],
    viewport: ViewportState
  ): string | null {
    for (const id of componentIds) {
      if (this.hitTest(screenPoint, id, viewport)) return id
    }
    return null
  }

  /**
   * Calcula o viewport para centralizar um componente na tela.
   */
  centerOnComponent(
    componentId: string,
    viewportWidth: number,
    viewportHeight: number,
    zoom: number
  ): { panX: number; panY: number } | null {
    const pos = this.positionCache.get(componentId)
    if (!pos) return null

    const dim = getComputedDimensions(pos)
    const cx = pos.x + dim.width / 2
    const cy = pos.y + dim.height / 2

    return {
      panX: viewportWidth / 2 - cx * zoom,
      panY: viewportHeight / 2 - cy * zoom,
    }
  }

  /**
   * Calcula o viewport inicial para mostrar todos os componentes.
   */
  fitToComponents(
    viewportWidth: number,
    viewportHeight: number
  ): ViewportState {
    return {
      zoom: 1,
      panX: (viewportWidth - BOARD_W) / 2,
      panY: (viewportHeight - BOARD_H) / 2,
    }
  }
}

// Singleton — uma instância por sessão do BoardView
export const coordinateEngine = new CoordinateEngine()
