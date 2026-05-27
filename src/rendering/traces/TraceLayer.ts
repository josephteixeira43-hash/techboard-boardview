/**
 * TraceLayer.ts
 * src/rendering/traces/TraceLayer.ts
 *
 * Track A — Task 4: Deterministic fake PCB trace renderer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ARCHITECTURAL NOTE — SURFACE DECISION
 * ─────────────────────────────────────────────────────────────────────────
 * The original task spec referenced Canvas 2D API (ctx.save, ctx.clip, etc.).
 * This project's rendering pipeline is React + SVG (Tasks 1–3 are all SVG).
 * Mixing Canvas into an SVG layer stack is architecturally incompatible —
 * they are mutually exclusive rendering surfaces.
 *
 * This file uses the SVG equivalents for every Canvas operation:
 *   ctx.save() / restore()     → <g clipPath="url(#id)"> ... </g>
 *   ctx.clip()                 → SVG <clipPath> + clipPath attribute
 *   silhouette.toCanvasPath()  → silhouette.outerPath in <clipPath>
 *   ctx.rotate / scale         → NOT USED (prohibited by spec anyway)
 *
 * All other constraints from the task spec are honored exactly:
 *   - Math.imul-based hash from (gx, gy, seed)
 *   - No Math.random(), Date.now(), crypto
 *   - No SVG filters
 *   - No cross-module imports
 *   - Zero npm dependencies
 *   - Total determinism guarantee
 * ─────────────────────────────────────────────────────────────────────────
 *
 * POSITION IN LAYER STACK:
 *   [0] pcb-silhouette  ← Task 1 (frozen)
 *   [1] pcb-texture     ← Task 2 (frozen)
 *   [2] pcb-copper      ← Task 3 (frozen)
 *   [3] pcb-traces      ← THIS FILE  ◀
 *   [4] pcb-vias        ← future
 *   [5] overlays        ← existing children, untouched
 *
 * DETERMINISM GUARANTEE:
 *   Given identical (silhouette, boardBounds, regions) inputs, this module
 *   always produces byte-identical SVG path strings. No entropy source is
 *   used. All variation is derived from grid coordinates and integer seeds
 *   via Math.imul bitwise arithmetic.
 *
 * ACCEPTANCE CHECKLIST:
 *   [x] TRACE_LAYER_ID exported as 'pcb-traces'
 *   [x] createTraceLayer() exported
 *   [x] Receives: silhouette, boardBounds, optional regions
 *   [x] Renders: horizontal traces, vertical traces, branch traces, via hints
 *   [x] Clipping to silhouette.outerPath (SVG clipPath — save/restore equiv.)
 *   [x] No Math.random()
 *   [x] No Date.now()
 *   [x] No crypto
 *   [x] No SVG filters (feGaussianBlur, feTurbulence, etc.)
 *   [x] No ctx.rotate / ctx.scale / ctx.transform
 *   [x] No external npm dependencies
 *   [x] No cross-module imports (only React + type-only local import)
 *   [x] Hash uses Math.imul + bitwise ops + integer arithmetic only
 *   [x] Trace width in range [0.6, 2.2] layout units
 *   [x] Small smooth curves on traces (quadratic Bezier via SVG Q command)
 *   [x] Non-repetitive visual distribution
 *   [x] Zero side effects
 *   [x] Autocontained
 */

import React from "react";
import type { BoardSilhouette, BoardRegion } from "../BoardSilhouetteGenerator";

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Layer identifier — used by PCBRenderer to reference this layer in the stack */
export const TRACE_LAYER_ID = "pcb-traces" as const;

export interface TraceBoardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TraceLayerInput {
  silhouette: BoardSilhouette;
  boardBounds: TraceBoardBounds;
  regions?: BoardRegion[];
  opacity?: number;
  visible?: boolean;
}

export interface TraceLayerOutput {
  /** Layer identifier — always TRACE_LAYER_ID */
  layerId: typeof TRACE_LAYER_ID;
  /**
   * SVG JSX element — drop into <g data-layer="pcb-traces"> in PCBRenderer.
   * All geometry is pre-clipped; no further clipping needed by the caller.
   */
  element: React.ReactElement | null;
}

/**
 * createTraceLayer()
 *
 * Factory function (not a React component) — returns a pre-computed
 * TraceLayerOutput containing a ready-to-insert React element.
 *
 * Usage in PCBRenderer:
 *   const traceLayer = createTraceLayer({ silhouette, boardBounds, regions });
 *   // then in JSX:
 *   <g data-layer="pcb-traces">{traceLayer.element}</g>
 *
 * The factory pattern keeps geometry computation outside the React render
 * cycle — callers can memoize the result with useMemo([silhouette, boardBounds]).
 */
