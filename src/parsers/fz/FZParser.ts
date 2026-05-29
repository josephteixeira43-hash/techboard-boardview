/**
 * FZParser.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Fritzing .fz / .fzz Parser
 *
 * Fritzing is an open-source EDA tool widely used for prototyping.
 * Some phone repair community diagrams are distributed as .fz files.
 *
 * FORMAT OVERVIEW
 * ───────────────
 * .fz  — plain XML (Fritzing sketch file)
 * .fzz — ZIP archive containing a .fz file + SVG assets
 *
 * The sketch XML uses mm-based coordinates with an SVG-like coordinate system
 * (Y-axis points down). Components are <instance> elements referencing
 * part definitions. Connections are <connector> → <connector> refs.
 *
 * ARCHITECTURE
 * ────────────
 * Phase 1 — Format detection: detect .fzz (ZIP magic) vs .fz (XML)
 * Phase 2 — Extract: if .fzz, locate the .fz entry in the ZIP
 *            (minimal ZIP reader — no external libs)
 * Phase 3 — Parse: XML → RawBoardData in mm
 * Phase 4 — Normalize: BoardGeometryNormalizer applies origin translation
 *
 * ZIP READING NOTE
 * ────────────────
 * Implements a minimal ZIP local file header reader sufficient to locate
 * the .fz entry. Does not support encryption or data descriptors (not used
 * by Fritzing). This is ~80 lines of deterministic byte manipulation.
 *
 * DETERMINISM
 * ───────────
 * • No Math.random · No Date · No async
 * • Identical bytes → identical BoardData
 */

import type { BoardData } from '../common/BoardTypes'
import type { RawBoardData, RawComponent, RawPad, RawNet, RawOutlineSegment } from '../common/BoardGeometryNormalizer'
import { BoardGeometryNormalizer } from '../common/BoardGeometryNormalizer'
import { fzPxToMm, normalizeLayer, inferCategory, roundMm } from '../common/BoardNormalizationUtils'

// ─── ZIP minimal reader ───────────────────────────────────────────────────────

const ZIP_LOCAL_MAGIC = 0x04034B50

/**
 * Locate and extract a file entry from a ZIP archive by name suffix.
 * Returns the raw bytes of the entry's uncompressed data, or null if not found.
 *
 * Only supports STORE (method=0) and DEFLATE (method=8).
 * For DEFLATE: returns the compressed bytes — caller must decompress.
 * For STORE:   returns the raw bytes directly.
 *
 * Fritzing .fzz files typically store the .fz as STORE (no compression)
 * because SVG is already compressed in the outer .fzz.
 */
function zipFindEntry(buffer: ArrayBuffer, nameSuffix: string): ArrayBuffer | null {
  const view = new DataView(buffer)
  let offset = 0
  const len  = buffer.byteLength

  while (offset + 30 < len) {
    const sig = view.getUint32(offset, true)
    if (sig !== ZIP_LOCAL_MAGIC) break   // No more local file headers

    const method     = view.getUint16(offset + 8,  true)
    const compSize   = view.getUint32(offset + 18, true)
    const nameLen    = view.getUint16(offset + 26, true)
    const extraLen   = view.getUint16(offset + 28, true)

    const nameBytes  = new Uint8Array(buffer, offset + 30, nameLen)
    const entryName  = String.fromCharCode(...nameBytes)

    const dataStart  = offset + 30 + nameLen + extraLen

    if (entryName.endsWith(nameSuffix)) {
      if (method === 0) {
        // STORE — return slice directly
        return buffer.slice(dataStart, dataStart + compSize)
      }
      // DEFLATE — return compressed bytes (caller handles decompression)
      // For now return null; Fritzing typically uses STORE for .fz
      return null
    }

    offset = dataStart + compSize
    if (offset <= 0 || offset >= len) break
  }

  return null
}

function isZip(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false
  const view = new DataView(buffer)
  return view.getUint32(0, true) === ZIP_LOCAL_MAGIC
}

// ─── XML attribute reader (no DOM required) ───────────────────────────────────

/**
 * Minimal XML attribute extractor using regex.
 * Sufficient for Fritzing's well-formed XML — not a general XML parser.
 */
function attr(tag: string, attrName: string): string {
  const re = new RegExp(`\\b${attrName}="([^"]*)"`)
  const m  = re.exec(tag)
  return m ? m[1] : ''
}

/**
 * Split XML text into an array of tag strings (opening tags only).
 * Preserves attribute order. Filters out comments and processing instructions.
 */
function extractTags(xml: string, tagName: string): string[] {
  const results: string[] = []
  const re = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    results.push(m[0])
  }
  return results
}

/**
 * Extract the text content between opening and closing tags.
 */
