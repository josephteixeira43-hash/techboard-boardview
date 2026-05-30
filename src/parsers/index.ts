/**
 * index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Parser Public API
 *
 * Single entry point for all board file parsing.
 * Import from here, not from individual parser files.
 *
 * Usage:
 *   import { BoardParser, BRDParser, FZParser } from '@/parsers'
 *   import type { BoardData, NormalizedBoardComponent } from '@/parsers'
 */

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  BoardData,
  NormalizedBoardComponent,
  BoardPad,
  BoardVia,
  BoardTrace,
  ElectricalNet,
  LayerDefinition,
  LayerSide,
  LayerFunction,
  ComponentCategory,
  BoundingBox,
  Point2D,
  ParseResult,
  ParseQuality,
  BoardOutlineSegment,
  PadShape,
  PadType,
  ViaType,
  TraceType,
} from './common/BoardTypes'

// ── Normalization utilities ───────────────────────────────────────────────────
export {
  milToMm,
  inchToMm,
  fzPxToMm,
  roundMm,
  normalizeLayer,
  normalizeSide,
  inferCategory,
  inferVoltage,
  MIL_TO_MM,
  INCH_TO_MM,
  FZ_PX_TO_MM,
} from './common/BoardNormalizationUtils'

// ── Geometry normalizer ───────────────────────────────────────────────────────
export { BoardGeometryNormalizer } from './common/BoardGeometryNormalizer'
export type { RawBoardData, RawComponent, RawPad, RawVia, RawTrace, RawNet, RawOutlineSegment } from './common/BoardGeometryNormalizer'

// ── Parsers ───────────────────────────────────────────────────────────────────
export { BRDParser } from './brd/BRDParser'
export { FZParser  } from './fz/FZParser'

// ── Unified parser facade ─────────────────────────────────────────────────────

import { BRDParser } from './brd/BRDParser'
import { FZParser  } from './fz/FZParser'
import type { BoardData } from './common/BoardTypes'

/**
 * BoardParser — unified facade that auto-detects format from file extension
 * and delegates to the correct parser.
 *
 * Supports:
 *   .brd         → BRDParser (Cadence Allegro, Eagle, KiCad)
 *   .kicad_pcb   → BRDParser (KiCad)
 *   .fz          → FZParser  (Fritzing)
 *   .fzz         → FZParser  (Fritzing ZIP)
 *
 * Future formats plug in here by adding a case to the switch.
 */
export class BoardParser {
  private readonly brdParser = new BRDParser()
  private readonly fzParser  = new FZParser()

  /**
   * Parse any supported board file from an ArrayBuffer.
   * @param buffer   Raw file bytes
   * @param fileName File name including extension (used for format detection)
   */
  parse(buffer: ArrayBuffer, fileName: string): BoardData {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

    switch (ext) {
      case 'fz':
      case 'fzz':
        return this.fzParser.parse(buffer, fileName)

      case 'brd':
      case 'kicad_pcb':
      case 'kicad':
      default:
        return this.brdParser.parse(buffer, fileName)
    }
  }

  /**
   * Parse from a string (text-based formats).
   */
  parseText(text: string, fileName: string): BoardData {
    const enc = new TextEncoder()
    return this.parse(enc.encode(text).buffer, fileName)
  }

  /**
   * Generate a deterministic mock board for a given brand/model.
   * Useful for UI development and testing without real files.
   */
  mock(brand: 'samsung' | 'xiaomi' | 'motorola' | 'iphone' | 'generic' = 'generic'): BoardData {
    const names: Record<typeof brand, string> = {
      samsung:  'Samsung A12 Mock',
      xiaomi:   'Xiaomi Redmi Note 10 Mock',
      motorola: 'Motorola G84 Mock',
      iphone:   'iPhone 14 Pro Mock',
      generic:  'Generic Board Mock',
    }
    return this.brdParser.mock(names[brand])
  }
}
