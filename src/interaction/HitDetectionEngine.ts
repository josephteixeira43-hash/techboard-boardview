/**
 * HitDetectionEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Deterministic Spatial Hit Detection Engine
 *
 * ARCHITECTURAL ROLE
 * ───────────────────
 * Single source of truth for board-space spatial queries:
 *   • component picking (click / pointer-down)
 *   • hover targeting
 *   • radius / proximity queries
 *   • bounds-intersection queries
 *   • future overlay anchoring & selection systems
 *
 * Rendering-agnostic. No canvas, no DOM, no React.
 * Operates entirely in board-space coordinates.
 *
 * SPATIAL INDEX
 * ──────────────
 * Uniform grid with configurable cellSize (default 64 board units).
 * Each component is inserted into every grid cell its expanded AABB overlaps.
 * Query inspects only the O(k) cells that overlap the query shape — never a
 * full O(n) scan of all registered components.
 *
 * Cell addressing:
 *   cellX = floor(boardX / cellSize)
 *   cellY = floor(boardY / cellSize)
 *   key   = packCellKey(cellX, cellY)
 *
 * For cellX/cellY in [-32768, 32767]: packed into one 32-bit int (no alloc).
 * Outside that range: string key "cx,cy" — transparent fallback.
 *
 * ROTATION HANDLING
 * ──────────────────
 * Components with rotation are tested using a 2-D OBB SAT check (Separating
 * Axis Theorem on the OBB's two local axes).  For rotation === 0 (or absent)
 * the fast AABB path is used.
 *
 * Grid insertion uses the OBB's circumscribed AABB (= expanded by the max of
 * half-width and half-height) to conservatively cover all occupied cells.
 * Precise geometry is applied only at query time.
 *
 * DETERMINISTIC ORDERING
 * ───────────────────────
 * Each registered component receives a monotonically increasing
 * registrationIndex.  Query results are sorted by:
 *   1. distanceToCentreSquared  (nearest centre first)
 *   2. registrationIndex        (earlier registration wins ties)
 * Both keys are deterministic given identical input sequences.
 *
 * PERFORMANCE TARGETS
 * ────────────────────
 * • 50k+ components: grid keeps per-query candidate set small.
 * • Hot-path allocations: one reused Set<number> for deduplication;
 *   result array allocated once per query.
 * • No string allocations in the common (small-coordinate) code path.
 *
 * FORBIDDEN (verified by automated suite)
 * ─────────────────────────────────────────
 * No Math.random · No Date.now · No performance.now · No DOM · No canvas ·
 * No React · No external libraries · No mutable globals ·
 * No runtime sort instability (sort key fully deterministic).
 *
 * ACCEPTANCE CHECKLIST
 * ─────────────────────
 * [x] registerComponents() — batch O(k) insertion into grid
 * [x] queryPoint()         — tolerance-expanded point pick
 * [x] queryRadius()        — circular proximity query
 * [x] queryBounds()        — AABB intersection query
 * [x] clear()              — full engine reset
 * [x] getStats()           — diagnostics without forbidden APIs
 * [x] Rotated OBB support  — SAT-based precise test
 * [x] Spatial grid         — no O(n) full scan
 * [x] Stable ordering      — dist² primary, registrationIndex secondary
 * [x] Tolerance expansion  — all query types accept tolerance parameter
 * [x] Malformed input      — silently skipped, pipeline unaffected
 * [x] Immutable results    — frozen HitResult objects
 * [x] Zero forbidden APIs
 * [x] Zero npm dependencies
 */

// ─── Public Geometry Types ────────────────────────────────────────────────────

/** Immutable 2-D point in board-space. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Immutable axis-aligned bounding box in board-space. */
export interface Rect {
  readonly x:      number;
  readonly y:      number;
  readonly width:  number;
  readonly height: number;
}

// ─── Component Interface ──────────────────────────────────────────────────────

/**
 * Minimal board component shape consumed by HitDetectionEngine.
 * Fields beyond this interface are preserved and returned in HitResult.
 */
