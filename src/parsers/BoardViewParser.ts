/**
 * Tech Board Pro native boardview format (.boardview.json / .tbv.json)
 */

import type { BoardParseResult, ParsedComponent } from '@/types/parsed'
import { dedupeById, parseNum, validateParsedComponent } from './parseUtils'

export class BoardViewParser {
  static extensions = ['.boardview', '.boardview.json', '.tbv', '.tbv.json']

  canParse(filename: string, content: string): boolean {
    const lower = filename.toLowerCase()
    if (BoardViewParser.extensions.some((e) => lower.endsWith(e))) return true
    try {
      const j = JSON.parse(content)
      return !!(j.components || j.parts || j.board?.components)
    } catch {
      return false
    }
  }

  parse(content: string, source = 'boardview'): BoardParseResult {
    const errors: string[] = []
    try {
      const data = JSON.parse(content)
      const list =
        data.components ??
        data.parts ??
        data.board?.components ??
        data.boardview?.components ??
        []

      const boardW = parseNum(data.board?.width ?? data.width, 0)
      const boardH = parseNum(data.board?.height ?? data.height, 0)

      const components: ParsedComponent[] = []
      for (const item of list) {
        const parsed = validateParsedComponent({
          id: item.id ?? item.name ?? item.designator,
          x: item.x ?? item.left ?? item.posX,
          y: item.y ?? item.top ?? item.posY,
          width: item.width ?? item.w,
          height: item.height ?? item.h,
          net: item.net ?? item.netName ?? item.electrical_line,
          layer: item.layer ?? item.side,
          type: item.type ?? item.category,
          rotation: item.rotation,
          description: item.description,
        })
        if (parsed) components.push(parsed)
      }

      return {
        success: components.length > 0,
        components: dedupeById(components),
        meta: {
          format: 'boardview',
          source,
          boardWidth: boardW || undefined,
          boardHeight: boardH || undefined,
          componentCount: components.length,
          parsedAt: new Date().toISOString(),
        },
        errors,
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Invalid BoardView JSON')
      return this.empty('boardview', source, errors)
    }
  }

  private empty(format: BoardParseResult['meta']['format'], source: string, errors: string[]): BoardParseResult {
    return {
      success: false,
      components: [],
      meta: { format, source, componentCount: 0, parsedAt: new Date().toISOString() },
      errors,
    }
  }
}