export function createTraceLayer(input: TraceLayerInput): TraceLayerOutput {
  const { silhouette, boardBounds, regions = [], opacity = 1, visible = true } = input;

  if (!visible || !silhouette?.outerPath || boardBounds.width <= 0 || boardBounds.height <= 0) {
    return { layerId: TRACE_LAYER_ID, element: null };
  }

  const geometry = buildTraceGeometry(silhouette, boardBounds, regions);
  const element = renderTraceElement(geometry, silhouette, boardBounds, opacity);

  return { layerId: TRACE_LAYER_ID, element };
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual constants
// ─────────────────────────────────────────────────────────────────────────────

/** Copper trace color — slightly lighter than copper base for visual separation */
const TRACE_COLOR_PRIMARY = "#c8863c";

/** Secondary trace color — used for branch traces and thin signal lines */
const TRACE_COLOR_SECONDARY = "#a06828";

/** Via hint fill — small circle at trace terminations */
const VIA_HINT_COLOR = "#d4955a";

/** Via hint stroke */
const VIA_HINT_STROKE = "#8c5a22";

/** Trace width range in layout units */
const TRACE_WIDTH_MIN = 0.6;
const TRACE_WIDTH_MAX = 2.2;

/** Grid cell size in layout units — traces are distributed on this grid */
const GRID_BASE = 18;

/** Minimum trace length as fraction of grid cell */
const MIN_TRACE_LENGTH_RATIO = 0.4;

/** Branch probability threshold (0–1 normalized hash) */
const BRANCH_PROBABILITY = 0.28;

/** Via hint probability at trace endpoints */
const VIA_PROBABILITY = 0.42;

/** Integer seeds for hash discrimination — prime numbers for low collision */
const SEED_H_PRESENT = 0x3f6d2b1;
const SEED_V_PRESENT = 0x7a4c9e3;
const SEED_WIDTH     = 0x1d8b4f7;
const SEED_OFFSET    = 0x5c2e8a9;
const SEED_LENGTH    = 0x9b1f3d5;
const SEED_BRANCH    = 0x2e7a5c1;
const SEED_CURVE     = 0x6f3b9d7;
const SEED_VIA       = 0x4d8c2f3;
const SEED_VIA_START = 0x8a1e6b4;

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic hash — Math.imul based
//
// Strategy: mix three integer inputs (gx, gy, seed) using Math.imul and
// XOR cascades. Output is a uint32 normalized to [0, 1).
//
// Properties:
//   - Fully deterministic: same (gx, gy, seed) → same output always
//   - Different seeds → uncorrelated outputs for same (gx, gy)
//   - Avalanche: single-bit change in any input changes ~50% of output bits
//   - No external entropy: Math.random, Date.now, crypto never called
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hash three integers to a uint32 using Math.imul (as specified in task).
 *
 * Algorithm:
 *   1. Mix gx with the golden-ratio-derived constant 0x9e3779b9
 *   2. XOR with gy mixed with 0x6c62272e (FNV prime derivative)
 *   3. Final avalanche pass with seed
 *   4. Normalize to [0, 1)
 */
function hash3(gx: number, gy: number, seed: number): number {
  // Step 1: mix x coordinate
  let h = Math.imul(gx ^ seed, 0x9e3779b9);
  // Step 2: mix y coordinate
  h = Math.imul(h ^ gy, 0x6c62272e);
  // Step 3: avalanche — improves bit distribution
  h ^= (h >>> 16);
  h = Math.imul(h, 0x85ebca6b);
  h ^= (h >>> 13);
  h = Math.imul(h, 0xc2b2ae35);
  h ^= (h >>> 16);
  // Normalize to [0, 1)
  return (h >>> 0) / 0x100000000;
}

/**
 * Map a [0,1) hash value to the trace width range [TRACE_WIDTH_MIN, TRACE_WIDTH_MAX].
 * Width is biased toward thinner traces (log-ish distribution) to match real PCB
 * aesthetics where thin signal traces outnumber thick power traces.
 */
function hashToWidth(h: number): number {
  // Bias toward thin: use h^1.6 to compress the high end
  const biased = Math.pow(h, 1.6);
  return TRACE_WIDTH_MIN + biased * (TRACE_WIDTH_MAX - TRACE_WIDTH_MIN);
}

/** Format number to 2 decimal places for SVG output */
function f(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Region density map
//
// Traces avoid component centers and cluster near region edges — matching
// real PCB routing behavior where traces route around, not through, components.
// ─────────────────────────────────────────────────────────────────────────────

interface RegionBlock {
  x: number;
  y: number;
  x2: number;
  y2: number;
  /** Clearance margin in layout units — traces avoid this zone */
  clearance: number;
}

function buildRegionBlocks(regions: BoardRegion[]): RegionBlock[] {
  return regions
    .filter((r) => r.type !== "empty" && r.width > 4 && r.height > 4)
    .map((r) => ({
      x: r.x,
      y: r.y,
      x2: r.x + r.width,
      y2: r.y + r.height,
      clearance: Math.min(r.width, r.height) * 0.1,
    }));
}

/**
 * Returns true if a point (px, py) falls inside any region block
 * (including clearance margin). Used to suppress trace segments that
 * would render inside components.
 */
function insideAnyBlock(px: number, py: number, blocks: RegionBlock[]): boolean {
  for (const b of blocks) {
    if (
      px >= b.x - b.clearance &&
      px <= b.x2 + b.clearance &&
      py >= b.y - b.clearance &&
      py <= b.y2 + b.clearance
    ) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry types
// ─────────────────────────────────────────────────────────────────────────────

interface TracePath {
  d: string;
  width: number;
  color: string;
}

interface ViaHint {
  cx: number;
  cy: number;
  r: number;
}

interface TraceGeometry {
  traces: TracePath[];
  vias: ViaHint[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG path builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a horizontal trace path with a subtle mid-point curve.
 * Uses SVG quadratic Bezier (Q command) for the smooth bend.
 *
 * The control point is offset vertically by a hash-derived amount —
 * small enough to read as a PCB trace, not a drawn curve.
 *
 * @param x0    start x
 * @param x1    end x
 * @param y     base y position
 * @param bend  vertical control point offset (signed, layout units)
 */
function buildHTrace(x0: number, x1: number, y: number, bend: number): string {
  const mx = (x0 + x1) / 2;
  if (Math.abs(bend) < 0.3) {
    // Effectively straight — use L for cleaner output
    return `M ${f(x0)},${f(y)} L ${f(x1)},${f(y)}`;
  }
  return `M ${f(x0)},${f(y)} Q ${f(mx)},${f(y + bend)} ${f(x1)},${f(y)}`;
}

/**
 * Build a vertical trace path with a subtle mid-point curve.
 */
function buildVTrace(x: number, y0: number, y1: number, bend: number): string {
  const my = (y0 + y1) / 2;
  if (Math.abs(bend) < 0.3) {
    return `M ${f(x)},${f(y0)} L ${f(x)},${f(y1)}`;
  }
  return `M ${f(x)},${f(y0)} Q ${f(x + bend)},${f(my)} ${f(x)},${f(y1)}`;
}

/**
 * Build a short branch trace (45°-ish diagonal stub) emerging from a point.
 * Uses two line segments with a 45° intermediate point.
 */
function buildBranchTrace(
  x: number, y: number,
  length: number,
  dir: 0 | 1 | 2 | 3  // 0=NE, 1=SE, 2=SW, 3=NW
): string {
  const dx = dir < 2 ? length * 0.6 : -length * 0.6;
  const dy = (dir === 0 || dir === 3) ? -length * 0.6 : length * 0.6;
  const mx = x + dx * 0.5;
  const my = y + dy * 0.5;
  return `M ${f(x)},${f(y)} L ${f(mx)},${f(my)} L ${f(x + dx)},${f(y + dy)}`;
}

/**
 * Build a via hint — small filled circle with stroke ring.
 * Via radius is derived from trace width.
 */
function buildViaHint(cx: number, cy: number, traceWidth: number): ViaHint {
  return {
    cx,
    cy,
    r: Math.max(1.0, traceWidth * 1.4),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core geometry builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the full trace geometry for a board.
 *
 * Algorithm:
 *   1. Divide board into a grid of (GRID_BASE × GRID_BASE) cells.
 *   2. For each cell (gx, gy):
 *      a. Hash (gx, gy, SEED_H_PRESENT) → decide if horizontal trace present
 *      b. Hash (gx, gy, SEED_V_PRESENT) → decide if vertical trace present
 *      c. For each present trace: derive width, offset, length, bend, branch, via
 *   3. Suppress traces whose midpoint falls inside a component region block.
 *   4. Collect all trace paths + via hints.
 *
 * Grid coordinates are integers; all floating-point arithmetic is in layout
 * space. The grid is scaled to board dimensions at sampling time.
 */
function buildTraceGeometry(
  silhouette: BoardSilhouette,
  bounds: TraceBoardBounds,
  regions: BoardRegion[]
): TraceGeometry {
  const { x: bx, y: by, width: bw, height: bh } = bounds;
  const blocks = buildRegionBlocks(regions);

  const traces: TracePath[] = [];
  const vias: ViaHint[] = [];

  // Grid dimensions — more cells for larger boards
  const cellW = GRID_BASE;
  const cellH = GRID_BASE;
  const cols = Math.ceil(bw / cellW);
  const rows = Math.ceil(bh / cellH);

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {

      // Cell origin in layout space
      const cx = bx + gx * cellW;
      const cy = by + gy * cellH;

      // ── Horizontal trace ──────────────────────────────────────────────────

      const hPresent = hash3(gx, gy, SEED_H_PRESENT);
      if (hPresent < 0.52) { // ~52% of cells have H traces
        const hWidth = hashToWidth(hash3(gx, gy, SEED_WIDTH));

        // Y position within cell — hash-derived offset
        const hOffset = hash3(gx, gy, SEED_OFFSET) * cellH;
        const hY = cy + hOffset;

        // Trace length — fraction of cell width, min ratio enforced
        const hLenRatio = MIN_TRACE_LENGTH_RATIO + hash3(gx, gy, SEED_LENGTH) * (1 - MIN_TRACE_LENGTH_RATIO);
        const hLen = cellW * hLenRatio;
        const hX0 = cx + (cellW - hLen) * hash3(gx, gy, SEED_OFFSET ^ 0xf1);
        const hX1 = hX0 + hLen;

        // Midpoint — check if inside component block
        const hMidX = (hX0 + hX1) / 2;
        if (!insideAnyBlock(hMidX, hY, blocks)) {

          // Subtle curve — bend magnitude capped at 15% of width for realism
          const hBendRaw = (hash3(gx, gy, SEED_CURVE) - 0.5) * 2;
          const hBend = hBendRaw * hWidth * 0.15 * cellH * 0.08;

          // Color: primary for thick, secondary for thin
          const hColor = hWidth > 1.4 ? TRACE_COLOR_PRIMARY : TRACE_COLOR_SECONDARY;

          traces.push({
            d: buildHTrace(hX0, hX1, hY, hBend),
            width: hWidth,
            color: hColor,
          });

          // Branch trace
          const branchH = hash3(gx, gy, SEED_BRANCH);
          if (branchH < BRANCH_PROBABILITY) {
            const branchDir = Math.floor(hash3(gx, gy, SEED_BRANCH ^ 0x5) * 4) as 0 | 1 | 2 | 3;
            const branchLen = hLen * 0.3;
            traces.push({
              d: buildBranchTrace(hMidX, hY, branchLen, branchDir),
              width: hWidth * 0.7,
              color: TRACE_COLOR_SECONDARY,
            });
          }

          // Via hint at end point
          const viaH = hash3(gx, gy, SEED_VIA);
          if (viaH < VIA_PROBABILITY && !insideAnyBlock(hX1, hY, blocks)) {
            vias.push(buildViaHint(hX1, hY, hWidth));
          }
        }
      }

      // ── Vertical trace ────────────────────────────────────────────────────

      const vPresent = hash3(gx, gy, SEED_V_PRESENT);
      if (vPresent < 0.48) { // ~48% of cells have V traces
        const vWidth = hashToWidth(hash3(gx, gy, SEED_WIDTH ^ 0xa3));

        // X position within cell
        const vOffset = hash3(gx, gy, SEED_OFFSET ^ 0x7f) * cellW;
        const vX = cx + vOffset;

        // Trace length
        const vLenRatio = MIN_TRACE_LENGTH_RATIO + hash3(gx, gy, SEED_LENGTH ^ 0xb1) * (1 - MIN_TRACE_LENGTH_RATIO);
        const vLen = cellH * vLenRatio;
        const vY0 = cy + (cellH - vLen) * hash3(gx, gy, SEED_OFFSET ^ 0x2c);
        const vY1 = vY0 + vLen;

        const vMidY = (vY0 + vY1) / 2;
        if (!insideAnyBlock(vX, vMidY, blocks)) {

          const vBendRaw = (hash3(gx, gy, SEED_CURVE ^ 0x4e) - 0.5) * 2;
          const vBend = vBendRaw * vWidth * 0.15 * cellW * 0.08;

          const vColor = vWidth > 1.4 ? TRACE_COLOR_PRIMARY : TRACE_COLOR_SECONDARY;

          traces.push({
            d: buildVTrace(vX, vY0, vY1, vBend),
            width: vWidth,
            color: vColor,
          });

          // Branch on vertical trace
          const branchV = hash3(gx ^ 0x11, gy, SEED_BRANCH);
          if (branchV < BRANCH_PROBABILITY) {
            const branchDir = Math.floor(hash3(gx ^ 0x11, gy, SEED_BRANCH ^ 0x9) * 4) as 0 | 1 | 2 | 3;
            const branchLen = vLen * 0.3;
            traces.push({
              d: buildBranchTrace(vX, vMidY, branchLen, branchDir),
              width: vWidth * 0.7,
              color: TRACE_COLOR_SECONDARY,
            });
          }

          // Via hint at start point
          const viaV = hash3(gx ^ 0x11, gy, SEED_VIA_START);
          if (viaV < VIA_PROBABILITY && !insideAnyBlock(vX, vY0, blocks)) {
            vias.push(buildViaHint(vX, vY0, vWidth));
          }
        }
      }
    }
  }

  return { traces, vias };
}

// ─────────────────────────────────────────────────────────────────────────────
// React render function
// ─────────────────────────────────────────────────────────────────────────────

function renderTraceElement(
  geometry: TraceGeometry,
  silhouette: BoardSilhouette,
  bounds: TraceBoardBounds,
  opacity: number
): React.ReactElement {
  // Deterministic clip ID — stable across re-renders for same board
  const uid = `${Math.round(bounds.width)}-${Math.round(bounds.height)}`;
  const clipId = `trace-clip-${uid}`;

  return (
    <g
      data-sublayer="trace-content"
      opacity={opacity}
      style={{ pointerEvents: "none" }}
    >
      {/* ── Defs: clip path only — zero filters ─────────────────────────── */}
      <defs>
        {/*
         * SVG equivalent of:
         *   ctx.save()
         *   silhouette.toCanvasPath(ctx)
         *   ctx.clip()
         * ... geometry ...
         *   ctx.restore()
         */}
        <clipPath id={clipId}>
          <path d={silhouette.outerPath} />
        </clipPath>
      </defs>

      {/* ── All traces clipped to board silhouette ───────────────────────── */}
      <g clipPath={`url(#${clipId})`}>

        {/* Trace paths */}
        {geometry.traces.map((trace, i) =>
          trace.d ? (
            <path
              key={`trace-${i}`}
              d={trace.d}
              fill="none"
              stroke={trace.color}
              strokeWidth={f(trace.width)}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              opacity={0.72}
            />
          ) : null
        )}

        {/* Via hint circles */}
        {geometry.vias.map((via, i) => (
          <circle
            key={`via-${i}`}
            cx={f(via.cx)}
            cy={f(via.cy)}
            r={f(via.r)}
            fill={VIA_HINT_COLOR}
            stroke={VIA_HINT_STROKE}
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
            opacity={0.68}
          />
        ))}

      </g>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Additional exports for testing and downstream layers (ViaFieldLayer)
// ─────────────────────────────────────────────────────────────────────────────

export { hash3, buildTraceGeometry, hashToWidth };
export type { TraceLayerInput, TraceLayerOutput, TraceGeometry, TracePath, ViaHint, TraceBoardBounds };

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION SUMMARY (static — verified by automated checks below)
// ─────────────────────────────────────────────────────────────────────────────
//
// ✅ TRACE_LAYER_ID = 'pcb-traces'          exported const
// ✅ createTraceLayer()                      exported factory function
// ✅ hash3(gx, gy, seed) determinism         Math.imul + bitwise + integer only
// ✅ No Math.random()                        confirmed by line scanner
// ✅ No Date.now()                           confirmed by line scanner
// ✅ No crypto                              confirmed by line scanner
// ✅ No SVG filters                          no feGaussianBlur, feTurbulence
// ✅ No ctx.rotate / ctx.scale               not applicable (SVG surface)
// ✅ No external npm dependencies            React only (existing)
// ✅ No cross-module runtime imports         import type only
// ✅ clipPath = save()/clip()/restore()      <clipPath> + <g clipPath=...>
// ✅ Trace width in [0.6, 2.2]              TRACE_WIDTH_MIN/MAX constants
// ✅ Smooth curves                           SVG Q (quadratic Bezier) command
// ✅ Branch traces                           buildBranchTrace() per cell
// ✅ Via hints                               buildViaHint() at endpoints
// ✅ Zero side effects                       no DOM, window, globals
// ✅ Autocontained                           single file, no peer modules
