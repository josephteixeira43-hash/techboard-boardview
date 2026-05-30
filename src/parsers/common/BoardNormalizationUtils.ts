/**
 * BoardNormalizationUtils.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Normalization Utilities
 *
 * Pure functions for:
 *   • Unit conversion (mils, inches, px → mm)
 *   • Layer name normalization (format-specific → canonical)
 *   • Side normalization
 *   • Category inference from reference designators and values
 *
 * No side effects. No globals. Same input → same output.
 */

import type {
  LayerDefinition,
  LayerSide,
  LayerFunction,
  ComponentCategory,
} from './BoardTypes'

// ─── Unit Conversion ──────────────────────────────────────────────────────────

/** Multiply by this to convert mils → mm (1 mil = 0.0254 mm). */
export const MIL_TO_MM = 0.0254 as const

/** Multiply by this to convert inches → mm. */
export const INCH_TO_MM = 25.4 as const

/** Multiply by this to convert Fritzing px → mm (96 dpi standard). */
export const FZ_PX_TO_MM = 0.26458333 as const

/** Multiply by this to convert Eagle BRD internal units → mm (1 unit = 1 mil). */
export const EAGLE_UNIT_TO_MM = MIL_TO_MM

/**
 * Convert mils to millimeters.
 * Used by Cadence Allegro BRD, Eagle (via mil mode), OrCAD.
 */
export function milToMm(mils: number): number {
  return mils * MIL_TO_MM
}

/**
 * Convert inches to millimeters.
 * Used by Eagle (inch mode), some Altium exports.
 */
export function inchToMm(inches: number): number {
  return inches * INCH_TO_MM
}

/**
 * Convert Fritzing SVG pixels to millimeters.
 */
export function fzPxToMm(px: number): number {
  return px * FZ_PX_TO_MM
}

/**
 * Round to 4 decimal places (0.1 micron resolution — sufficient for PCB work).
 * Keeps normalized output deterministic and compact.
 */
export function roundMm(mm: number): number {
  return Math.round(mm * 10000) / 10000
}

// ─── Layer Name Normalization ─────────────────────────────────────────────────

/**
 * Maps raw layer names from various EDA tools to canonical LayerDefinition fields.
 * Keys are lowercased raw names; values are [side, function, canonicalName].
 */
const LAYER_NAME_MAP: Readonly<Record<string, [LayerSide, LayerFunction, string]>> = {
  // ── KiCad canonical ──
  'f.cu':          ['top',    'copper',      'F.Cu'],
  'b.cu':          ['bottom', 'copper',      'B.Cu'],
  'in1.cu':        ['inner',  'copper',      'In1.Cu'],
  'in2.cu':        ['inner',  'copper',      'In2.Cu'],
  'in3.cu':        ['inner',  'copper',      'In3.Cu'],
  'in4.cu':        ['inner',  'copper',      'In4.Cu'],
  'f.silks':       ['top',    'silkscreen',  'F.SilkS'],
  'b.silks':       ['bottom', 'silkscreen',  'B.SilkS'],
  'f.mask':        ['top',    'soldermask',  'F.Mask'],
  'b.mask':        ['bottom', 'soldermask',  'B.Mask'],
  'f.paste':       ['top',    'paste',       'F.Paste'],
  'b.paste':       ['bottom', 'paste',       'B.Paste'],
  'f.courtyard':   ['top',    'courtyard',   'F.Courtyard'],
  'b.courtyard':   ['bottom', 'courtyard',   'B.Courtyard'],
  'f.fab':         ['top',    'fab',         'F.Fab'],
  'b.fab':         ['bottom', 'fab',         'B.Fab'],
  'edge.cuts':     ['all',    'edge_cuts',   'Edge.Cuts'],
  'dwgs.user':     ['all',    'documentation','Dwgs.User'],

  // ── Eagle ──
  'top':           ['top',    'copper',      'F.Cu'],
  'bottom':        ['bottom', 'copper',      'B.Cu'],
  'tsilk':         ['top',    'silkscreen',  'F.SilkS'],
  'bsilk':         ['bottom', 'silkscreen',  'B.SilkS'],
  'tplace':        ['top',    'silkscreen',  'F.SilkS'],
  'bplace':        ['bottom', 'silkscreen',  'B.SilkS'],
  'tstop':         ['top',    'soldermask',  'F.Mask'],
  'bstop':         ['bottom', 'soldermask',  'B.Mask'],
  'tcream':        ['top',    'paste',       'F.Paste'],
  'bcream':        ['bottom', 'paste',       'B.Paste'],
  'dimension':     ['all',    'edge_cuts',   'Edge.Cuts'],
  'milling':       ['all',    'edge_cuts',   'Edge.Cuts'],
  'document':      ['all',    'documentation','Dwgs.User'],

  // ── Allegro / OrCAD BRD ──
  'top_etch':      ['top',    'copper',      'F.Cu'],
  'bot_etch':      ['bottom', 'copper',      'B.Cu'],
  'bottom_etch':   ['bottom', 'copper',      'B.Cu'],
  'top_silk':      ['top',    'silkscreen',  'F.SilkS'],
  'bot_silk':      ['bottom', 'silkscreen',  'B.SilkS'],
  'top_solder':    ['top',    'soldermask',  'F.Mask'],
  'bot_solder':    ['bottom', 'soldermask',  'B.Mask'],
  'board_outline': ['all',    'edge_cuts',   'Edge.Cuts'],
  'package_geometry': ['all', 'documentation','Dwgs.User'],

  // ── Altium ──
  'toplayer':      ['top',    'copper',      'F.Cu'],
  'bottomlayer':   ['bottom', 'copper',      'B.Cu'],
  'topoverlay':    ['top',    'silkscreen',  'F.SilkS'],
  'bottomoverlay': ['bottom', 'silkscreen',  'B.SilkS'],
  'topsolder':     ['top',    'soldermask',  'F.Mask'],
  'bottomsolder':  ['bottom', 'soldermask',  'B.Mask'],
  'keeplayer':     ['all',    'edge_cuts',   'Edge.Cuts'],
  'mechanicallayer':['all',   'edge_cuts',   'Edge.Cuts'],

  // ── Fritzing ──
  'copper0':       ['bottom', 'copper',      'B.Cu'],
  'copper1':       ['top',    'copper',      'F.Cu'],
  'silkscreen':    ['top',    'silkscreen',  'F.SilkS'],
  'outline':       ['all',    'edge_cuts',   'Edge.Cuts'],
}

