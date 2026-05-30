/**
 * BRDParser.ts
 * src/parsers/BRDParser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — BRD Parser (pipeline-compatible)
 *
 * Wraps the full deterministic BRDParser (src/parsers/brd/BRDParser.ts) and
 * converts its normalized BoardData output into the BoardParseResult shape
 * that BoardDataPipeline expects.
 *
 * Format support:
 *   KiCad .kicad_pcb  → full s-expression parse → real component positions
 *   Eagle .brd (XML)  → full XML parse → real component positions
 *   JSON/CSV/XML list → component list parse (legacy fallback)
 *   Allegro binary    → stub → mock data with warning
 */

import type { BoardParseResult, ParsedComponent, ParsedLayer } from '@/types/parsed'
import {
  dedupeById,
  inferTypeFromDesignator,
} from './parseUtils'

// ── Full deterministic parser (KiCad, Eagle, Allegro) ──────────────────────
import { BRDParser as FullBRDParser } from './brd/BRDParser'

// ── Legacy simple parsers (JSON/CSV/XML component lists) ────────────────────
import {
  attrs,
  parseNum,
  textContent,
  validateParsedComponent,
} from './parseUtils'

const fullParser = new FullBRDParser()

export class BRDParser {
  static extensions = ['.brd', '.board', '.xml', '.kicad_pcb']

  canParse(filename: string, content: string): boolean {
    const lower = filename.toLowerCase()
    if (
      lower.endsWith('.brd') ||
      lower.endsWith('.board') ||
      lower.endsWith('.kicad_pcb') ||
      lower.endsWith('.kicad')
    ) return true
    const t = content.trim()
    // KiCad s-expression
    if (t.startsWith('(kicad_pcb')) return true
    // Eagle XML
    if (t.includes('<eagle')) return true
    // Legacy JSON/CSV
    return t.startsWith('{') || t.startsWith('[') || /^[A-Z]\d+/m.test(t)
  }

  parse(content: string, source = 'brd'): BoardParseResult {
    const trimmed = content.trim()

    // ── KiCad or Eagle → delegate to full deterministic parser ──────────────
    if (
      trimmed.startsWith('(kicad_pcb') ||
      trimmed.includes('<eagle') ||
      source.toLowerCase().endsWith('.kicad_pcb') ||
      source.toLowerCase().endsWith('.kicad')
    ) {
      return this.fromFullParser(content, source)
    }

    // ── Legacy JSON list ────────────────────────────────────────────────────
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return this.parseJson(trimmed, source)
    }

    // ── Legacy XML component list ────────────────────────────────────────────
    if (trimmed.startsWith('<')) {
      // Try Eagle XML first via full parser
      if (trimmed.includes('<eagle') || trimmed.includes('<board')) {
        return this.fromFullParser(content, source)
      }
      return this.parseXml(trimmed, source)
    }

