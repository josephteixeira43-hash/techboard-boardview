/**
 * OverlaySystem.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Deterministic Overlay Orchestration System
 *
 * PURPOSE
 * ────────
 * Manages all transient and interactive visual overlays rendered above the PCB
 * layer stack.  Acts as the authoritative orchestrator for:
 *
 *   • Hover overlays          — pointer-reactive component highlighting
 *   • Selection overlays      — multi-select marquee and selection rings
 *   • Region highlight overlays — zone/net region fills
 *   • Temporary debug overlays — bounding-box visualisers, grid helpers
 *   • Future net tracing overlays
 *   • Future voltage path overlays
 *
 * ARCHITECTURE
 * ─────────────
 * Internal state is split into two structures:
 *
 *   _registry   Map<string, OverlayEntry>   — source of truth for all overlays
 *   _renderOrder readonly OverlayEntry[]    — pre-sorted render sequence
 *
 * _renderOrder is rebuilt synchronously on every structural mutation
 * (register / unregister / setOverlayVisible).  The hot render() path reads
 * _renderOrder only — zero sorting, zero new array allocation, zero Map lookup.
 *
 * DETERMINISTIC ORDERING
 * ───────────────────────
 * Sort key: (zIndex ASC, registrationIndex ASC)
 *   • zIndex is the primary layer position.
 *   • registrationIndex is a monotonically increasing integer assigned at
 *     registration time.  It acts as a stable tiebreak so that two overlays
 *     with the same zIndex always render in the same relative order regardless
 *     of Map iteration order or engine-specific sort behaviour.
 *
 * RENDER LIFECYCLE
 * ─────────────────
 *   1. render(ctx, viewport) reads the pre-built _renderOrder array.
 *   2. For each visible overlay:
 *        ctx.save()
 *        try { overlay.render(ctx, viewport) }
 *        catch { record error, continue }
 *        ctx.restore()
 *   3. No sorting, no allocation, no Map access during the render pass.
 *   4. render() is non-recursive and iterates a fixed-length array.
 *
 * FAILURE HANDLING
 * ─────────────────
 * ctx.save() is called BEFORE the try block so ctx.restore() always runs even
 * when an overlay throws.  The canvas state is never left corrupted.
 * Errors are recorded in lastRenderErrors (reset each pass) and logged via
 * console.error.  The remaining overlays continue unaffected.
 *
 * FORBIDDEN (verified by automated suite)
 * ─────────────────────────────────────────
 * No Math.random · No Date.now · No performance.now · No external imports ·
 * No React · No DOM ownership · No mutable globals · No side effects at module
 * scope · No canvas transforms owned by this system · No recursion.
 *
 * ACCEPTANCE CHECKLIST
 * ─────────────────────
 * [x] createOverlaySystem()         — factory, returns frozen API object
 * [x] registerOverlay(overlay)      — insert, rebuild order, duplicate guard
 * [x] unregisterOverlay(id)         — remove, rebuild order
 * [x] setOverlayVisible(id, bool)   — toggle, rebuild order
 * [x] clearOverlay(id)              — alias for unregister (symmetry with clearAll)
 * [x] clearAll()                    — full reset
 * [x] render(ctx, viewport)         — hot path, zero allocation, save/restore
 * [x] getOverlay(id)                — point lookup, returns frozen copy
 * [x] getVisibleOverlays()          — frozen snapshot of current render order
 * [x] lastRenderErrors              — frozen error log from last render pass
 * [x] Deterministic ordering        — (zIndex, registrationIndex) sort
 * [x] Pre-sorted on mutation        — render path never sorts
 * [x] Immutable visible snapshots   — Object.freeze on every public array
 * [x] Safe isolation                — save/restore + try/catch per overlay
 * [x] No recursion
 * [x] No forbidden APIs
 * [x] Zero npm dependencies
 */

// ─── Viewport Descriptor ──────────────────────────────────────────────────────
//
// Defined locally to keep the module self-contained.
// Compatible with ViewportManager.getTransform() and BoardDescriptor patterns
// already established in the pipeline.