/**
 * Normalize a raw layer name string into a LayerDefinition.
 * Falls back to 'unknown' gracefully — never throws.
 */
export function normalizeLayer(rawName: string, id: number): LayerDefinition {
  const key = rawName.toLowerCase().trim()
  const mapped = LAYER_NAME_MAP[key]

  if (mapped) {
    const [side, fn, canonical] = mapped
    return {
      id,
      name:     canonical,
      rawName,
      side,
      function: fn,
      isCopper: fn === 'copper',
      order:    layerOrder(side, fn),
    }
  }

  // Heuristic fallback for inner copper layers (e.g. "in5.cu", "layer_5")
  const innerMatch = key.match(/^(?:in(\d+)\.cu|layer[_\s]?(\d+)|inner[_\s]?(\d+))$/)
  if (innerMatch) {
    const n = parseInt(innerMatch[1] ?? innerMatch[2] ?? innerMatch[3], 10)
    return {
      id,
      name:     `In${n}.Cu`,
      rawName,
      side:     'inner',
      function: 'copper',
      isCopper: true,
      order:    10 + n,
    }
  }

  return {
    id,
    name:     rawName,
    rawName,
    side:     'unknown',
    function: 'unknown',
    isCopper: false,
    order:    999,
  }
}

/** Deterministic render order for layers. */
function layerOrder(side: LayerSide, fn: LayerFunction): number {
  if (fn === 'edge_cuts')   return 0
  if (fn === 'copper')      return side === 'bottom' ? 1 : side === 'top' ? 100 : 50
  if (fn === 'soldermask')  return side === 'bottom' ? 2 : 101
  if (fn === 'paste')       return side === 'bottom' ? 3 : 102
  if (fn === 'silkscreen')  return side === 'bottom' ? 4 : 103
  if (fn === 'courtyard')   return 200
  if (fn === 'fab')         return 201
  return 999
}

// ─── Side Normalization ───────────────────────────────────────────────────────

/** Map of raw side strings → canonical LayerSide. */
const SIDE_MAP: Readonly<Record<string, LayerSide>> = {
  top:         'top',
  front:       'top',
  f:           'top',
  'f.cu':      'top',
  primary:     'top',
  component:   'top',
  bottom:      'bottom',
  back:        'bottom',
  b:           'bottom',
  'b.cu':      'bottom',
  secondary:   'bottom',
  solder:      'bottom',
  inner:       'inner',
  both:        'all',
  all:         'all',
  any:         'all',
}

