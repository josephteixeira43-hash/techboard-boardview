/**
 * CopperLayer.ts
 * src/rendering/copper/CopperLayer.ts
 *
 * Track A — Task 3: Deterministic fake copper polygon renderer.
 *
 * POSITION IN LAYER STACK (PCBRenderer):
 *   1. silhouette   ← Task 1 (frozen)
 *   2. texture      ← Task 2 (frozen)
 *   3. copper       ← THIS FILE  ◀
 *   4. vias         ← Task 4 (future)
 *   5–7. children   ← existing, untouched
 *
 * CONSTRAINTS:
 *   - No Math.random() — all geometry seeded from region.id + coordinates
 *   - No SVG turbulence, blur, or heavy filters
 *   - No external packages
 *   - No hidden transforms
 *   - No imports from parsers/, ai/, CoordinateEngine, NetGraphEngine,
 *     OCRPipeline, OverlaySystem, BoardSilhouetteGenerator internals
 *   - Consumes only: BoardSilhouette + BoardRegion[] + board bounds
 *   - Must not crash on invalid, empty, or zero-dimension regions
 *   - All geometry reproducible from same input (deterministic guarantee)
 *
 * FUTURE STACKING COMPATIBILITY:
 *   pcb-silhouette → pcb-texture → pcb-copper ← here
 *   → pcb-traces → pcb-vias → components → markers → overlays
 *
 * VISUAL RULES (from task spec):
 *   CPU regions     → dense copper fill + inner hatching
 *   RF regions      → isolated copper islands (sparse, floating)
 *   Charging regions → wide copper fills, thick clearance rings
 *   SIM/AUDIO       → light copper usage, thin traces implied
 *   shield          → solid copper flood with clearance border
 *   connector       → no copper (mechanical, not electrical)
 *   empty           → sparse ground-plane hatching
 */

import React from "react";
import type { BoardSilhouette, BoardRegion } from "../BoardSilhouetteGenerator";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CopperLayerProps {
  /** Board silhouette from BoardSilhouetteGenerator — clip boundary */
  silhouette: BoardSilhouette;

  /**
   * Flat list of board regions from BoardLayout.regions.
   * CopperLayer reads type and geometry only — no electrical data required.
   */
  regions: BoardRegion[];

  /**
   * Board bounds — used for ground-fill extent and gradient anchors.
   * Pass silhouette.boundingBox directly.
   */
  boardBounds: { x: number; y: number; width: number; height: number };

  /** Master opacity for the entire copper layer. Default: 1 */
  opacity?: number;

  /** Show/hide toggle. When false, renders nothing (no residual defs). */
  visible?: boolean;
}

// ---------------------------------------------------------------------------
// Copper visual constants
// ---------------------------------------------------------------------------

/** Primary copper color — warm satin gold */
const COPPER_BASE = "#b87333";

/** Highlight tint for raised copper zones */
const COPPER_HIGHLIGHT = "#d4955a";

/** Shadow tint for recessed copper areas */
const COPPER_SHADOW = "#8c5a22";

/** Ground plane flood fill — very sparse, low contrast */
const COPPER_GROUND = "#9e6a2e";

/** Clearance ring stroke around component pads */
const CLEARANCE_STROKE = "#1a2e1a"; // matches silhouette fill — board color

/** Opacity for isolated RF islands */
const RF_ISLAND_OPACITY = 0.55;

/** Opacity for ground hatch lines */
const GROUND_HATCH_OPACITY = 0.18;

/** Copper fill opacity for dense zones (CPU, charging) */
const DENSE_FILL_OPACITY = 0.82;

/** Copper fill opacity for light zones (SIM, audio) */
const LIGHT_FILL_OPACITY = 0.38;

// ---------------------------------------------------------------------------
// Density profiles — driven by region.id keyword matching
//
// region.type from BoardSilhouetteGenerator is coarse (component/shield/
// connector/empty). The copper density profile refines this using region.id
// substring matching, which is the only available signal without parser data.
//
// This is purely a visual heuristic — no electrical correctness claimed.
// ---------------------------------------------------------------------------

type CopperDensity = "dense" | "medium" | "light" | "island" | "flood" | "none";

/**
 * Classify a region into a copper density profile.
 * Classification is deterministic: same region.id always maps to same profile.
 *
 * Priority order (first match wins):
 *   1. type === 'connector' → none (connectors have no copper fill)
 *   2. type === 'shield'    → flood (full copper pour)
 *   3. id keyword match     → density override
 *   4. type === 'empty'     → ground hatch
 *   5. default component    → medium
 */
