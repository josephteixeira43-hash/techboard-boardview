// src/core/boardview/ViewportManager.ts
// Fonte única de verdade para zoom e pan do BoardView
// Resolve o problema de zoom inconsistente ao redor do cursor

import type { ViewportState, ScreenPoint } from '@/types/board'

export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 4

export class ViewportManager {
  private state: ViewportState = { zoom: 1, panX: 0, panY: 0 }
  private listeners: Array<(state: ViewportState) => void> = []

  getState(): ViewportState {
    return { ...this.state }
  }

  subscribe(fn: (state: ViewportState) => void): () => void {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter(l => l !== fn) }
  }

  private notify() {
    const s = this.getState()
    this.listeners.forEach(fn => fn(s))
  }

  /**
   * Converte coordenadas de tela (pixels do viewport) para board-space.
   * Inverso exato da transform aplicada no canvas:
   *   screenX = boardX * zoom + panX
   *   screenY = boardY * zoom + panY
   * Portanto:
   *   boardX = (screenX - panX) / zoom
   *   boardY = (screenY - panY) / zoom
   */
  screenToBoard(screenX: number, screenY: number): { x: number; y: number } {
    const { zoom, panX, panY } = this.state
    return {
      x: (screenX - panX) / zoom,
      y: (screenY - panY) / zoom,
    }
  }

  /**
   * Converte coordenadas de board-space para tela.
   */
  boardToScreen(boardX: number, boardY: number): { x: number; y: number } {
    const { zoom, panX, panY } = this.state
    return {
      x: boardX * zoom + panX,
      y: boardY * zoom + panY,
    }
  }

  /**
   * Zoom ao redor de um ponto da tela (cursor).
   * Mantém o ponto sob o cursor estacionário durante o zoom.
   */
  zoomAt(screenPoint: ScreenPoint, delta: number): ViewportState {
    const factor = delta > 0 ? 1.1 : 0.9
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.state.zoom * factor))
    const ratio = newZoom / this.state.zoom

    this.state = {
      zoom: newZoom,
      panX: screenPoint.x - (screenPoint.x - this.state.panX) * ratio,
      panY: screenPoint.y - (screenPoint.y - this.state.panY) * ratio,
    }
    this.notify()
    return this.getState()
  }

  /**
   * Pan absoluto.
   */
  setPan(panX: number, panY: number): ViewportState {
    this.state = { ...this.state, panX, panY }
    this.notify()
    return this.getState()
  }

  /**
   * Pan relativo (delta).
   */
  applyPanDelta(dx: number, dy: number): ViewportState {
    this.state = {
      ...this.state,
      panX: this.state.panX + dx,
      panY: this.state.panY + dy,
    }
    this.notify()
    return this.getState()
  }

  /**
   * Define zoom e pan simultaneamente.
   */
  setViewport(viewport: ViewportState): ViewportState {
    this.state = { ...viewport }
    this.notify()
    return this.getState()
  }

  /**
   * Reset para estado inicial.
   */
  reset(viewportWidth: number, viewportHeight: number, boardW: number, boardH: number): ViewportState {
    this.state = {
      zoom: 1,
      panX: (viewportWidth - boardW) / 2,
      panY: (viewportHeight - boardH) / 2,
    }
    this.notify()
    return this.getState()
  }

  /**
   * Centraliza em um ponto do canvas com zoom alvo.
   */
  centerOn(
    canvasX: number,
    canvasY: number,
    viewportWidth: number,
    viewportHeight: number,
    targetZoom?: number
  ): ViewportState {
    const zoom = targetZoom ?? this.state.zoom
    this.state = {
      zoom,
      panX: viewportWidth / 2 - canvasX * zoom,
      panY: viewportHeight / 2 - canvasY * zoom,
    }
    this.notify()
    return this.getState()
  }

  /**
   * Clamp do zoom para limites definidos.
   */
  clampZoom(zoom: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
  }
}

export const viewportManager = new ViewportManager()
