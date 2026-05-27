// src/types/board.ts
// Tipos compartilhados do Tech Board Pro BoardView

// ─── Componente PCB ───────────────────────────────────────────────────────────

export interface BoardComponent {
  id: string
  name: string
  category: string
  description?: string
  part_code?: string
  side: 'top' | 'bottom' | 'sub_top' | 'sub_bottom'
  package?: string
  rotation?: number
  // Coordenadas reais do PCB
  x_top?: number | null
  y_top?: number | null
  x_bottom?: number | null
  y_bottom?: number | null
  /** Parsed geometry (source units, typically 0..10000 or file coords) */
  width?: number | null
  height?: number | null
  // Dados elétricos
  electrical_line?: string
  voltage?: string
  common_faults?: string[]
  // Supabase
  device_id?: string
  /** Origin of geometry — parsed board files take priority over OCR */
  data_source?: 'parsed' | 'supabase' | 'ocr' | 'merged'
  // Virtual regions (PDF schematic enrichment — not physical board placement)
  regionId?: string
  regionName?: string
  clusterId?: string
  x_virtual?: number
  y_virtual?: number
  // PDF schematic net graph enrichment
  connectedNets?: string[]
  connectedComponents?: string[]
  signalType?: string
}

// ─── NET System ───────────────────────────────────────────────────────────────

export interface BoardNet {
  id: string
  name: string           // Ex: "VBAT_MAIN"
  voltage?: string       // Ex: "3.8V"
  power_rail?: string    // Ex: "VBAT"
  color?: string         // Cor para renderização
  components: string[]   // IDs dos componentes conectados
}

// ─── Viewport / Transform ─────────────────────────────────────────────────────

export interface ViewportState {
  zoom: number
  panX: number
  panY: number
}

export interface CanvasPoint {
  x: number
  y: number
}

export interface ScreenPoint {
  x: number
  y: number
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

// ─── Posição computada no canvas ──────────────────────────────────────────────

export interface ComputedPosition {
  x: number
  y: number
  width?: number
  height?: number
  hasRealCoords: boolean
}

// ─── Highlight ────────────────────────────────────────────────────────────────

export type HighlightType = 'selected' | 'connected' | 'search' | 'ai'

export interface ComponentHighlight {
  componentId: string
  type: HighlightType
  color: string
  animated: boolean
}

// ─── Trace ────────────────────────────────────────────────────────────────────

export interface PCBTrace {
  id: string
  fromId: string
  toId: string
  net: string
  color: string
  animated: boolean
  points?: CanvasPoint[]  // Para futuro bezier path
}

// ─── Estado do BoardView ──────────────────────────────────────────────────────

export interface BoardViewState {
  deviceId: string
  components: BoardComponent[]
  nets: BoardNet[]
  selectedComponent: BoardComponent | null
  highlightedComponents: Set<string>
  activeLayer: 'top' | 'bottom' | 'sub_top' | 'sub_bottom'
  showAllLayers: boolean
  viewport: ViewportState
  boardImage: string | null
  loading: boolean
}

// ─── Eventos ──────────────────────────────────────────────────────────────────

export interface ComponentClickEvent {
  component: BoardComponent
  position: CanvasPoint
  screenPosition: ScreenPoint
}