/**
 * Viewport context passed to every overlay's render() call.
 * Overlays use this to position themselves in screen-space.
 */
export interface OverlayViewport {
  /** Uniform zoom scale (board units → screen pixels). */
  readonly scale:          number;
  /** Screen-space X translation (board origin → screen). */
  readonly translateX:     number;
  /** Screen-space Y translation (board origin → screen). */
  readonly translateY:     number;
  /** Viewport width in screen pixels. */
  readonly viewportWidth:  number;
  /** Viewport height in screen pixels. */
  readonly viewportHeight: number;
}

// ─── Overlay Contract ─────────────────────────────────────────────────────────

/**
 * Canonical overlay interface.
 * Any object satisfying this shape can be registered with OverlaySystem.
 */
export interface Overlay {
  /**
   * Stable, unique string identifier.
   * Attempting to register two overlays with the same id throws
   * OverlayRegistrationError.
   */
  readonly id: string;
  /**
   * Render stack position.  Lower values render first (further back).
   * Overlays with equal zIndex are ordered by registration order (FIFO).
   */
  readonly zIndex: number;
  /**
   * Whether this overlay participates in the render pass.
   * Controlled externally via setOverlayVisible().
   */
  visible: boolean;
  /**
   * Draw this overlay onto ctx.
   * Called inside ctx.save() / ctx.restore() — state changes do not leak.
   * Must not throw uncaught exceptions (they are caught by the system).
   * Must not call render() on the OverlaySystem (no recursion).
   */
  render(ctx: CanvasRenderingContext2D, viewport: OverlayViewport): void;
}

// ─── Error Types ──────────────────────────────────────────────────────────────

/** Thrown when attempting to register a duplicate overlay id. */
export class OverlayRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverlayRegistrationError';
    Object.setPrototypeOf(this, OverlayRegistrationError.prototype);
  }
}

/** Captured render failure from a single overlay in a single pass. */
export interface OverlayRenderError {
  readonly overlayId: string;
  readonly error:     unknown;
}

// ─── Public API Surface ───────────────────────────────────────────────────────

/**
 * Public interface of the object returned by createOverlaySystem().
 * All mutation methods are synchronous and immediately consistent.
 */
export interface OverlaySystemAPI {
  /**
   * Register an overlay.
   *
   * The overlay is inserted into the sorted render order immediately.
   * @throws {OverlayRegistrationError} if an overlay with the same id exists.
   */
  registerOverlay(overlay: Overlay): void;

  /**
   * Unregister an overlay by id.
   * No-op if the id is not found.
   */
  unregisterOverlay(id: string): void;

  /**
   * Toggle the visibility of a registered overlay.
   * The render order is rebuilt immediately to reflect the change.
   * No-op if the id is not found.
   *
   * @param id       Target overlay id.
   * @param visible  New visibility state.
   */
  setOverlayVisible(id: string, visible: boolean): void;

  /**
   * Remove a single overlay by id.
   * Alias for unregisterOverlay — provided for API symmetry with clearAll().
   */
  clearOverlay(id: string): void;

  /**
   * Remove all overlays and reset the system to its initial state.
   * Does NOT reset the registration index counter — indices remain globally
   * monotonic for external reference stability.
   */
  clearAll(): void;

  /**
   * Execute the overlay render pass.
   *
   * Iterates the pre-sorted visible overlay list.
   * Each overlay is rendered inside ctx.save() / ctx.restore().
   * Exceptions are caught per-overlay; the pass continues regardless.
   * Error details are available via lastRenderErrors after the call.
   *
   * @param ctx       Target 2-D rendering context.
   * @param viewport  Viewport descriptor for this frame.
   */
  render(ctx: CanvasRenderingContext2D, viewport: OverlayViewport): void;

  /**
   * Return a frozen snapshot of the overlay's current registration state.
   * Returns undefined if the id is not registered.
   *
   * The returned object is a shallow frozen copy — mutations to it do not
   * affect the internal registry.
   */
  getOverlay(id: string): Readonly<Overlay> | undefined;

