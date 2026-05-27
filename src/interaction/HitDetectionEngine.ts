/**
 * Professional hit detection — screen ↔ canvas with zoom/pan.
 * Uses CoordinateEngine + spatial grid for large boards.
 */

import type { BoardComponent, ScreenPoint, ViewportState, ComputedPosition } from '@/types/board'
import { CoordinateEngine, getComputedDimensions } from '@/core/boardview/CoordinateEngine'

const CELL = 100
const HIT_PAD = 6

export class HitDetectionEngine {
  private grid = new Map<string, string[]>()
  private componentMap = new Map<string, BoardComponent>()

  rebuild(
    components: BoardComponent[],
    positions: Map<string, ComputedPosition>,
    activeLayer: string
  ) {
    this.grid.clear()
    this.componentMap.clear()

    for (const comp of components) {
      if (comp.side !== activeLayer) continue
      const pos = positions.get(comp.id)
      if (!pos) continue
      this.componentMap.set(comp.id, comp)
      const dim = getComputedDimensions(pos)
      const keys = this.cellsForRect(
        pos.x,
        pos.y,
        dim.width + HIT_PAD * 2,
        dim.height + HIT_PAD * 2
      )
      for (const key of keys) {
        const bucket = this.grid.get(key) ?? []
        bucket.push(comp.id)
        this.grid.set(key, bucket)
      }
    }
  }

  private cellsForRect(x: number, y: number, w: number, h: number): string[] {
    const keys: string[] = []
    const x0 = Math.floor(x / CELL)
    const y0 = Math.floor(y / CELL)
    const x1 = Math.floor((x + w) / CELL)
    const y1 = Math.floor((y + h) / CELL)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        keys.push(`${cx},${cy}`)
      }
    }
    return keys
  }

  private pointInComponent(
    canvasX: number,
    canvasY: number,
    pos: ComputedPosition
  ): boolean {
    const dim = getComputedDimensions(pos)
    return (
      canvasX >= pos.x - HIT_PAD &&
      canvasX <= pos.x + dim.width + HIT_PAD &&
      canvasY >= pos.y - HIT_PAD &&
      canvasY <= pos.y + dim.height + HIT_PAD
    )
  }

  findAt(
    screen: ScreenPoint,
    viewport: ViewportState,
    coordEngine: CoordinateEngine,
    layerIds: string[]
  ): BoardComponent | null {
    for (let i = layerIds.length - 1; i >= 0; i--) {
      if (coordEngine.hitTest(screen, layerIds[i], viewport)) {
        return this.componentMap.get(layerIds[i]) ?? null
      }
    }
    return null
  }

  findAtFast(
    screen: ScreenPoint,
    viewport: ViewportState,
    coordEngine: CoordinateEngine
  ): BoardComponent | null {
    const canvas = coordEngine.screenToCanvas(screen, viewport)
    const key = `${Math.floor(canvas.x / CELL)},${Math.floor(canvas.y / CELL)}`
    const candidates = this.grid.get(key) ?? []
    const seen = new Set<string>()

    for (let i = candidates.length - 1; i >= 0; i--) {
      const id = candidates[i]
      if (seen.has(id)) continue
      seen.add(id)
      const comp = this.componentMap.get(id)
      if (!comp) continue
      const pos = coordEngine.getPosition(id)
      if (!pos) continue
      if (this.pointInComponent(canvas.x, canvas.y, pos)) return comp
    }

    return null
  }

  getLayerIds(components: BoardComponent[], activeLayer: string): string[] {
    return components.filter((c) => c.side === activeLayer).map((c) => c.id)
  }
}
