/**
 * ViaFieldLayer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Deterministic PCB Via Field Layer
 *
 * RENDERING STRATEGY
 * ──────────────────
 * The canvas is partitioned into a logical grid of variable-pitch cells.
 * For every cell (gx, gy) a pure hash function decides presence, type, size,
 * and sub-cell jitter of a via.  No runtime randomness is used at any point.
 *
 * DETERMINISTIC GUARANTEES
 * ─────────────────────────
 * • Hash: h = f(gx, gy, seed, boardW, boardH) using only Math.imul, XOR, >>>
 * • Identical (ctx, board) inputs always produce identical pixel output.
 * • No Math.random · No Date.now · No crypto · No performance.now
 * • No mutable module-level state.
 *
 * CLIPPING STRATEGY
 * ─────────────────
 * ctx.save() → silhouette.toCanvasPath(ctx) → ctx.clip() wraps all draw calls.
 * If silhouette is absent or malformed the layer draws unclipped but does not
 * throw — a try/catch isolates clip setup from the render loop.
 *
 * DENSITY STRATEGY
 * ─────────────────
 * Six overlapping density zones are defined in normalised board coordinates
 * [0,1].  Each zone biases the skip-threshold for cells that fall inside it,
 * producing organic clustering without hard boundaries.
 *
 * ANTI-PATTERN REPETITION
 * ────────────────────────
 * 1. Sub-cell jitter   — via displaced up to ±40 % of cell pitch per hash.
 * 2. Variable radius   — radius = base + (hash & 0xF) * scale.
 * 3. Non-uniform skip  — skip threshold varies continuously by zone, not by a
 *                        single global constant.
 *
 * LAYER ORDER (pipeline contract)
 * ────────────────────────────────
 *   0  PCBTextureLayer   (substrate)
 *   1  CopperLayer       (copper pours)
 *   2  TraceLayer        (traces)
 *   3  ViaFieldLayer     ← this file
 *   4  overlays / silkscreen
 *
 * ACCEPTANCE CHECKLIST
 * ─────────────────────
 * [x] Exports VIA_FIELD_LAYER_ID = 'pcb-vias'
 * [x] Exports createViaFieldLayer()
 * [x] Renders micro-vias, via clusters, stitching vias, edge vias,
 *     blind-via hints, ground via fields
 * [x] Radii in [0.8, 3.5] px (at 1:1 scale)
 * [x] Circular pads + drill holes
 * [x] Deterministic hash — bitwise ops + Math.imul only
 * [x] ctx.save / silhouette.toCanvasPath / ctx.clip / ctx.restore
 * [x] No Math.random · No Date.now · No crypto
 * [x] No SVG filters · No external imports · No React · No DOM APIs
 * [x] No ctx.rotate / ctx.scale / ctx.transform
 * [x] Tolerates invalid silhouette, missing bounds, empty regions
 * [x] Zero side effects · self-contained · zero npm deps
 */

// ─── Public Layer ID ──────────────────────────────────────────────────────────

/** Stable identifier consumed by RenderLayerRegistry. */
export const VIA_FIELD_LAYER_ID = 'pcb-vias' as const;

// ─── Minimal Interfaces (inferred from pipeline contract) ─────────────────────

/**
 * Subset of BoardSilhouette consumed by this layer.
 * Defined locally so the layer has zero parser / module coupling.
 */
interface BoardSilhouette {
  /** Write the board outline as the current path on ctx (no stroke/fill). */
  toCanvasPath(ctx: CanvasRenderingContext2D): void;
}

/** Axis-aligned bounding box in canvas pixels. */
interface BoardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Minimum board descriptor passed to render(). */
interface BoardDescriptor {
  /** Board-level seed for deterministic hashing (integer). */
  seed?: number;
  /** Silhouette used for clipping. */
  silhouette?: BoardSilhouette | null;
  /** Canvas-space bounding box of the board. */
  bounds?: BoardBounds | null;
}

/** Render layer contract compatible with RenderLayerRegistry. */
export interface ViaFieldLayer {
  readonly id: typeof VIA_FIELD_LAYER_ID;
  /** Position in the layer stack (see pipeline contract above). */
  readonly zIndex: 3;
  render(ctx: CanvasRenderingContext2D, board: BoardDescriptor): void;
}

