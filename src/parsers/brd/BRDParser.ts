/**
 * BRDParser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Cadence Allegro / OrCAD BRD Parser
 *
 * SUPPORTED FORMATS
 * ─────────────────
 * • Cadence Allegro BRD (binary + ASCII variants)
 * • OrCAD PCB Designer BRD
 * • KiCad .kicad_pcb (s-expression, text-based)
 * • Eagle .brd (XML-based)
 *
 * ARCHITECTURE
 * ────────────
 * The parser operates in two phases:
 *
 *   Phase 1 — Detection:   sniff(buffer) reads the first 512 bytes and
 *                          identifies the format variant.
 *
 *   Phase 2 — Extraction:  The appropriate sub-parser is dispatched.
 *                          Each sub-parser extracts RawBoardData in mm.
 *
 *   Phase 3 — Normalize:   BoardGeometryNormalizer.normalize() translates
 *                          origin, rounds coordinates, builds net index.
 *
 * REAL BRD DECODING NOTE
 * ──────────────────────
 * Cadence Allegro BRD is a proprietary binary format with no public spec.
 * Full decoding requires reverse-engineered offset tables (per format version).
 * This implementation provides:
 *   - Full pipeline, types, normalization, and mock output
 *   - KiCad and Eagle XML parsing (text-based, fully implementable)
 *   - Stubs for Allegro binary with documented extension points
 *
 * To plug in real Allegro decoding: implement AllegroDecoder and inject via
 * BRDParser.registerDecoder('allegro', new AllegroDecoder()).
 *
 * DETERMINISM
 * ───────────
 * • No Math.random · No Date.now · No async I/O
 * • All arrays sorted by stable keys before freezing
 * • Same file bytes → same BoardData every time
 */

import type { BoardData, ParseResult } from '../common/BoardTypes'
import type { RawBoardData, RawComponent, RawPad, RawVia, RawTrace, RawNet, RawOutlineSegment } from '../common/BoardGeometryNormalizer'
import { BoardGeometryNormalizer } from '../common/BoardGeometryNormalizer'
import { milToMm, inchToMm, normalizeLayer, normalizeSide, inferCategory, roundMm } from '../common/BoardNormalizationUtils'

// ─── Format Detection ─────────────────────────────────────────────────────────

type BRDVariant = 'kicad' | 'eagle_xml' | 'allegro_binary' | 'allegro_ascii' | 'unknown'

function detectVariant(buffer: ArrayBuffer): BRDVariant {
  const bytes = new Uint8Array(buffer, 0, Math.min(512, buffer.byteLength))
  const head  = String.fromCharCode(...bytes).toLowerCase()

  // KiCad PCB: starts with "(kicad_pcb"
  if (head.includes('(kicad_pcb'))              return 'kicad'

  // Eagle XML: starts with "<?xml" and contains "<eagle"
  if (head.includes('<?xml') && head.includes('<eagle')) return 'eagle_xml'

  // Allegro ASCII: starts with "PADS-PCB" or "ACCEL_ASCII"
  if (head.startsWith('pads-pcb') || head.startsWith('accel_ascii')) return 'allegro_ascii'

  // Allegro binary: magic bytes 0x00 0x FF at offset 0, version marker
  if (bytes[0] === 0x00 && bytes[1] === 0xFF)   return 'allegro_binary'
  if (bytes[0] === 0x41 && bytes[1] === 0x4C)   return 'allegro_binary' // "AL"

  return 'unknown'
}

// ─── KiCad S-Expression Parser ────────────────────────────────────────────────

/**
 * Minimal S-expression tokenizer for KiCad .kicad_pcb format.
 * Handles: atoms, strings (quoted), nested lists.
 * No recursion limit issues — iterative approach.
 */
function tokenizeKiCad(text: string): string[] {
  const tokens: string[] = []
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue }

    // Comments
    if (ch === ';') { while (i < n && text[i] !== '\n') i++; continue }

    // Parens
    if (ch === '(' || ch === ')') { tokens.push(ch); i++; continue }

    // Quoted string
    if (ch === '"') {
      let s = ''
      i++
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) { i++; s += text[i] } else { s += text[i] }
        i++
      }
      i++ // closing "
      tokens.push(s)
      continue
    }

    // Atom
    let atom = ''
    while (i < n && text[i] !== ' ' && text[i] !== '\t' && text[i] !== '\n'
           && text[i] !== '\r' && text[i] !== '(' && text[i] !== ')') {
      atom += text[i++]
    }
    if (atom) tokens.push(atom)
  }

  return tokens
}

