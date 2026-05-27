/**
 * BoardSilhouetteGenerator.ts
 *
 * Deterministic PCB board silhouette generator.
 *
 * CONSTRAINTS (from CURRENT_TASK.md):
 *   - No Math.random() — all shape variation derives from input data
 *   - No imports from parsers/, ai/, CoordinateEngine, NetGraphEngine, OCRPipeline
 *   - No DOM manipulation
 *   - No React or rendering logic
 *   - Pure data-in / SVG-path-out contract
 *
 * LAYER POSITION: Bottom-most visual layer.
 *   Does not affect hit-testing, selection, or component interaction.
 *
 * FUTURE COMPATIBILITY:
 *   Track A layers that build on this module (textures, copper, vias)
 *   should consume the `BoardSilhouette` output — not call this generator directly.
 *   This keeps the generation logic replaceable without touching the renderer.
 */

// ---------------------------------------------------------------------------
// Public types — re-exported for PCBRenderer and future Track A layers
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export interface BoardRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * 'connector' regions trigger edge notches.
   * All other types contribute to bounding geometry only.
   */
  type: "component" | "shield" | "connector" | "empty";
}

export interface BoardLayout {
  /** Board width in layout units (pixels, mils, mm — caller's coordinate space) */
  width: number;
  /** Board height in layout units */
  height: number;
  /** Component and zone regions on the board */
  regions: BoardRegion[];
  /** Optional explicit mounting hole centers */
  mountingHoles?: Point[];
}

export interface BoardSilhouette {
  /** Closed SVG path string representing the board outer contour */
  outerPath: string;
  /**
   * SVG path strings for mounting hole cutouts.
   * Use fill-rule="evenodd" on the parent group to subtract holes from outline.
   */
  cutouts: string[];
  /** Axis-aligned bounding box of the silhouette in layout units */
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// ---------------------------------------------------------------------------
// Internal geometry constants — ratios, not magic pixel values
// ---------------------------------------------------------------------------

/** Chamfer size relative to the shorter board dimension */
const CHAMFER_RATIO = 0.018;

/** Mounting hole radius relative to the shorter board dimension */
const MOUNTING_HOLE_RADIUS_RATIO = 0.012;

/**
 * Corner inset for default mounting holes (when mountingHoles not provided).
 * Expressed as a fraction of the shorter board dimension.
 */
const MOUNTING_HOLE_CORNER_INSET_RATIO = 0.035;

/**
 * Connector notch depth as a fraction of a connector region's dimension
 * perpendicular to the nearest board edge.
 */
const NOTCH_DEPTH_RATIO = 0.55;

/**
 * Corner smoothing for notch transitions — expressed in layout units as a
 * fraction of notch width. Keeps the SVG path readable and avoids hard corners
 * on notch edges.
 */
const NOTCH_CORNER_RATIO = 0.15;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const BoardSilhouetteGenerator = {
  /**
   * Generate a deterministic PCB board silhouette from a normalized board layout.
   *
   * @param layout  Board dimensions + region array + optional mounting holes
   * @returns       BoardSilhouette with outerPath, cutouts[], and boundingBox
   *
   * Determinism guarantee:
   *   Given identical `layout` objects, this function always returns
   *   byte-identical SVG path strings.
   */
  generate(layout: BoardLayout): BoardSilhouette {
    validateLayout(layout);

    const { width, height } = layout;
    const shorter = Math.min(width, height);

    const chamferSize = shorter * CHAMFER_RATIO;
    const holeRadius = shorter * MOUNTING_HOLE_RADIUS_RATIO;
    const cornerInset = shorter * MOUNTING_HOLE_CORNER_INSET_RATIO;

    // 1. Build chamfered base rectangle
    const basePoints = buildChamferedRect(0, 0, width, height, chamferSize);

    // 2. Apply connector notches (deterministic from connector regions)
    const connectorRegions = layout.regions.filter((r) => r.type === "connector");
    const notchedPoints = applyConnectorNotches(
      basePoints,
      connectorRegions,
      width,
      height
    );

    // 3. Build smooth outer path
    const outerPath = pointsToClosedPath(notchedPoints);

    // 4. Build mounting hole cutouts
    const holePositions = resolveMountingHoles(
      layout.mountingHoles,
      width,
      height,
      cornerInset
    );
    const cutouts = holePositions.map((p) =>
      buildCirclePath(p.x, p.y, holeRadius)
    );

    return {
      outerPath,
      cutouts,
      boundingBox: { x: 0, y: 0, width, height },
    };
  },
};

// ---------------------------------------------------------------------------
// Internal: chamfered rectangle
// ---------------------------------------------------------------------------

/**
 * Produces the 8 corner points of a rectangle with chamfered (45°) corners.
 * Points are ordered clockwise starting from top-left, after the first chamfer.
 *
 * For a board at (0,0) with size (w×h) and chamfer size c:
 *
 *   (c,0) ─────── (w-c,0)
 *  /                      \
 * (0,c)               (w,c)
 * |                        |
 * (0,h-c)           (w,h-c)
 *  \                      /
 *   (c,h) ─────── (w-c,h)
 *
 * Returns flat Point[] in clockwise order — ready for SVG path construction.
 */
function buildChamferedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  c: number
): Point[] {
  // Clamp chamfer so it never exceeds half the shorter side
  const safeC = Math.min(c, Math.min(w, h) * 0.45);

  return [
    { x: x + safeC, y: y },           // top-left: after chamfer
    { x: x + w - safeC, y: y },       // top-right: before chamfer
    { x: x + w, y: y + safeC },       // top-right: after chamfer
    { x: x + w, y: y + h - safeC },   // bottom-right: before chamfer
    { x: x + w - safeC, y: y + h },   // bottom-right: after chamfer
    { x: x + safeC, y: y + h },       // bottom-left: before chamfer
    { x: x, y: y + h - safeC },       // bottom-left: after chamfer
    { x: x, y: y + safeC },           // top-left: before chamfer
  ];
}

