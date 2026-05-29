/**
 * BoardGeometryNormalizer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Geometry Normalization Pipeline
 *
 * Receives raw parsed data (already in mm) and applies:
 *   1. Bounding box computation from all geometry
 *   2. Origin translation → top-left of outline becomes (0, 0)
 *   3. Coordinate rounding to 4 decimal places
 *   4. Layer deduplication and ordering
 *   5. Net index building (componentIds, padIds per net)
 *
 * This is the FINAL step before BoardData is returned to the caller.
 * Pure function — no side effects, no mutation of inputs.
 */

import type {
  BoardData,
  BoundingBox,
  NormalizedBoardComponent,
  BoardPad,
  BoardVia,
  BoardTrace,
  ElectricalNet,
  BoardOutlineSegment,
  LayerDefinition,
  ParseResult,
} from './BoardTypes'
import { roundMm, inferVoltage } from './BoardNormalizationUtils'

// ─── Raw input from parsers (pre-normalization) ───────────────────────────────

export interface RawBoardData {
  name:       string
  format:     BoardData['format']
  version:    string
  layers:     LayerDefinition[]
  components: RawComponent[]
  pads:       RawPad[]
  vias:       RawVia[]
  traces:     RawTrace[]
  nets:       RawNet[]
  outline:    RawOutlineSegment[]
  result:     ParseResult
}

export interface RawComponent {
  id:          string
  reference:   string
  value:       string
  footprint:   string
  category:    NormalizedBoardComponent['category']
  description: string
  x:           number
  y:           number
  width:       number
  height:      number
  rotation:    number
  side:        NormalizedBoardComponent['side']
  layerId:     number
  nets:        string[]
  padIds:      string[]
  mpn:         string
  dnp:         boolean
}

export interface RawPad {
  id:          string
  componentId: string
  number:      string
  type:        BoardPad['type']
  shape:       BoardPad['shape']
  x:           number
  y:           number
  width:       number
  height:      number
  rotation:    number
  layerId:     number
  side:        BoardPad['side']
  netName:     string
  drillDia:    number
}

export interface RawVia {
  id:         string
  type:       BoardVia['type']
  x:          number
  y:          number
  outerDia:   number
  drillDia:   number
  layerStart: number
  layerEnd:   number
  netName:    string
}

export interface RawTrace {
  id:      string
  type:    BoardTrace['type']
  layerId: number
  netName: string
  width:   number
  x1:      number
  y1:      number
  x2:      number
  y2:      number
  arcCx:   number
  arcCy:   number
  arcR:    number
}

export interface RawNet {
  id:      number
  name:    string
  voltage: string
  netClass: string
}

export interface RawOutlineSegment {
  type:  'line' | 'arc'
  x1:    number
  y1:    number
  x2:    number
  y2:    number
  arcCx: number
  arcCy: number
  arcR:  number
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

export class BoardGeometryNormalizer {

  /**
   * Main entry point.
   * Takes raw parsed data (already in mm) and returns a fully normalized BoardData.
   */
  normalize(raw: RawBoardData): BoardData {
    // 1. Compute bounding box from all geometry
    const bbox = this.computeBounds(raw)

    // 2. Compute origin offset (translate so top-left = 0,0)
    const ox = bbox.minX
    const oy = bbox.minY

    // 3. Translate and round all coordinates
    const components = this.normalizeComponents(raw.components, ox, oy)
    const pads       = this.normalizePads(raw.pads, ox, oy)
    const vias       = this.normalizeVias(raw.vias, ox, oy)
    const traces     = this.normalizeTraces(raw.traces, ox, oy)
    const outline    = this.normalizeOutline(raw.outline, ox, oy)

    // 4. Build net index (attach componentIds and padIds per net)
    const nets = this.buildNets(raw.nets, components, pads)

    // 5. Sort layers by order
    const layers = [...raw.layers].sort((a, b) => a.order - b.order)

    // 6. Final bounds (after translation, origin is at 0,0)
    const finalBounds: BoundingBox = {
      minX:   0,
      minY:   0,
      maxX:   roundMm(bbox.maxX - ox),
      maxY:   roundMm(bbox.maxY - oy),
      width:  roundMm(bbox.maxX - bbox.minX),
      height: roundMm(bbox.maxY - bbox.minY),
    }

    return Object.freeze({
      name:       raw.name,
      format:     raw.format,
      version:    raw.version,
      bounds:     finalBounds,
      layers:     Object.freeze(layers),
      components: Object.freeze(components),
      pads:       Object.freeze(pads),
      vias:       Object.freeze(vias),
      traces:     Object.freeze(traces),
      nets:       Object.freeze(nets),
      outline:    Object.freeze(outline),
      result:     raw.result,
    })
  }

  // ─── Bounds computation ─────────────────────────────────────────────────────

  private computeBounds(raw: RawBoardData): BoundingBox {
    let minX = Infinity, minY = Infinity
    let maxX = -Infinity, maxY = -Infinity

    const expand = (x: number, y: number) => {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }

    // Use outline first (most accurate board boundary)
    for (const seg of raw.outline) {
      expand(seg.x1, seg.y1)
      expand(seg.x2, seg.y2)
      if (seg.type === 'arc') {
        expand(seg.arcCx - seg.arcR, seg.arcCy - seg.arcR)
        expand(seg.arcCx + seg.arcR, seg.arcCy + seg.arcR)
      }
    }

    // If no outline, fall back to component positions
    if (!isFinite(minX) || !isFinite(minY)) {
      for (const c of raw.components) {
        expand(c.x - c.width / 2, c.y - c.height / 2)
        expand(c.x + c.width / 2, c.y + c.height / 2)
      }
      for (const p of raw.pads) {
        expand(p.x - p.width / 2, p.y - p.height / 2)
        expand(p.x + p.width / 2, p.y + p.height / 2)
      }
    }

    // Guard: empty board
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 80 }