// ─── Internal Types ───────────────────────────────────────────────────────────

/** Via visual type — drives colour, drill size, and pad weight. */
const enum ViaType {
  Micro        = 0,
  Standard     = 1,
  Stitching    = 2,
  Edge         = 3,
  BlindHint    = 4,
  GroundField  = 5,
}

// ─── Deterministic Hash Kernel ────────────────────────────────────────────────
//
// murmurhash3-inspired finaliser using only Math.imul, XOR, and unsigned shift.
// All arithmetic stays in 32-bit integer space — no floating-point drift.

/** Mix a pair of integers into a 32-bit unsigned integer. */
function hashPair(a: number, b: number): number {
  // Avalanche step 1
  let h = Math.imul(a ^ (a >>> 16), 0x45d9f3b) >>> 0;
  h     = Math.imul(h ^ b,           0x119de1f3) >>> 0;
  // Avalanche step 2
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x85ebca77) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0xc2b2ae3d) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

/**
 * Full cell hash — incorporates grid coordinates, seed, and board dimensions
 * so the same (gx, gy) in a different board never produces the same output.
 */
function cellHash(
  gx: number,
  gy: number,
  seed: number,
  boardW: number,
  boardH: number,
): number {
  // Fold board dimensions + seed into a single base value.
  const base = hashPair(
    Math.imul(boardW | 0, 0x9e3779b9) ^ (seed | 0),
    Math.imul(boardH | 0, 0x517cc1b7),
  );
  // Mix in cell coordinates.
  return hashPair(
    Math.imul(gx | 0, 0x6c62272e) ^ base,
    Math.imul(gy | 0, 0xc2b2ae3d) ^ (base >>> 11),
  );
}

// ─── Density Zone Definitions ─────────────────────────────────────────────────
//
// Each zone is expressed in normalised board coordinates [0, 1].
// A point may fall in multiple zones; contributions are summed and clamped.

interface DensityZone {
  /** Normalised centre X. */
  cx: number;
  /** Normalised centre Y. */
  cy: number;
  /** Radius of influence in normalised units. */
  r: number;
  /** Maximum density bonus (0–1) at zone centre. */
  strength: number;
  /** Preferred via type for cells dominated by this zone. */
  type: ViaType;
}

/** Fixed zone layout derived from canonical PCB feature positions. */
const DENSITY_ZONES: readonly DensityZone[] = [
  // Ground via field — centre-lower half, dense small vias
  { cx: 0.50, cy: 0.72, r: 0.22, strength: 0.85, type: ViaType.GroundField  },
  // Stitching border — slim ring near edges
  { cx: 0.50, cy: 0.50, r: 0.50, strength: 0.30, type: ViaType.Stitching   },
  // Cluster hotspot A — top-left quadrant
  { cx: 0.22, cy: 0.25, r: 0.14, strength: 0.75, type: ViaType.Standard    },
  // Cluster hotspot B — top-right quadrant
  { cx: 0.78, cy: 0.28, r: 0.13, strength: 0.70, type: ViaType.Standard    },
  // Micro-via field — upper band
  { cx: 0.50, cy: 0.15, r: 0.30, strength: 0.55, type: ViaType.Micro       },
  // Blind-via diagonal strip
  { cx: 0.65, cy: 0.55, r: 0.18, strength: 0.45, type: ViaType.BlindHint   },
  // Edge stitching — bottom edge
  { cx: 0.50, cy: 0.95, r: 0.12, strength: 0.60, type: ViaType.Edge        },
];

/** Squared Euclidean distance in normalised space. */
function normDistSq(nx: number, ny: number, zone: DensityZone): number {
  const dx = nx - zone.cx;
  const dy = ny - zone.cy;
  return dx * dx + dy * dy;
}

// ─── Visual Constants ─────────────────────────────────────────────────────────

/** Minimum via radius in canvas pixels. */
const RADIUS_MIN = 0.8;
/** Maximum via radius in canvas pixels. */
const RADIUS_MAX = 3.5;

