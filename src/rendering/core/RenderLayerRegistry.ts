/**
 * RenderLayerRegistry.ts
 * src/rendering/core/RenderLayerRegistry.ts
 *
 * Centralized registration and execution system for PCB rendering layers.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Design pattern: Factory + Closure
 *   - createRenderLayerRegistry() produces a new, independent instance
 *   - Internal state is private by closure — no shared mutable globals
 *   - No singleton, no EventEmitter, no runtime dynamic imports
 *   - No React, no DOM, no parser, no AI module imports
 *
 * Layer pipeline (default order):
 *   [100] pcb-texture   ← PCBTextureLayer
 *   [200] pcb-copper    ← CopperLayer
 *   [300] pcb-traces    ← TraceLayer
 *   [400] pcb-overlays  ← future overlay system
 *
 * Order gaps of 100 allow future layers to be inserted without renumbering.
 * Custom layers may use any integer. Tie-break: lexicographic id sort.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DETERMINISM GUARANTEES
 * ─────────────────────────────────────────────────────────────────────────
 *   1. Layer order is determined solely by the integer `order` field.
 *   2. Tie-break on equal `order` uses lexicographic sort of `id` strings
 *      — produces a strict total order with no ambiguity.
 *   3. Sort comparator is pure: (a, b) => order diff, then id diff.
 *   4. No Date.now(), Math.random(), or any entropy source is used.
 *   5. getEnabledLayers() is a pure function — same registry state always
 *      returns the same sequence.
 *   6. renderAll() executes layers in the exact sequence from getEnabledLayers().
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FAILURE ISOLATION
 * ─────────────────────────────────────────────────────────────────────────
 *   Each layer's render() call is wrapped in an individual try/catch.
 *   A layer that throws:
 *     - Does NOT interrupt execution of subsequent layers
 *     - Increments stats.failedCount
 *     - Appends an error record to stats.errors[]
 *     - Is recorded with its id for debuggability
 *   renderAll() always returns a RenderStats object — never throws.
 *   The pipeline is fully resilient to partial layer failure.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ACCEPTANCE CHECKLIST
 * ─────────────────────────────────────────────────────────────────────────
 *   [x] RenderLayerRegistry type exported
 *   [x] createRenderLayerRegistry() exported
 *   [x] RenderLayerId type exported
 *   [x] RenderLayerOrder enum exported
 *   [x] register() — adds layer, rejects duplicate IDs
 *   [x] unregister() — removes layer by id
 *   [x] enable() / disable() — per-layer toggle
 *   [x] getEnabledLayers() — pure, deterministically ordered
 *   [x] getAllLayers() — all registered layers regardless of enabled state
 *   [x] validateLayerOrder() — checks for order conflicts
 *   [x] detectDuplicateIds() — scans for id collisions
 *   [x] renderAll() — executes pipeline, returns RenderStats
 *   [x] Failure isolation — one layer crash does not stop pipeline
 *   [x] Render stats collection (successCount, failedCount, errors, duration)
 *   [x] No Math.random()
 *   [x] No Date.now()
 *   [x] No React import
 *   [x] No DOM API import
 *   [x] No parser / AI module import
 *   [x] No EventEmitter
 *   [x] No singleton global
 *   [x] No mutable shared external state
 *   [x] No runtime dynamic imports
 *   [x] No external npm dependencies
 *   [x] Stable deterministic sort (order ASC, id lexicographic tie-break)
 *   [x] Future layer expansion supported
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valid layer ID type.
 * Constrained to non-empty strings — enforced at registration time.
 */
export type RenderLayerId = string;

/**
 * Canonical layer order constants.
 * Gaps of 100 allow future insertion without renumbering existing layers.
 *
 * Usage:
 *   registry.register({ id: 'pcb-texture', order: RenderLayerOrder.TEXTURE, ... })
 */