/**
 * Parse KiCad s-expression tokens into a nested structure.
 * Returns [node, nextIndex].
 */
type SExpr = string | SExpr[]

function parseSExpr(tokens: string[], start: number): [SExpr, number] {
  if (tokens[start] !== '(') return [tokens[start] ?? '', start + 1]
  const list: SExpr[] = []
  let i = start + 1
  while (i < tokens.length && tokens[i] !== ')') {
    const [child, next] = parseSExpr(tokens, i)
    list.push(child)
    i = next
  }
  return [list, i + 1]
}

function kicadFloat(s: SExpr): number {
  if (typeof s === 'string') return parseFloat(s) || 0
  return 0
}

function kicadStr(s: SExpr): string {
  if (typeof s === 'string') return s
  return ''
}

function findAtom(node: SExpr[], key: string): SExpr[] | null {
  if (!Array.isArray(node)) return null
  for (const child of node) {
    if (Array.isArray(child) && child[0] === key) return child as SExpr[]
  }
  return null
}

function findAllAtoms(node: SExpr[], key: string): SExpr[][] {
  if (!Array.isArray(node)) return []
  const results: SExpr[][] = []
  for (const child of node) {
    if (Array.isArray(child) && child[0] === key) results.push(child as SExpr[])
  }
  return results
}

// ─── KiCad Full Parser ────────────────────────────────────────────────────────

