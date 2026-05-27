/**
 * BRD / Borneo / ZXW-style board files — XML, JSON, or CSV component lists
 */

import type { BoardParseResult, ParsedComponent } from '@/types/parsed'
import {
  attrs,
  dedupeById,
  inferTypeFromDesignator,
  parseNum,
  textContent,
  validateParsedComponent,
} from './parseUtils'

export class BRDParser {
  static extensions = ['.brd', '.board', '.xml']

  canParse(filename: string, content: string): boolean {
    const lower = filename.toLowerCase()
    if (lower.endsWith('.brd') || lower.endsWith('.board')) return true
    const t = content.trim()
    return t.startsWith('<') || t.startsWith('{') || /^[A-Z]\d+/m.test(t)
  }

  parse(content: string, source = 'brd'): BoardParseResult {
    const trimmed = content.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return this.parseJson(trimmed, source)
    }
    if (trimmed.startsWith('<')) {
      return this.parseXml(trimmed, source)
    }
    return this.parseCsvLines(trimmed, source)
  }

  private parseJson(content: string, source: string): BoardParseResult {
    const errors: string[] = []
    try {
      const data = JSON.parse(content)
      const list = data.components ?? data.parts ?? data.Parts ?? data.items ?? []
      const components: ParsedComponent[] = []
      for (const item of list) {
        const p = validateParsedComponent({
          id: item.name ?? item.designator ?? item.id,
          x: item.x ?? item.X,
          y: item.y ?? item.Y,
          width: item.width ?? item.w ?? item.W,
          height: item.height ?? item.h ?? item.H,
          net: item.net ?? item.Net ?? item.netName,
          layer: item.layer ?? item.side ?? item.Layer,
          type: item.type ?? item.category,
        })
        if (p) components.push(p)
      }
      return this.result(components, source, errors)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'BRD JSON parse failed')
      return this.fail(source, errors)
    }
  }

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

      const selectors = [
        'component',
        'part',
        'Part',
        'Component',
        'item',
        'pad',
      ]

      for (const sel of selectors) {
        doc.querySelectorAll(sel).forEach((el) => {
          const a = attrs(el)
          const p = validateParsedComponent({
            id: a.name ?? a.designator ?? a.id ?? a.ref ?? textContent(el.querySelector('name')),
            x: a.x ?? a.left ?? a.posx ?? a.cx,
            y: a.y ?? a.top ?? a.posy ?? a.cy,
            width: a.width ?? a.w ?? a.sizex,
            height: a.height ?? a.h ?? a.sizey,
            net: a.net ?? a.netname ?? a.signal,
            layer: a.layer ?? a.side ?? a.level,
            type: a.type ?? a.category ?? inferTypeFromDesignator(a.name ?? ''),
          })
          if (p) components.push(p)
        })
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'BRD XML parse failed')
    }

    return this.result(components, source, errors)
  }

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
        x: parts[1],
        y: parts[2],
        width: parts[3] ?? 40,
        height: parts[4] ?? 20,
        net: parts[5] ?? 'GND',
        layer: parts[6] ?? 'top',
        type: parts[7] ?? inferTypeFromDesignator(id),
      })
      if (p) components.push(p)
    }

    if (components.length === 0) errors.push('No BRD components found in text format')
    return this.result(components, source, errors)
  }

  private result(components: ParsedComponent[], source: string, errors: string[]): BoardParseResult {
    const deduped = dedupeById(components)
    return {
      success: deduped.length > 0,
      components: deduped,
      meta: {
        format: 'brd',
        source,
        componentCount: deduped.length,
        parsedAt: new Date().toISOString(),
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
