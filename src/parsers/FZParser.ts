/**
 * FZParser.ts
 * src/parsers/FZParser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Fritzing Parser (pipeline-compatible)
 *
 * Wraps the full deterministic FZParser (src/parsers/fz/FZParser.ts) and
 * converts its normalized BoardData output into the BoardParseResult shape
 * that BoardDataPipeline expects.
 *
 * Accepts: .fz (Fritzing XML), .fzz (Fritzing ZIP archive)
 */

import type { BoardParseResult, ParsedComponent, ParsedLayer } from '@/types/parsed'
import { dedupeById } from './parseUtils'
import { FZParser as FullFZParser } from './fz/FZParser'

const fullParser = new FullFZParser()

export class FZParser {
  static extensions = ['.fz', '.fzz']

  canParse(filename: string, content: string): boolean {
    const lower = filename.toLowerCase()
    if (lower.endsWith('.fz') || lower.endsWith('.fzz')) return true
    const t = content.trim()
    return (
      t.includes('<module') ||
      t.includes('<sketch') ||
      t.includes('fritzing') ||
      t.includes('<fritzingVersion')
    )
  }

  parse(content: string, source = 'fz'): BoardParseResult {
    try {
      const boardData = fullParser.parseText(content, source)
      const errors    = [...boardData.result.errors]

      const components: ParsedComponent[] = boardData.components.map(comp => ({
        id:          comp.reference || comp.id,
        x:           comp.x,
        y:           comp.y,
        width:       Math.max(comp.width,  0.5),
        height:      Math.max(comp.height, 0.5),
        net:         comp.nets[0] ?? 'GND',
        layer:       this.mapSide(comp.side),
        type:        comp.category,
        rotation:    comp.rotation,
        description: comp.description || comp.value,
      }))

      const deduped = dedupeById(components)

      return {
        success:    deduped.length > 0,
        components: deduped,
        meta: {
          format:         'fz',
          source,
          boardWidth:     boardData.bounds.width,
          boardHeight:    boardData.bounds.height,
          componentCount: deduped.length,
          parsedAt:       new Date().toISOString(),
        },
        errors: errors.length ? errors : (deduped.length === 0 ? ['No components found in Fritzing file'] : []),
      }
    } catch (err) {
      return {
        success:    false,
        components: [],
        meta: { format: 'fz', source, componentCount: 0, parsedAt: new Date().toISOString() },
        errors: [`FZ parse error: ${err instanceof Error ? err.message : String(err)}`],
      }
    }
  }

  private mapSide(side: string): ParsedLayer {
    switch (side) {
      case 'bottom': return 'bottom'
      case 'top':    return 'top'
      default:       return 'top'
    }
  }
}
