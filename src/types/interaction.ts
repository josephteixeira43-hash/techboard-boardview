// Professional BoardViewer interaction types — future-ready

import type { BoardComponent } from './board'

export type InteractionMode = 'navigate' | 'inspect' | 'search'

export type ComponentStatus = 'detected' | 'simulated' | 'manual' | 'unknown'

export interface ComponentMetadata {
  id: string
  name: string
  type: string
  category: string
  net: string
  voltage: string
  layer: string
  x: number
  y: number
  width: number
  height: number
  hasRealCoords: boolean
  description?: string
  partCode?: string
  status: ComponentStatus
  /** Placeholders for future features */
  schematicRef?: string
  repairNotes?: string
  testPoints?: string[]
  aiDiagnosis?: string
}

export interface SearchMatch {
  component: BoardComponent
  score: number
  matchType: 'name' | 'net' | 'category' | 'description' | 'testpoint'
  label: string
}

export interface TooltipState {
  visible: boolean
  screenX: number
  screenY: number
  metadata: ComponentMetadata | null
}

export interface InteractionPointer {
  screenX: number
  screenY: number
  canvasX: number
  canvasY: number
}