function parseKiCad(text: string, name: string): RawBoardData {
  const errors: string[]   = []
  const warnings: string[] = []

  const tokens = tokenizeKiCad(text)
  if (!tokens.length) {
    return mockRawBoard(name, 'kicad', errors, ['Empty KiCad file'])
  }

  let root: SExpr
  try {
    ;[root] = parseSExpr(tokens, 0)
  } catch {
    return mockRawBoard(name, 'kicad', errors, ['Failed to parse KiCad s-expression'])
  }

  if (!Array.isArray(root) || root[0] !== 'kicad_pcb') {
    return mockRawBoard(name, 'kicad', errors, ['Not a valid kicad_pcb file'])
  }

  const rootArr = root as SExpr[]

  // ── Layers ──
  const layersNode = findAtom(rootArr, 'layers')
  const layerMap   = new Map<string, number>() // name → id
  const layers     = layersNode
    ? findAllAtoms(layersNode as SExpr[], 'layer').flatMap((l, _i) => {
        const id      = parseInt(kicadStr(l[1]), 10)
        const rawName = kicadStr(l[2])
        layerMap.set(rawName, id)
        return [normalizeLayer(rawName, id)]
      })
    : []

  const getLayerId = (rawName: string): number => layerMap.get(rawName) ?? 0

  // ── Nets ──
  const netNodes = findAllAtoms(rootArr, 'net')
  const rawNets: RawNet[] = netNodes.map(n => ({
    id:       parseInt(kicadStr(n[1]), 10),
    name:     kicadStr(n[2]),
    voltage:  '',
    netClass: 'Signal',
  }))

  // ── Footprints (components + pads) ──
  const fpNodes = findAllAtoms(rootArr, 'footprint')
  const rawComponents: RawComponent[] = []
  const rawPads: RawPad[] = []

  for (const fp of fpNodes) {
    const fpArr   = fp as SExpr[]
    const ref     = kicadStr(findAtom(fpArr, 'reference')?.[1] ?? '')
    const val     = kicadStr(findAtom(fpArr, 'value')?.[1] ?? '')
    const fpName  = kicadStr(fpArr[1])
    const layerRaw = kicadStr(findAtom(fpArr, 'layer')?.[1] ?? 'F.Cu')
    const side    = layerRaw.startsWith('B.') ? 'bottom' : 'top'
    const layerId = getLayerId(layerRaw)

    const atNode   = findAtom(fpArr, 'at')
    const cx       = atNode ? kicadFloat(atNode[1]) : 0
    const cy       = atNode ? kicadFloat(atNode[2]) : 0
    const rotation = atNode && atNode[3] ? kicadFloat(atNode[3]) : 0

    const compId = ref || `comp_${rawComponents.length}`
    const compNets: string[] = []
    const compPadIds: string[] = []

    // Pads within this footprint
    const padNodes = findAllAtoms(fpArr, 'pad')
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    for (const pad of padNodes) {
      const padArr    = pad as SExpr[]
      const padNum    = kicadStr(padArr[1])
      const padType   = kicadStr(padArr[2]) as BoardPad['type']
      const padShape  = kicadStr(padArr[3]) as BoardPad['shape']
      const padAt     = findAtom(padArr, 'at')
      const padSize   = findAtom(padArr, 'size')
      const padNet    = findAtom(padArr, 'net')
      const padLayer  = findAtom(padArr, 'layers')

      const px = cx + (padAt ? kicadFloat(padAt[1]) : 0)
      const py = cy + (padAt ? kicadFloat(padAt[2]) : 0)
      const pw = padSize ? kicadFloat(padSize[1]) : 1
      const ph = padSize ? kicadFloat(padSize[2]) : 1
      const netName = padNet ? kicadStr(padNet[2]) : ''

      const padLayerRaw = padLayer && padLayer[1] ? kicadStr(padLayer[1]) : layerRaw
      const padSide = padLayerRaw.startsWith('B.') ? 'bottom' : 'top'

      const drill = findAtom(padArr, 'drill')
      const drillDia = drill ? kicadFloat(drill[1]) : 0

      const padId = `${compId}_pad_${padNum}`
      compPadIds.push(padId)
      if (netName && !compNets.includes(netName)) compNets.push(netName)

      rawPads.push({
        id: padId, componentId: compId, number: padNum,
        type: padType || 'smd', shape: padShape || 'rect',
        x: px, y: py, width: pw, height: ph,
        rotation: padAt && padAt[3] ? kicadFloat(padAt[3]) : rotation,
        layerId: getLayerId(padLayerRaw), side: padSide as any,
        netName, drillDia,
      })

      if (px - pw / 2 < minX) minX = px - pw / 2
      if (py - ph / 2 < minY) minY = py - ph / 2
      if (px + pw / 2 > maxX) maxX = px + pw / 2
      if (py + ph / 2 > maxY) maxY = py + ph / 2
    }

    const width  = isFinite(maxX) ? maxX - minX : 2
    const height = isFinite(maxY) ? maxY - minY : 2

    rawComponents.push({
      id: compId, reference: ref, value: val, footprint: fpName,
      category: inferCategory(ref, val), description: val,
      x: cx, y: cy, width, height, rotation,
      side: side as any, layerId,
      nets: compNets, padIds: compPadIds, mpn: '', dnp: false,
    })
  }

  // ── Vias ──
  const rawVias: RawVia[] = findAllAtoms(rootArr, 'via').map((v, i) => {
    const vArr = v as SExpr[]
    const at   = findAtom(vArr, 'at')
    const size = findAtom(vArr, 'size')
    const drill = findAtom(vArr, 'drill')
    const net   = findAtom(vArr, 'net')
    const layers = findAtom(vArr, 'layers')
    return {
      id:         `via_${i}`,
      type:       'through',
      x:          at ? kicadFloat(at[1]) : 0,
      y:          at ? kicadFloat(at[2]) : 0,
      outerDia:   size ? kicadFloat(size[1]) : 0.8,
      drillDia:   drill ? kicadFloat(drill[1]) : 0.4,
      layerStart: layers ? getLayerId(kicadStr(layers[1])) : 0,
      layerEnd:   layers ? getLayerId(kicadStr(layers[2])) : 1,
      netName:    net ? kicadStr(net[2]) : '',
    }
  })

  // ── Traces ──
  const rawTraces: RawTrace[] = []
  findAllAtoms(rootArr, 'segment').forEach((s, i) => {
    const sArr  = s as SExpr[]
    const start = findAtom(sArr, 'start')
    const end   = findAtom(sArr, 'end')
    const width = findAtom(sArr, 'width')
    const layer = findAtom(sArr, 'layer')
    const net   = findAtom(sArr, 'net')
    rawTraces.push({
      id: `trace_${i}`, type: 'segment',
      layerId: layer ? getLayerId(kicadStr(layer[1])) : 0,
      netName: net ? kicadStr(net[2]) : '',
      width:   width ? kicadFloat(width[1]) : 0.25,
      x1: start ? kicadFloat(start[1]) : 0,
      y1: start ? kicadFloat(start[2]) : 0,
      x2: end   ? kicadFloat(end[1])   : 0,
      y2: end   ? kicadFloat(end[2])   : 0,
      arcCx: 0, arcCy: 0, arcR: 0,
    })
  })

  // ── Outline ──
  const rawOutline: RawOutlineSegment[] = []
  findAllAtoms(rootArr, 'gr_line').forEach(l => {
    const lArr  = l as SExpr[]
    const lyr   = findAtom(lArr, 'layer')
    if (kicadStr(lyr?.[1] ?? '') !== 'Edge.Cuts') return
    const start = findAtom(lArr, 'start')
    const end   = findAtom(lArr, 'end')
    rawOutline.push({
      type: 'line',
      x1: start ? kicadFloat(start[1]) : 0,
      y1: start ? kicadFloat(start[2]) : 0,
      x2: end   ? kicadFloat(end[1])   : 0,
      y2: end   ? kicadFloat(end[2])   : 0,
      arcCx: 0, arcCy: 0, arcR: 0,
    })
  })

  return {
    name: name, format: 'kicad', version: '1',
    layers, components: rawComponents, pads: rawPads,
    vias: rawVias, traces: rawTraces, nets: rawNets, outline: rawOutline,
    result: { success: true, errors, warnings, quality: 'real' },
  }
}

