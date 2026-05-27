import type { BoardComponent } from '@/types/board'
import type { BoardParseResult, ParsedComponent } from '@/types/parsed'
import { BoardViewParser } from './BoardViewParser'
import { BRDParser } from './BRDParser'
import { FZParser } from './FZParser'
import { ComponentMapper } from './ComponentMapper'

export interface BoardDataLoadResult {
  components: BoardComponent[]
  parseResult: BoardParseResult | null
  hasRealGeometry: boolean
  ocrFallbackEnabled: boolean
}

export class BoardDataPipeline {
  private boardViewParser = new BoardViewParser()
  private brdParser = new BRDParser()
  private fzParser = new FZParser()

  detectFormat(filename: string, content: string): BoardParseResult['meta']['format'] {
    if (this.boardViewParser.canParse(filename, content)) return 'boardview'
    if (this.fzParser.canParse(filename, content)) return 'fz'
    if (this.brdParser.canParse(filename, content)) return 'brd'
    return 'unknown'
  }

  parseFile(filename: string, content: string): BoardParseResult {
    if (this.boardViewParser.canParse(filename, content)) {
      return this.boardViewParser.parse(content, filename)
    }
    if (this.fzParser.canParse(filename, content)) {
      return this.fzParser.parse(content, filename)
    }
    if (this.brdParser.canParse(filename, content)) {
      return this.brdParser.parse(content, filename)
    }
    return {
      success: false,
      components: [],
      meta: {
        format: 'unknown',
        source: filename,
        componentCount: 0,
        parsedAt: new Date().toISOString(),
      },
      errors: ['Unsupported board file format'],
    }
  }

  async parseFileInput(file: File): Promise<BoardParseResult> {
    const content = await file.text()
    return this.parseFile(file.name, content)
  }

  buildComponents(
    parseResult: BoardParseResult,
    deviceId: string,
    supabaseRows?: BoardComponent[]
  ): BoardComponent[] {
    if (!parseResult.success || parseResult.components.length === 0) {
      return supabaseRows ?? []
    }
    if (supabaseRows?.length) {
      return ComponentMapper.mergeIntoSupabase(
        supabaseRows,
        parseResult.components,
        deviceId
      )
    }
    return ComponentMapper.toBoardComponents(parseResult.components, deviceId)
  }

  fromSupabase(
    components: BoardComponent[],
    geometryRows: Array<{
      component_name: string
      x: number
      y: number
      width?: number
      height?: number
      layer?: string
      bbox?: { w?: number; h?: number }
    }>,
    deviceId: string
  ): BoardComponent[] {
    const parsed: ParsedComponent[] = []
    for (const row of geometryRows) {
      const p = ComponentMapper.fromBoardGeometryRow(row)
      if (p) parsed.push(p)
    }
    if (parsed.length === 0) return components
    return ComponentMapper.mergeIntoSupabase(components, parsed, deviceId)
  }

  load(params: {
    deviceId: string
    supabaseComponents: BoardComponent[]
    parseResult?: BoardParseResult | null
    geometryRows?: Array<{
      component_name: string
      x: number
      y: number
      width?: number
      height?: number
      layer?: string
    }>
  }): BoardDataLoadResult {
    let components = params.supabaseComponents

    if (params.geometryRows?.length) {
      components = this.fromSupabase(components, params.geometryRows, params.deviceId)
    }

    if (params.parseResult?.success && params.parseResult.components.length > 0) {
      components = this.buildComponents(
        params.parseResult,
        params.deviceId,
        components
      )
    }

    const hasRealGeometry = BoardDataPipeline.hasRealGeometry(components)

    return {
      components,
      parseResult: params.parseResult ?? null,
      hasRealGeometry,
      ocrFallbackEnabled: !hasRealGeometry,
    }
  }

  static hasRealGeometry(components: BoardComponent[]): boolean {
    if (!components.length) return false
    const withGeom = components.filter((c) => BoardDataPipeline.componentHasGeometry(c))
    return withGeom.length >= Math.max(3, Math.ceil(components.length * 0.25))
  }

  static componentHasGeometry(c: BoardComponent): boolean {
    const hasCoords = (v: unknown) => v != null && v !== '' && Number(v) !== 0
    const useBottom = c.side === 'bottom' || c.side === 'sub_bottom'
    const hasPos = useBottom
      ? hasCoords(c.x_bottom) && hasCoords(c.y_bottom)
      : hasCoords(c.x_top) && hasCoords(c.y_top)
    const hasSize =
      (c.width != null && Number(c.width) > 0) ||
      (c.height != null && Number(c.height) > 0)
    const fromParser = c.data_source === 'parsed' || c.data_source === 'merged'
    return hasPos && (hasSize || fromParser)
  }
}

export const boardDataPipeline = new BoardDataPipeline()