export interface BoardComponent {
  /** Unique stable string identifier. */
  readonly id: string;
  /** Board-space left edge of the component's unrotated AABB. */
  readonly x: number;
  /** Board-space top edge of the component's unrotated AABB. */
  readonly y: number;
  /** Component width in board units. Must be > 0. */
  readonly width: number;
  /** Component height in board units. Must be > 0. */
  readonly height: number;
  /** Rotation in radians about the component centre. 0 = axis-aligned. */
  readonly rotation?: number;
  /** Optional pre-computed bounds cache (ignored — engine manages its own). */
  readonly boundsCache?: unknown;
}

// ─── Query & Result Types ─────────────────────────────────────────────────────

/** Options shared by all query methods. */
export interface QueryOptions {
  /**
   * Expand the effective hit area of each component by this many board units
   * on all sides.  Useful for touch targets and proximity hover.
   * Default: 0.
   */
  readonly tolerance?: number;
  /**
   * Maximum number of results to return.  If omitted, all hits are returned.
   */
  readonly maxResults?: number;
}

/** A single query result entry. Immutable. */
export interface HitResult {
  /** The matched component. */
  readonly component: BoardComponent;
  /**
   * Squared distance from the query origin to the component's centre.
   * For queryBounds, origin is the query rect's centre.
   * Primary sort key — nearest centre wins.
   */
  readonly distanceSq: number;
  /**
   * Registration order index. Secondary (tiebreak) sort key.
   * Lower = registered earlier.
   */
  readonly registrationIndex: number;
}

/** Diagnostic statistics. All values are non-negative integers. */
export interface EngineStats {
  /** Total registered components. */
  readonly componentCount: number;
  /** Total grid cells currently occupied. */
  readonly cellCount: number;
  /** Total (component, cell) insertion pairs (sum of per-component cell spans). */
  readonly totalInsertions: number;
  /** Grid cell size in board units. */
  readonly cellSize: number;
  /** Monotonic registration counter (next index to be assigned). */
  readonly nextRegistrationIndex: number;
}

// ─── Configuration ─────────────────────────────────────────────────────────────

/** HitDetectionEngine constructor options. */
export interface HitDetectionEngineOptions {
  /**
   * Size of each grid cell in board units.
   * Smaller = finer grid, more cells, faster queries in dense regions.
   * Larger = coarser grid, fewer cells, faster queries in sparse regions.
   * Default: 64.
   */
  readonly cellSize?: number;
}

// ─── Internal Types ───────────────────────────────────────────────────────────

/** Augmented component record stored in the engine. */
interface RegisteredComponent {
  readonly component:          BoardComponent;
  readonly registrationIndex:  number;
  /** Centre X in board units. */
  readonly cx:                 number;
  /** Centre Y in board units. */
  readonly cy:                 number;
  /** Half-width. */
  readonly hw:                 number;
  /** Half-height. */
  readonly hh:                 number;
  /** cos(rotation). 1.0 for axis-aligned. */
  readonly cosR:               number;
  /** sin(rotation). 0.0 for axis-aligned. */
  readonly sinR:               number;
  /** True when rotation is non-trivially non-zero. */
  readonly isRotated:          boolean;
  /**
   * AABB used for grid insertion — expanded to circumscribe the OBB.
   * For axis-aligned components this is the component's own AABB.
   */
  readonly insertionHW:        number;  // half-width of insertion AABB
  readonly insertionHH:        number;  // half-height of insertion AABB
}

// ─── Grid Key Utilities ───────────────────────────────────────────────────────

/** Threshold for using integer packing vs string fallback. */
const CELL_INT_RANGE = 32767; // 2^15 - 1

/**
 * Pack (cellX, cellY) into a 32-bit integer key.
 * Valid for cellX/cellY in [-32768, 32767].
 */
function packIntKey(cellX: number, cellY: number): number {
  return ((cellX & 0xFFFF) << 16) | (cellY & 0xFFFF);
}

/**
 * Produce a canonical cell key — integer when possible, string fallback.
 * The Map accepts both as keys; identical logical cells always produce equal
 * keys regardless of code path.
 */