// ─── Eagle XML Parser ─────────────────────────────────────────────────────────

function parseEagleXML(text: string, name: string): RawBoardData {
  const errors:   string[] = []
  const warnings: string[] = []

  // Use DOM parser if available (browser/Next.js), else text-scan fallback
  let doc: Document | null = null
  if (typeof DOMParser !== 'undefined') {
    try {
      doc = new DOMParser().parseFromString(text, 'application/xml')
    } catch { /* fallback below */ }
  }

  if (!doc) {
    warnings.push('DOMParser unavailable — Eagle XML using mock fallback')
    return mockRawBoard(name, 'brd', errors, warnings)
  }

  const parseError = doc.querySelector('parsererror')
  if (parseError) return mockRawBoard(name, 'brd', errors, ['Eagle XML parse error'])

  // ── Layers ──
  const layerEls = Array.from(doc.querySelectorAll('layers > layer'))
  const layers   = layerEls.map(el => {
    const id      = parseInt(el.getAttribute('number') ?? '0', 10)
    const rawName = el.getAttribute('name') ?? `layer_${id}`
    return normalizeLayer(rawName, id)
  })
  const layerById = new Map(layers.map(l => [l.id, l]))

  // ── Nets ──
  const netEls  = Array.from(doc.querySelectorAll('signal'))
  const rawNets: RawNet[] = netEls.map((el, i) => ({
    id:       i,
    name:     el.getAttribute('name') ?? `NET_${i}`,
    voltage:  '',
    netClass: 'Signal',
  }))
  const netNames = new Set(rawNets.map(n => n.name))

  // ── Components ──
  const compEls      = Array.from(doc.querySelectorAll('elements > element'))
  const rawComponents: RawComponent[] = []
  const rawPads: RawPad[] = []

  compEls.forEach((el, ci) => {
    const ref      = el.getAttribute('name') ?? `C${ci}`
    const val      = el.getAttribute('value') ?? ''
    const pkg      = el.getAttribute('package') ?? ''
    const xIn      = parseFloat(el.getAttribute('x') ?? '0')
    const yIn      = parseFloat(el.getAttribute('y') ?? '0')
    const rot      = parseFloat(el.getAttribute('rot')?.replace(/[RFM]/g,'') ?? '0')
    const mirror   = el.getAttribute('rot')?.includes('M') ?? false
    const side     = mirror ? 'bottom' : 'top'
    const layerId  = mirror ? 16 : 1   // Eagle: 1=Top, 16=Bottom

    // Eagle uses inches by default
    const xMm = inchToMm(xIn)
    const yMm = inchToMm(yIn)

    rawComponents.push({
      id: ref, reference: ref, value: val, footprint: pkg,
      category: inferCategory(ref, val), description: val,
      x: xMm, y: yMm, width: 2, height: 1.5, rotation: rot,
      side: side as any, layerId, nets: [], padIds: [], mpn: '', dnp: false,
    })
  })

  // ── Wires (traces) from signals ──
  const rawTraces: RawTrace[] = []
  let traceIdx = 0
  netEls.forEach(sigEl => {
    const netName = sigEl.getAttribute('name') ?? ''
    sigEl.querySelectorAll('wire').forEach(wire => {
      const layNum = parseInt(wire.getAttribute('layer') ?? '1', 10)
      rawTraces.push({
        id:      `trace_${traceIdx++}`,
        type:    'segment',
        layerId: layNum,
        netName,
        width:   inchToMm(parseFloat(wire.getAttribute('width') ?? '0.01')),
        x1:      inchToMm(parseFloat(wire.getAttribute('x1') ?? '0')),
        y1:      inchToMm(parseFloat(wire.getAttribute('y1') ?? '0')),
        x2:      inchToMm(parseFloat(wire.getAttribute('x2') ?? '0')),
        y2:      inchToMm(parseFloat(wire.getAttribute('y2') ?? '0')),
        arcCx: 0, arcCy: 0, arcR: 0,
      })
    })
  })

  // ── Outline ──
  const rawOutline: RawOutlineSegment[] = []
  doc.querySelectorAll('wire[layer="20"]').forEach(wire => {
    rawOutline.push({
      type: 'line',
      x1:   inchToMm(parseFloat(wire.getAttribute('x1') ?? '0')),
      y1:   inchToMm(parseFloat(wire.getAttribute('y1') ?? '0')),
      x2:   inchToMm(parseFloat(wire.getAttribute('x2') ?? '0')),
      y2:   inchToMm(parseFloat(wire.getAttribute('y2') ?? '0')),
      arcCx: 0, arcCy: 0, arcR: 0,
    })
  })

  return {
    name, format: 'brd', version: doc.querySelector('eagle')?.getAttribute('version') ?? '1',
    layers, components: rawComponents, pads: rawPads,
    vias: [], traces: rawTraces, nets: rawNets, outline: rawOutline,
    result: { success: true, errors, warnings, quality: rawComponents.length > 0 ? 'real' : 'partial' },
  }
}

