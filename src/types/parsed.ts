/** Parsed board component — canonical geometry from BRD/FZ/BoardView files */

export type ParsedLayer = 'top' | 'bottom' | 'sub_top' | 'sub_bottom'

export interface ParsedComponent {
  id: string
  x: number
  y: number
  width: number
  height: number
  net: string
  layer: ParsedLayer | string
  type: string
  rotation?: number
  description?: string
}

export type BoardFileFormat = 'boardview' | 'brd' | 'fz' | 'json' | 'xml' | 'unknown'

export interface BoardParseMeta {
  format: BoardFileFormat
  source: string
  boardWidth?: number
  boardHeight?: number
  componentCount: number
  parsedAt: string
}

export interface BoardParseResult {
  success: boolean
  components: ParsedComponent[]
  meta: BoardParseMeta
  errors: string[]
}

export type ComponentDataSource = 'parsed' | 'supabase' | 'ocr' | 'merged'
