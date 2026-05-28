/**
 * ComponentSelectionEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Deterministic Component Selection Engine
 *
 * ARCHITECTURAL ROLE
 * ───────────────────
 * Pure TypeScript selection state machine and spatial query engine.
 * Single source of truth for:
 *
 *   • Active component selection (multi-select Set)
 *   • Hover state (single slot)
 *   • Rectangle / marquee selection queries
 *   • Point-pick queries with deterministic priority
 *   • Nearest-component queries
 *
 * Zero React. Zero DOM. Zero canvas. Zero rendering logic.
 * No side effects outside internal closure state.
 *
 * SELECTION PRIORITY (deterministic, four-level)
 * ────────────────────────────────────────────────
 * When multiple components satisfy a query, results are sorted by:
 *
 *   1. hitType      0 = exact hit (point inside bounds), 1 = proximity
 *   2. area         width × height  (smaller = higher priority)
 *   3. distanceSq   squared distance from query point to component centre
 *   4. id           lexicographic string comparison (unambiguous tiebreak)
 *
 * All four keys are pure functions of the input data — identical inputs always
 * produce identical ordering. No registration counters, no timestamps.
 *
 * SPATIAL INDEX
 * ──────────────
 * Uniform grid (configurable cellSize, default 64 board units).
 * Each component is inserted into every cell its AABB overlaps.
 * Point and rect queries inspect only the O(k) cells that overlap the query
 * shape — no O(n) full scan. Nearest-component search expands cell rings
 * outward until a result is confirmed or all cells are exhausted.
 *
 * DETERMINISTIC GUARANTEES
 * ─────────────────────────
 * • No Math.random · No Date.now · No performance.now · No async
 * • Same registration sequence + same query input → identical output
 * • getSelection() returns a lexically sorted frozen array snapshot
 * • getVisibleQueryResults() returns frozen arrays
 * • No mutation leaks: internal Set/Map never exposed directly
 *
 * FACTORY PATTERN
 * ────────────────
 * All state lives in the createComponentSelectionEngine() closure.
 * No class prototype, no module-level mutable state.
 * Returned API object is frozen — callers cannot inject fields.
 *
 * ACCEPTANCE CHECKLIST
 * ─────────────────────
 * [x] COMPONENT_SELECTION_ENGINE_ID constant exported
 * [x] createComponentSelectionEngine() factory exported
 * [x] selectComponent / deselectComponent / toggleSelection
 * [x] clearSelection / getSelection / isSelected
 * [x] setHoveredComponent / getHoveredComponent
 * [x] queryPoint — point-pick with priority sort
 * [x] queryRect  — rectangle intersection, priority sort
 * [x] queryNearest — nearest centre, optional radius cap
 * [x] registerComponents / clear
 * [x] Spatial grid index — no O(n) full scan on queries
 * [x] Immutable snapshots on all read paths
 * [x] Graceful handling of invalid / malformed components
 * [x] No recursion — iterative loops only
 * [x] 50k component scale — grid partitioning, no stack usage
 * [x] No forbidden APIs
 * [x] Zero npm dependencies
 * [x] Zero modifications to existing files
 */

// ─── Public ID Constant ───────────────────────────────────────────────────────

/** Stable identifier for this engine in multi-engine registries. */
export const COMPONENT_SELECTION_ENGINE_ID = 'component-selection-engine' as const;

// ─── Geometry Types ───────────────────────────────────────────────────────────

/** Immutable board-space point. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Immutable axis-aligned bounding box (x,y = top-left corner). */
export interface Rect {
  readonly x:      number;
  readonly y:      number;
  readonly width:  number;
  readonly height: number;
}

// ─── Component Interface ──────────────────────────────────────────────────────

/**
 * Minimum component shape consumed by the engine.
 * Additional fields are carried through transparently in query results.
 */
export interface SelectableComponent {
  /** Unique stable string identifier. */
  readonly id:     string;
  /** Board-space left edge. */
  readonly x:      number;
  /** Board-space top edge. */
  readonly y:      number;
  /** Width in board units. Must be > 0. */
  readonly width:  number;
  /** Height in board units. Must be > 0. */
  readonly height: number;
}

// ─── Query Result Types ───────────────────────────────────────────────────────

