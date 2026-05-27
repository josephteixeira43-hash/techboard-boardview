/**
 * FZ / Wuxinji / 维修图纸-style XML board exports
 */

import type { BoardParseResult, ParsedComponent } from '@/types/parsed'
import {
  attrs,
  dedupeById,
  inferTypeFromDesignator,
  parseNum,
  validateParsedComponent,
} from './parseUtils'

export class FZParser {
  static extensions = ['.fz', '.fz.xml', '.xml']

  canParse(filename: string, content: string): boolean {
    const lower = filename.toLowerCase()
    if (lower.endsWith('.fz')) return true
    const t = content.trim()
    return (
      t.includes('<FZ') ||
      t.includes('<fz') ||
      t.includes('Designator=') ||
      t.includes('<Part') ||
      t.includes('<Parts')
    )
  }

  parse(content: string, source = 'fz'): BoardParseResult {
    const errors: string[] = []
    const components: ParsedComponent[] = []

    try {
      let xml = content.trim()

      // Some .fz files wrap XML in binary header — extract XML segment
      const xmlStart = xml.indexOf('<?xml')
      const altStart = xml.indexOf('<')
      if (xmlStart > 0) xml = xml.slice(xmlStart)
      else if (altStart > 0 && !xml.startsWith('<')) xml = xml.slice(altStart)

      const doc = new DOMParser().parseFromString(xml, 'text/xml')
      if (doc.querySelector('parsererror')) {
        errors.push('FZ XML parse error')
        return this.fail(source, errors)
      }

      const partNodes = doc.querySelectorAll(
        'Part, part, PART, Component, component, Chip, chip, Item, item'
      )

      partNodes.forEach((el) => {
        const a = attrs(el)
        const id =
          a.designator ??
          a.name ??
          a.ref ??
          a.id ??
          el.getAttribute('Designator') ??
          ''

        const p = validateParsedComponent({
          id,
          x: a.left ?? a.x ?? a.posx ?? a.cx ?? el.getAttribute('Left'),
          y: a.top ?? a.y ?? a.posy ?? a.cy ?? el.getAttribute('Top'),
          width: a.width ?? a.w ?? el.getAttribute('Width'),
          height: a.height ?? a.h ?? el.getAttribute('Height'),
          net: a.net ?? a.netname ?? a.signal ?? el.getAttribute('Net'),
          layer: a.layer ?? a.side ?? el.getAttribute('Layer'),
          type: a.type ?? a.packagetype ?? inferTypeFromDesignator(id),
          rotation: parseNum(a.rotation ?? a.angle, 0),
        })
        if (p) components.push(p)
      })

      // FZ netlist blocks: Designator linked to Net
      const netMap = new Map<string, string>()
      doc.querySelectorAll('Net, net, NET').forEach((netEl) => {
        const netName =
          attrs(netEl).name ?? netEl.getAttribute('Name') ?? netEl.textContent?.trim() ?? ''
        netEl.querySelectorAll('Pin, pin, Ref, ref').forEach((pin) => {
          const ref = attrs(pin).designator ?? pin.textContent?.trim()
          if (ref && netName) netMap.set(ref.toUpperCase(), netName)
        })
      })

      components.forEach((c) => {
        const n = netMap.get(c.id)
        if (n) c.net = n
      })
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'FZ parse failed')
    }

    const deduped = dedupeById(components)
    return {
      success: deduped.length > 0,
      components: deduped,
      meta: {
        format: 'fz',
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
      meta: { format: 'fz', source, componentCount: 0, parsedAt: new Date().toISOString() },
      errors,
    }
  }
}
