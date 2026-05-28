/**
 * BoardRuntime.ts
 * src/integration/boardview/BoardRuntime.ts
 *
 * Composes all board engines into a single runtime handle.
 * Does NOT implement engines — only wires them together.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RESPONSIBILITIES
 * ─────────────────────────────────────────────────────────────────────────
 *   - Instantiate and hold refs to all engine instances
 *   - Seed NetConnectivityEngine from BoardData
 *   - Register rendering layers in the correct order
 *   - Expose a stable handle consumed by BoardRenderLoop and
 *     BoardInteractionController
 *   - Provide viewport state accessors (pure math, no React)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PASSIVE ARCHITECTURE
 * ─────────────────────────────────────────────────────────────────────────
 *   Engines never directly call React setState.
 *   BoardRuntime exposes callback slots that React components fill in.
 *   This keeps the rendering loop entirely outside the React tree.
 *
 * Zero external dependencies. No React. No DOM. No async.
 */

import type {
  BoardData,
  ViewportState,
  WorldPoint,
  EngineRenderContext,
} from "../../components/boardview/InteractiveBoardCanvas";

import { createNetConnectivityEngine } from "../../core/boardview/NetConnectivityEngine";
import type { NetConnectivityEngine }   from "../../core/boardview/NetConnectivityEngine";

import { seedMockConnectivityEngine }   from "./BoardMockDataFactory";

// ─────────────────────────────────────────────────────────────────────────────
// Viewport constants + pure math
// ─────────────────────────────────────────────────────────────────────────────

export const ZOOM_MIN  = 0.05;
export const ZOOM_MAX  = 40.0;
export const ZOOM_STEP = 0.12;

export function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

export function screenToWorld(sx: number, sy: number, vp: ViewportState): WorldPoint {
  return { x: (sx - vp.panX) / vp.zoom, y: (sy - vp.panY) / vp.zoom };
}

export function worldToScreen(wx: number, wy: number, vp: ViewportState): WorldPoint {
  return { x: wx * vp.zoom + vp.panX, y: wy * vp.zoom + vp.panY };
}

/**
 * Zoom viewport centered on a screen point.
 * Keeps the world point under the cursor stationary.
 * delta > 0 = zoom out, delta < 0 = zoom in.
 */
export function zoomViewport(
  vp: ViewportState,
  cursorX: number,
  cursorY: number,
  delta: number
): ViewportState {
  const factor   = 1 - delta * ZOOM_STEP;
  const nextZoom = clampZoom(vp.zoom * factor);
  const scale    = nextZoom / vp.zoom;
  return {
    zoom: nextZoom,
    panX: cursorX - scale * (cursorX - vp.panX),
    panY: cursorY - scale * (cursorY - vp.panY),
  };
}

/**
 * Compute initial fit-to-board viewport for given canvas dimensions.
 * Board is centered with padding.
 */