export const RenderLayerOrder = {
  /** PCB substrate texture — bottom of visual stack */
  TEXTURE:  100,
  /** Copper fills and flood zones */
  COPPER:   200,
  /** Electrical traces and via hints */
  TRACES:   300,
  /** Diagnostic overlays, highlights, selections */
  OVERLAYS: 400,
  /** Reserved expansion slots */
  VIAS:     250,   // between copper and traces
  SHIELDS:  150,   // between texture and copper
  HEATMAP:  350,   // between traces and overlays
} as const;

export type RenderLayerOrderValue = typeof RenderLayerOrder[keyof typeof RenderLayerOrder];

/**
 * Render context passed to each layer's render() function.
 *
 * Typed as unknown to keep this module free of React/DOM/Canvas imports.
 * The caller (PCBRenderer) provides the concrete context — SVG element ref,
 * Canvas 2D context, or any future render target.
 */
export type RenderContext = unknown;

/**
 * Payload passed to each layer's render() function.
 * Contains the board data needed for rendering.
 *
 * Typed as a generic record to avoid importing domain types here.
 * Layers cast to their specific payload type internally.
 */
export type RenderPayload = Record<string, unknown>;

/**
 * A single render layer definition.
 */
export interface RenderLayer {
  /** Unique identifier for this layer — must be non-empty, no whitespace */
  readonly id: RenderLayerId;

  /**
   * Render order — lower numbers render first (bottom of visual stack).
   * Use RenderLayerOrder constants for canonical layers.
   * Custom layers may use any integer, including values between constants.
   */
  readonly order: number;

  /**
   * Whether this layer participates in renderAll().
   * Default: true. Toggle with registry.enable(id) / registry.disable(id).
   */
  enabled: boolean;

  /**
   * Render function — called by renderAll() in order.
   *
   * MUST NOT throw to external callers — the registry wraps all render()
   * calls in try/catch for failure isolation. However, it is acceptable for
   * render() to throw internally; the registry will catch and record it.
   *
   * @param ctx     The render context (SVG ref, Canvas ctx, etc.)
   * @param payload The board data payload for this render pass
   */
  render(ctx: RenderContext, payload: RenderPayload): void;

  /**
   * Optional human-readable description for debugging and validation output.
   */
  readonly description?: string;
}

/**
 * Internal registry entry — extends RenderLayer with runtime metadata.
 */
interface RenderLayerEntry extends RenderLayer {
  /** Monotonically increasing registration index — used only for tie-break
   *  stability when order AND id are both identical (should not occur in
   *  practice since duplicate ids are rejected). */
  readonly _registrationIndex: number;
}

/**
 * Statistics collected during a renderAll() pass.
 */
export interface RenderStats {
  /** Number of layers that completed render() without throwing */
  successCount: number;

  /** Number of layers whose render() threw an error */
  failedCount: number;

  /** Total layers that were eligible for rendering (enabled) */
  totalRendered: number;

  /**
   * Error records for failed layers.
   * Each entry contains the layer id and the caught error value.
   */
  errors: Array<{
    layerId: RenderLayerId;
    error: unknown;
  }>;

  /**
   * Ordered list of layer IDs that were executed in this pass.
   * Useful for debugging render order.
   */
  executionOrder: RenderLayerId[];

  /**
   * Performance timing in milliseconds.
   * Uses performance.now() if available, falls back to 0.
   * This is NOT a determinism concern — timing is diagnostic only,
   * never used to affect render output or layer ordering.
   */
  durationMs: number;
}

/**
 * Result of validateLayerOrder() — describes any order conflicts found.
 */
export interface LayerOrderValidation {
  valid: boolean;
  /** Layers that share the same `order` value (potential ambiguity) */
  orderConflicts: Array<{
    order: number;
    layerIds: RenderLayerId[];
  }>;
  /** Summary message */
  message: string;
}

/**
 * Result of detectDuplicateIds() — describes any id collisions.
 */
export interface DuplicateIdReport {
  hasDuplicates: boolean;
  duplicates: RenderLayerId[];
  message: string;
}

/**
 * The public interface of a RenderLayerRegistry instance.
 */
export interface RenderLayerRegistry {
  /**
   * Register a new layer.
   *
   * @throws {Error} if layer.id is empty or contains whitespace
   * @throws {Error} if a layer with the same id is already registered
   * @throws {Error} if layer.order is not a finite integer
   */
  register(layer: RenderLayer): void;