function cellKey(cellX: number, cellY: number): number | string {
  if (
    cellX >= -CELL_INT_RANGE && cellX <= CELL_INT_RANGE &&
    cellY >= -CELL_INT_RANGE && cellY <= CELL_INT_RANGE
  ) {
    return packIntKey(cellX, cellY);
  }
  return `${cellX},${cellY}`;
}

// ─── Geometry Primitives ──────────────────────────────────────────────────────
//
// All functions are pure — no side effects, no allocations beyond return value.

/** Squared Euclidean distance between two points. */
function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * Test whether a point (px, py) lies within a tolerance-expanded AABB.
 *
 * @param cx    AABB centre X
 * @param cy    AABB centre Y
 * @param hw    AABB half-width
 * @param hh    AABB half-height
 * @param tol   Tolerance expansion (added to hw and hh)
 */
function pointInAABB(
  px: number, py: number,
  cx: number, cy: number,
  hw: number, hh: number,
  tol: number,
): boolean {
  return (
    px >= cx - hw - tol && px <= cx + hw + tol &&
    py >= cy - hh - tol && py <= cy + hh + tol
  );
}

/**
 * Test whether a point (px, py) lies within a tolerance-expanded OBB.
 *
 * The OBB is defined by:
 *   centre (cx, cy), half-extents (hw, hh),
 *   local axes: u = (cosR, sinR), v = (-sinR, cosR)
 *
 * SAT: project the point into local OBB space and compare to half-extents.
 *
 * @param cosR  cos(rotation)
 * @param sinR  sin(rotation)
 */
function pointInOBB(
  px: number, py: number,
  cx: number, cy: number,
  hw: number, hh: number,
  cosR: number, sinR: number,
  tol: number,
): boolean {
  // Translate point to OBB local frame.
  const dx = px - cx;
  const dy = py - cy;
  // Project onto local axes.
  const localX = dx * cosR + dy * sinR;
  const localY = -dx * sinR + dy * cosR;
  return (
    localX >= -(hw + tol) && localX <= hw + tol &&
    localY >= -(hh + tol) && localY <= hh + tol
  );
}

/**
 * Test whether a circle (cx, cy, r) overlaps a tolerance-expanded AABB.
 *
 * Uses the standard "closest point on AABB to circle centre" test.
 */
function circleOverlapsAABB(
  circX: number, circY: number, radius: number,
  cx: number, cy: number,
  hw: number, hh: number,
  tol: number,
): boolean {
  const exHW = hw + tol;
  const exHH = hh + tol;
  // Closest point on expanded AABB to circle centre.
  const clampX = circX < cx - exHW ? cx - exHW : circX > cx + exHW ? cx + exHW : circX;
  const clampY = circY < cy - exHH ? cy - exHH : circY > cy + exHH ? cy + exHH : circY;
  return distSq(circX, circY, clampX, clampY) <= radius * radius;
}

/**
 * Test whether a circle overlaps a tolerance-expanded OBB.
 *
 * Transforms circle centre into OBB local space, then applies the AABB test.
 */
function circleOverlapsOBB(
  circX: number, circY: number, radius: number,
  cx: number, cy: number,
  hw: number, hh: number,
  cosR: number, sinR: number,
  tol: number,
): boolean {
  const dx = circX - cx;
  const dy = circY - cy;
  const localX = dx * cosR + dy * sinR;
  const localY = -dx * sinR + dy * cosR;
  const exHW = hw + tol;
  const exHH = hh + tol;
  const clampX = localX < -exHW ? -exHW : localX > exHW ? exHW : localX;
  const clampY = localY < -exHH ? -exHH : localY > exHH ? exHH : localY;
  return distSq(localX, localY, clampX, clampY) <= radius * radius;
}

/**
 * Test whether two tolerance-expanded AABBs overlap (axis-aligned case).
 *
 * Component: centre (cx, cy), half-extents (hw, hh), expanded by tol.
 * Query rect: (qx, qy, qw, qh) in (left, top, width, height) form.
 */