function classifyDensity(region: BoardRegion): CopperDensity {
  if (region.type === "connector") return "none";
  if (region.type === "shield") return "flood";

  const id = region.id.toLowerCase();

  // CPU / processor — highest copper density (power + thermal planes)
  if (/cpu|ap|soc|processor|snapdragon|exynos|helio|bionic/.test(id)) return "dense";

  // Charging / power — wide fills, thick pours
  if (/charg|pmic|batt|power|vbus|vcc|dcdc|buck|boost/.test(id)) return "dense";

  // RF / wireless — isolated floating islands (avoid solid pour)
  if (/rf|wifi|wlan|bluetooth|bt|antenna|nfc|mmwave|5g|lte/.test(id)) return "island";

  // SIM / audio / light signal — thin usage
  if (/sim|audio|mic|speaker|codec|amp|uart|i2c|spi/.test(id)) return "light";

  // Memory — medium density
  if (/ram|dram|nand|emmc|ufs|flash|sdram/.test(id)) return "medium";

  // Camera / display — medium
  if (/cam|isp|mipi|display|dsi|lcd|oled|touch/.test(id)) return "medium";

  // Empty regions → sparse ground hatch
  if (region.type === "empty") return "light";

  return "medium";
}

// ---------------------------------------------------------------------------
// Deterministic hash — replaces Math.random()
//
// Algorithm: djb2 variant, seeded by a string derived from region identity
// and coordinate position. Produces consistent uint32 values.
//
// Hash is used only for:
//   1. Sub-pixel vertex jitter within copper polygons (visual naturalness)
//   2. Selecting which hatch lines to include in sparse fills
//   3. Island placement offsets within RF regions
//
// Hash is NEVER used for topology decisions — those are driven by region.type
// and region.id keyword matching, which are fully deterministic.
// ---------------------------------------------------------------------------

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    // djb2: h = h * 33 ^ char
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h & 0xffffffff; // keep 32-bit
  }
  return (h >>> 0); // unsigned
}

/**
 * Returns a deterministic float in [0, 1) seeded by region identity
 * and a discriminator string (prevents same value for all calls on same region).
 *
 * Examples:
 *   drand(region, "jitter-x-0") → stable float for vertex 0 x-jitter
 *   drand(region, "jitter-y-0") → stable float for vertex 0 y-jitter
 *   drand(region, "island-count") → stable float for RF island count
 */
function drand(region: BoardRegion, discriminator: string): number {
  const seed = `${region.id}:${region.x}:${region.y}:${discriminator}`;
  return (hashStr(seed) >>> 0) / 0x100000000;
}

/**
 * Returns a deterministic integer in [min, max] (inclusive) for a region.
 */
function drandInt(region: BoardRegion, discriminator: string, min: number, max: number): number {
  return min + Math.floor(drand(region, discriminator) * (max - min + 1));
}

// ---------------------------------------------------------------------------
// Geometry helpers — pure coordinate arithmetic
// ---------------------------------------------------------------------------