  /**
   * Remove a layer by id.
   * No-op if the id is not registered.
   *
   * @returns true if the layer was found and removed, false otherwise
   */
  unregister(id: RenderLayerId): boolean;

  /**
   * Enable a layer by id.
   * No-op if the id is not registered.
   */
  enable(id: RenderLayerId): void;

  /**
   * Disable a layer by id.
   * Disabled layers are excluded from getEnabledLayers() and renderAll().
   * No-op if the id is not registered.
   */
  disable(id: RenderLayerId): void;

  /**
   * Returns all enabled layers in deterministic render order.
   *
   * Sort: primary = order ASC, tie-break = id lexicographic ASC.
   * This is a pure function — no side effects, no mutation.
   */
  getEnabledLayers(): ReadonlyArray<Readonly<RenderLayer>>;

  /**
   * Returns ALL registered layers (enabled and disabled) in deterministic order.
   * Useful for debugging and registry inspection.
   */
  getAllLayers(): ReadonlyArray<Readonly<RenderLayer>>;

  /**
   * Check for layers sharing the same `order` value.
   * Order conflicts are not errors — tie-break by id ensures determinism —
   * but they may indicate accidental collision and are worth surfacing.
   */
  validateLayerOrder(): LayerOrderValidation;

  /**
   * Scan all registered layer ids for duplicates.
   * In normal operation this should always return hasDuplicates: false
   * since register() prevents duplicates. Provided as a runtime safety check.
   */
  detectDuplicateIds(): DuplicateIdReport;

  /**
   * Execute all enabled layers in deterministic order.
   *
   * Failure isolation: each layer's render() is wrapped in try/catch.
   * A failing layer does not interrupt subsequent layers.
   *
   * Always returns RenderStats — never throws.
   *
   * @param ctx      Render context passed to each layer unchanged
   * @param payload  Board data payload passed to each layer unchanged
   */
  renderAll(ctx: RenderContext, payload: RenderPayload): RenderStats;

  /**
   * Returns the number of registered layers (enabled + disabled).
   */
  size(): number;