    // ── CSV/text component list ──────────────────────────────────────────────
    return this.parseCsvLines(trimmed, source)
  }

  // ── Full parser bridge ──────────────────────────────────────────────────────

  private fromFullParser(content: string, source: string): BoardParseResult {
    try {
      const boardData = fullParser.parseText(content, source)
      const warnings = [...boardData.result.warnings]
      const errors   = [...boardData.result.errors]

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
        success: deduped.length > 0 || boardData.result.quality === 'mock',
        components: deduped,
        meta: {
          format:         'brd',
          source,
          boardWidth:     boardData.bounds.width,
          boardHeight:    boardData.bounds.height,
          componentCount: deduped.length,
          parsedAt:       new Date().toISOString(),
        },
        errors: errors.length ? errors : (deduped.length === 0 ? ['No components found in file'] : []),
      }
    } catch (err) {
      return this.fail(source, [
        `Full parser error: ${err instanceof Error ? err.message : String(err)}`
      ])
    }
  }

  private mapSide(side: string): ParsedLayer {
    switch (side) {
      case 'top':        return 'top'
      case 'bottom':     return 'bottom'
      case 'inner':      return 'top'
      case 'all':        return 'top'
      default:           return 'top'
    }
  }

  // ── Legacy JSON parser ──────────────────────────────────────────────────────

  private parseJson(content: string, source: string): BoardParseResult {
    const errors: string[] = []
    try {
      const data = JSON.parse(content)
      const list = data.components ?? data.parts ?? data.Parts ?? data.items ?? []
      const components: ParsedComponent[] = []
      for (const item of list) {
        const p = validateParsedComponent({
          id:     item.name ?? item.designator ?? item.id,
          x:      item.x ?? item.X,
          y:      item.y ?? item.Y,
          width:  item.width ?? item.w ?? item.W,
          height: item.height ?? item.h ?? item.H,
          net:    item.net ?? item.Net ?? item.netName,
          layer:  item.layer ?? item.side ?? item.Layer,
          type:   item.type ?? item.category,
        })
        if (p) components.push(p)
      }
      return this.result(components, source, errors)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'BRD JSON parse failed')
      return this.fail(source, errors)
    }
  }

  // ── Legacy XML component list parser ────────────────────────────────────────

  private parseXml(content: string, source: string): BoardParseResult {
    const errors: string[] = []
    const components: ParsedComponent[] = []

    try {
      const doc = new DOMParser().parseFromString(content, 'text/xml')
      const parseError = doc.querySelector('parsererror')
      if (parseError) {
        errors.push('XML parse error')
        return this.fail(source, errors)
      }

      const selectors = ['component', 'part', 'Part', 'Component', 'item', 'pad']
      for (const sel of selectors) {
        doc.querySelectorAll(sel).forEach((el) => {
          const a = attrs(el)
          const p = validateParsedComponent({
            id:     a.name ?? a.designator ?? a.id ?? a.ref ?? textContent(el.querySelector('name')),
            x:      a.x ?? a.left ?? a.posx ?? a.cx,
            y:      a.y ?? a.top  ?? a.posy ?? a.cy,
            width:  a.width  ?? a.w ?? a.sizex,
            height: a.height ?? a.h ?? a.sizey,
            net:    a.net ?? a.netname ?? a.signal,
            layer:  a.layer ?? a.side ?? a.level,
            type:   a.type  ?? a.category ?? inferTypeFromDesignator(a.name ?? ''),
          })
          if (p) components.push(p)
        })
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'BRD XML parse failed')
    }

    return this.result(components, source, errors)
  }

  // ── Legacy CSV parser ────────────────────────────────────────────────────────

  private parseCsvLines(content: string, source: string): BoardParseResult {
    const errors: string[] = []
    const components: ParsedComponent[] = []
    const lines = content.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'))

    for (const line of lines) {
      const parts = line.split(/[,;\t|]/).map((s) => s.trim())
      if (parts.length < 3) continue
      const id = parts[0].toUpperCase()
      if (!/^[A-Z]/.test(id)) continue

      const p = validateParsedComponent({
        id,
        x:      parts[1],
        y:      parts[2],
        width:  parts[3] ?? 40,
        height: parts[4] ?? 20,
        net:    parts[5] ?? 'GND',
        layer:  parts[6] ?? 'top',
        type:   parts[7] ?? inferTypeFromDesignator(id),
      })
      if (p) components.push(p)
    }

    if (components.length === 0) errors.push('No BRD components found in text format')
    return this.result(components, source, errors)
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private result(components: ParsedComponent[], source: string, errors: string[]): BoardParseResult {
    const deduped = dedupeById(components)
    return {
      success: deduped.length > 0,
      components: deduped,
      meta: {
        format:         'brd',
        source,
        componentCount: deduped.length,
        parsedAt:       new Date().toISOString(),
      },
      errors,
    }
  }

  private fail(source: string, errors: string[]): BoardParseResult {
    return {
      success: false,
      components: [],
      meta: { format: 'brd', source, componentCount: 0, parsedAt: new Date().toISOString() },
      errors,
    }
  }
}