// ---------------------------------------------------------------------------
// Internal: connector notches
// ---------------------------------------------------------------------------

type Edge = "top" | "bottom" | "left" | "right";

/**
 * Determine which board edge a connector region is closest to.
 * Uses the center of the connector region and the board dimensions.
 * Fully deterministic — no randomness.
 */
function nearestEdge(region: BoardRegion, boardW: number, boardH: number): Edge {
  const cx = region.x + region.width / 2;
  const cy = region.y + region.height / 2;

  const distTop = cy;
  const distBottom = boardH - cy;
  const distLeft = cx;
  const distRight = boardW - cx;

  const min = Math.min(distTop, distBottom, distLeft, distRight);

  if (min === distTop) return "top";
  if (min === distBottom) return "bottom";
  if (min === distLeft) return "left";
  return "right";
}

/**
 * Apply connector notches to an existing point array.
 *
 * For each connector region, this function:
 *   1. Determines which edge the connector is nearest to.
 *   2. Projects the connector's span onto that edge.
 *   3. Inserts a rectangular inset (notch) into the point array at the
 *      correct position along the edge.
 *
 * Points are inserted in clockwise order to maintain a valid closed path.
 *
 * Notch geometry is derived entirely from the connector's region dimensions
 * and position — no randomness or hardcoded offsets.
 */