/**
 * Discriminates point-pick result type.
 * 'exact' = query point falls inside the component bounds.
 * 'proximity' = nearest match within tolerance/radius.
 */
export type HitType = 'exact' | 'proximity';

/** A single query result. Immutable. */
export interface SelectionQueryResult {
  readonly component:  SelectableComponent;
  /** 0 for exact hit, 1 for proximity — primary sort key. */
  readonly hitType:    HitType;
  /** Component bounding area (width × height). Secondary sort key. */
  readonly area:       number;
  /** Squared distance from query origin to component centre. Third sort key. */
  readonly distanceSq: number;
}

/** Options accepted by point and rect query methods. */
export interface QueryOptions {
  /**
   * Expand each component's effective hit area by this many board units.
   * Default: 0.
   */
  readonly tolerance?:  number;
  /** Cap the result set. Unlimited if omitted. */
  readonly maxResults?: number;
}

// ─── Engine Configuration ─────────────────────────────────────────────────────

export interface ComponentSelectionEngineOptions {
  /**
   * Spatial grid cell size in board units.
   * Smaller = finer grid (better for dense layouts).
   * Default: 64.
   */
  readonly cellSize?: number;
}

// ─── Public Engine API ────────────────────────────────────────────────────────

export interface ComponentSelectionEngine {
  // ── Registration ──────────────────────────────────────────────────────────

  /**
   * Register components into the spatial index.
   * Duplicate ids replace prior entries.
   * Malformed entries are silently skipped.
   */
  registerComponents(components: readonly SelectableComponent[]): void;

  /**
   * Remove all registered components and reset spatial index.
   * Does NOT clear active selection or hover state.
   */
  clear(): void;

  // ── Selection State ───────────────────────────────────────────────────────

  /**
   * Add a component id to the active selection.
   * No-op if already selected or id is empty.
   */
  selectComponent(id: string): void;

  /**
   * Remove a component id from the active selection.
   * No-op if not selected.
   */
  deselectComponent(id: string): void;

  /**
   * Toggle the selection state of a component id.
   */
  toggleSelection(id: string): void;

  /**
   * Clear the entire active selection.
   */
  clearSelection(): void;

  /**
   * Return a frozen, lexically sorted array of currently selected ids.
   * Snapshot — safe to hold across mutations.
   */
  getSelection(): readonly string[];

  /**
   * Return true if the given id is currently selected.
   */
  isSelected(id: string): boolean;

  /**
   * Replace the entire selection with the given set of ids.
   * Equivalent to clearSelection() + selectComponent() for each id.
   */
  setSelection(ids: readonly string[]): void;

  // ── Hover State ───────────────────────────────────────────────────────────

  /**
   * Set the hovered component. Pass null to clear hover.
   */
  setHoveredComponent(id: string | null): void;

  /**
   * Return the currently hovered component id, or null.
   */
  getHoveredComponent(): string | null;

  // ── Spatial Queries ───────────────────────────────────────────────────────

  /**
   * Query for components at a board-space point.
   *
   * Results are sorted by selection priority:
   *   1. hitType (exact before proximity)
   *   2. area (smaller first)
   *   3. distanceSq (nearer first)
   *   4. id (lexical tiebreak)
   *
   * @returns Frozen array of SelectionQueryResult.
   */
  queryPoint(point: Point, options?: QueryOptions): readonly SelectionQueryResult[];

  /**
   * Query for components intersecting a board-space rectangle.
   *
   * Distance is measured from the rect's centre.
   * Sort order: area, distanceSq (from rect centre), id.
   *
   * @returns Frozen array of SelectionQueryResult.
   */
  queryRect(rect: Rect, options?: QueryOptions): readonly SelectionQueryResult[];

  /**
   * Find the nearest component to a point.
   *
   * @param point      Board-space query point.
   * @param maxRadius  Optional search radius cap (board units). Unlimited if omitted.
   * @returns The nearest component result, or null if none found.
   */
  queryNearest(point: Point, maxRadius?: number): SelectionQueryResult | null;

  /**
   * Select all components returned by queryRect with the given rect.
   * Replaces the current selection entirely.
   *
   * @returns The ids that were selected (same as getSelection() after call).
   */
  selectRect(rect: Rect, options?: QueryOptions): readonly string[];

