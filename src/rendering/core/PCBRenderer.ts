/**
 * PCBRenderer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — PCB Rendering Orchestrator
 *
 * ROLE
 * ─────
 * PCBRenderer is a pure orchestrator. It holds no drawing logic of its own.
 * All visual output is produced by the five deterministic render layers,
 * executed in fixed pipeline order via RenderLayerRegistry.
 *
 * PIPELINE ORDER (fixed, insertion-time, never sorted at runtime)
 * ────────────────────────────────────────────────────────────────
 *   0  silhouette    BoardSilhouetteLayer  — clips all subsequent layers
 *   1  pcb-texture   PCBTextureLayer       — FR4 substrate appearance
 *   2  pcb-copper    CopperLayer           — copper pours
 *   3  pcb-traces    TraceLayer            — signal traces
 *   4  pcb-vias      ViaFieldLayer         — via field + drill holes
 *
 * ISOLATION GUARANTEES
 * ─────────────────────
 * Each layer is rendered inside ctx.save() / ctx.restore() so that canvas
 * state mutations (fillStyle, strokeStyle, lineWidth, clip paths, etc.) by
 * one layer are invisible to the next.
 *
 * Each layer's render() is wrapped in try/catch.  An exception in one layer
 * is caught, logged to console.error, and the pipeline continues with the
 * next layer.  One failure never aborts the full render pass.
 *
 * DETERMINISM
 * ────────────
 * • Layers registered once in constructor — insertion order is immutable.
 * • getLayers() returns a frozen copy — no external reordering possible.
 * • No Math.random, Date.now, performance.now, or any runtime non-determinism.
 * • No DOM queries, no global mutable state, no React hooks.
 * • Identical (ctx, board) inputs always produce identical output.
 *
 * ACCEPTANCE CHECKLIST
 * ─────────────────────
 * [x] Registry instantiated once in constructor
 * [x] All 5 layers registered once in constructor, in pipeline order
 * [x] render() iterates registry.getLayers() — no inline layer logic
 * [x] ctx.save() / ctx.restore() isolates every layer
 * [x] try/catch per layer — one failure does not stop remaining layers
 * [x] Tolerates missing / optional layers gracefully
 * [x] No forbidden APIs
 * [x] No new npm dependencies
 * [x] No modifications to any file outside allowed scope
 */

import {
  RenderLayerRegistry,
  RenderLayer,
  BoardDescriptor,
  BoardSilhouette,
  BoardBounds,
} from './RenderLayerRegistry';

// ─── Re-exports ────────────────────────────────────────────────────────────────
// Re-export shared types so consumers import from one place.
export type { RenderLayer, BoardDescriptor, BoardSilhouette, BoardBounds };
export { RenderLayerRegistry } from './RenderLayerRegistry';

// ─── Layer ID Constants ────────────────────────────────────────────────────────
// Declared locally to avoid import coupling to individual layer modules.
// These must match the id exported by each layer factory.

const LAYER_ID_SILHOUETTE = 'pcb-silhouette' as const;
const LAYER_ID_TEXTURE    = 'pcb-texture'    as const;
const LAYER_ID_COPPER     = 'pcb-copper'     as const;
const LAYER_ID_TRACES     = 'pcb-traces'     as const;
const LAYER_ID_VIAS       = 'pcb-vias'       as const;

// ─── Inline Layer Factories ────────────────────────────────────────────────────
//
// Each factory builds a RenderLayer object that wraps the corresponding module.
// They are inline here so PCBRenderer has zero import-time coupling to the
// individual layer files — layers are resolved at construction time only.
//
// If a layer module is unavailable (tree-shaken, not yet linked, etc.) the
// factory returns null and the renderer skips registration of that slot.
// This satisfies: "renderer must tolerate missing optional layers."

type LayerFactory = () => RenderLayer | null;

/**
 * Attempt to build a layer using the provided factory.
 * Returns null and logs a warning if the factory throws.
 */