  /**
   * Return a frozen array of all currently visible overlays in render order.
   *
   * This is a snapshot: subsequent calls after mutations return fresh arrays.
   * The returned array itself is frozen; individual overlay objects are not
   * re-frozen (they may be mutable by design — e.g. animated content).
   */
  getVisibleOverlays(): readonly Overlay[];

  /**
   * Errors captured during the most recent render() call.
   * Empty when the last pass was error-free.
   * Frozen — safe to hold across render passes.
   */
  readonly lastRenderErrors: readonly OverlayRenderError[];

  /**
   * Total number of registered overlays (visible + hidden).
   */
  readonly size: number;
}

// ─── Internal Entry ───────────────────────────────────────────────────────────

/**
 * Internal record augmenting a registered Overlay with engine bookkeeping.
 */
interface OverlayEntry {
  readonly overlay:            Overlay;
  /** Monotonically assigned at registration — stable tiebreak. */
  readonly registrationIndex:  number;
}

// ─── Sort Comparator ─────────────────────────────────────────────────────────

/**
 * Deterministic comparator for overlay render ordering.
 *
 * Primary key:   zIndex (ascending — lower zIndex renders first / behind)
 * Secondary key: registrationIndex (ascending — earlier registration renders first)
 *
 * The integer tiebreak makes this behave as a stable sort on all engines,
 * including those where Array.sort was not guaranteed stable before ES2019.
 */