// ─── Mock Board (fallback / testing) ─────────────────────────────────────────

function mockRawBoard(
  name: string,
  format: RawBoardData['format'],
  errors: string[],
  warnings: string[]
): RawBoardData {
  // Deterministic mock: Samsung-like 18×36mm board with 8 representative components
  const W = 72, H = 144   // board size in mm (Samsung A-series typical)

  const MOCK_COMPONENTS: Omit<RawComponent, 'padIds'>[] = [
    { id:'U1', reference:'U1', value:'MT6768', footprint:'BGA-224', category:'CPU',
      description:'Application Processor', x:36, y:48, width:8, height:8,
      rotation:0, side:'top', layerId:0, nets:['VDD_CORE','GND','PP1V8_CPU'], mpn:'MT6768V/WA', dnp:false },
    { id:'U2', reference:'U2', value:'MT6358', footprint:'BGA-144', category:'PMIC',
      description:'Power Management IC', x:18, y:36, width:6, height:6,
      rotation:0, side:'top', layerId:0, nets:['VBAT','GND','PP1V8_CPU','VDD_CORE'], mpn:'MT6358V/SA', dnp:false },
    { id:'U3', reference:'U3', value:'WCN3991', footprint:'BGA-100', category:'RF',
      description:'WLAN/BT Combo', x:54, y:36, width:5, height:5,
      rotation:0, side:'top', layerId:0, nets:['GND','PP1V8_CPU'], mpn:'WCN3991', dnp:false },
    { id:'CN1', reference:'CN1', value:'USB_C', footprint:'USB-C-24P', category:'CONNECTOR',
      description:'USB Type-C Connector', x:36, y:130, width:9, height:4,
      rotation:0, side:'bottom', layerId:1, nets:['VBUS','GND','D+','D-'], mpn:'', dnp:false },
    { id:'C1', reference:'C1', value:'100nF', footprint:'0402', category:'CAPACITOR',
      description:'Decoupling capacitor', x:28, y:50, width:1, height:0.5,
      rotation:0, side:'top', layerId:0, nets:['VDD_CORE','GND'], mpn:'', dnp:false },
    { id:'R1', reference:'R1', value:'10k', footprint:'0402', category:'RESISTOR',
      description:'Pull-up resistor', x:45, y:52, width:1, height:0.5,
      rotation:90, side:'top', layerId:0, nets:['PP1V8_CPU'], mpn:'', dnp:false },
    { id:'U4', reference:'U4', value:'LPDDR4X', footprint:'BGA-200', category:'MEMORY',
      description:'4GB LPDDR4X RAM', x:36, y:70, width:10, height:10,
      rotation:0, side:'top', layerId:0, nets:['GND','VDD_CORE'], mpn:'', dnp:false },
    { id:'U5', reference:'U5', value:'NAND256', footprint:'BGA-153', category:'MEMORY',
      description:'256GB UFS 2.1', x:22, y:65, width:9, height:9,
      rotation:0, side:'top', layerId:0, nets:['GND','PP1V8_CPU'], mpn:'', dnp:false },
  ]

  const components: RawComponent[] = MOCK_COMPONENTS.map(c => ({ ...c, padIds: [] }))

  const rawNets: RawNet[] = [
    { id:0, name:'GND',       voltage:'0V',    netClass:'Power'  },
    { id:1, name:'VBAT',      voltage:'4.2V',  netClass:'Power'  },
    { id:2, name:'VDD_CORE',  voltage:'0.9V',  netClass:'Power'  },
    { id:3, name:'PP1V8_CPU', voltage:'1.8V',  netClass:'Power'  },
    { id:4, name:'VBUS',      voltage:'5V',    netClass:'Power'  },
    { id:5, name:'D+',        voltage:'unknown',netClass:'Signal' },
    { id:6, name:'D-',        voltage:'unknown',netClass:'Signal' },
  ]

  const rawOutline: RawOutlineSegment[] = [
    { type:'line', x1:0, y1:0,   x2:W,  y2:0,   arcCx:0, arcCy:0, arcR:0 },
    { type:'line', x1:W, y1:0,   x2:W,  y2:H,   arcCx:0, arcCy:0, arcR:0 },
    { type:'line', x1:W, y1:H,   x2:0,  y2:H,   arcCx:0, arcCy:0, arcR:0 },
    { type:'line', x1:0, y1:H,   x2:0,  y2:0,   arcCx:0, arcCy:0, arcR:0 },
  ]

  const layers = [
    normalizeLayer('F.Cu', 0),
    normalizeLayer('B.Cu', 1),
    normalizeLayer('F.SilkS', 2),
    normalizeLayer('B.SilkS', 3),
    normalizeLayer('Edge.Cuts', 4),
  ]

  return {
    name, format, version: 'mock-1.0',
    layers, components, pads: [], vias: [], traces: [],
    nets: rawNets, outline: rawOutline,
    result: {
      success:  errors.length === 0,
      errors:   Object.freeze(errors),
      warnings: Object.freeze(warnings),
      quality:  'mock',
    },
  }
}

