/**
 * BoardTypes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Canonical Board Data Types
 *
 * Single source of truth for all normalized board structures.
 * Every parser (BRD, FZ, future formats) outputs these types.
 * No external dependencies. No DOM. No React. Pure TypeScript.
 *
 * UNIT CONVENTION
 * ───────────────
 * All coordinates and dimensions are in MILLIMETERS after normalization.
 * Parsers are responsible for converting from their native units:
 *   BRD (Cadence/Allegro): mils  → mm  (×0.0254)
 *   FZ  (Fritzing):        px    → mm  (×0.2645833)
 *   KiCad:                 mm    → mm  (×1.0)
 *   Eagle:                 inch  → mm  (×25.4)
 *
 * COORDINATE ORIGIN
 * ─────────────────
 * After normalization, origin (0,0) is at the top-left of the board outline
 * bounding box. BoardGeometryNormalizer applies this translation.
 *
 * LAYER NAMING
 * ────────────
 * Normalized layer names follow the canonical set in LayerDefinition.
 * Parser-specific layer names are mapped via LAYER_NAME_MAP.
 */

// ─── Layer Types ──────────────────────────────────────────────────────────────

/** Canonical layer side identifier. */
export type LayerSide = 'top' | 'bottom' | 'inner' | 'all' | 'unknown'

/** Canonical layer function identifier. */
export type LayerFunction =
  | 'copper'
  | 'silkscreen'
  | 'soldermask'
  | 'paste'
  | 'courtyard'
  | 'fab'
  | 'edge_cuts'
  | 'drill'
  | 'documentation'
  | 'unknown'

/** A fully normalized PCB layer definition. */
export interface LayerDefinition {
  /** Unique layer identifier within this board. */
  readonly id:       number
  /** Canonical name (e.g. "F.Cu", "B.SilkS"). */
  readonly name:     string
  /** Original name from the source file. */
  readonly rawName:  string
  readonly side:     LayerSide
  readonly function: LayerFunction
  /** True if this layer carries electrical signals. */
  readonly isCopper: boolean
  /** Render order — lower renders first (bottom of stack). */
  readonly order:    number
}

// ─── Geometry Primitives ──────────────────────────────────────────────────────

/** Immutable 2-D point in mm. */
export interface Point2D {
  readonly x: number
  readonly y: number
}

/** Immutable axis-aligned bounding box in mm. */
export interface BoundingBox {
  readonly minX:   number
  readonly minY:   number
  readonly maxX:   number
  readonly maxY:   number
  readonly width:  number
  readonly height: number
}

/** A straight-line segment. */
export interface LineSegment {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
}

/** An arc segment (angles in degrees, counter-clockwise). */
export interface ArcSegment {
  readonly cx:         number   // centre X
  readonly cy:         number   // centre Y
  readonly radius:     number
  readonly startAngle: number   // degrees
  readonly endAngle:   number   // degrees
}

/** A closed polygon outline (array of vertices in order). */
export interface Polygon {
  readonly points: readonly Point2D[]
}

// ─── Pad ─────────────────────────────────────────────────────────────────────

export type PadShape = 'circle' | 'rect' | 'oval' | 'roundrect' | 'trapezoid' | 'custom'
export type PadType  = 'smd' | 'thru_hole' | 'np_thru_hole' | 'connect'

export interface BoardPad {
  /** Globally unique pad id within the board. */
  readonly id:           string
  /** Parent component id (empty string if standalone). */
  readonly componentId:  string
  /** Pad number/name as printed on silkscreen (e.g. "1", "A2", "GND"). */
  readonly number:       string
  readonly type:         PadType
  readonly shape:        PadShape
  /** Centre position in mm. */
  readonly x:            number
  readonly y:            number
  /** Bounding dimensions in mm. */
  readonly width:        number
  readonly height:       number
  /** Rotation in degrees (counter-clockwise). */
  readonly rotation:     number
  readonly layerId:      number
  readonly side:         LayerSide
  /** Net name this pad belongs to (empty if unconnected). */
  readonly netName:      string
  /** Drill diameter for through-hole pads (mm). 0 for SMD. */
  readonly drillDia:     number
}

// ─── Via ──────────────────────────────────────────────────────────────────────

export type ViaType = 'through' | 'blind' | 'buried' | 'micro'

export interface BoardVia {
  readonly id:         string
  readonly type:       ViaType
  /** Centre position in mm. */
  readonly x:          number
  readonly y:          number
  /** Outer diameter in mm. */
  readonly outerDia:   number
  /** Drill diameter in mm. */
  readonly drillDia:   number
  /** Layer the via starts on. */
  readonly layerStart: number
  /** Layer the via ends on. */
  readonly layerEnd:   number
  readonly netName:    string
}

