// Semantic net graph from PDF schematic text (not physical PCB connectivity)

export type SignalType =
  | 'power'
  | 'usb'
  | 'i2c'
  | 'spi'
  | 'clock'
  | 'reset'
  | 'sim'
  | 'rf'
  | 'gpio'
  | 'other'

export interface PdfNetLabel {
  name: string
  normalizedName: string
  x: number
  y: number
  width: number
  height: number
  pageIndex: number
  signalType: SignalType
}

export interface PdfNetNode {
  netId: string
  name: string
  signalType: SignalType
  componentIds: string[]
  color: string
  /** Inferred from PDF text vs region heuristic */
  source: 'pdf_text' | 'region' | 'inferred'
}

/** Component → Net → Component edge */
export interface NetGraphEdge {
  componentId: string
  netId: string
}

export interface NetGraph {
  nets: PdfNetNode[]
  edges: NetGraphEdge[]
}

export interface ComponentGraphNode {
  componentId: string
  connectedNets: string[]
  connectedComponents: string[]
  /** Primary signal for quick filtering */
  signalType: SignalType
}

export interface ComponentGraph {
  nodes: Record<string, ComponentGraphNode>
}

export interface PdfNetGraphContext {
  hits?: import('@/lib/pdfComponentExtractor').PdfTextHit[]
  netLabels?: PdfNetLabel[]
  pageCount?: number
}

export interface PdfNetGraphResult {
  components: import('@/types/board').BoardComponent[]
  netGraph: NetGraph
  componentGraph: ComponentGraph
}