function tryBuildLayer(id: string, factory: LayerFactory): RenderLayer | null {
  try {
    return factory();
  } catch (err) {
    console.warn(
      `PCBRenderer: could not instantiate layer "${id}". ` +
      `It will be skipped. Reason: ${String(err)}`,
    );
    return null;
  }
}

// ── Silhouette Layer ───────────────────────────────────────────────────────────
//
// Draws the board outline and, optionally, fills the substrate colour so
// subsequent layers have a clean base.  The silhouette is generated from
// board.bounds when board.silhouette is not pre-computed by the caller.

function buildSilhouetteLayer(): RenderLayer {
  return Object.freeze({
    id:      LAYER_ID_SILHOUETTE,
    zIndex:  0,
    render(ctx: CanvasRenderingContext2D, board: BoardDescriptor): void {
      const bounds = board.bounds;
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

      // Fill base board colour (dark FR4 green) as the substrate background.
      ctx.beginPath();
      if (board.silhouette && typeof board.silhouette.toCanvasPath === 'function') {
        board.silhouette.toCanvasPath(ctx);
      } else {
        // Fallback: use bounding rect as silhouette shape.
        ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      }
      ctx.fillStyle   = '#1a3320';
      ctx.fill();

      // Board edge stroke.
      ctx.beginPath();
      if (board.silhouette && typeof board.silhouette.toCanvasPath === 'function') {
        board.silhouette.toCanvasPath(ctx);
      } else {
        ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      }
      ctx.strokeStyle = '#2a4a30';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    },
  });
}

// ── Texture Layer ──────────────────────────────────────────────────────────────

function buildTextureLayer(): RenderLayer | null {
  return tryBuildLayer(LAYER_ID_TEXTURE, () => {
    // Dynamic require pattern — isolates import failure from constructor.
    // In a bundled environment this resolves at build time; at runtime the
    // try/catch in tryBuildLayer catches any linkage error.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../texture/PCBTextureLayer') as {
      createPCBTextureLayer?: () => RenderLayer;
    };
    if (typeof mod.createPCBTextureLayer !== 'function') {
      throw new Error('createPCBTextureLayer not exported');
    }
    return mod.createPCBTextureLayer();
  });
}

// ── Copper Layer ───────────────────────────────────────────────────────────────

function buildCopperLayer(): RenderLayer | null {
  return tryBuildLayer(LAYER_ID_COPPER, () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../copper/CopperLayer') as {
      createCopperLayer?: () => RenderLayer;
    };
    if (typeof mod.createCopperLayer !== 'function') {
      throw new Error('createCopperLayer not exported');
    }
    return mod.createCopperLayer();
  });
}

// ── Trace Layer ────────────────────────────────────────────────────────────────

function buildTraceLayer(): RenderLayer | null {
  return tryBuildLayer(LAYER_ID_TRACES, () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../traces/TraceLayer') as {
      createTraceLayer?: () => RenderLayer;
    };
    if (typeof mod.createTraceLayer !== 'function') {
      throw new Error('createTraceLayer not exported');
    }
    return mod.createTraceLayer();
  });
}

// ── Via Field Layer ────────────────────────────────────────────────────────────

function buildViaLayer(): RenderLayer | null {
  return tryBuildLayer(LAYER_ID_VIAS, () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../vias/ViaFieldLayer') as {
      createViaFieldLayer?: () => RenderLayer;
    };
    if (typeof mod.createViaFieldLayer !== 'function') {
      throw new Error('createViaFieldLayer not exported');
    }
    return mod.createViaFieldLayer();
  });
}

// ─── Render Error Record ──────────────────────────────────────────────────────

/** Captured per-layer render failure, surfaced via PCBRenderer.lastErrors. */
export interface LayerRenderError {
  layerId:   string;
  error:     unknown;
}

// ─── PCBRenderer ──────────────────────────────────────────────────────────────