function applyConnectorNotches(
  basePoints: Point[],
  connectors: BoardRegion[],
  boardW: number,
  boardH: number
): Point[] {
  if (connectors.length === 0) return basePoints;

  // Sort connectors deterministically by region id to guarantee stable output
  // regardless of input array order.
  const sortedConnectors = [...connectors].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );

  // For each connector, we append a notch polygon to the base outline.
  // Each notch is represented as a separate closed subpath (SVG fill-rule
  // handles the union). This avoids complex point-insertion surgery into
  // the base chamfered polygon, which is fragile with multiple notches.
  //
  // The outerPath function will handle this by returning the combined path.

  const notchPaths: string[] = sortedConnectors.map((region) => {
    const edge = nearestEdge(region, boardW, boardH);
    return buildNotchPath(region, edge, boardW, boardH);
  });

  // Attach notch paths as additional subpaths. The SVG renderer uses
  // fill-rule="nonzero" for the main outline, and the notches are additive
  // cut-ins rendered separately (see PCBRenderer integration).
  // We encode notches as a metadata annotation on the points array for the
  // path builder to handle — instead, return the base points and expose
  // notches via the public API's dedicated field.
  //
  // Since BoardSilhouette exposes only outerPath + cutouts, and connector
  // notches are part of the outer contour (not holes), we encode them by
  // returning the base path with notch subpaths appended using SVG's
  // "M...Z M...Z" multi-subpath syntax. The renderer uses fill-rule="evenodd"
  // which correctly subtracts the notch areas from the board fill.

  // Build base outer path string
  const basePath = pointsToClosedPath(basePoints);

  // Append notch subpaths — each closes independently
  const combined = [basePath, ...notchPaths].join(" ");

  // Return as a single virtual "point set" by encoding it in a special wrapper
  // that pointsToClosedPath won't re-process. We flag this by returning a
  // sentinel object that the generate() function recognizes.
  //
  // Cleaner approach: since we already build the combined path string here,
  // we return it via a tagged structure. The generate() function checks for
  // this and uses it directly.

  // IMPLEMENTATION NOTE: To keep the data flow clean, we mutate the approach:
  // applyConnectorNotches returns Point[] when no notches are needed, and
  // returns a NOTCHED_PATH_RESULT sentinel when notches are applied.
  // generate() handles both return shapes.

  (basePoints as NotchedPathResult).__notchedPath = combined;
  return basePoints;
}

/** Sentinel to carry pre-built path string through the Point[] return type */
interface NotchedPathResult extends Array<Point> {
  __notchedPath?: string;
}

/**
 * Build a closed SVG notch path for a single connector region on a given edge.
 *
 * The notch is a rectangle that protrudes inward from the board edge,
 * centered on the connector region's projection onto that edge.
 *
 * Notch width  = connector span along the edge (+ small clearance margin)
 * Notch depth  = connector dimension perpendicular to edge × NOTCH_DEPTH_RATIO
 *
 * All values are deterministic from input geometry.
 */