// ─── Trace ───────────────────────────────────────────────────────────────────

export type TraceType = 'segment' | 'arc'

export interface BoardTrace {
  readonly id:       string
  readonly type:     TraceType
  readonly layerId:  number
  readonly netName:  string
  /** Line width in mm. */
  readonly width:    number
  /** Start point (mm). */
  readonly x1:       number
  readonly y1:       number
  /** End point (mm). For arcs: end of arc. */
  readonly x2:       number
  readonly y2:       number
  /** Arc centre X (mm). 0 for segments. */
  readonly arcCx:    number
  /** Arc centre Y (mm). 0 for segments. */
  readonly arcCy:    number
  /** Arc radius (mm). 0 for segments. */
  readonly arcR:     number
}

// ─── Electrical Net ───────────────────────────────────────────────────────────

export interface ElectricalNet {
  readonly id:           number
  /** Net name as defined in the source file (e.g. "GND", "VCC", "PP_VDD_MAIN"). */
  readonly name:         string
  /** Component ids connected to this net. */
  readonly componentIds: readonly string[]
  /** Pad ids in this net. */
  readonly padIds:       readonly string[]
  /** Canonical voltage string (e.g. "3.3V", "0V", "unknown"). */
  readonly voltage:      string
  /** Net class name (e.g. "Power", "Signal"). */
  readonly netClass:     string
}

// ─── Board Component ─────────────────────────────────────────────────────────

export type ComponentCategory =
  | 'IC' | 'PMIC' | 'CPU' | 'RF' | 'MEMORY' | 'CONNECTOR'
  | 'RESISTOR' | 'CAPACITOR' | 'INDUCTOR' | 'DIODE' | 'TRANSISTOR'
  | 'CRYSTAL' | 'SENSOR' | 'AUDIO' | 'CAMERA' | 'BATTERY' | 'OTHER'

export interface NormalizedBoardComponent {
  /** Unique id within the board (e.g. "U1", "R42"). */
  readonly id:           string
  /** Reference designator (e.g. "U1"). */
  readonly reference:    string
  /** Component value or part number (e.g. "100nF", "MT6359"). */
  readonly value:        string
  /** Footprint / package (e.g. "0402", "BGA-100"). */
  readonly footprint:    string
  /** Canonical category. */
  readonly category:     ComponentCategory
  /** Description from library or netlist. */
  readonly description:  string
  /** Centre position in mm after normalization. */
  readonly x:            number
  readonly y:            number
  /** Bounding box in mm. */
  readonly width:        number
  readonly height:       number
  /** Rotation in degrees (counter-clockwise). */
  readonly rotation:     number
  readonly side:         LayerSide
  readonly layerId:      number
  /** Net names this component connects to. */
  readonly nets:         readonly string[]
  /** Pad ids belonging to this component. */
  readonly padIds:       readonly string[]
  /** Manufacturer part number if available. */
  readonly mpn:          string
  /** True if the component is a DNP (Do Not Populate). */
  readonly dnp:          boolean
}

// ─── Board Outline ────────────────────────────────────────────────────────────

export interface BoardOutlineSegment {
  readonly type:   'line' | 'arc'
  readonly x1:     number
  readonly y1:     number
  readonly x2:     number
  readonly y2:     number
  readonly arcCx:  number
  readonly arcCy:  number
  readonly arcR:   number
}

// ─── Root Board Data ──────────────────────────────────────────────────────────

/** Parse quality tier — indicates confidence in extracted data. */
export type ParseQuality = 'real' | 'partial' | 'mock'

export interface ParseResult {
  readonly success:  boolean
  readonly errors:   readonly string[]
  readonly warnings: readonly string[]
  readonly quality:  ParseQuality
}

/**
 * The canonical normalized board data structure.
 * Output of every parser after BoardGeometryNormalizer is applied.
 * This is what the rendering pipeline consumes.
 */
export interface BoardData {
  /** Board name / filename. */
  readonly name:       string
  /** Source format identifier. */
  readonly format:     'brd' | 'fz' | 'kicad' | 'eagle' | 'altium' | 'mock' | 'unknown'
  /** Format version string from the source file. */
  readonly version:    string
  /** Board bounding box in mm after normalization. */
  readonly bounds:     BoundingBox
  readonly layers:     readonly LayerDefinition[]
  readonly components: readonly NormalizedBoardComponent[]
  readonly pads:       readonly BoardPad[]
  readonly vias:       readonly BoardVia[]
  readonly traces:     readonly BoardTrace[]
  readonly nets:       readonly ElectricalNet[]
  readonly outline:    readonly BoardOutlineSegment[]
  readonly result:     ParseResult
}
