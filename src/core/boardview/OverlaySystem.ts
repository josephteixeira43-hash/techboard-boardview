// src/core/boardview/OverlaySystem.ts
// Sistema de overlays ativáveis para o BoardView
// Controla visibilidade de pads, vias, nets, tensões, labels, traces

export interface OverlayState {
  showPads:       boolean
  showVias:       boolean
  showNets:       boolean
  showTraces:     boolean
  showVoltages:   boolean
  showLabels:     boolean
  showConnected:  boolean
  showSilkscreen: boolean
  showGrid:       boolean
}

export const DEFAULT_OVERLAY: OverlayState = {
  showPads:       true,
  showVias:       true,
  showNets:       true,
  showTraces:     true,
  showVoltages:   false,
  showLabels:     true,
  showConnected:  true,
  showSilkscreen: true,
  showGrid:       true,
}

type OverlayListener = (state: OverlayState) => void

export class OverlaySystem {
  private state: OverlayState = { ...DEFAULT_OVERLAY }
  private listeners: OverlayListener[] = []

  getState(): OverlayState {
    return { ...this.state }
  }

  toggle(key: keyof OverlayState): OverlayState {
    this.state = { ...this.state, [key]: !this.state[key] }
    this.notify()
    return this.getState()
  }

  set(key: keyof OverlayState, value: boolean): OverlayState {
    this.state = { ...this.state, [key]: value }
    this.notify()
    return this.getState()
  }

  reset(): OverlayState {
    this.state = { ...DEFAULT_OVERLAY }
    this.notify()
    return this.getState()
  }

  subscribe(fn: OverlayListener): () => void {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter(l => l !== fn) }
  }

  private notify() {
    this.listeners.forEach(fn => fn(this.getState()))
  }
}