function aabbOverlapsAABB(
  cx: number, cy: number,
  hw: number, hh: number,
  tol: number,
  qLeft: number, qTop: number, qRight: number, qBottom: number,
): boolean {
  return (
    cx - hw - tol < qRight  &&
    cx + hw + tol > qLeft   &&
    cy - hh - tol < qBottom &&
    cy + hh + tol > qTop
  );
}

/**
 * Test whether a query AABB overlaps a tolerance-expanded OBB.
 *
 * Uses SAT on five axes: two query-AABB axes (X,Y) and two OBB axes.
 * (The fifth SAT axis — cross products of edges — is not needed for 2-D.)
 */
function obbOverlapsAABB(
  cx: number, cy: number,
  hw: number, hh: number,
  cosR: number, sinR: number,
  tol: number,
  qLeft: number, qTop: number, qRight: number, qBottom: number,
): boolean {
  // ── Axis 1 & 2: world X and Y (query AABB axes) ──────────────────────────
  // Project OBB onto world X.
  const obbExtentX = hw * Math.abs(cosR) + hh * Math.abs(sinR);
  if (cx - obbExtentX - tol > qRight  || cx + obbExtentX + tol < qLeft)   return false;
  // Project OBB onto world Y.
  const obbExtentY = hw * Math.abs(sinR) + hh * Math.abs(cosR);
  if (cy - obbExtentY - tol > qBottom || cy + obbExtentY + tol < qTop)    return false;

  // ── Axis 3 & 4: OBB local axes ───────────────────────────────────────────
  // Query AABB corners in world space (relative to OBB centre).
  const qcx = (qLeft + qRight)  * 0.5 - cx;
  const qcy = (qTop  + qBottom) * 0.5 - cy;
  const qhw = (qRight - qLeft)  * 0.5;
  const qhh = (qBottom - qTop)  * 0.5;

  // Project query AABB onto OBB local axis u = (cosR, sinR).
  const queryExtentU = qhw * Math.abs(cosR) + qhh * Math.abs(sinR);
  const sepU = Math.abs(qcx * cosR + qcy * sinR);
  if (sepU > hw + tol + queryExtentU) return false;

  // Project query AABB onto OBB local axis v = (-sinR, cosR).
  const queryExtentV = qhw * Math.abs(sinR) + qhh * Math.abs(cosR);
  const sepV = Math.abs(-qcx * sinR + qcy * cosR);
  if (sepV > hh + tol + queryExtentV) return false;

  return true;
}

// ─── Result Sorting ───────────────────────────────────────────────────────────

/**
 * Deterministic comparator for HitResult ordering.
 * Primary key:   distanceSq  (ascending — nearest first)
 * Secondary key: registrationIndex (ascending — earlier registration first)
 *
 * Both keys are integers / IEEE-754 values with no NaN risk given validated
 * input.  The sort is stable given a stable sort implementation (V8 >= Node 11,
 * all modern environments); the secondary key makes it deterministic even on
 * non-stable sort engines.
 */