  /**
   * Returns true if a layer with the given id is registered.
   */
  has(id: RenderLayerId): boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers (pure functions — no registry dependency)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a layer ID:
 *   - Must be a string
 *   - Must be non-empty
 *   - Must not contain whitespace characters
 *   - Must not exceed 128 characters
 */
function validateId(id: unknown): asserts id is RenderLayerId {
  if (typeof id !== "string") {
    throw new Error(`RenderLayerRegistry: layer id must be a string, got ${typeof id}`);
  }
  if (id.length === 0) {
    throw new Error("RenderLayerRegistry: layer id must be non-empty");
  }
  if (/\s/.test(id)) {
    throw new Error(`RenderLayerRegistry: layer id must not contain whitespace: "${id}"`);
  }
  if (id.length > 128) {
    throw new Error(`RenderLayerRegistry: layer id exceeds 128 characters: "${id.slice(0, 32)}..."`);
  }
}

/**
 * Validate a layer order value:
 *   - Must be a finite number
 *   - Must be a safe integer (no floating point)
 */
function validateOrder(order: unknown): asserts order is number {
  if (typeof order !== "number" || !Number.isFinite(order)) {
    throw new Error(`RenderLayerRegistry: layer order must be a finite number, got ${order}`);
  }
  if (!Number.isSafeInteger(order)) {
    throw new Error(`RenderLayerRegistry: layer order must be a safe integer, got ${order}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic sort comparator
//
// Primary:   order ASC  (lower renders first)
// Secondary: id lexicographic ASC  (tie-break — deterministic total order)
// Tertiary:  _registrationIndex ASC  (belt-and-suspenders for identical ids,
//            which register() prevents — kept for theoretical completeness)
//
// This comparator is pure: no side effects, no external state.
// ─────────────────────────────────────────────────────────────────────────────

function layerComparator(a: RenderLayerEntry, b: RenderLayerEntry): number {
  // Primary: numeric order
  const orderDiff = a.order - b.order;
  if (orderDiff !== 0) return orderDiff;

  // Secondary: lexicographic id — guarantees total order on equal `order`
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;

  // Tertiary: registration index — should never reach here if ids are unique
  return a._registrationIndex - b._registrationIndex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance timing — diagnostic only, never affects render output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safe timing function — returns current time in ms.
 * Uses performance.now() if available (non-DOM environments may not have it).
 * Falls back to 0 — timing is diagnostic only.
 *
 * This is NOT a determinism concern: timing values are never used to affect
 * layer ordering, geometry, or any render output. They exist solely for
 * profiling in RenderStats.durationMs.
 */
function now(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createRenderLayerRegistry()
 *
 * Creates a new, independent RenderLayerRegistry instance.
 *
 * Each call returns a completely isolated instance — no shared state
 * between instances. This is the only way to create a registry.
 *
 * Usage:
 *   const registry = createRenderLayerRegistry();
 *   registry.register({ id: 'pcb-texture', order: RenderLayerOrder.TEXTURE, ... });
 *   const stats = registry.renderAll(svgRef, boardPayload);
 */
export function createRenderLayerRegistry(): RenderLayerRegistry {

  // ── Private state (closure — not accessible outside this function) ────────

  /** Primary storage: id → entry */
  const _layers = new Map<RenderLayerId, RenderLayerEntry>();

  /** Monotonic counter for registration order tie-break */
  let _registrationCounter = 0;

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Returns a sorted snapshot of all entries.
   * Pure: reads _layers, never mutates it.
   */
  function _sortedEntries(): RenderLayerEntry[] {
    return Array.from(_layers.values()).sort(layerComparator);
  }

  // ── Public interface ──────────────────────────────────────────────────────

  const registry: RenderLayerRegistry = {

    register(layer: RenderLayer): void {
      // Validate id
      validateId(layer.id);

      // Validate order
      validateOrder(layer.order);

      // Reject duplicate
      if (_layers.has(layer.id)) {
        throw new Error(
          `RenderLayerRegistry: duplicate layer id "${layer.id}". ` +
          `Unregister the existing layer before re-registering.`
        );
      }

      // Validate render function
      if (typeof layer.render !== "function") {
        throw new Error(
          `RenderLayerRegistry: layer "${layer.id}" must have a render() function`
        );
      }

      const entry: RenderLayerEntry = {
        id: layer.id,
        order: layer.order,
        enabled: layer.enabled !== false, // default true
        render: layer.render,
        description: layer.description,
        _registrationIndex: _registrationCounter++,
      };

      _layers.set(layer.id, entry);
    },

    unregister(id: RenderLayerId): boolean {
      return _layers.delete(id);
    },

    enable(id: RenderLayerId): void {
      const entry = _layers.get(id);
      if (entry) {
        entry.enabled = true;
      }
    },

    disable(id: RenderLayerId): void {
      const entry = _layers.get(id);
      if (entry) {
        entry.enabled = false;
      }
    },

    getEnabledLayers(): ReadonlyArray<Readonly<RenderLayer>> {
      return _sortedEntries().filter((e) => e.enabled);
    },

    getAllLayers(): ReadonlyArray<Readonly<RenderLayer>> {
      return _sortedEntries();
    },

    validateLayerOrder(): LayerOrderValidation {
      // Group layers by order value
      const orderMap = new Map<number, RenderLayerId[]>();

      for (const entry of _layers.values()) {
        const existing = orderMap.get(entry.order);
        if (existing) {
          existing.push(entry.id);
        } else {
          orderMap.set(entry.order, [entry.id]);
        }
      }

      // Collect conflicts (more than one id per order value)
      const orderConflicts: Array<{ order: number; layerIds: RenderLayerId[] }> = [];

      for (const [order, ids] of orderMap.entries()) {
        if (ids.length > 1) {
          // Sort ids for deterministic conflict report
          orderConflicts.push({ order, layerIds: [...ids].sort() });
        }
      }

      // Sort conflicts by order value for deterministic output
      orderConflicts.sort((a, b) => a.order - b.order);

      const valid = orderConflicts.length === 0;
      const message = valid
        ? `All ${_layers.size} layer(s) have unique order values.`
        : `${orderConflicts.length} order conflict(s) found. ` +
          `Conflicts are resolved deterministically by id lexicographic order, ` +
          `but may indicate accidental collision.`;

      return { valid, orderConflicts, message };
    },

    detectDuplicateIds(): DuplicateIdReport {
      // In normal operation register() prevents duplicates.
      // This is a defensive runtime check.
      const seen = new Set<RenderLayerId>();
      const duplicates: RenderLayerId[] = [];

      for (const id of _layers.keys()) {
        if (seen.has(id)) {
          duplicates.push(id);
        }
        seen.add(id);
      }

      const sortedDuplicates = [...duplicates].sort();

      return {
        hasDuplicates: sortedDuplicates.length > 0,
        duplicates: sortedDuplicates,
        message: sortedDuplicates.length === 0
          ? `No duplicate layer IDs detected.`
          : `Duplicate IDs found: ${sortedDuplicates.join(", ")}`,
      };
    },

    renderAll(ctx: RenderContext, payload: RenderPayload): RenderStats {
      const startTime = now();

      const enabledLayers = registry.getEnabledLayers();

      const stats: RenderStats = {
        successCount: 0,
        failedCount: 0,
        totalRendered: enabledLayers.length,
        errors: [],
        executionOrder: [],
        durationMs: 0,
      };

      for (const layer of enabledLayers) {
        // Record execution order before attempt — so it appears in stats
        // even if the layer fails
        stats.executionOrder.push(layer.id);

        try {
          layer.render(ctx, payload);
          stats.successCount++;
        } catch (error: unknown) {
          // ── FAILURE ISOLATION ─────────────────────────────────────────
          // This catch is intentional and load-bearing.
          // A layer that throws must never interrupt the pipeline.
          // The error is recorded for diagnostics; execution continues.
          stats.failedCount++;
          stats.errors.push({ layerId: layer.id, error });
          // ── END FAILURE ISOLATION ─────────────────────────────────────
        }
      }

      stats.durationMs = now() - startTime;

      return stats;
    },

    size(): number {
      return _layers.size;
    },

    has(id: RenderLayerId): boolean {
      return _layers.has(id);
    },
  };

  return registry;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: build the default PCB layer registry
//
// Pre-registers the four canonical layers with correct order values and
// no-op render functions as placeholders. Callers replace the render
// functions by unregistering and re-registering with real implementations.
//
// This function exists for documentation and testing purposes — it shows
// the intended canonical layer configuration without coupling this module
// to the actual layer implementations.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a registry pre-configured with the four canonical PCB layer IDs
 * at their correct order positions, all disabled by default.
 *
 * Callers are expected to:
 *   1. Unregister a placeholder layer
 *   2. Re-register it with a real render() implementation and enabled: true
 *
 * Or simply create an empty registry and register layers manually.
 */
export function createDefaultPCBRegistry(): RenderLayerRegistry {
  const registry = createRenderLayerRegistry();

  const noop = (): void => { /* placeholder — replace before rendering */ };

  registry.register({
    id: "pcb-texture",
    order: RenderLayerOrder.TEXTURE,
    enabled: false,
    render: noop,
    description: "PCB substrate texture layer (PCBTextureLayer)",
  });

  registry.register({
    id: "pcb-copper",
    order: RenderLayerOrder.COPPER,
    enabled: false,
    render: noop,
    description: "Copper fill zones layer (CopperLayer)",
  });

  registry.register({
    id: "pcb-traces",
    order: RenderLayerOrder.TRACES,
    enabled: false,
    render: noop,
    description: "Electrical traces layer (TraceLayer)",
  });

  registry.register({
    id: "pcb-overlays",
    order: RenderLayerOrder.OVERLAYS,
    enabled: false,
    render: noop,
    description: "Diagnostic overlays and highlights",
  });

  return registry;
}