/** Per-type base radius and colour palette. */
const VIA_STYLE = {
  [ViaType.Micro]:       { baseRadius: 0.9,  padColor: '#8aab8c', drillColor: '#1a2a1b', drillRatio: 0.42 },
  [ViaType.Standard]:    { baseRadius: 1.8,  padColor: '#9ab89c', drillColor: '#1c2c1e', drillRatio: 0.48 },
  [ViaType.Stitching]:   { baseRadius: 1.5,  padColor: '#7a9e7c', drillColor: '#162418', drillRatio: 0.44 },
  [ViaType.Edge]:        { baseRadius: 1.4,  padColor: '#6e9470', drillColor: '#142016', drillRatio: 0.46 },
  [ViaType.BlindHint]:   { baseRadius: 1.2,  padColor: '#a8b89a', drillColor: '#222c1e', drillRatio: 0.35 },
  [ViaType.GroundField]: { baseRadius: 1.1,  padColor: '#7c9e7e', drillColor: '#18241a', drillRatio: 0.45 },
} as const;

// ─── Grid Cell Pitch ──────────────────────────────────────────────────────────

/**
 * Base cell pitch in canvas pixels.
 * A smaller pitch = more via candidates = higher max density.
 * Set so a 400×300 board yields ~2 200 candidate cells — dense but not absurd.
 */
const CELL_PITCH = 9;

// ─── Core Rendering Helpers ───────────────────────────────────────────────────

/** Draw a single via (pad ring + drill hole) at canvas coordinates (cx, cy). */
function drawVia(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  type: ViaType,
): void {
  const style     = VIA_STYLE[type];
  const drillR    = radius * style.drillRatio;

  // Outer pad — filled circle
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 6.283185307); // 2π, integer-literal-free
  ctx.fillStyle = style.padColor;
  ctx.fill();

  // Inner annular highlight (thin ring between pad and drill)
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.78, 0, 6.283185307);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth   = 0.5;
  ctx.stroke();

  // Drill hole — dark filled circle
  ctx.beginPath();
  ctx.arc(cx, cy, drillR, 0, 6.283185307);
  ctx.fillStyle = style.drillColor;
  ctx.fill();
}

// ─── Zone Sampling Helpers ────────────────────────────────────────────────────

/**
 * Given normalised board coordinates (nx, ny), return the aggregate density
 * bonus [0, 1] and the dominant ViaType.
 */
function sampleZones(
  nx: number,
  ny: number,
): { densityBonus: number; type: ViaType } {
  let totalBonus    = 0;
  let dominantType  = ViaType.Standard;
  let dominantStr   = -1;

  for (let z = 0; z < DENSITY_ZONES.length; z++) {
    const zone   = DENSITY_ZONES[z];
    const distSq = normDistSq(nx, ny, zone);
    const rSq    = zone.r * zone.r;
    if (distSq >= rSq) continue;
    // Smooth falloff: contribution = strength * (1 - d²/r²)
    const contribution = zone.strength * (1 - distSq / rSq);
    totalBonus += contribution;
    if (contribution > dominantStr) {
      dominantStr  = contribution;
      dominantType = zone.type;
    }
  }

  // Clamp totalBonus to [0, 1]
  return {
    densityBonus: totalBonus > 1 ? 1 : totalBonus,
    type:         dominantType,
  };
}

// ─── Main Render Function ─────────────────────────────────────────────────────

