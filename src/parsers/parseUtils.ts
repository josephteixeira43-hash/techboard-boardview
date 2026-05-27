import type { ParsedComponent, ParsedLayer } from '@/types/parsed'

const LAYER_MAP: Record<string, ParsedLayer> = {
  top: 'top',
  bottom: 'bottom',
  sub_top: 'sub_top',
  sub_bottom: 'sub_bottom',
  '1': 'top',
  '2': 'bottom',
  t: 'top',
  b: 'bottom',
}

export function normalizeLayer(raw: string | undefined | null): ParsedLayer {
  if (!raw) return 'top'
  const key = raw.toLowerCase().replace(/\s+/g, '_')
  if (key.includes('sub') && key.includes('bottom')) return 'sub_bottom'
  if (key.includes('sub') && key.includes('top')) return 'sub_top'
  if (key.includes('bottom') || key === 'b') return 'bottom'
  return LAYER_MAP[key] ?? 'top'
}

export function inferTypeFromDesignator(id: string): string {
  const u = id.toUpperCase()
  if (/^U\d/.test(u)) return 'IC'
  if (/^C\d/.test(u)) return 'CAPACITOR'
  if (/^R\d/.test(u)) return 'RESISTOR'
  if (/^L\d/.test(u)) return 'INDUCTOR'
  if (/^Q\d/.test(u)) return 'TRANSISTOR'
  if (/^D\d/.test(u)) return 'DIODE'
  if (/^PAM/.test(u)) return 'RF'
  if (/^ANT/.test(u)) return 'RF'
  if (/^PMIC/.test(u)) return 'PMIC'
  if (/^TP/.test(u)) return 'TESTPOINT'
  if (/^J|^CN/.test(u)) return 'CONNECTOR'
  return 'OTHER'
}

export function parseNum(v: string | number | null | undefined, fallback = 0): number {
  if (v == null || v === '') return fallback
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

export function validateParsedComponent(raw: Partial<ParsedComponent>): ParsedComponent | null {
  const id = String(raw.id ?? '').trim().toUpperCase()
  if (!id || id.length < 2) return null

  const width = parseNum(raw.width, 40)
  const height = parseNum(raw.height, 20)
  const x = parseNum(raw.x)
  const y = parseNum(raw.y)

  return {
    id,
    x,
    y,
    width: Math.max(4, width),
    height: Math.max(4, height),
    net: String(raw.net ?? 'GND').trim() || 'GND',
    layer: normalizeLayer(String(raw.layer ?? 'top')),
    type: String(raw.type ?? inferTypeFromDesignator(id)).toUpperCase(),
    rotation: raw.rotation,
    description: raw.description,
  }
}

export function dedupeById(components: ParsedComponent[]): ParsedComponent[] {
  const map = new Map<string, ParsedComponent>()
  for (const c of components) {
    map.set(c.id, c)
  }
  return Array.from(map.values())
}

export function attrs(el: Element): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i]
    out[a.name.toLowerCase()] = a.value
  }
  return out
}

export function textContent(el: Element | null): string {
  return el?.textContent?.trim() ?? ''
}