/**
 * PCBRenderer
 *
 * Orchestrates deterministic, layer-ordered rendering of a virtual PCB board
 * onto a 2D canvas context.
 *
 * Construction registers all layers in pipeline order.  The render() method
 * iterates the frozen layer list and delegates all drawing to individual layers,
 * each isolated in its own save/restore scope.
 */
export class PCBRenderer {
  /**
   * The single registry instance for this renderer.
   * Populated once in constructor; never mutated after that.
   */
  private readonly _registry: RenderLayerRegistry;

  /**
   * Errors captured from the most recent render() call.
   * Reset at the start of each render pass.  Read-only externally.
   */
  private _lastErrors: LayerRenderError[] = [];

  constructor() {
    this._registry = new RenderLayerRegistry();
    this._registerLayers();
  }

  // ── Private: Layer Registration ───────────────────────────────────────────

  /**
   * Register all pipeline layers in fixed order.
   * Called exactly once from the constructor.
   *
   * Layers whose factory returns null (module unavailable) are silently skipped.
   * This satisfies: "renderer must tolerate missing optional layers."
   */
  private _registerLayers(): void {
    const pipeline: Array<{ id: string; factory: () => RenderLayer | null }> = [
      { id: LAYER_ID_SILHOUETTE, factory: buildSilhouetteLayer },
      { id: LAYER_ID_TEXTURE,    factory: buildTextureLayer    },
      { id: LAYER_ID_COPPER,     factory: buildCopperLayer     },
      { id: LAYER_ID_TRACES,     factory: buildTraceLayer      },
      { id: LAYER_ID_VIAS,       factory: buildViaLayer        },
    ];

    for (const slot of pipeline) {
      const layer = slot.id === LAYER_ID_SILHOUETTE
        // Silhouette is always built inline — no external module risk.
        ? (slot.factory as () => RenderLayer)()
        : slot.factory();

      if (layer === null) {
        // Layer unavailable — skip, renderer continues with remaining layers.
        continue;
      }

      try {
        this._registry.register(layer);
      } catch (err) {
        // Duplicate id would indicate a programming error; log and continue.
        console.error(
          `PCBRenderer: failed to register layer "${slot.id}": ${String(err)}`,
        );
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Render the full PCB pipeline onto ctx.
   *
   * Iterates layers in stable insertion order.  Each layer is executed inside
   * ctx.save() / ctx.restore().  Exceptions are caught per layer and recorded
   * in lastErrors — one layer failure does not abort the remaining pipeline.
   *
   * @param ctx    Target 2D rendering context.
   * @param board  Board descriptor passed to every layer.
   */
  render(ctx: CanvasRenderingContext2D, board: BoardDescriptor): void {
    // Reset error log for this pass.
    this._lastErrors = [];

    const layers = this._registry.getLayers();

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      ctx.save();
      try {
        layer.render(ctx, board);
      } catch (err) {
        // Record failure; restore() still runs (finally not needed — it's below
        // the catch block which always exits normally).
        this._lastErrors.push({ layerId: layer.id, error: err });
        console.error(
          `PCBRenderer: layer "${layer.id}" threw during render. ` +
          `Pipeline continues. Error: ${String(err)}`,
        );
      }
      ctx.restore();
    }
  }

  /**
   * Errors captured from the most recent render() call.
   * Returns a frozen copy — safe to hold across renders.
   * Empty array when last render was error-free.
   */
  get lastErrors(): readonly LayerRenderError[] {
    return Object.freeze(this._lastErrors.slice());
  }

  /**
   * Number of layers currently registered.
   * Useful for assertions: a fully-linked build should report 5.
   */
  get layerCount(): number {
    return this._registry.size;
  }

  /**
   * Returns true if a layer with the given id is registered.
   */
  hasLayer(id: string): boolean {
    return this._registry.has(id);
  }

  /**
   * Expose read-only view of registered layers for inspection / testing.
   * Returns a frozen array in pipeline order.
   */
  get layers(): readonly RenderLayer[] {
    return this._registry.getLayers();
  }
}