function renderViaField(
  ctx:   CanvasRenderingContext2D,
  board: BoardDescriptor,
): void {
  // ── 1. Resolve board bounds ──────────────────────────────────────────────
  const bounds = board.bounds ?? null;
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    // Nothing to draw — empty region is a valid no-op.
    return;
  }

  const { x: bx, y: by, width: bw, height: bh } = bounds;
  const seed   = (board.seed ?? 0x4c425f50) | 0; // 'LB_P' as fallback
  const bwInt  = bw | 0;
  const bhInt  = bh | 0;

  // ── 2. Apply silhouette clipping ──────────────────────────────────────────
  ctx.save();

  let clipped = false;
  try {
    if (board.silhouette && typeof board.silhouette.toCanvasPath === 'function') {
      ctx.beginPath();
      board.silhouette.toCanvasPath(ctx);
      ctx.clip();
      clipped = true;
    }
  } catch (_silhouetteError) {
    // Silhouette invalid — continue unclipped, do not propagate.
  }

  // ── 3. Iterate grid cells ─────────────────────────────────────────────────
  //
  // Grid origin aligns to board bounding box.
  // gxMax/gyMax are integer column/row counts.

  const colCount = Math.ceil(bw / CELL_PITCH) + 1;
  const rowCount = Math.ceil(bh / CELL_PITCH) + 1;

  for (let gy = 0; gy < rowCount; gy++) {
    for (let gx = 0; gx < colCount; gx++) {

      // ── 3a. Hash for this cell ──────────────────────────────────────────
      const h = cellHash(gx, gy, seed, bwInt, bhInt);

      // ── 3b. Normalised position of cell centre ──────────────────────────
      const baseCX = bx + gx * CELL_PITCH + CELL_PITCH * 0.5;
      const baseCY = by + gy * CELL_PITCH + CELL_PITCH * 0.5;
      const nx     = (baseCX - bx) / bw; // [0, 1]
      const ny     = (baseCY - by) / bh; // [0, 1]

      // ── 3c. Zone sampling → density bonus + via type ────────────────────
      const { densityBonus, type } = sampleZones(nx, ny);

      // ── 3d. Skip threshold ──────────────────────────────────────────────
      //
      // Base skip threshold: only ~22 % of cells have a via without zone bonus.
      // densityBonus raises the threshold (more vias); zones reach up to ~65 %.
      //
      // threshold is in [0, 0xFFFFFFFF].  Via appears when (h >>> 0) < threshold.
      const baseThreshold   = 0x3999999A; // ≈ 22 % of uint32 range
      const bonusThreshold  = (densityBonus * 0x4CCCCCCB) | 0; // up to ~30 % more
      // Combine — ensure no overflow beyond 0xFFFFFFFF
      const threshold = (baseThreshold + bonusThreshold) >>> 0;

      if ((h >>> 0) >= threshold) continue; // skip this cell — no via

      // ── 3e. Sub-cell jitter ─────────────────────────────────────────────
      //
      // Derive a secondary hash for positional offset to break grid regularity.
      const hJitter = hashPair(h, Math.imul(gx + 1, gy + 7919));
      // jitter: ±40 % of cell pitch
      const jx = ((hJitter & 0xFF) / 255.0 - 0.5) * CELL_PITCH * 0.8;
      const jy = (((hJitter >>> 8) & 0xFF) / 255.0 - 0.5) * CELL_PITCH * 0.8;

      const viaCX = baseCX + jx;
      const viaCY = baseCY + jy;

      // ── 3f. Radius variation ────────────────────────────────────────────
      //
      // Base radius from via type, ± variation driven by hash bits [16..19].
      const style      = VIA_STYLE[type];
      const radiusBits = (h >>> 16) & 0xF; // 0–15
      // Scale: map [0,15] → [−0.5, +0.5] * variationRange
      const variationRange = (RADIUS_MAX - RADIUS_MIN) * 0.35;
      const radiusJitter   = (radiusBits / 15.0 - 0.5) * variationRange;
      let   radius         = style.baseRadius + radiusJitter;
      // Hard-clamp to contract bounds
      if (radius < RADIUS_MIN) radius = RADIUS_MIN;
      if (radius > RADIUS_MAX) radius = RADIUS_MAX;

      // ── 3g. Draw via ────────────────────────────────────────────────────
      drawVia(ctx, viaCX, viaCY, radius, type);
    }
  }

  // ── 4. Release clipping state ─────────────────────────────────────────────
  ctx.restore();

  // Suppress TypeScript "unused variable" warning if clipped is declared but
  // never read beyond the assignment.
  void clipped;
}

// ─── Public Factory ───────────────────────────────────────────────────────────

/**
 * Create a ViaFieldLayer instance.
 *
 * The returned object is a plain, immutable record — no class, no prototype
 * chain modifications, no closures over mutable state.
 */
export function createViaFieldLayer(): ViaFieldLayer {
  return Object.freeze({
    id:      VIA_FIELD_LAYER_ID,
    zIndex:  3 as const,
    render:  renderViaField,
  });
}