export function normalizeSide(raw: string): LayerSide {
  return SIDE_MAP[raw.toLowerCase().trim()] ?? 'unknown'
}

// ─── Category Inference ───────────────────────────────────────────────────────

/**
 * Infer ComponentCategory from reference designator and value.
 * Deterministic — same inputs → same output always.
 */
export function inferCategory(reference: string, value: string): ComponentCategory {
  const ref = reference.toUpperCase().trim()
  const val = value.toUpperCase().trim()

  // Reference-based rules (most reliable)
  if (/^U\d/.test(ref))  return inferICCategory(val)
  if (/^R\d/.test(ref))  return 'RESISTOR'
  if (/^C\d/.test(ref))  return 'CAPACITOR'
  if (/^L\d/.test(ref))  return 'INDUCTOR'
  if (/^D\d/.test(ref))  return 'DIODE'
  if (/^Q\d/.test(ref))  return 'TRANSISTOR'
  if (/^Y\d|^XTAL/.test(ref)) return 'CRYSTAL'
  if (/^CN\d|^J\d|^P\d|^CON/.test(ref)) return 'CONNECTOR'
  if (/^BT\d/.test(ref)) return 'BATTERY'

  // Value-based fallback
  if (/CPU|SOC|AP\b/.test(val))       return 'CPU'
  if (/PMIC|PMU|PM\d/.test(val))      return 'PMIC'
  if (/RF|PA\b|LNA|ANTENNA/.test(val)) return 'RF'
  if (/LPDDR|NAND|EMMC|FLASH/.test(val)) return 'MEMORY'
  if (/SENSOR|IMU|ACCEL|GYRO/.test(val)) return 'SENSOR'
  if (/CODEC|DAC|ADC|AMP/.test(val))  return 'AUDIO'
  if (/CAM|ISP|CIS/.test(val))        return 'CAMERA'

  return 'OTHER'
}

function inferICCategory(value: string): ComponentCategory {
  const v = value.toUpperCase()
  if (/MT6\d{3}|PM\d{4}|PMI\d|AXP\d|SY\d{4}|BD9\d/.test(v)) return 'PMIC'
  if (/MT6\d{2}[89]|SDM\d|A\d{2}|KIRIN|EXYNOS/.test(v))      return 'CPU'
  if (/WCN|MDM|WTR|SDR|QCA|RTL|MT7\d/.test(v))                return 'RF'
  if (/LPDDR|SAMSUNG K|SK HYNIX|MICRON/.test(v))              return 'MEMORY'
  if (/IMX\d|S5K|OV\d{4}/.test(v))                            return 'CAMERA'
  if (/AK\d{4}|WCD\d|RT\d{4}|ES8\d/.test(v))                  return 'AUDIO'
  return 'IC'
}

// ─── Voltage Inference ────────────────────────────────────────────────────────

/** Infer canonical voltage string from net name. */
export function inferVoltage(netName: string): string {
  const n = netName.toUpperCase()

  if (/GND|VSS|AGND|DGND|PGND/.test(n)) return '0V'
  if (/\bVCC\b/.test(n))  return '3.3V'
  if (/\bVDD\b/.test(n))  return '1.8V'
  if (/3V3|3\.3V/.test(n)) return '3.3V'
  if (/1V8|1\.8V/.test(n)) return '1.8V'
  if (/1V2|1\.2V/.test(n)) return '1.2V'
  if (/5V0|5\.0V|\b5V\b/.test(n)) return '5V'
  if (/VBAT|VBUS|VUSB/.test(n))  return '4.2V'
  if (/PP1V8|PP_1V8/.test(n))    return '1.8V'
  if (/PP3V3|PP_3V3/.test(n))    return '3.3V'
  if (/PP1V2|PP_1V2/.test(n))    return '1.2V'
  if (/PP5V0|PP_5V/.test(n))     return '5V'
  if (/VCORE|VPP/.test(n))       return '0.9V'

  // Try to extract numeric voltage pattern from name (e.g. "PP_1V05_LDO")
  const match = n.match(/(\d+)V(\d*)/)
  if (match) {
    const major = parseInt(match[1], 10)
    const minor = match[2] ? parseInt(match[2], 10) : 0
    if (major >= 0 && major <= 48) {
      return minor > 0 ? `${major}.${minor}V` : `${major}V`
    }
  }

  return 'unknown'
}