    return {
      minX, minY, maxX, maxY,
      width:  maxX - minX,
      height: maxY - minY,
    }
  }

  // ─── Per-entity normalization ───────────────────────────────────────────────

  private normalizeComponents(
    comps: RawComponent[], ox: number, oy: number
  ): readonly NormalizedBoardComponent[] {
    return comps.map(c => Object.freeze({
      id:          c.id,
      reference:   c.reference,
      value:       c.value,
      footprint:   c.footprint,
      category:    c.category,
      description: c.description,
      x:           roundMm(c.x - ox),
      y:           roundMm(c.y - oy),
      width:       roundMm(c.width),
      height:      roundMm(c.height),
      rotation:    c.rotation,
      side:        c.side,
      layerId:     c.layerId,
      nets:        Object.freeze([...c.nets]),
      padIds:      Object.freeze([...c.padIds]),
      mpn:         c.mpn,
      dnp:         c.dnp,
    } satisfies NormalizedBoardComponent))
  }

  private normalizePads(
    pads: RawPad[], ox: number, oy: number
  ): readonly BoardPad[] {
    return pads.map(p => Object.freeze({
      id:          p.id,
      componentId: p.componentId,
      number:      p.number,
      type:        p.type,
      shape:       p.shape,
      x:           roundMm(p.x - ox),
      y:           roundMm(p.y - oy),
      width:       roundMm(p.width),
      height:      roundMm(p.height),
      rotation:    p.rotation,
      layerId:     p.layerId,
      side:        p.side,
      netName:     p.netName,
      drillDia:    roundMm(p.drillDia),
    } satisfies BoardPad))
  }

  private normalizeVias(
    vias: RawVia[], ox: number, oy: number
  ): readonly BoardVia[] {
    return vias.map(v => Object.freeze({
      id:         v.id,
      type:       v.type,
      x:          roundMm(v.x - ox),
      y:          roundMm(v.y - oy),
      outerDia:   roundMm(v.outerDia),
      drillDia:   roundMm(v.drillDia),
      layerStart: v.layerStart,
      layerEnd:   v.layerEnd,
      netName:    v.netName,
    } satisfies BoardVia))
  }

  private normalizeTraces(
    traces: RawTrace[], ox: number, oy: number
  ): readonly BoardTrace[] {
    return traces.map(t => Object.freeze({
      id:      t.id,
      type:    t.type,
      layerId: t.layerId,
      netName: t.netName,
      width:   roundMm(t.width),
      x1:      roundMm(t.x1 - ox),
      y1:      roundMm(t.y1 - oy),
      x2:      roundMm(t.x2 - ox),
      y2:      roundMm(t.y2 - oy),
      arcCx:   roundMm(t.arcCx - ox),
      arcCy:   roundMm(t.arcCy - oy),
      arcR:    roundMm(t.arcR),
    } satisfies BoardTrace))
  }

  private normalizeOutline(
    segs: RawOutlineSegment[], ox: number, oy: number
  ): readonly BoardOutlineSegment[] {
    return segs.map(s => Object.freeze({
      type:  s.type,
      x1:    roundMm(s.x1 - ox),
      y1:    roundMm(s.y1 - oy),
      x2:    roundMm(s.x2 - ox),
      y2:    roundMm(s.y2 - oy),
      arcCx: roundMm(s.arcCx - ox),
      arcCy: roundMm(s.arcCy - oy),
      arcR:  roundMm(s.arcR),
    } satisfies BoardOutlineSegment))
  }

  // ─── Net index builder ──────────────────────────────────────────────────────

  private buildNets(
    rawNets: RawNet[],
    components: readonly NormalizedBoardComponent[],
    pads: readonly BoardPad[],
  ): readonly ElectricalNet[] {
    // Build lookup maps for O(n) net population
    const compsByNet = new Map<string, string[]>()
    const padsByNet  = new Map<string, string[]>()

    for (const c of components) {
      for (const net of c.nets) {
        if (!compsByNet.has(net)) compsByNet.set(net, [])
        compsByNet.get(net)!.push(c.id)
      }
    }

    for (const p of pads) {
      if (!p.netName) continue
      if (!padsByNet.has(p.netName)) padsByNet.set(p.netName, [])
      padsByNet.get(p.netName)!.push(p.id)
    }

    // If raw nets list is empty, synthesize from component/pad net names
    const netSource: RawNet[] = rawNets.length > 0
      ? rawNets
      : this.synthesizeNets(compsByNet)

    return netSource.map(n => Object.freeze({
      id:           n.id,
      name:         n.name,
      componentIds: Object.freeze(compsByNet.get(n.name) ?? []),
      padIds:       Object.freeze(padsByNet.get(n.name) ?? []),
      voltage:      n.voltage || inferVoltage(n.name),
      netClass:     n.netClass || 'Signal',
    } satisfies ElectricalNet))
  }

  private synthesizeNets(compsByNet: Map<string, string[]>): RawNet[] {
    let id = 0
    const nets: RawNet[] = []
    compsByNet.forEach((_, name) => {
      nets.push({ id: id++, name, voltage: inferVoltage(name), netClass: 'Signal' })
    })
    // Sort deterministically by name
    nets.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    return nets
  }
}