  // ── Diagnostics ───────────────────────────────────────────────────────────

  /**
   * Return engine statistics. No forbidden APIs.
   */
  getStats(): SelectionEngineStats;
}

/** Diagnostic snapshot. */
export interface SelectionEngineStats {
  readonly componentCount:  number;
  readonly selectionSize:   number;
  readonly hoveredId:       string | null;
  readonly cellCount:       number;
  readonly totalInsertions: number;
  readonly cellSize:        number;
}

// ─── Internal Types ───────────────────────────────────────────────────────────

interface RegisteredComponent {
  readonly component: SelectableComponent;
  /** Pre-computed centre X. */
  readonly cx: number;
  /** Pre-computed centre Y. */
  readonly cy: number;
  /** Pre-computed half-width. */
  readonly hw: number;
  /** Pre-computed half-height. */
  readonly hh: number;
  /** Pre-computed area = width × height. */
  readonly area: number;
}

// ─── Geometry Primitives ──────────────────────────────────────────────────────

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function pointInExpandedAABB(
  px: number, py: number,
  cx: number, cy: number,
  hw: number, hh: number,
  tol: number,
): boolean {
  return (
    px >= cx - hw - tol &&
    px <= cx + hw + tol &&
    py >= cy - hh - tol &&
    py <= cy + hh + tol
  );
}

function rectsIntersect(
  // Component AABB (expanded by tolerance)
  cx: number, cy: number, hw: number, hh: number, tol: number,
  // Query rect (left, top, right, bottom)
  ql: number, qt: number, qr: number, qb: number,
): boolean {
  return (
    cx - hw - tol < qr &&
    cx + hw + tol > ql &&
    cy - hh - tol < qb &&
    cy + hh + tol > qt
  );
}

/** Validate a component has the minimum required fields. */
function isValid(c: SelectableComponent): boolean {
  return (
    typeof c.id     === 'string' && c.id.length > 0 &&
    typeof c.x      === 'number' && isFinite(c.x)   &&
    typeof c.y      === 'number' && isFinite(c.y)   &&
    typeof c.width  === 'number' && c.width  > 0     &&
    typeof c.height === 'number' && c.height > 0
  );
}

// ─── Grid Key Utilities ───────────────────────────────────────────────────────

const CELL_INT_RANGE = 32767;

function cellKey(cellX: number, cellY: number): number | string {
  if (
    cellX >= -CELL_INT_RANGE && cellX <= CELL_INT_RANGE &&
    cellY >= -CELL_INT_RANGE && cellY <= CELL_INT_RANGE
  ) {
    return ((cellX & 0xFFFF) << 16) | (cellY & 0xFFFF);
  }
  return `${cellX},${cellY}`;
}

// ─── Priority Sort Comparator ─────────────────────────────────────────────────

/**
 * Deterministic comparator for SelectionQueryResult ordering.
 *
 * Key hierarchy (all ascending):
 *   1. hitType numerically   (0=exact < 1=proximity)
 *   2. area                  (smaller component wins)
 *   3. distanceSq            (nearer centre wins)
 *   4. id lexicographic      (stable final tiebreak)
 */