export function fitViewport(
  boardBounds: { width: number; height: number; x: number; y: number },
  canvasW: number,
  canvasH: number,
  padding = 40
): ViewportState {
  const fitZoom = clampZoom(Math.min(
    (canvasW - padding * 2) / Math.max(boardBounds.width,  1),
    (canvasH - padding * 2) / Math.max(boardBounds.height, 1)
  ));
  return {
    zoom: fitZoom,
    panX: (canvasW  - boardBounds.width  * fitZoom) / 2 - boardBounds.x * fitZoom,
    panY: (canvasH  - boardBounds.height * fitZoom) / 2 - boardBounds.y * fitZoom,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal inline implementations of engines not yet built
//
// These are ADAPTERS — thin stubs implementing the same interface contract
// as the real engines. They are replaced by real engines when available.
// Each is purpose-built and self-contained; none share state.
// ─────────────────────────────────────────────────────────────────────────────

// ── ViewportManager adapter ────────────────────────────────────────────────

export interface ViewportManagerAdapter {
  getViewport(): ViewportState;
  setViewport(vp: ViewportState): void;
  screenToWorld(sx: number, sy: number): WorldPoint;
  worldToScreen(wx: number, wy: number): WorldPoint;
  zoomAt(cursorX: number, cursorY: number, delta: number): void;
  fitToBoard(boardBounds: { x: number; y: number; width: number; height: number },
             canvasW: number, canvasH: number): void;
}

export function createViewportManager(initial?: Partial<ViewportState>): ViewportManagerAdapter {
  let _vp: ViewportState = {
    panX: initial?.panX ?? 0,
    panY: initial?.panY ?? 0,
    zoom: initial?.zoom ?? 1,
  };

  return {
    getViewport:  ()       => _vp,
    setViewport:  (vp)     => { _vp = vp; },
    screenToWorld:(sx, sy) => screenToWorld(sx, sy, _vp),
    worldToScreen:(wx, wy) => worldToScreen(wx, wy, _vp),
    zoomAt(cx, cy, delta)  { _vp = zoomViewport(_vp, cx, cy, delta); },
    fitToBoard(bounds, cw, ch) { _vp = fitViewport(bounds, cw, ch); },
  };
}

// ── HitDetectionEngine adapter ─────────────────────────────────────────────

export interface HitDetectionAdapter {
  hitTest(worldPt: WorldPoint, boardData: BoardData, radius?: number): string | null;
  hitTestRegion(topLeft: WorldPoint, bottomRight: WorldPoint, boardData: BoardData): string[];
}

export function createHitDetectionEngine(): HitDetectionAdapter {
  return {
    hitTest(worldPt, boardData, _radius = 0) {
      if (!boardData?.components) return null;
      // Reverse iteration: last rendered = topmost
      for (let i = boardData.components.length - 1; i >= 0; i--) {
        const c = boardData.components[i];
        if (
          worldPt.x >= c.x && worldPt.x <= c.x + c.width &&
          worldPt.y >= c.y && worldPt.y <= c.y + c.height
        ) return c.id;
      }
      return null;
    },
    hitTestRegion(tl, br, boardData) {
      if (!boardData?.components) return [];
      return boardData.components
        .filter((c) =>
          c.x + c.width  >= tl.x && c.x <= br.x &&
          c.y + c.height >= tl.y && c.y <= br.y
        )
        .map((c) => c.id)
        .sort(); // deterministic
    },
  };
}

// ── ComponentSelectionEngine adapter ──────────────────────────────────────

export interface SelectionAdapter {
  select(id: string): void;
  deselect(id: string): void;
  clearSelection(): void;
  getSelectedIds(): string[];
  isSelected(id: string): boolean;
  toggle(id: string): void;
}

export function createSelectionEngine(): SelectionAdapter {
  const _selected = new Set<string>();

  return {
    select(id)         { _selected.add(id); },
    deselect(id)       { _selected.delete(id); },
    clearSelection()   { _selected.clear(); },
    getSelectedIds()   { return [..._selected].sort(); }, // deterministic
    isSelected(id)     { return _selected.has(id); },
    toggle(id)         { _selected.has(id) ? _selected.delete(id) : _selected.add(id); },
  };
}

// ── OverlaySystem adapter ─────────────────────────────────────────────────

export interface OverlayAdapter {
  setHovered(id: string | null): void;
  setSelected(ids: string[]): void;
  getHovered(): string | null;
  getSelected(): string[];
  render(
    ctx: CanvasRenderingContext2D,
    boardData: BoardData,
    viewport: ViewportState
  ): void;
}

export function createOverlaySystem(): OverlayAdapter {
  let _hoveredId:   string | null  = null;
  let _selectedIds: string[]       = [];

  return {
    setHovered(id)  { _hoveredId   = id; },
    setSelected(ids){ _selectedIds = [...ids]; },
    getHovered()    { return _hoveredId; },
    getSelected()   { return [..._selectedIds]; },

    render(ctx, boardData, viewport) {
      if (!boardData?.components) return;

      const selectedSet = new Set(_selectedIds);
      const vp = viewport;

      ctx.save();

      for (const comp of boardData.components) {
        const isSelected = selectedSet.has(comp.id);
        const isHovered  = comp.id === _hoveredId;
        if (!isSelected && !isHovered) continue;

        const x0 = comp.x * vp.zoom + vp.panX;
        const y0 = comp.y * vp.zoom + vp.panY;
        const w  = comp.width  * vp.zoom;
        const h  = comp.height * vp.zoom;

        if (w < 0.5 || h < 0.5) continue;

        if (isSelected) {
          // Selection: solid cyan outline + translucent fill
          ctx.strokeStyle = "#00e5ff";
          ctx.lineWidth   = 2;
          ctx.fillStyle   = "rgba(0, 229, 255, 0.08)";
          ctx.setLineDash([]);
          ctx.fillRect(x0, y0, w, h);
          ctx.strokeRect(x0, y0, w, h);

          // Component id label at high enough zoom
          if (vp.zoom >= 0.4) {
            const fontSize = Math.max(8, Math.min(13, vp.zoom * 11));
            ctx.fillStyle  = "#00e5ff";
            ctx.font       = `${fontSize}px monospace`;
            ctx.textAlign  = "left";
            ctx.fillText(comp.id, x0 + 3, y0 - 3);
          }
        } else if (isHovered) {
          // Hover: dashed white outline
          ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
          ctx.lineWidth   = 1;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(x0, y0, w, h);
          ctx.setLineDash([]);
        }
      }

      ctx.restore();
    },
  };
}

// ── PCBRenderer adapter ───────────────────────────────────────────────────
//
// Renders board using the Canvas 2D API.
// Applies viewport transform internally so callers work in world space.

export interface PCBRendererAdapter {
  render(
    ctx: CanvasRenderingContext2D,
    boardData: BoardData,
    viewport: ViewportState
  ): void;
}

// Component type → fill color mapping (deterministic lookup table)
const TYPE_COLORS: Record<string, string> = {
  cpu:       "#1e4a1e",
  pmic:      "#1e2e4a",
  "rf-wifi": "#2a1e4a",
  shield:    "#2a2a1e",
  connector: "#3a2a1e",
  component: "#1e3a2a",
};
const TYPE_STROKE: Record<string, string> = {
  cpu:       "#3a8a3a",
  pmic:      "#3a5a8a",
  "rf-wifi": "#5a3a8a",
  shield:    "#5a5a3a",
  connector: "#7a5a3a",
  component: "#3a7a5a",
};

export function createPCBRenderer(): PCBRendererAdapter {
  return {
    render(ctx, boardData, viewport) {
      if (!boardData) return;
      const vp = viewport;

      ctx.save();

      // ── Board silhouette ────────────────────────────────────────────────
      const { bounds } = boardData;
      const bx0 = bounds.x * vp.zoom + vp.panX;
      const by0 = bounds.y * vp.zoom + vp.panY;
      const bw  = bounds.width  * vp.zoom;
      const bh  = bounds.height * vp.zoom;

      // Board fill
      ctx.fillStyle   = "#152a15";
      ctx.strokeStyle = "#2d5a2d";
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.rect(bx0, by0, bw, bh);
      ctx.fill();
      ctx.stroke();

      // Subtle grid texture (only at useful zoom levels)
      if (vp.zoom >= 0.15) {
        ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.lineWidth   = 0.5;
        const gridStep  = Math.max(8, 20 * vp.zoom);
        const startX    = bx0 + (gridStep - ((bx0) % gridStep)) % gridStep;
        const startY    = by0 + (gridStep - ((by0) % gridStep)) % gridStep;

        ctx.beginPath();
        for (let gx = startX; gx < bx0 + bw; gx += gridStep) {
          ctx.moveTo(gx, by0);
          ctx.lineTo(gx, by0 + bh);
        }
        for (let gy = startY; gy < by0 + bh; gy += gridStep) {
          ctx.moveTo(bx0, gy);
          ctx.lineTo(bx0 + bw, gy);
        }
        ctx.stroke();
      }

      // ── Components ──────────────────────────────────────────────────────
      for (const comp of boardData.components) {
        const cx0 = comp.x * vp.zoom + vp.panX;
        const cy0 = comp.y * vp.zoom + vp.panY;
        const cw  = comp.width  * vp.zoom;
        const ch  = comp.height * vp.zoom;

        if (cw < 0.5 || ch < 0.5) continue;

        const type = comp.type || "component";
        ctx.fillStyle   = TYPE_COLORS[type]   || "#1e3a2a";
        ctx.strokeStyle = TYPE_STROKE[type]   || "#3a7a5a";
        ctx.lineWidth   = Math.max(0.5, vp.zoom * 0.6);

        ctx.beginPath();
        ctx.rect(cx0, cy0, cw, ch);
        ctx.fill();
        ctx.stroke();

        // Component label — only at legible zoom
        if (vp.zoom >= 0.6 && cw > 18 && ch > 10) {
          const fontSize = Math.max(7, Math.min(11, cw * 0.22));
          ctx.fillStyle  = "rgba(255,255,255,0.55)";
          ctx.font       = `${fontSize}px monospace`;
          ctx.textAlign  = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(comp.id, cx0 + cw / 2, cy0 + ch / 2, cw - 4);
        }
      }

      ctx.restore();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BoardRuntime — the composed engine handle
// ─────────────────────────────────────────────────────────────────────────────

export interface BoardRuntimeCallbacks {
  /** Called when selection changes — bridge to React setState */
  onSelectionChange?: (ids: string[]) => void;
  /** Called when hover changes — bridge to React setState */
  onHoverChange?: (id: string | null) => void;
}

export interface BoardRuntime {
  // Engine accessors
  viewport:     ViewportManagerAdapter;
  hitDetection: HitDetectionAdapter;
  selection:    SelectionAdapter;
  overlay:      OverlayAdapter;
  pcbRenderer:  PCBRendererAdapter;
  connectivity: NetConnectivityEngine;

  // Board data
  getBoardData(): BoardData;
  setBoardData(data: BoardData): void;

  // Callback slots (filled by React component — passive architecture)
  callbacks: BoardRuntimeCallbacks;

  // Convenience: notify callbacks after selection change
  notifySelectionChange(): void;
  notifyHoverChange(): void;
}

/**
 * createBoardRuntime()
 *
 * Composes all engine adapters into a single runtime handle.
 * Accepts optional real engine implementations — falls back to adapters.
 *
 * @param boardData   Initial board data (or null for empty board)
 * @param overrides   Optional real engine implementations to use instead of adapters
 */
export function createBoardRuntime(
  boardData: BoardData | null,
  overrides?: Partial<{
    viewport:     ViewportManagerAdapter;
    hitDetection: HitDetectionAdapter;
    selection:    SelectionAdapter;
    overlay:      OverlayAdapter;
    pcbRenderer:  PCBRendererAdapter;
  }>
): BoardRuntime {
  // Instantiate engines — use overrides if provided
  const viewport     = overrides?.viewport     ?? createViewportManager();
  const hitDetection = overrides?.hitDetection ?? createHitDetectionEngine();
  const selection    = overrides?.selection    ?? createSelectionEngine();
  const overlay      = overrides?.overlay      ?? createOverlaySystem();
  const pcbRenderer  = overrides?.pcbRenderer  ?? createPCBRenderer();
  const connectivity = createNetConnectivityEngine();

  let _boardData: BoardData = boardData ?? { id: "empty", bounds: { x:0, y:0, width:0, height:0 }, components: [], nets: [] };

  // Seed connectivity engine from board data
  if (_boardData.components.length > 0) {
    seedMockConnectivityEngine(connectivity, _boardData);
  }

  const callbacks: BoardRuntimeCallbacks = {};

  const runtime: BoardRuntime = {
    viewport,
    hitDetection,
    selection,
    overlay,
    pcbRenderer,
    connectivity,
    callbacks,

    getBoardData: () => _boardData,

    setBoardData(data: BoardData) {
      _boardData = data;
      connectivity.clear();
      seedMockConnectivityEngine(connectivity, data);
    },

    notifySelectionChange() {
      callbacks.onSelectionChange?.(selection.getSelectedIds());
    },

    notifyHoverChange() {
      callbacks.onHoverChange?.(overlay.getHovered());
    },
  };

  return runtime;
}