/** Format number to 2 decimal places for SVG path output */
function f(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/**
 * Build a closed SVG rectangle path with optional vertex jitter.
 * Jitter is deterministic: derived from region + vertex index.
 *
 * jitterAmt = max displacement in layout units (0 = perfect rectangle).
 */
function jitteredRect(
  region: BoardRegion,
  x: number,
  y: number,
  w: number,
  h: number,
  jitterAmt: number,
  jitterSeed: string
): string {
  if (w <= 0 || h <= 0) return "";

  // 4 corners, clockwise: TL, TR, BR, BL
  const corners = [
    { bx: x,     by: y     },
    { bx: x + w, by: y     },
    { bx: x + w, by: y + h },
    { bx: x,     by: y + h },
  ];

  const pts = corners.map((c, i) => {
    const jx = jitterAmt > 0 ? (drand(region, `${jitterSeed}-jx-${i}`) - 0.5) * 2 * jitterAmt : 0;
    const jy = jitterAmt > 0 ? (drand(region, `${jitterSeed}-jy-${i}`) - 0.5) * 2 * jitterAmt : 0;
    return { x: c.bx + jx, y: c.by + jy };
  });

  return [
    `M ${f(pts[0].x)},${f(pts[0].y)}`,
    `L ${f(pts[1].x)},${f(pts[1].y)}`,
    `L ${f(pts[2].x)},${f(pts[2].y)}`,
    `L ${f(pts[3].x)},${f(pts[3].y)}`,
    "Z",
  ].join(" ");
}

/**
 * Build a clearance ring (unfilled stroked rectangle inset from region bounds).
 * Inset ensures the ring sits inside the copper fill, not outside it.
 */
function clearanceRing(
  x: number, y: number, w: number, h: number,
  inset: number
): string {
  const ix = x + inset;
  const iy = y + inset;
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  if (iw <= 0 || ih <= 0) return "";
  return `M ${f(ix)},${f(iy)} L ${f(ix+iw)},${f(iy)} L ${f(ix+iw)},${f(iy+ih)} L ${f(ix)},${f(iy+ih)} Z`;
}

/**
 * Build a horizontal hatch fill inside a rectangle.
 * Line count and spacing are deterministic from region dimensions.
 *
 * Returns an array of SVG line element descriptors (rendered as <line> tags).
 */
interface HatchLine {
  x1: number; y1: number;
  x2: number; y2: number;
}

function buildHatchLines(
  region: BoardRegion,
  x: number, y: number, w: number, h: number,
  density: "dense" | "medium" | "light"
): HatchLine[] {
  if (w <= 0 || h <= 0) return [];

  // Line spacing in layout units — smaller = denser
  const spacing = density === "dense" ? 3.5 : density === "medium" ? 6 : 11;
  const lines: HatchLine[] = [];
  let yPos = y + spacing;

  while (yPos < y + h) {
    // Skip some lines deterministically for medium/light density
    const skipHash = drand(region, `hatch-skip-${f(yPos)}`);
    const skip = (density === "light" && skipHash < 0.45) ||
                 (density === "medium" && skipHash < 0.2);

    if (!skip) {
      // Add slight x-jitter to line endpoints for organic look
      const jx1 = (drand(region, `hatch-jx1-${f(yPos)}`) - 0.5) * 1.5;
      const jx2 = (drand(region, `hatch-jx2-${f(yPos)}`) - 0.5) * 1.5;
      lines.push({
        x1: x + jx1,
        y1: yPos,
        x2: x + w + jx2,
        y2: yPos,
      });
    }
    yPos += spacing;
  }
  return lines;
}

/**
 * Build RF copper island polygons within a region.
 * Islands are small floating rectangles placed deterministically.
 *
 * Island count: 2–5, seeded by region id.
 * Island positions: grid-snapped with deterministic offset, never overlapping
 * the region border (inset by margin).
 */
interface IslandShape {
  path: string;
  opacity: number;
}

function buildRFIslands(region: BoardRegion): IslandShape[] {
  const { x, y, width, height } = region;
  if (width < 8 || height < 8) return [];

  const margin = Math.min(width, height) * 0.08;
  const innerW = width - margin * 2;
  const innerH = height - margin * 2;

  const count = drandInt(region, "island-count", 2, 5);
  const islands: IslandShape[] = [];

  // Divide inner area into a grid; place one island per cell
  const cols = Math.ceil(Math.sqrt(count * (innerW / innerH)));
  const rows = Math.ceil(count / cols);
  const cellW = innerW / cols;
  const cellH = innerH / rows;

  let placed = 0;
  for (let row = 0; row < rows && placed < count; row++) {
    for (let col = 0; col < cols && placed < count; col++) {
      const seed = `island-${row}-${col}`;

      // Island size: 30–65% of cell, deterministic
      const sizeRatio = 0.30 + drand(region, `${seed}-size`) * 0.35;
      const iw = cellW * sizeRatio;
      const ih = cellH * sizeRatio;

      // Position within cell: deterministic offset
      const cx = x + margin + col * cellW + (cellW - iw) * drand(region, `${seed}-cx`);
      const cy = y + margin + row * cellH + (cellH - ih) * drand(region, `${seed}-cy`);

      const path = jitteredRect(region, cx, cy, iw, ih, iw * 0.04, seed);
      if (path) {
        islands.push({ path, opacity: RF_ISLAND_OPACITY });
      }
      placed++;
    }
  }
  return islands;
}

// ---------------------------------------------------------------------------
// Per-region copper geometry builders
// ---------------------------------------------------------------------------

interface RegionCopper {
  /** Main fill paths (copper color) */
  fills: { path: string; opacity: number; highlight?: boolean }[];
  /** Hatch lines (rendered as <line> elements) */
  hatches: HatchLine[];
  /** Clearance ring path (stroked, board-color) */
  clearance?: string;
}

function buildRegionCopper(region: BoardRegion): RegionCopper {
  const { x, y, width: w, height: h } = region;

  // Guard: skip zero-dimension or negative regions without crashing
  if (!region.id || w <= 0 || h <= 0) {
    return { fills: [], hatches: [] };
  }

  const density = classifyDensity(region);

  switch (density) {

    case "none": {
      // Connectors — no copper rendered
      return { fills: [], hatches: [] };
    }

    case "flood": {
      // Shield regions — solid copper flood with thin clearance border
      const inset = Math.min(w, h) * 0.04;
      const fillPath = jitteredRect(region, x, y, w, h, Math.min(w, h) * 0.008, "flood");
      const ring = clearanceRing(x, y, w, h, inset);
      return {
        fills: [{ path: fillPath, opacity: DENSE_FILL_OPACITY }],
        hatches: [],
        clearance: ring,
      };
    }

    case "dense": {
      // CPU / charging — copper fill + inner hatch + clearance ring
      const jAmt = Math.min(w, h) * 0.015;
      const fillPath = jitteredRect(region, x, y, w, h, jAmt, "dense-fill");

      // Inner inset fill for highlight layering
      const inset = Math.min(w, h) * 0.06;
      const innerPath = jitteredRect(
        region, x + inset, y + inset, w - inset * 2, h - inset * 2,
        jAmt * 0.5, "dense-inner"
      );

      const hatches = buildHatchLines(region, x + inset, y + inset, w - inset * 2, h - inset * 2, "dense");
      const ring = clearanceRing(x, y, w, h, inset * 0.5);

      return {
        fills: [
          { path: fillPath, opacity: DENSE_FILL_OPACITY },
          { path: innerPath, opacity: 0.25, highlight: true },
        ],
        hatches,
        clearance: ring,
      };
    }

    case "medium": {
      // RAM, camera, display — medium fill + light hatch
      const jAmt = Math.min(w, h) * 0.02;
      const fillPath = jitteredRect(region, x, y, w, h, jAmt, "med-fill");
      const inset = Math.min(w, h) * 0.08;
      const hatches = buildHatchLines(region, x + inset, y + inset, w - inset * 2, h - inset * 2, "medium");
      const ring = clearanceRing(x, y, w, h, inset * 0.6);

      return {
        fills: [{ path: fillPath, opacity: 0.55 }],
        hatches,
        clearance: ring,
      };
    }

    case "light": {
      // SIM, audio — thin copper suggestion, minimal fill
      const jAmt = Math.min(w, h) * 0.025;
      const inset = Math.min(w, h) * 0.12;
      const fillPath = jitteredRect(region, x + inset, y + inset, w - inset * 2, h - inset * 2, jAmt, "light-fill");
      const hatches = buildHatchLines(region, x + inset, y + inset, w - inset * 2, h - inset * 2, "light");

      return {
        fills: [{ path: fillPath, opacity: LIGHT_FILL_OPACITY }],
        hatches,
      };
    }

    case "island": {
      // RF / wireless — isolated floating islands, no solid fill
      const islands = buildRFIslands(region);
      return {
        fills: islands.map((isl) => ({ path: isl.path, opacity: isl.opacity })),
        hatches: [],
      };
    }

    default: {
      // Exhaustive guard — should never reach here
      return { fills: [], hatches: [] };
    }
  }
}

// ---------------------------------------------------------------------------
// Board-level sparse ground hatch
//
// Renders a very low-opacity diagonal-free hatch across the entire board,
// simulating the ground plane copper that exists between component zones on
// real PCBs. This is board-level, not per-region.
//
// Uses the board bounding box; all coordinates deterministic.
// ---------------------------------------------------------------------------

interface GroundHatch {
  lines: HatchLine[];
}

function buildGroundHatch(
  bounds: { x: number; y: number; width: number; height: number },
  regions: BoardRegion[]
): GroundHatch {
  const { x, y, width, height } = bounds;
  if (width <= 0 || height <= 0) return { lines: [] };

  // Ground hatch spacing — coarser than per-region hatching
  const spacing = Math.min(width, height) * 0.022;
  const lines: HatchLine[] = [];

  // Build a simple set-based region map for fast containment check
  // (avoid drawing ground hatch inside defined component regions)
  // We use a coarse grid: skip hatch line segments that fall within any region.
  // This is a visual approximation — not geometric clipping.
  const regionBoxes = regions.filter(r => r.type !== "empty" && r.width > 0 && r.height > 0);

  let yPos = y + spacing;
  let lineIndex = 0;

  while (yPos < y + height - spacing * 0.5) {
    // Skip ~30% of lines for visual sparseness — deterministic skip pattern
    const skipParity = (lineIndex % 3 === 2); // every 3rd line skipped
    if (!skipParity) {
      // Check if this y position overlaps any non-empty region (coarse)
      const blocked = regionBoxes.some(
        (r) => yPos >= r.y - 1 && yPos <= r.y + r.height + 1
      );

      if (!blocked) {
        lines.push({ x1: x, y1: yPos, x2: x + width, y2: yPos });
      }
    }
    yPos += spacing;
    lineIndex++;
  }

  return { lines };
}

// ---------------------------------------------------------------------------
// React component
// ---------------------------------------------------------------------------

export const CopperLayer: React.FC<CopperLayerProps> = ({
  silhouette,
  regions,
  boardBounds,
  opacity = 1,
  visible = true,
}) => {
  // Nothing to render when hidden — no residual defs
  if (!visible) return null;

  // Guard: if silhouette is missing or malformed, render nothing silently
  if (!silhouette?.outerPath || !boardBounds) return null;

  // Stable deterministic ID for this board instance — no Math.random()
  const uid = `${Math.round(boardBounds.width)}-${Math.round(boardBounds.height)}`;
  const clipId = `copper-clip-${uid}`;

  // Memoize copper geometry per region array + bounds
  // (in practice this component is always rendered inside PCBRenderer's useMemo
  // scope, but we guard here for direct usage)
  const safeRegions = Array.isArray(regions) ? regions : [];

  // Build per-region copper geometry
  const regionCopper = safeRegions.map((region) => ({
    region,
    copper: buildRegionCopper(region),
  }));

  // Build board-level ground hatch
  const groundHatch = buildGroundHatch(boardBounds, safeRegions);

  return (
    <g
      data-sublayer="copper-content"
      opacity={opacity}
      style={{ pointerEvents: "none" }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Defs: clip path only — no filters, no turbulence                    */}
      {/* ------------------------------------------------------------------ */}
      <defs>
        <clipPath id={clipId}>
          <path d={silhouette.outerPath} />
        </clipPath>
      </defs>

      {/* ------------------------------------------------------------------ */}
      {/* All copper geometry clipped to board silhouette                     */}
      {/* ------------------------------------------------------------------ */}
      <g clipPath={`url(#${clipId})`}>

        {/* ---------------------------------------------------------------- */}
        {/* Board-level sparse ground hatch (bottom of copper stack)         */}
        {/* ---------------------------------------------------------------- */}
        <g data-copper="ground-hatch" opacity={GROUND_HATCH_OPACITY}>
          {groundHatch.lines.map((line, i) => (
            <line
              key={`gh-${i}`}
              x1={f(line.x1)} y1={f(line.y1)}
              x2={f(line.x2)} y2={f(line.y2)}
              stroke={COPPER_GROUND}
              strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>

        {/* ---------------------------------------------------------------- */}
        {/* Per-region copper fills, hatches, clearance rings                */}
        {/* ---------------------------------------------------------------- */}
        {regionCopper.map(({ region, copper }) => {
          if (
            copper.fills.length === 0 &&
            copper.hatches.length === 0 &&
            !copper.clearance
          ) return null;

          return (
            <g key={region.id} data-copper-region={region.id} data-copper-type={region.type}>

              {/* Copper fill polygons */}
              {copper.fills.map((fill, fi) => (
                fill.path ? (
                  <path
                    key={`fill-${fi}`}
                    d={fill.path}
                    fill={fill.highlight ? COPPER_HIGHLIGHT : COPPER_BASE}
                    opacity={fill.opacity}
                    stroke="none"
                    fillRule="nonzero"
                  />
                ) : null
              ))}

              {/* Hatch lines — rendered as individual <line> elements */}
              {copper.hatches.length > 0 && (
                <g opacity={0.35}>
                  {copper.hatches.map((line, li) => (
                    <line
                      key={`hatch-${li}`}
                      x1={f(line.x1)} y1={f(line.y1)}
                      x2={f(line.x2)} y2={f(line.y2)}
                      stroke={COPPER_SHADOW}
                      strokeWidth="0.5"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </g>
              )}

              {/* Clearance ring — stroked with board background color */}
              {copper.clearance && (
                <path
                  d={copper.clearance}
                  fill="none"
                  stroke={CLEARANCE_STROKE}
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                />
              )}

            </g>
          );
        })}

      </g>
    </g>
  );
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export type { CopperLayerProps };

/**
 * Exported for testing and future Track A layers (ViaFieldLayer can use
 * classifyDensity to decide via density per region).
 */
export { classifyDensity, drand, drandInt };
export type { CopperDensity, HatchLine, IslandShape };