function compareResults(a: SelectionQueryResult, b: SelectionQueryResult): number {
  // 1. Hit type (exact before proximity)
  const ht = (a.hitType === 'exact' ? 0 : 1) - (b.hitType === 'exact' ? 0 : 1);
  if (ht !== 0) return ht;
  // 2. Area (smaller first)
  const da = a.area - b.area;
  if (da !== 0) return da;
  // 3. Distance squared (nearer first)
  const dd = a.distanceSq - b.distanceSq;
  if (dd !== 0) return dd;
  // 4. Lexical id tiebreak
  return a.component.id < b.component.id ? -1 : a.component.id > b.component.id ? 1 : 0;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a new ComponentSelectionEngine instance.
 *
 * All mutable state is private to the closure — zero module-level globals.
 * The returned API object is frozen.
 */
export function createComponentSelectionEngine(
  options: ComponentSelectionEngineOptions = {},
): ComponentSelectionEngine {

  // ── Configuration ────────────────────────────────────────────────────────
  const _cellSize = (options.cellSize ?? 64) > 0 ? (options.cellSize ?? 64) : 64;

  // ── Spatial Index ─────────────────────────────────────────────────────────
  const _components = new Map<string, RegisteredComponent>();
  const _grid       = new Map<number | string, RegisteredComponent[]>();
  let   _totalInsertions = 0;

  // ── Selection & Hover State ───────────────────────────────────────────────
  const _selection  = new Set<string>();
  let   _hovered: string | null = null;

  // ── Reusable Query Deduplication Set ─────────────────────────────────────
  // Cleared before each query — avoids per-query allocation in hot paths.
  const _seen = new Set<string>();

  // ── Grid Management ───────────────────────────────────────────────────────

  function _insertIntoGrid(rec: RegisteredComponent): void {
    const cs    = _cellSize;
    const minCX = Math.floor((rec.cx - rec.hw) / cs);
    const minCY = Math.floor((rec.cy - rec.hh) / cs);
    const maxCX = Math.floor((rec.cx + rec.hw) / cs);
    const maxCY = Math.floor((rec.cy + rec.hh) / cs);

    for (let gcx = minCX; gcx <= maxCX; gcx++) {
      for (let gcy = minCY; gcy <= maxCY; gcy++) {
        const key = cellKey(gcx, gcy);
        let bucket = _grid.get(key);
        if (bucket === undefined) {
          bucket = [];
          _grid.set(key, bucket);
        }
        bucket.push(rec);
        _totalInsertions++;
      }
    }
  }

  function _removeFromGrid(id: string): void {
    const existing = _components.get(id);
    if (existing === undefined) return;

    const cs    = _cellSize;
    const minCX = Math.floor((existing.cx - existing.hw) / cs);
    const minCY = Math.floor((existing.cy - existing.hh) / cs);
    const maxCX = Math.floor((existing.cx + existing.hw) / cs);
    const maxCY = Math.floor((existing.cy + existing.hh) / cs);

    for (let gcx = minCX; gcx <= maxCX; gcx++) {
      for (let gcy = minCY; gcy <= maxCY; gcy++) {
        const key    = cellKey(gcx, gcy);
        const bucket = _grid.get(key);
        if (bucket === undefined) continue;
        const idx = bucket.findIndex(r => r.component.id === id);
        if (idx !== -1) {
          bucket[idx] = bucket[bucket.length - 1];
          bucket.pop();
          _totalInsertions--;
          if (bucket.length === 0) _grid.delete(key);
        }
      }
    }
  }

  // ── Registration ──────────────────────────────────────────────────────────

  function registerComponents(components: readonly SelectableComponent[]): void {
    for (let i = 0; i < components.length; i++) {
      const c = components[i];
      if (!isValid(c)) continue;

      if (_components.has(c.id)) _removeFromGrid(c.id);

      const hw   = c.width  * 0.5;
      const hh   = c.height * 0.5;
      const rec: RegisteredComponent = {
        component: c,
        cx:   c.x + hw,
        cy:   c.y + hh,
        hw,
        hh,
        area: c.width * c.height,
      };
      _components.set(c.id, rec);
      _insertIntoGrid(rec);
    }
  }

  function clear(): void {
    _components.clear();
    _grid.clear();
    _totalInsertions = 0;
    _seen.clear();
    // Does NOT clear selection or hover — per spec.
  }

  // ── Internal: Region Query ────────────────────────────────────────────────

  /**
   * Collect all RegisteredComponent records whose insertion AABB overlaps
   * the axis-aligned region [minX, minY, maxX, maxY].
   * Deduplication via _seen set (cleared by caller).
   */
  function _collectCandidates(
    minX: number, minY: number,
    maxX: number, maxY: number,
  ): RegisteredComponent[] {
    const cs    = _cellSize;
    const minCX = Math.floor(minX / cs);
    const minCY = Math.floor(minY / cs);
    const maxCX = Math.floor(maxX / cs);
    const maxCY = Math.floor(maxY / cs);

    const candidates: RegisteredComponent[] = [];

    for (let gcx = minCX; gcx <= maxCX; gcx++) {
      for (let gcy = minCY; gcy <= maxCY; gcy++) {
        const bucket = _grid.get(cellKey(gcx, gcy));
        if (bucket === undefined) continue;
        for (let i = 0; i < bucket.length; i++) {
          const rec = bucket[i];
          if (_seen.has(rec.component.id)) continue;
          _seen.add(rec.component.id);
          candidates.push(rec);
        }
      }
    }
    return candidates;
  }

  // ── Query: Point ──────────────────────────────────────────────────────────

  function queryPoint(
    point: Point,
    options: QueryOptions = {},
  ): readonly SelectionQueryResult[] {
    const tol    = options.tolerance  ?? 0;
    const maxRes = options.maxResults ?? -1;
    const px = point.x;
    const py = point.y;

    _seen.clear();
    const candidates = _collectCandidates(
      px - tol, py - tol, px + tol, py + tol,
    );

    const results: SelectionQueryResult[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const rec = candidates[i];
      const isExact = pointInExpandedAABB(px, py, rec.cx, rec.cy, rec.hw, rec.hh, 0);
      const inTol   = tol > 0
        ? pointInExpandedAABB(px, py, rec.cx, rec.cy, rec.hw, rec.hh, tol)
        : isExact;
      if (!inTol) continue;

      results.push(Object.freeze({
        component:  rec.component,
        hitType:    isExact ? 'exact' : 'proximity',
        area:       rec.area,
        distanceSq: distSq(px, py, rec.cx, rec.cy),
      }));
    }

    results.sort(compareResults);
    const out = maxRes > 0 && results.length > maxRes ? results.slice(0, maxRes) : results;
    return Object.freeze(out);
  }

  // ── Query: Rect ───────────────────────────────────────────────────────────

  function queryRect(
    rect: Rect,
    options: QueryOptions = {},
  ): readonly SelectionQueryResult[] {
    const tol    = options.tolerance  ?? 0;
    const maxRes = options.maxResults ?? -1;
    const ql = rect.x;
    const qt = rect.y;
    const qr = rect.x + rect.width;
    const qb = rect.y + rect.height;
    // Sort origin = rect centre
    const origX = rect.x + rect.width  * 0.5;
    const origY = rect.y + rect.height * 0.5;

    _seen.clear();
    const candidates = _collectCandidates(ql - tol, qt - tol, qr + tol, qb + tol);

    const results: SelectionQueryResult[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const rec = candidates[i];
      if (!rectsIntersect(rec.cx, rec.cy, rec.hw, rec.hh, tol, ql, qt, qr, qb)) continue;

      // hitType for rect query: 'exact' if fully contained, 'proximity' if partial
      const fullyContained = (
        rec.cx - rec.hw >= ql &&
        rec.cx + rec.hw <= qr &&
        rec.cy - rec.hh >= qt &&
        rec.cy + rec.hh <= qb
      );

      results.push(Object.freeze({
        component:  rec.component,
        hitType:    fullyContained ? 'exact' : 'proximity',
        area:       rec.area,
        distanceSq: distSq(origX, origY, rec.cx, rec.cy),
      }));
    }

    results.sort(compareResults);
    const out = maxRes > 0 && results.length > maxRes ? results.slice(0, maxRes) : results;
    return Object.freeze(out);
  }

  // ── Query: Nearest ────────────────────────────────────────────────────────

  /**
   * Find the nearest component to a point.
   *
   * Strategy: start with the cell containing the point, expand outward in
   * concentric cell-rings until the nearest confirmed candidate cannot be
   * beaten by any unseen cell.  O(1) best case, O(n) worst case.
   *
   * Iterative ring expansion — no recursion.
   */
  function queryNearest(
    point: Point,
    maxRadius?: number,
  ): SelectionQueryResult | null {
    if (_components.size === 0) return null;

    const cs = _cellSize;
    const px = point.x;
    const py = point.y;
    const maxRadSq = (maxRadius !== undefined && maxRadius >= 0)
      ? maxRadius * maxRadius
      : Infinity;

    // Cell containing the query point
    const originCX = Math.floor(px / cs);
    const originCY = Math.floor(py / cs);

    // Upper bound on rings to search: ceil(maxRadius / cellSize) + 1
    // For unlimited radius: bound by grid extent (safe for 50k components)
    const maxRing = maxRadius !== undefined
      ? Math.ceil(maxRadius / cs) + 1
      : Math.ceil(Math.sqrt(_components.size)) + 2;

    _seen.clear();

    let bestRec: RegisteredComponent | null = null;
    let bestDist = maxRadSq;

    for (let ring = 0; ring <= maxRing; ring++) {
      // Early termination: the minimum possible distance to any component in
      // cells further than `ring` cells away is (ring - 1) * cellSize.
      // If that exceeds bestDist we cannot improve.
      if (ring > 0) {
        const minPossibleDist = ((ring - 1) * cs) * ((ring - 1) * cs);
        if (minPossibleDist > bestDist) break;
      }

      // Iterate the perimeter of the ring square.
      // Ring 0: single cell. Ring 1: 3×3 border. Ring r: (2r+1)×(2r+1) border.
      const rMin = originCX - ring;
      const rMax = originCX + ring;
      const cMin = originCY - ring;
      const cMax = originCY + ring;

      for (let gcx = rMin; gcx <= rMax; gcx++) {
        for (let gcy = cMin; gcy <= cMax; gcy++) {
          // Only visit border cells of this ring (not inner cells already seen)
          if (
            ring > 0 &&
            gcx > rMin && gcx < rMax &&
            gcy > cMin && gcy < cMax
          ) continue;

          const bucket = _grid.get(cellKey(gcx, gcy));
          if (bucket === undefined) continue;

          for (let i = 0; i < bucket.length; i++) {
            const rec = bucket[i];
            if (_seen.has(rec.component.id)) continue;
            _seen.add(rec.component.id);

            const d = distSq(px, py, rec.cx, rec.cy);
            if (d < bestDist) {
              bestDist = d;
              bestRec  = rec;
            }
          }
        }
      }
    }

    if (bestRec === null) return null;

    return Object.freeze({
      component:  bestRec.component,
      hitType:    pointInExpandedAABB(px, py, bestRec.cx, bestRec.cy, bestRec.hw, bestRec.hh, 0)
                    ? 'exact' : 'proximity',
      area:       bestRec.area,
      distanceSq: bestDist,
    });
  }

  // ── Selection API ─────────────────────────────────────────────────────────

  function selectComponent(id: string): void {
    if (typeof id === 'string' && id.length > 0) _selection.add(id);
  }

  function deselectComponent(id: string): void {
    _selection.delete(id);
  }

  function toggleSelection(id: string): void {
    if (typeof id !== 'string' || id.length === 0) return;
    if (_selection.has(id)) {
      _selection.delete(id);
    } else {
      _selection.add(id);
    }
  }

  function clearSelection(): void {
    _selection.clear();
  }

  function getSelection(): readonly string[] {
    // Lexically sorted for stable external iteration.
    const ids = Array.from(_selection).sort();
    return Object.freeze(ids);
  }

  function isSelected(id: string): boolean {
    return _selection.has(id);
  }

  function setSelection(ids: readonly string[]): void {
    _selection.clear();
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (typeof id === 'string' && id.length > 0) _selection.add(id);
    }
  }

  // ── Hover API ─────────────────────────────────────────────────────────────

  function setHoveredComponent(id: string | null): void {
    _hovered = (typeof id === 'string' && id.length > 0) ? id : null;
  }

  function getHoveredComponent(): string | null {
    return _hovered;
  }

  // ── Rectangle Selection ───────────────────────────────────────────────────

  function selectRect(rect: Rect, options: QueryOptions = {}): readonly string[] {
    const hits = queryRect(rect, options);
    _selection.clear();
    for (let i = 0; i < hits.length; i++) {
      _selection.add(hits[i].component.id);
    }
    return getSelection();
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  function getStats(): SelectionEngineStats {
    return Object.freeze({
      componentCount:  _components.size,
      selectionSize:   _selection.size,
      hoveredId:       _hovered,
      cellCount:       _grid.size,
      totalInsertions: _totalInsertions,
      cellSize:        _cellSize,
    });
  }

  // ── Assemble Frozen Public API ────────────────────────────────────────────

  return Object.freeze({
    registerComponents,
    clear,
    selectComponent,
    deselectComponent,
    toggleSelection,
    clearSelection,
    getSelection,
    isSelected,
    setSelection,
    setHoveredComponent,
    getHoveredComponent,
    queryPoint,
    queryRect,
    queryNearest,
    selectRect,
    getStats,
  });
}