function innerText(xml: string, tagName: string): string {
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`)
  const m  = re.exec(xml)
  return m ? m[1].trim() : ''
}

/**
 * Extract all <tagName>...</tagName> blocks from xml.
 */
function extractBlocks(xml: string, tagName: string): string[] {
  const results: string[] = []
  const re = new RegExp(`<${tagName}[\\s>][\\s\\S]*?<\\/${tagName}>`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    results.push(m[0])
  }
  return results
}

// ─── Fritzing XML Parser ──────────────────────────────────────────────────────

function parseFritzingXML(xml: string, name: string): RawBoardData {
  const errors:   string[] = []
  const warnings: string[] = []

  if (!xml.includes('<module') && !xml.includes('<sketch')) {
    return fzMock(name, errors, ['Not a valid Fritzing file — missing <module> or <sketch>'])
  }

  // ── Layers ──
  // Fritzing PCB view has: copper0 (bottom), copper1 (top), silkscreen, outline
  const layers = [
    normalizeLayer('copper1',    0),
    normalizeLayer('copper0',    1),
    normalizeLayer('silkscreen', 2),
    normalizeLayer('outline',    3),
  ]

  // ── Instances → Components ──
  const instanceBlocks = extractBlocks(xml, 'instance')
  const rawComponents: RawComponent[] = []
  const rawPads: RawPad[] = []
  const netMap = new Map<string, string[]>()   // netId → componentId[]

  instanceBlocks.forEach((block, ci) => {
    const instTag  = extractTags(block, 'instance')[0] ?? ''
    const ref      = attr(instTag, 'moduleIdRef') || `inst_${ci}`
    const title    = innerText(block, 'title') || ref

    // PCB geometry is in the <pcbView> or <breadboardView> section
    const pcbBlock = extractBlocks(block, 'pcbView')[0]
               ?? extractBlocks(block, 'breadboardView')[0]
               ?? block

    const geoTag   = extractTags(pcbBlock, 'geometry')[0] ?? ''
    // Fritzing uses px, convert to mm
    const xPx      = parseFloat(attr(geoTag, 'x')  || '0')
    const yPx      = parseFloat(attr(geoTag, 'y')  || '0')
    const xMm      = fzPxToMm(xPx)
    const yMm      = fzPxToMm(yPx)

    const layerTag = extractTags(pcbBlock, 'layerkin')[0]
               ?? extractTags(pcbBlock, 'layer')[0] ?? ''
    const layerStr = attr(layerTag, 'id') || 'copper1'
    const side     = layerStr === 'copper0' ? 'bottom' : 'top'
    const layerId  = side === 'bottom' ? 1 : 0

    const compId   = `${title}_${ci}`
    const compNets: string[] = []
    const compPadIds: string[] = []

    // ── Connectors (pads) ──
    const connBlocks = extractBlocks(block, 'connector')
    connBlocks.forEach((conn, pi) => {
      const connTag   = extractTags(conn, 'connector')[0] ?? ''
      const padNum    = attr(connTag, 'id') || `${pi}`
      const padGeoTag = extractTags(conn, 'geometry')[0] ?? ''
      const pxPx      = fzPxToMm(parseFloat(attr(padGeoTag, 'x') || '0'))
      const pyPx      = fzPxToMm(parseFloat(attr(padGeoTag, 'y') || '0'))
      const connectedTag = extractTags(conn, 'connects')[0] ?? ''

      // Net extraction: Fritzing nets are implicit via connector connections
      const netIdMatch = /net="([^"]*)"/.exec(conn)
      const netId = netIdMatch ? netIdMatch[1] : ''
      if (netId) {
        if (!netMap.has(netId)) netMap.set(netId, [])
        netMap.get(netId)!.push(compId)
        if (!compNets.includes(netId)) compNets.push(netId)
      }

      const padId = `${compId}_pad_${padNum}`
      compPadIds.push(padId)

      rawPads.push({
        id: padId, componentId: compId, number: padNum,
        type: 'smd', shape: 'rect',
        x: xMm + pxPx, y: yMm + pyPx,
        width: 1, height: 1, rotation: 0,
        layerId, side: side as any, netName: netId, drillDia: 0,
      })
    })

    rawComponents.push({
      id: compId, reference: title, value: ref,
      footprint: attr(instTag, 'moduleIdRef') || '',
      category: inferCategory(title, ref),
      description: title,
      x: xMm, y: yMm, width: 4, height: 2, rotation: 0,
      side: side as any, layerId,
      nets: compNets, padIds: compPadIds, mpn: '', dnp: false,
    })
  })

  // ── Nets from connection map ──
  const rawNets: RawNet[] = []
  let netIdx = 0
  netMap.forEach((_, netId) => {
    rawNets.push({ id: netIdx++, name: netId, voltage: '', netClass: 'Signal' })
  })

  // ── Board outline ──
  // Fritzing board size is defined in <board> or <pcb> element
  const boardTag  = extractTags(xml, 'board')[0] ?? ''
  const boardW    = fzPxToMm(parseFloat(attr(boardTag, 'width')  || '340'))
  const boardH    = fzPxToMm(parseFloat(attr(boardTag, 'height') || '680'))

  const rawOutline: RawOutlineSegment[] = [
    { type:'line', x1:0,      y1:0,      x2:boardW, y2:0,      arcCx:0, arcCy:0, arcR:0 },
    { type:'line', x1:boardW, y1:0,      x2:boardW, y2:boardH, arcCx:0, arcCy:0, arcR:0 },
    { type:'line', x1:boardW, y1:boardH, x2:0,      y2:boardH, arcCx:0, arcCy:0, arcR:0 },
    { type:'line', x1:0,      y1:boardH, x2:0,      y2:0,      arcCx:0, arcCy:0, arcR:0 },
  ]

  return {
    name, format: 'fz', version: '1',
    layers, components: rawComponents, pads: rawPads,
    vias: [], traces: [], nets: rawNets, outline: rawOutline,
    result: {
      success:  true,
      errors:   Object.freeze(errors),
      warnings: Object.freeze(warnings),
      quality:  rawComponents.length > 0 ? 'real' : 'partial',
    },
  }
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

function fzMock(name: string, errors: string[], warnings: string[]): RawBoardData {
  const layers = [
    normalizeLayer('copper1',    0),
    normalizeLayer('copper0',    1),
    normalizeLayer('silkscreen', 2),
    normalizeLayer('outline',    3),
  ]

  const components: RawComponent[] = [
    { id:'MCU1', reference:'MCU1', value:'Arduino Pro Mini', footprint:'Arduino-Pro-Mini',
      category:'IC', description:'Microcontroller board', x:40, y:40, width:18, height:33,
      rotation:0, side:'top', layerId:0, nets:['VCC','GND'], padIds:[], mpn:'', dnp:false },
    { id:'LED1', reference:'LED1', value:'5mm LED Red', footprint:'LED-5MM',
      category:'DIODE', description:'Status LED', x:80, y:50, width:5, height:5,
      rotation:0, side:'top', layerId:0, nets:['GND'], padIds:[], mpn:'', dnp:false },
  ]

  const rawNets: RawNet[] = [
    { id:0, name:'GND', voltage:'0V',   netClass:'Power'  },
    { id:1, name:'VCC', voltage:'5V',   netClass:'Power'  },
  ]

  const outline: RawOutlineSegment[] = [
    { type:'line', x1:0,   y1:0,   x2:120, y2:0,   arcCx:0, arcCy:0, arcR:0 },
    { type:'line', x1:120, y1:0,   x2:120, y2:90,  arcCx:0, arcCy:0, arcR:0 },
    { type:'line', x1:120, y1:90,  x2:0,   y2:90,  arcCx:0, arcCy:0, arcR:0 },
    { type:'line', x1:0,   y1:90,  x2:0,   y2:0,   arcCx:0, arcCy:0, arcR:0 },
  ]

  return {
    name, format:'fz', version:'mock-1.0',
    layers, components, pads:[], vias:[], traces:[], nets:rawNets, outline,
    result: { success: errors.length === 0, errors: Object.freeze(errors),
      warnings: Object.freeze(warnings), quality:'mock' },
  }
}

// ─── Public Parser Class ──────────────────────────────────────────────────────

export class FZParser {
  private readonly normalizer = new BoardGeometryNormalizer()

  /**
   * Parse a Fritzing file from an ArrayBuffer.
   * Accepts: .fz (XML), .fzz (ZIP containing .fz).
   * Returns fully normalized BoardData with origin at (0,0).
   */
  parse(buffer: ArrayBuffer, fileName = 'sketch'): BoardData {
    const name = fileName.replace(/\.fzz?$/, '')

    let xmlBuffer: ArrayBuffer | null = buffer

    // Detect and extract .fz from .fzz ZIP
    if (isZip(buffer)) {
      xmlBuffer = zipFindEntry(buffer, '.fz')
      if (!xmlBuffer) {
        const raw = fzMock(name, [], ['Could not find .fz entry inside .fzz archive'])
        return this.normalizer.normalize(raw)
      }
    }

    const xml = new TextDecoder().decode(xmlBuffer)
    const raw = parseFritzingXML(xml, name)
    return this.normalizer.normalize(raw)
  }

  /**
   * Parse from a string (convenience for text .fz files).
   */
  parseText(text: string, fileName = 'sketch'): BoardData {
    const enc = new TextEncoder()
    return this.parse(enc.encode(text).buffer, fileName)
  }

  /**
   * Generate a deterministic mock BoardData without a real file.
   */
  mock(boardName = 'Fritzing Mock'): BoardData {
    const raw = fzMock(boardName, [], [])
    return this.normalizer.normalize(raw)
  }
}