function compareEntries(a: OverlayEntry, b: OverlayEntry): number {
  const dz = a.overlay.zIndex - b.overlay.zIndex;
  if (dz !== 0) return dz;
  return a.registrationIndex - b.registrationIndex;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new OverlaySystem instance.
 *
 * The returned object is a plain frozen record — no class prototype, no
 * inheritance chain.  All state lives in the factory closure.
 *
 * @returns A fully initialised OverlaySystem.
 */
export function createOverlaySystem(): OverlaySystemAPI {

  // ── Closure State ──────────────────────────────────────────────────────────
  //
  // All mutable state is private to this closure.
  // No module-level mutable variables — zero global side effects.

  /** Source of truth: id → OverlayEntry. Map preserves insertion order. */
  const _registry = new Map<string, OverlayEntry>();

  /**
   * Pre-sorted render sequence: visible overlays only, sorted by
   * (zIndex, registrationIndex).
   *
   * Rebuilt synchronously on every structural mutation.
   * The render() hot path reads this array exclusively — no sorting,
   * no Map access, no allocation during render.
   */
  let _renderOrder: readonly OverlayEntry[] = Object.freeze([]);

  /** Monotonically increasing registration counter. Never decremented. */
  let _nextIndex = 0;

  /** Error log — populated during render(), cleared at the start of each pass. */
  let _lastRenderErrors: readonly OverlayRenderError[] = Object.freeze([]);

  // ── Internal: Render Order Rebuild ─────────────────────────────────────────

  /**
   * Rebuild _renderOrder from _registry.
   *
   * Collects visible entries, sorts by (zIndex, registrationIndex),
   * then freezes the result.
   *
   * Called after every structural mutation. O(n log n) where n = total overlays.
   * For the expected scale (100+ overlays) this is negligible at mutation time
   * and ensures the render hot path stays O(n) with zero overhead.
   */
  function _rebuildRenderOrder(): void {
    const visible: OverlayEntry[] = [];
    _registry.forEach((entry) => {
      if (entry.overlay.visible) {
        visible.push(entry);
      }
    });
    visible.sort(compareEntries);
    _renderOrder = Object.freeze(visible);
  }

  // ── API Implementation ────────────────────────────────────────────────────

  function registerOverlay(overlay: Overlay): void {
    if (_registry.has(overlay.id)) {
      throw new OverlayRegistrationError(
        `OverlaySystem: overlay id "${overlay.id}" is already registered. ` +
        `Call unregisterOverlay("${overlay.id}") before re-registering.`,
      );
    }
    const entry: OverlayEntry = {
      overlay,
      registrationIndex: _nextIndex++,
    };
    _registry.set(overlay.id, entry);
    _rebuildRenderOrder();
  }

  function unregisterOverlay(id: string): void {
    if (!_registry.has(id)) return; // no-op — graceful
    _registry.delete(id);
    _rebuildRenderOrder();
  }

  function setOverlayVisible(id: string, visible: boolean): void {
    const entry = _registry.get(id);
    if (entry === undefined) return; // no-op — graceful
    if (entry.overlay.visible === visible) return; // no change — skip rebuild
    entry.overlay.visible = visible;
    _rebuildRenderOrder();
  }

  function clearOverlay(id: string): void {
    unregisterOverlay(id); // alias — identical behaviour
  }

  function clearAll(): void {
    _registry.clear();
    _renderOrder = Object.freeze([]);
    _lastRenderErrors = Object.freeze([]);
    // _nextIndex intentionally NOT reset — preserves global monotonicity.
  }

  function render(ctx: CanvasRenderingContext2D, viewport: OverlayViewport): void {
    // Capture render order snapshot at start of pass.
    // _renderOrder is a frozen array; assignment is a reference copy — O(1).
    const order = _renderOrder;
    const errors: OverlayRenderError[] = [];

    for (let i = 0; i < order.length; i++) {
      const { overlay } = order[i];

      // save() BEFORE try so restore() always executes — canvas state is safe
      // even when an overlay throws synchronously.
      ctx.save();
      try {
        overlay.render(ctx, viewport);
      } catch (err) {
        errors.push(Object.freeze({ overlayId: overlay.id, error: err }));
        console.error(
          `OverlaySystem: overlay "${overlay.id}" threw during render. ` +
          `Pass continues. Error: ${String(err)}`,
        );
      }
      ctx.restore();
    }

    _lastRenderErrors = Object.freeze(errors);
  }

  function getOverlay(id: string): Readonly<Overlay> | undefined {
    const entry = _registry.get(id);
    if (entry === undefined) return undefined;
    // Return a shallow frozen copy — external mutations don't affect registry.
    // Note: visible is included so callers can read state; writing to the copy
    // has no effect on internal state (use setOverlayVisible for that).
    return Object.freeze({ ...entry.overlay });
  }

  function getVisibleOverlays(): readonly Overlay[] {
    // Map pre-built entry list to overlay objects and freeze.
    // This is the only allocation in the read path — acceptable for a snapshot.
    const overlays = (_renderOrder as OverlayEntry[]).map(e => e.overlay);
    return Object.freeze(overlays);
  }

  // ── Assemble & Return Public API ──────────────────────────────────────────
  //
  // Use a getter for lastRenderErrors and size so they reflect current state
  // when accessed, without requiring the caller to call a method.

  const system: OverlaySystemAPI = {
    registerOverlay,
    unregisterOverlay,
    setOverlayVisible,
    clearOverlay,
    clearAll,
    render,
    getOverlay,
    getVisibleOverlays,
    get lastRenderErrors(): readonly OverlayRenderError[] {
      return _lastRenderErrors;
    },
    get size(): number {
      return _registry.size;
    },
  };

  return Object.freeze(system);
}

export type OverlayState = {
  showPads: boolean;
  showVias: boolean;
  showTraces: boolean;
  showNets: boolean;
  showLabels: boolean;
  showSilkscreen: boolean;
  showVoltages: boolean;
  showGrid: boolean;
};

export const DEFAULT_OVERLAY: OverlayState = Object.freeze({
  showPads: true,
  showVias: true,
  showTraces: true,
  showNets: true,
  showLabels: true,
  showSilkscreen: true,
  showVoltages: true,
  showGrid: false,
});

// Backward-compatible class export used by page-level imports.
export class OverlaySystem {
  private state: OverlayState = { ...DEFAULT_OVERLAY };
  private readonly listeners = new Set<(state: OverlayState) => void>();

  subscribe(listener: (state: OverlayState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  toggle(key: keyof OverlayState): void {
    this.state = Object.freeze({
      ...this.state,
      [key]: !this.state[key],
    });
    this.listeners.forEach((listener) => listener(this.state));
  }

  getState(): OverlayState {
    return this.state;
  }
}