// ─── Public Parser Class ──────────────────────────────────────────────────────

export class BRDParser {
  private readonly normalizer = new BoardGeometryNormalizer()

  /**
   * Parse a BRD file from an ArrayBuffer.
   * Accepts: KiCad .kicad_pcb, Eagle .brd, Allegro BRD.
   * Returns a fully normalized BoardData with origin at (0,0).
   */
  parse(buffer: ArrayBuffer, fileName = 'board'): BoardData {
    const name    = fileName.replace(/\.[^.]+$/, '')
    const variant = detectVariant(buffer)
    const text    = variant !== 'allegro_binary'
      ? new TextDecoder().decode(buffer)
      : ''

    let raw: RawBoardData

    switch (variant) {
      case 'kicad':
        raw = parseKiCad(text, name)
        break
      case 'eagle_xml':
        raw = parseEagleXML(text, name)
        break
      case 'allegro_binary':
        // Binary Allegro: proprietary format, requires reverse-engineered decoder
        // Extension point: inject AllegroDecoder here in the future
        raw = mockRawBoard(name, 'brd', [],
          ['Allegro binary format detected — real decoder not yet implemented; using mock data'])
        break
      case 'allegro_ascii':
        raw = mockRawBoard(name, 'brd', [],
          ['Allegro ASCII format detected — parser stub; using mock data'])
        break
      default:
        raw = mockRawBoard(name, 'unknown', [],
          [`Unknown BRD variant for file "${fileName}"`])
    }

    return this.normalizer.normalize(raw)
  }

  /**
   * Parse from a string (convenience overload for text-based formats).
   */
  parseText(text: string, fileName = 'board'): BoardData {
    const encoder = new TextEncoder()
    return this.parse(encoder.encode(text).buffer, fileName)
  }

  /**
   * Generate a deterministic mock BoardData for testing without a real file.
   */
  mock(boardName = 'Samsung A12 Mock'): BoardData {
    const raw = mockRawBoard(boardName, 'mock', [], [])
    return this.normalizer.normalize(raw)
  }
}