function buildNotchPath(
  region: BoardRegion,
  edge: Edge,
  boardW: number,
  boardH: number
): string {
  const MARGIN = 2; // small fixed clearance margin in layout units

  if (edge === "top" || edge === "bottom") {
    const notchLeft = Math.max(0, region.x - MARGIN);
    const notchRight = Math.min(boardW, region.x + region.width + MARGIN);
    const notchW = notchRight - notchLeft;
    const notchDepth = region.height * NOTCH_DEPTH_RATIO;
    const cornerR = notchW * NOTCH_CORNER_RATIO;

    if (edge === "top") {
      // Notch cuts into the board from the top edge
      const y0 = 0;
      const y1 = notchDepth;
      return buildRoundedRectPath(notchLeft, y0, notchW, y1, cornerR);
    } else {
      // Notch cuts into the board from the bottom edge
      const y0 = boardH - notchDepth;
      const y1 = boardH;
      return buildRoundedRectPath(notchLeft, y0, notchW, notchDepth, cornerR);
    }
  } else {
    const notchTop = Math.max(0, region.y - MARGIN);
    const notchBottom = Math.min(boardH, region.y + region.height + MARGIN);
    const notchH = notchBottom - notchTop;
    const notchDepth = region.width * NOTCH_DEPTH_RATIO;
    const cornerR = notchH * NOTCH_CORNER_RATIO;

    if (edge === "left") {
      return buildRoundedRectPath(0, notchTop, notchDepth, notchH, cornerR);
    } else {
      return buildRoundedRectPath(boardW - notchDepth, notchTop, notchDepth, notchH, cornerR);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal: mounting holes
// ---------------------------------------------------------------------------

/**
 * Resolve mounting hole positions.
 *
 * If the layout provides explicit hole positions, use them directly.
 * Otherwise, place holes at the four board corners, each inset by `cornerInset`.
 *
 * Both paths are fully deterministic.
 */
function resolveMountingHoles(
  provided: Point[] | undefined,
  boardW: number,
  boardH: number,
  cornerInset: number
): Point[] {
  if (provided && provided.length > 0) {
    return provided;
  }

  // Default: four-corner holes
  return [
    { x: cornerInset, y: cornerInset },
    { x: boardW - cornerInset, y: cornerInset },
    { x: boardW - cornerInset, y: boardH - cornerInset },
    { x: cornerInset, y: boardH - cornerInset },
  ];
}

// ---------------------------------------------------------------------------
// Internal: SVG path builders
// ---------------------------------------------------------------------------

/**
 * Convert an ordered Point[] into a closed SVG path string.
 * Uses straight line segments — no Bezier curves in the base contour.
 *
 * If the array carries a __notchedPath sentinel (from applyConnectorNotches),
 * return that pre-built path directly.
 *
 * Path format: "M x0,y0 L x1,y1 ... Z"
 */
function pointsToClosedPath(points: NotchedPathResult): string {
  if (points.__notchedPath) {
    return points.__notchedPath;
  }

  if (points.length === 0) return "";

  const parts: string[] = [];
  parts.push(`M ${fmt(points[0].x)},${fmt(points[0].y)}`);
  for (let i = 1; i < points.length; i++) {
    parts.push(`L ${fmt(points[i].x)},${fmt(points[i].y)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/**
 * Build a closed SVG path for a circle, approximated with four cubic
 * Bezier curves. This avoids the non-standard SVG arc syntax in some
 * renderers and produces smooth circles at any scale.
 *
 * The Bezier control point offset k ≈ 0.5523 is a well-known constant
 * for circular approximation — deterministic and universally valid.
 */
function buildCirclePath(cx: number, cy: number, r: number): string {
  const k = 0.5523 * r;
  return [
    `M ${fmt(cx)},${fmt(cy - r)}`,
    `C ${fmt(cx + k)},${fmt(cy - r)} ${fmt(cx + r)},${fmt(cy - k)} ${fmt(cx + r)},${fmt(cy)}`,
    `C ${fmt(cx + r)},${fmt(cy + k)} ${fmt(cx + k)},${fmt(cy + r)} ${fmt(cx)},${fmt(cy + r)}`,
    `C ${fmt(cx - k)},${fmt(cy + r)} ${fmt(cx - r)},${fmt(cy + k)} ${fmt(cx - r)},${fmt(cy)}`,
    `C ${fmt(cx - r)},${fmt(cy - k)} ${fmt(cx - k)},${fmt(cy - r)} ${fmt(cx)},${fmt(cy - r)}`,
    "Z",
  ].join(" ");
}

/**
 * Build a closed SVG path for a rectangle with rounded corners (arc-based).
 * Used for notch shapes to avoid sharp mechanical-looking cuts.
 *
 * cornerR is clamped to prevent overlap for very narrow notches.
 */
function buildRoundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  cornerR: number
): string {
  const r = Math.min(cornerR, Math.min(w, h) * 0.45);
  return [
    `M ${fmt(x + r)},${fmt(y)}`,
    `L ${fmt(x + w - r)},${fmt(y)}`,
    `A ${fmt(r)},${fmt(r)} 0 0 1 ${fmt(x + w)},${fmt(y + r)}`,
    `L ${fmt(x + w)},${fmt(y + h - r)}`,
    `A ${fmt(r)},${fmt(r)} 0 0 1 ${fmt(x + w - r)},${fmt(y + h)}`,
    `L ${fmt(x + r)},${fmt(y + h)}`,
    `A ${fmt(r)},${fmt(r)} 0 0 1 ${fmt(x)},${fmt(y + h - r)}`,
    `L ${fmt(x)},${fmt(y + r)}`,
    `A ${fmt(r)},${fmt(r)} 0 0 1 ${fmt(x + r)},${fmt(y)}`,
    "Z",
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Internal: validation
// ---------------------------------------------------------------------------

function validateLayout(layout: BoardLayout): void {
  if (!layout) throw new Error("BoardSilhouetteGenerator: layout is required");
  if (layout.width <= 0 || layout.height <= 0) {
    throw new Error(
      `BoardSilhouetteGenerator: invalid board dimensions ${layout.width}×${layout.height}`
    );
  }
  if (!Array.isArray(layout.regions)) {
    throw new Error("BoardSilhouetteGenerator: layout.regions must be an array");
  }
}

// ---------------------------------------------------------------------------
// Internal: number formatting
// ---------------------------------------------------------------------------

/**
 * Format a number for SVG path output.
 * Rounds to 3 decimal places — sufficient precision for layout coordinates,
 * avoids floating-point noise in path strings.
 */
function fmt(n: number): string {
  return (Math.round(n * 1000) / 1000).toString();
}