function compareHits(a: HitResult, b: HitResult): number {
  const dd = a.distanceSq - b.distanceSq;
  if (dd !== 0) return dd;
  return a.registrationIndex - b.registrationIndex;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Return true if component has the minimum valid shape for registration. */
function isValidComponent(c: BoardComponent): boolean {
  return (
    typeof c.id     === 'string'  &&
    c.id.length > 0               &&
    typeof c.x      === 'number'  && isFinite(c.x)      &&
    typeof c.y      === 'number'  && isFinite(c.y)      &&
    typeof c.width  === 'number'  && c.width  > 0       &&
    typeof c.height === 'number'  && c.height > 0       &&
    (c.rotation === undefined || (typeof c.rotation === 'number' && isFinite(c.rotation)))
  );
}

// ─── HitDetectionEngine ───────────────────────────────────────────────────────

/**
 * HitDetectionEngine
 *
 * Deterministic board-space spatial query engine backed by a uniform grid.
 */
export class HitDetectionEngine {

  // ── Configuration ────────────────────────────────────────────────────────
  private readonly _cellSize: number;

  // ── Index State ──────────────────────────────────────────────────────────

  /**
   * Primary component registry: id → RegisteredComponent.
   * Preserves insertion-order iteration (Map guarantees this in ES2015+).
   */
  private readonly _components: Map<string, RegisteredComponent> = new Map();

  /**
   * Spatial grid: cell key → array of registered component records.
   * Each record may appear in multiple cells (all cells its AABB covers).
   */
  private readonly _grid: Map<number | string, RegisteredComponent[]> = new Map();

  /** Monotonically increasing counter — never resets on clear(). */
  private _nextRegistrationIndex: number = 0;

  /** Total (component, cell) insertion count — for getStats(). */
  private _totalInsertions: number = 0;

  /**
   * Reusable candidate set — cleared before each query.
   * Avoids per-query allocation of a new Set in the hot path.
   */
  private readonly _candidateSet: Set<number> = new Set();

  // ── Constructor ───────────────────────────────────────────────────────────

  /**
   * @param options  Optional engine configuration.
   */
  constructor(options: HitDetectionEngineOptions = {}) {
    const cs = options.cellSize ?? 64;
    this._cellSize = cs > 0 ? cs : 64;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register an array of components into the spatial index.
   *
   * Components with duplicate ids replace their prior entry (index is updated).
   * Malformed components are silently skipped.
   *
   * Registration order determines the secondary sort key for query results.
   * Batch registration is preferred over incremental calls for performance.
   *
   * @param components  Array of board components to index.
   */
  registerComponents(components: readonly BoardComponent[]): void {
    for (let i = 0; i < components.length; i++) {
      const c = components[i];
      if (!isValidComponent(c)) continue;

      // Remove any existing entry for this id (handles re-registration).
      if (this._components.has(c.id)) {
        this._removeFromGrid(c.id);
      }

      const rot    = c.rotation ?? 0;
      const isRot  = Math.abs(rot) > 1e-9;
      const cosR   = isRot ? Math.cos(rot) : 1.0;
      const sinR   = isRot ? Math.sin(rot) : 0.0;
      const cx     = c.x + c.width  * 0.5;
      const cy     = c.y + c.height * 0.5;
      const hw     = c.width  * 0.5;
      const hh     = c.height * 0.5;

      // Insertion AABB: circumscribes the OBB to cover all occupied cells.
      // For axis-aligned components this equals the component AABB.
      let insertionHW: number;
      let insertionHH: number;
      if (isRot) {
        const absC = Math.abs(cosR);
        const absS = Math.abs(sinR);
        insertionHW = hw * absC + hh * absS;
        insertionHH = hw * absS + hh * absC;
      } else {
        insertionHW = hw;
        insertionHH = hh;
      }

      const rec: RegisteredComponent = {
        component:         c,
        registrationIndex: this._nextRegistrationIndex++,
        cx, cy, hw, hh,
        cosR, sinR,
        isRotated:  isRot,
        insertionHW,
        insertionHH,
      };

      this._components.set(c.id, rec);
      this._insertIntoGrid(rec);
    }
  }

  /**
   * Query for components that contain or intersect a board-space point.
   *
   * Expands each component's hit area by `options.tolerance` board units.
   * Results are sorted nearest-centre first, registration-order tiebreak.
   *
   * @param point    Board-space query point.
   * @param options  Optional tolerance and maxResults.
   * @returns Frozen array of HitResult, sorted by (distSq, registrationIndex).
   */
  queryPoint(point: Point, options: QueryOptions = {}): readonly HitResult[] {
    const tol     = options.tolerance  ?? 0;
    const maxRes  = options.maxResults ?? -1;
    const px      = point.x;
    const py      = point.y;

    // Tolerance-expanded region for cell collection.
    const results = this._queryRegion(
      px - tol, py - tol, px + tol, py + tol,
      (rec) => {
        if (rec.isRotated) {
          return pointInOBB(px, py, rec.cx, rec.cy, rec.hw, rec.hh, rec.cosR, rec.sinR, tol);
        }
        return pointInAABB(px, py, rec.cx, rec.cy, rec.hw, rec.hh, tol);
      },
      px, py,
      maxRes,
    );
    return results;
  }

  /**
   * Query for components within a board-space radius of a centre point.
   *
   * Tests each candidate against a circle + component OBB/AABB overlap.
   * `options.tolerance` further expands each component's effective area.
   *
   * @param centre   Board-space centre of the query circle.
   * @param radius   Radius in board units. Must be ≥ 0.
   * @param options  Optional tolerance and maxResults.
   * @returns Frozen array of HitResult, sorted by (distSq, registrationIndex).
   */
  queryRadius(centre: Point, radius: number, options: QueryOptions = {}): readonly HitResult[] {
    const tol    = options.tolerance  ?? 0;
    const maxRes = options.maxResults ?? -1;
    const cx     = centre.x;
    const cy     = centre.y;
    const r      = radius < 0 ? 0 : radius;
    const span   = r + tol;

    const results = this._queryRegion(
      cx - span, cy - span, cx + span, cy + span,
      (rec) => {
        if (rec.isRotated) {
          return circleOverlapsOBB(cx, cy, r, rec.cx, rec.cy, rec.hw, rec.hh, rec.cosR, rec.sinR, tol);
        }
        return circleOverlapsAABB(cx, cy, r, rec.cx, rec.cy, rec.hw, rec.hh, tol);
      },
      cx, cy,
      maxRes,
    );
    return results;
  }

  /**
   * Query for components that intersect a board-space axis-aligned rectangle.
   *
   * `options.tolerance` expands each component's effective area.
   *
   * @param rect     Query rectangle in board-space (x, y = top-left corner).
   * @param options  Optional tolerance and maxResults.
   * @returns Frozen array of HitResult, sorted by (distSq, registrationIndex).
   */
  queryBounds(rect: Rect, options: QueryOptions = {}): readonly HitResult[] {
    const tol     = options.tolerance  ?? 0;
    const maxRes  = options.maxResults ?? -1;
    const qLeft   = rect.x;
    const qTop    = rect.y;
    const qRight  = rect.x + rect.width;
    const qBottom = rect.y + rect.height;
    // Query origin for distSq sorting = rect centre.
    const origX   = rect.x + rect.width  * 0.5;
    const origY   = rect.y + rect.height * 0.5;

    const results = this._queryRegion(
      qLeft - tol, qTop - tol, qRight + tol, qBottom + tol,
      (rec) => {
        if (rec.isRotated) {
          return obbOverlapsAABB(
            rec.cx, rec.cy, rec.hw, rec.hh,
            rec.cosR, rec.sinR, tol,
            qLeft, qTop, qRight, qBottom,
          );
        }
        return aabbOverlapsAABB(
          rec.cx, rec.cy, rec.hw, rec.hh, tol,
          qLeft, qTop, qRight, qBottom,
        );
      },
      origX, origY,
      maxRes,
    );
    return results;
  }

  /**
   * Remove all registered components and reset the spatial grid.
   * Does NOT reset the registrationIndex counter — indices remain globally
   * monotonic across clear() calls for stable external references.
   */
  clear(): void {
    this._components.clear();
    this._grid.clear();
    this._totalInsertions = 0;
    this._candidateSet.clear();
  }

  /**
   * Return a frozen diagnostic snapshot.
   * No forbidden APIs, no allocations beyond the returned object.
   */
  getStats(): EngineStats {
    return Object.freeze({
      componentCount:        this._components.size,
      cellCount:             this._grid.size,
      totalInsertions:       this._totalInsertions,
      cellSize:              this._cellSize,
      nextRegistrationIndex: this._nextRegistrationIndex,
    });
  }

  // ── Private: Grid Management ──────────────────────────────────────────────

  /**
   * Insert a RegisteredComponent into every grid cell its insertion AABB covers.
   */
  private _insertIntoGrid(rec: RegisteredComponent): void {
    const cs    = this._cellSize;
    const minCX = Math.floor((rec.cx - rec.insertionHW) / cs);
    const minCY = Math.floor((rec.cy - rec.insertionHH) / cs);
    const maxCX = Math.floor((rec.cx + rec.insertionHW) / cs);
    const maxCY = Math.floor((rec.cy + rec.insertionHH) / cs);

    for (let gcx = minCX; gcx <= maxCX; gcx++) {
      for (let gcy = minCY; gcy <= maxCY; gcy++) {
        const key = cellKey(gcx, gcy);
        let bucket = this._grid.get(key);
        if (bucket === undefined) {
          bucket = [];
          this._grid.set(key, bucket);
        }
        bucket.push(rec);
        this._totalInsertions++;
      }
    }
  }

  /**
   * Remove a component from all grid cells it occupies.
   * Used during re-registration of a duplicate id.
   */
  private _removeFromGrid(id: string): void {
    const existing = this._components.get(id);
    if (existing === undefined) return;

    const cs    = this._cellSize;
    const minCX = Math.floor((existing.cx - existing.insertionHW) / cs);
    const minCY = Math.floor((existing.cy - existing.insertionHH) / cs);
    const maxCX = Math.floor((existing.cx + existing.insertionHW) / cs);
    const maxCY = Math.floor((existing.cy + existing.insertionHH) / cs);

    for (let gcx = minCX; gcx <= maxCX; gcx++) {
      for (let gcy = minCY; gcy <= maxCY; gcy++) {
        const key    = cellKey(gcx, gcy);
        const bucket = this._grid.get(key);
        if (bucket === undefined) continue;
        const idx = bucket.findIndex(r => r.component.id === id);
        if (idx !== -1) {
          // Swap-remove for O(1) deletion without preserving cell order.
          // Cell order doesn't matter — query order is determined by sort.
          bucket[idx] = bucket[bucket.length - 1];
          bucket.pop();
          this._totalInsertions--;
          if (bucket.length === 0) {
            this._grid.delete(key);
          }
        }
      }
    }

    this._components.delete(id);
  }

  // ── Private: Query Core ───────────────────────────────────────────────────

  /**
   * Shared query implementation.
   *
   * 1. Computes the set of grid cells overlapping [minX,minY]×[maxX,maxY].
   * 2. Collects candidate RegisteredComponents from those cells.
   * 3. Deduplicates by registrationIndex using _candidateSet.
   * 4. Applies the provided geometry predicate.
   * 5. Sorts by (distSq, registrationIndex) and returns a frozen array.
   *
   * @param minX / minY / maxX / maxY  Cell-collection AABB (already includes tolerance).
   * @param predicate  Precise geometry test applied to each deduplicated candidate.
   * @param origX / origY  Distance origin for result sorting.
   * @param maxRes  Result cap (-1 = unlimited).
   */
  private _queryRegion(
    minX: number, minY: number, maxX: number, maxY: number,
    predicate: (rec: RegisteredComponent) => boolean,
    origX: number, origY: number,
    maxRes: number,
  ): readonly HitResult[] {
    const cs    = this._cellSize;
    const minCX = Math.floor(minX / cs);
    const minCY = Math.floor(minY / cs);
    const maxCX = Math.floor(maxX / cs);
    const maxCY = Math.floor(maxY / cs);

    const candidateSet = this._candidateSet;
    candidateSet.clear();

    const results: HitResult[] = [];

    for (let gcx = minCX; gcx <= maxCX; gcx++) {
      for (let gcy = minCY; gcy <= maxCY; gcy++) {
        const bucket = this._grid.get(cellKey(gcx, gcy));
        if (bucket === undefined) continue;

        for (let i = 0; i < bucket.length; i++) {
          const rec = bucket[i];
          const idx = rec.registrationIndex;

          // Deduplicate: a component may appear in multiple cells.
          if (candidateSet.has(idx)) continue;
          candidateSet.add(idx);

          // Precise geometry test.
          if (!predicate(rec)) continue;

          const ds = distSq(origX, origY, rec.cx, rec.cy);
          results.push(Object.freeze({
            component:         rec.component,
            distanceSq:        ds,
            registrationIndex: idx,
          }));
        }
      }
    }

    // Deterministic sort: nearest centre first, registration order tiebreak.
    results.sort(compareHits);

    // Apply maxResults cap after sorting.
    const out = maxRes > 0 && results.length > maxRes
      ? results.slice(0, maxRes)
      : results;

    return Object.freeze(out);
  }
}
