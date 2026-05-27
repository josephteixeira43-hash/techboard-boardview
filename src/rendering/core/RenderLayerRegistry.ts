/**
 * RenderLayerRegistry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Deterministic Render Layer Registry
 *
 * RESPONSIBILITIES
 * ─────────────────
 * • Stable ordered storage of render layers.
 * • Deterministic, insertion-order iteration — no runtime sorting ever.
 * • Immutable registration order: once registered, order never changes.
 * • Duplicate layer id protection: second registration of the same id throws.
 * • Read-only layer list exposure via frozen array copy.
 *
 * DESIGN INVARIANTS
 * ──────────────────
 * • Internal layer array is never exposed directly — callers receive a frozen
 *   shallow copy from getLayers(), preventing external mutation.
 * • The registry itself holds no rendering logic — pure bookkeeping.
 * • Zero side effects at import time — no module-level initialisation.
 * • No forbidden APIs: no Math.random, Date.now, performance.now, DOM queries,
 *   global mutable state, or dynamic sorting.
 *
 * PIPELINE ORDER CONTRACT
 * ────────────────────────
 * Layers MUST be registered in pipeline order by the caller (PCBRenderer).
 * The registry preserves that order permanently:
 *
 *   zIndex 0 → silhouette        (BoardSilhouetteLayer)
 *   zIndex 1 → pcb-texture       (PCBTextureLayer)
 *   zIndex 2 → pcb-copper        (CopperLayer)
 *   zIndex 3 → pcb-traces        (TraceLayer)
 *   zIndex 4 → pcb-vias          (ViaFieldLayer)
 *
 * ACCEPTANCE CHECKLIST
 * ─────────────────────
 * [x] register(layer)         — adds layer, throws on duplicate id
 * [x] getLayers()             — returns frozen array in insertion order
 * [x] Duplicate ids rejected  — RenderLayerRegistryError thrown
 * [x] Insertion order preserved permanently
 * [x] No runtime sorting
 * [x] No forbidden APIs
 * [x] Zero npm dependencies
 * [x] Zero side effects at module scope
 */

// ─── Shared Layer Interface ────────────────────────────────────────────────────
//
// Defined here as the authoritative contract; re-exported so PCBRenderer and
// individual layers can import from one location without circular deps.

/** Minimum board context passed to every render() call. */
export interface BoardSilhouette {
  toCanvasPath(ctx: CanvasRenderingContext2D): void;
}

export interface BoardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardDescriptor {
  seed?: number;
  silhouette?: BoardSilhouette | null;
  bounds?: BoardBounds | null;
}

/**
 * Canonical render layer interface.
 * All layers registered with RenderLayerRegistry must satisfy this shape.
 */
export interface RenderLayer {
  /** Stable, unique string identifier. Must not change after construction. */
  readonly id: string;
  /**
   * Pipeline position hint — informational only.
   * The registry does NOT sort by zIndex; insertion order is authoritative.
   */
  readonly zIndex: number;
  /** Draw this layer onto ctx given board context. Must not throw uncaught. */
  render(ctx: CanvasRenderingContext2D, board: BoardDescriptor): void;
}

// ─── Error Types ──────────────────────────────────────────────────────────────

/** Thrown when a caller attempts to register a layer id already present. */
export class RenderLayerRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenderLayerRegistryError';
    // Restore prototype chain for instanceof checks in transpiled targets.
    Object.setPrototypeOf(this, RenderLayerRegistryError.prototype);
  }
}

// ─── Registry Implementation ──────────────────────────────────────────────────

/**
 * RenderLayerRegistry
 *
 * Maintains an ordered, append-only list of render layers.
 * Iteration order equals insertion order — stable and deterministic.
 */
export class RenderLayerRegistry {
  /**
   * Ordered layer list.  Never re-sorted, never exposed directly.
   * Marked private to enforce access through getLayers().
   */
  private readonly _layers: RenderLayer[] = [];

  /**
   * Set of registered ids for O(1) duplicate detection.
   * Kept in sync with _layers at all times.
   */
  private readonly _ids: Set<string> = new Set();

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register a layer.
   *
   * Appends the layer to the internal ordered list.
   * Throws {@link RenderLayerRegistryError} if a layer with the same id has
   * already been registered — duplicate ids are never silently ignored.
   *
   * @param layer  The layer to register.
   * @throws {RenderLayerRegistryError} on duplicate id.
   */
  register(layer: RenderLayer): void {
    if (this._ids.has(layer.id)) {
      throw new RenderLayerRegistryError(
        `RenderLayerRegistry: layer id "${layer.id}" is already registered. ` +
        `Each layer id must be unique. Duplicate registration is not permitted.`,
      );
    }
    this._ids.add(layer.id);
    this._layers.push(layer);
  }

  /**
   * Return all registered layers in stable insertion order.
   *
   * Returns a **frozen shallow copy** — callers cannot mutate the registry's
   * internal list.  The freeze is shallow: individual layer objects are not
   * re-frozen (they may already be frozen by their own factories).
   *
   * Calling getLayers() is O(n) in the number of registered layers.
   */
  getLayers(): readonly RenderLayer[] {
    return Object.freeze(this._layers.slice());
  }

  /**
   * Number of currently registered layers.
   * Useful for assertions and tests without materialising a full copy.
   */
  get size(): number {
    return this._layers.length;
  }

  /**
   * Returns true if a layer with the given id has been registered.
   */
  has(id: string): boolean {
    return this._ids.has(id);
  }
}
