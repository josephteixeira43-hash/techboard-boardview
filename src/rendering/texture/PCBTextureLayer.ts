/**
 * PCBTextureLayer.ts
 *
 * Renders a deterministic FR4 substrate texture clipped to the board silhouette.
 *
 * Architectural invariants preserved:
 *  - No Math.random() or any runtime procedural randomness
 *  - No parser coupling; silhouette is consumed only through IBoardSilhouette
 *  - No OCR dependencies
 *  - No SVG filter elements (feGaussianBlur, feTurbulence, etc.)
 *  - No cross-module edits; PCBRenderer integration is additive only
 *  - Layer ID exported for renderer layer-order registry
 *  - Copper / traces layers may render on top without interference
 */

// ---------------------------------------------------------------------------
// Public interface contracts (minimal, no import from forbidden modules)
// ---------------------------------------------------------------------------

/**
 * Opaque silhouette contract.
 * The actual BoardSilhouetteGenerator output must satisfy this interface.
 * No other members are accessed, preserving parser decoupling.
 */
export interface IBoardSilhouette {
  /** Replay the board outline as a closed canvas path on `ctx`. */
  toCanvasPath(ctx: CanvasRenderingContext2D): void;
  /** Axis-aligned bounding box of the silhouette in canvas pixels. */
  boundingBox: { x: number; y: number; width: number; height: number };
}

/**
 * Options accepted by PCBTextureLayer.
 * All fields are optional; defaults produce a standard green FR4 board.
 */
export interface PCBTextureLayerOptions {
  /**
   * Substrate base color in CSS hex notation.
   * Default: '#1f6b35' (FR4 green, IPC-standardised mid-tone).
   */
  substrateColor?: string;

  /**
   * Tonal variation amplitude [0–255].
   * Higher = more pronounced micro-cell contrast.
   * Default: 18.
   */
  tonalAmplitude?: number;

  /**
   * Cell size in canvas pixels for the tonal grid.
   * Smaller = finer grain texture.
   * Default: 4.
   */
  cellSize?: number;

  /**
   * Deterministic seed for tonal variation.
   * Change to produce a different (but still deterministic) pattern.
   * Default: 0x4b43_5f42  ('KC_B' in ASCII — internal project mnemonic).
   */
  seed?: number;

  /**
   * Global alpha for the entire texture layer [0–1].
   * Default: 1.0.
   */
  alpha?: number;
}

// ---------------------------------------------------------------------------
// Deterministic hash — XOR-shift 32-bit, no floating-point randomness
// ---------------------------------------------------------------------------

/**
 * Returns a deterministic uint32 in [0, 0xFFFF_FFFF] given three integers.
 * Algorithm: 3-round XOR-shift mix — bijective, avalanche-safe, zero-dependency.
 * Must remain a pure function (same inputs → same output, always).
 */
function deterministicHash(x: number, y: number, seed: number): number {
  // Pack x and y into a single 32-bit value via mixing
  let h = (seed ^ (x * 0x9e3779b9)) >>> 0;
  h = (h ^ (y * 0x85ebca6b)) >>> 0;
  // XOR-shift rounds
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return h >>> 0; // unsigned 32-bit result
}

// ---------------------------------------------------------------------------
// Color utilities — operate on integer channels only
// ---------------------------------------------------------------------------

/** Parse a '#rrggbb' hex string into { r, g, b } integer channels [0–255]. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = parseInt(hex.replace('#', ''), 16);
  return {
    r: (v >>> 16) & 0xff,
    g: (v >>> 8) & 0xff,
    b: v & 0xff,
  };
}

/**
 * Clamp an integer to [0, 255].
 * Kept as a standalone helper so callers stay readable.
 */
function clamp255(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

/** Compose a CSS `rgba()` string from integer channels and a float alpha. */
function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

// ---------------------------------------------------------------------------
// PCBTextureLayer — main export
// ---------------------------------------------------------------------------

/** Stable layer identifier consumed by PCBRenderer's layer-order registry. */
export const LAYER_ID = 'pcb-texture' as const;

/**
 * Renders a deterministic FR4 substrate texture onto a 2D canvas context,
 * clipped to the supplied board silhouette.
 *
 * Layer order contract:
 *   [0] pcb-texture   ← this layer (lowest)
 *   [1] pcb-copper    ← future Track A (renders on top)
 *   [2] pcb-traces    ← future Track A (renders on top)
 *   [3] pcb-overlay   ← future Track A (renders on top)
 *
 * This layer writes only within `ctx.clip()` so upper layers are unaffected.
 */
export class PCBTextureLayer {
  // Resolved options
  private readonly substrateColor: string;
  private readonly tonalAmplitude: number;
  private readonly cellSize: number;
  private readonly seed: number;
  private readonly alpha: number;

  // Pre-parsed base channel values (avoid re-parsing on every render call)
  private readonly baseR: number;
  private readonly baseG: number;
  private readonly baseB: number;

  constructor(options: PCBTextureLayerOptions = {}) {
    this.substrateColor  = options.substrateColor  ?? '#1f6b35';
    this.tonalAmplitude  = options.tonalAmplitude  ?? 18;
    this.cellSize        = options.cellSize        ?? 4;
    this.seed            = options.seed            ?? 0x4b435f42;
    this.alpha           = options.alpha           ?? 1.0;

    const { r, g, b } = hexToRgb(this.substrateColor);
    this.baseR = r;
    this.baseG = g;
    this.baseB = b;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Render the texture layer.
   *
   * @param ctx       - Target 2D rendering context (must not be inside a
   *                    save/restore block that already sets a clip the caller
   *                    needs to preserve — this method manages its own save).
   * @param silhouette - Board silhouette produced by BoardSilhouetteGenerator.
   *                    Consumed only through the IBoardSilhouette interface.
   */
  render(ctx: CanvasRenderingContext2D, silhouette: IBoardSilhouette): void {
    const { x, y, width, height } = silhouette.boundingBox;

    // Guard: skip degenerate boards
    if (width <= 0 || height <= 0) return;

    ctx.save();

    // 1. Apply global layer alpha
    ctx.globalAlpha = this.alpha;

    // 2. Establish clip region from silhouette outline
    ctx.beginPath();
    silhouette.toCanvasPath(ctx);
    ctx.clip();

    // 3. Fill substrate base color — solid, covers entire bounding box
    ctx.fillStyle = this.substrateColor;
    ctx.fillRect(x, y, width, height);

    // 4. Render deterministic tonal micro-cell grid
    this._renderTonalGrid(ctx, x, y, width, height);

    ctx.restore();
    // globalAlpha is restored to its pre-call value by ctx.restore()
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Rasterise the tonal variation grid.
   *
   * Each cell at grid position (gx, gy) gets a brightness delta derived from
   * `deterministicHash(gx, gy, seed)`. The delta is mapped from the full
   * uint32 range into [-tonalAmplitude, +tonalAmplitude] via modulo — which
   * preserves determinism and avoids floating-point non-determinism.
   *
   * Performance note: `fillRect` per cell is fast enough for typical PCB
   * bounding boxes (≤ 4096 × 4096 px at cellSize 4 → ≤ 1 M cells).
   * If profiling reveals a bottleneck, replace with a single ImageData pass
   * without changing the hash or color arithmetic.
   */
  private _renderTonalGrid(
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    bw: number,
    bh: number,
  ): void {
    const { cellSize, seed, tonalAmplitude, baseR, baseG, baseB } = this;
    const span = tonalAmplitude * 2 + 1; // number of distinct delta values

    // Integer grid extents — ceiling so the grid covers the full bbox
    const cols = Math.ceil(bw / cellSize);
    const rows = Math.ceil(bh / cellSize);

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const hash  = deterministicHash(gx, gy, seed);
        // Map hash to a delta in [-tonalAmplitude, +tonalAmplitude]
        const delta = (hash % span) - tonalAmplitude;

        const r = clamp255(baseR + delta);
        const g = clamp255(baseG + delta);
        const b = clamp255(baseB + delta);

        // Skip cells that are identical to the base to reduce draw calls
        if (delta === 0) continue;

        ctx.fillStyle = rgba(r, g, b, 1);
        ctx.fillRect(
          bx + gx * cellSize,
          by + gy * cellSize,
          cellSize,
          cellSize,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Integration stub for PCBRenderer (additive, no modification of renderer)
// ---------------------------------------------------------------------------

/**
 * Factory helper used by PCBRenderer to instantiate the texture layer.
 *
 * PCBRenderer calls this once during its own construction:
 *
 *   ```ts
 *   // Inside PCBRenderer.ts — additive only, no architectural change
 *   import { createPCBTextureLayer, LAYER_ID as TEXTURE_LAYER_ID } from './PCBTextureLayer';
 *
 *   // In constructor:
 *   this.layerRegistry.register(TEXTURE_LAYER_ID, createPCBTextureLayer(options.texture));
 *
 *   // In render():
 *   this.layerRegistry.get(TEXTURE_LAYER_ID)?.render(ctx, silhouette);
 *   ```
 *
 * This factory is the only integration surface; the renderer's own layer-order
 * array and `render()` pipeline are untouched by this file.
 */
export function createPCBTextureLayer(
  options?: PCBTextureLayerOptions,
): PCBTextureLayer {
  return new PCBTextureLayer(options);
}
