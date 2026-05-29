import { PCBCanvas } from '@/rendering/board/PCBCanvas'

/**
 * InteractiveBoardCanvas.tsx
 * src/components/boardview/InteractiveBoardCanvas.tsx
 *
 * Interactive React canvas component connecting the deterministic PCB
 * rendering pipeline to a native HTMLCanvasElement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Ref-heavy: all engine state lives in useRef — zero re-renders from
 * engine mutations. React state is used only for UI-safe snapshots
 * (selectedIds, hoveredId) exposed via callbacks.
 *
 * Render loop:
 *   initCanvas → startRenderLoop → rAF → renderFrame
 *     clearRect → save → applyViewport → pcbRenderer → overlaySystem → restore
 *   cancelAnimationFrame on unmount
 *
 * Engine integration:
 *   Engines are defined via minimal local interfaces. When real engine
 *   implementations are available, pass them via the `engines` prop.
 *   All engine calls are guarded — a missing engine is a no-op, never a crash.
 *
 * Event ordering (deterministic):
 *   All listeners attached via addEventListener on the canvas element.
 *   Order: wheel → mousedown → mousemove → mouseup → mouseleave
 *   All removed on cleanup.
 *
 * High DPI:
 *   Canvas physical size = CSS size × devicePixelRatio.
 *   All transforms account for DPR via initial ctx.scale(dpr, dpr).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COORDINATE SYSTEM
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   World space:    board layout units (origin = board top-left)
 *   Screen space:   CSS pixels relative to canvas top-left
 *   Physical space: screen × devicePixelRatio (canvas internal)
 *
 *   screenToWorld(sx, sy) = { x: (sx - panX) / zoom, y: (sy - panY) / zoom }
 *   worldToScreen(wx, wy) = { x: wx * zoom + panX,   y: wy * zoom + panY   }
 */

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
} from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Engine interface contracts
//
// Minimal interfaces for each engine. The component depends on these shapes,
// not on concrete implementations. Pass real engines via the `engines` prop.
// ─────────────────────────────────────────────────────────────────────────────

export interface WorldPoint {
  x: number;
  y: number;
}

export interface BoardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Minimal render context passed to all engines */
export interface EngineRenderContext {
  ctx: CanvasRenderingContext2D;
  viewport: ViewportState;
  boardBounds: BoardBounds;
}

/** PCBRenderer — renders the board visual layer stack */
export interface IPCBRenderer {
  render(context: EngineRenderContext, boardData: BoardData): void;
}

/** ViewportManager — optional external viewport state controller */
export interface IViewportManager {
  getViewport(): ViewportState;
  setViewport(state: ViewportState): void;
  screenToWorld(sx: number, sy: number, viewport: ViewportState): WorldPoint;
  worldToScreen(wx: number, wy: number, viewport: ViewportState): WorldPoint;
}

/** HitDetectionEngine — returns component ids near a screen point */
export interface IHitDetectionEngine {
  hitTest(
    point: WorldPoint,
    boardData: BoardData,
    radius?: number
  ): string | null;
  hitTestRegion(
    topLeft: WorldPoint,
    bottomRight: WorldPoint,
    boardData: BoardData
  ): string[];
}

/** ComponentSelectionEngine — manages selection state */
export interface IComponentSelectionEngine {
  select(id: string): void;
  deselect(id: string): void;
  clearSelection(): void;
  getSelectedIds(): string[];
  isSelected(id: string): boolean;
}

/** OverlaySystem — renders highlights, selections, hover states */
export interface IOverlaySystem {
  render(
    context: EngineRenderContext,
    boardData: BoardData,
    selectedIds: string[],
    hoveredId: string | null
  ): void;
  setHovered(id: string | null): void;
  setSelected(ids: string[]): void;
}

/** ComponentMetadataEngine — returns display metadata for a component */
export interface IComponentMetadataEngine {
  getMetadata(id: string): Record<string, unknown> | null;
}

/** NetConnectivityEngine — electrical connectivity queries */
export interface INetConnectivityEngine {
  getConnectedComponents(id: string): { members: readonly string[] };
  areConnected(a: string, b: string): boolean;
}

/** Engine bundle — all optional; missing engines are no-ops */
export interface EngineBundle {
  pcbRenderer?: IPCBRenderer;
  viewportManager?: IViewportManager;
  hitDetection?: IHitDetectionEngine;
  selectionEngine?: IComponentSelectionEngine;
  overlaySystem?: IOverlaySystem;
  metadataEngine?: IComponentMetadataEngine;
  connectivityEngine?: INetConnectivityEngine;
}

// ─────────────────────────────────────────────────────────────────────────────
// Board data types
// ─────────────────────────────────────────────────────────────────────────────

export interface ComponentData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type?: string;
  nets?: string[];
  metadata?: Record<string, unknown>;
}

export interface BoardData {
  id?: string;
  bounds: BoardBounds;
  components: ComponentData[];
  nets?: Array<{ id: string; components: string[] }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Viewport state
// ─────────────────────────────────────────────────────────────────────────────

export interface ViewportState {
  /** Pan offset in CSS pixels */
  panX: number;
  panY: number;
  /** Zoom level — 1.0 = 100% */
  zoom: number;
}

const ZOOM_MIN = 0.05;
const ZOOM_MAX = 40.0;
const ZOOM_STEP = 0.12;  // zoom sensitivity per wheel tick

/** Pure coordinate transforms — no side effects */
function screenToWorld(sx: number, sy: number, vp: ViewportState): WorldPoint {
  return {
    x: (sx - vp.panX) / vp.zoom,
    y: (sy - vp.panY) / vp.zoom,
  };
}

function worldToScreen(wx: number, wy: number, vp: ViewportState): WorldPoint {
  return {
    x: wx * vp.zoom + vp.panX,
    y: wy * vp.zoom + vp.panY,
  };
}

/** Clamp zoom to [ZOOM_MIN, ZOOM_MAX] */
function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

/**
 * Compute new viewport after wheel zoom centered on a screen point.
 * Keeps the world point under the cursor stationary.
 *
 * Deterministic: same inputs → same output.
 */
function computeZoomedViewport(
  vp: ViewportState,
  cursorScreenX: number,
  cursorScreenY: number,
  delta: number
): ViewportState {
  const zoomFactor = 1 - delta * ZOOM_STEP;
  const nextZoom = clampZoom(vp.zoom * zoomFactor);
  const scale = nextZoom / vp.zoom;

  return {
    zoom: nextZoom,
    panX: cursorScreenX - scale * (cursorScreenX - vp.panX),
    panY: cursorScreenY - scale * (cursorScreenY - vp.panY),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Selection snapshot (UI-safe, serializable)
// ─────────────────────────────────────────────────────────────────────────────

export interface SelectionSnapshot {
  selectedIds: readonly string[];
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component props
// ─────────────────────────────────────────────────────────────────────────────

export interface InteractiveBoardCanvasProps {
  /** Board data to render — null/undefined renders blank canvas */
  boardData: BoardData | null | undefined;

  /** CSS width of the canvas element */
  width: number;

  /** CSS height of the canvas element */
  height: number;

  /** Engine bundle — all optional; provide real engines for full functionality */
  engines?: EngineBundle;

  /** Called when component selection changes */
  onSelectionChange?: (snapshot: SelectionSnapshot) => void;

  /** Called when hovered component changes — null means no hover */
  onHoverChange?: (componentId: string | null) => void;

  /** Initial viewport state — defaults to identity (no pan, zoom=1) */
  initialViewport?: Partial<ViewportState>;

  /** Background fill color for empty canvas area */
  backgroundColor?: string;

  /** Class name forwarded to the wrapper div */
  className?: string;

  /** Inline style forwarded to the wrapper div */
  style?: React.CSSProperties;

  /** Accessibility label */
  "aria-label"?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal render state (mutable, lives in useRef)
// ─────────────────────────────────────────────────────────────────────────────

interface RenderState {
  animFrameId: number;
  isRunning: boolean;
  viewport: ViewportState;
  dpr: number;
  canvasWidth: number;   // CSS pixels
  canvasHeight: number;  // CSS pixels
}

interface InteractionState {
  isPanning: boolean;
  panStartX: number;
  panStartY: number;
  panStartPanX: number;
  panStartPanY: number;
  hoveredId: string | null;
  selectedIds: string[];
  isDirty: boolean; // true = next rAF should re-render
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback renderer — used when no pcbRenderer engine is provided
// Renders a minimal placeholder so the canvas is never blank on valid boardData
// ─────────────────────────────────────────────────────────────────────────────

function renderFallbackBoard(
  ctx: CanvasRenderingContext2D,
  boardData: BoardData,
  vp: ViewportState
): void {
  const { bounds, components } = boardData;

  // Board outline
  const tl = worldToScreen(bounds.x, bounds.y, vp);
  const br = worldToScreen(bounds.x + bounds.width, bounds.y + bounds.height, vp);
  const w = br.x - tl.x;
  const h = br.y - tl.y;

  ctx.fillStyle = "#1a3a1a";
  ctx.strokeStyle = "#2d5a2d";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(tl.x, tl.y, w, h);
  ctx.fill();
  ctx.stroke();

  // Components
  for (const comp of components) {
    const ctl = worldToScreen(comp.x, comp.y, vp);
    const cbr = worldToScreen(comp.x + comp.width, comp.y + comp.height, vp);
    const cw = cbr.x - ctl.x;
    const ch = cbr.y - ctl.y;

    if (cw < 0.5 || ch < 0.5) continue; // skip sub-pixel components

    ctx.fillStyle = "#2a5a2a";
    ctx.strokeStyle = "#4a8a4a";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.rect(ctl.x, ctl.y, cw, ch);
    ctx.fill();
    ctx.stroke();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback overlay renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderFallbackOverlay(
  ctx: CanvasRenderingContext2D,
  boardData: BoardData,
  vp: ViewportState,
  selectedIds: string[],
  hoveredId: string | null
): void {
  if (!boardData?.components) return;

  const selectedSet = new Set(selectedIds);

  for (const comp of boardData.components) {
    const isSelected = selectedSet.has(comp.id);
    const isHovered  = comp.id === hoveredId;

    if (!isSelected && !isHovered) continue;

    const ctlScreen = worldToScreen(comp.x, comp.y, vp);
    const cbrScreen = worldToScreen(comp.x + comp.width, comp.y + comp.height, vp);
    const cw = cbrScreen.x - ctlScreen.x;
    const ch = cbrScreen.y - ctlScreen.y;

    if (cw < 0.5 || ch < 0.5) continue;

    if (isSelected) {
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
    } else if (isHovered) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
    }

    ctx.strokeRect(ctlScreen.x, ctlScreen.y, cw, ch);
    ctx.setLineDash([]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hit detection fallback — AABB test on component bounds
// ─────────────────────────────────────────────────────────────────────────────

function fallbackHitTest(
  worldPt: WorldPoint,
  boardData: BoardData
): string | null {
  if (!boardData?.components) return null;

  // Test in reverse order (last rendered = topmost visually)
  for (let i = boardData.components.length - 1; i >= 0; i--) {
    const comp = boardData.components[i];
    if (
      worldPt.x >= comp.x &&
      worldPt.x <= comp.x + comp.width &&
      worldPt.y >= comp.y &&
      worldPt.y <= comp.y + comp.height
    ) {
      return comp.id;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// InteractiveBoardCanvas component
// ─────────────────────────────────────────────────────────────────────────────

export const InteractiveBoardCanvas: React.FC<InteractiveBoardCanvasProps> = ({
  boardData,
  width,
  height,
  engines,
  onSelectionChange,
  onHoverChange,
  initialViewport,
  backgroundColor = "#111111",
  className,
  style,
  "aria-label": ariaLabel = "Interactive PCB board view",
}) => {

  // ── Refs ──────────────────────────────────────────────────────────────────

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Mutable render state — never triggers re-render
  const renderStateRef = useRef<RenderState>({
    animFrameId: 0,
    isRunning: false,
    viewport: {
      panX: initialViewport?.panX ?? 0,
      panY: initialViewport?.panY ?? 0,
      zoom: initialViewport?.zoom ?? 1,
    },
    dpr: 1,
    canvasWidth: width,
    canvasHeight: height,
  });

  // Mutable interaction state
  const interactionRef = useRef<InteractionState>({
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    panStartPanX: 0,
    panStartPanY: 0,
    hoveredId: null,
    selectedIds: [],
    isDirty: true,
  });

  // Stable refs for callbacks (avoids stale closure in event handlers)
  const boardDataRef  = useRef<BoardData | null | undefined>(boardData);
  const enginesRef    = useRef<EngineBundle | undefined>(engines);
  const onSelectionRef = useRef(onSelectionChange);
  const onHoverRef     = useRef(onHoverChange);

  // Keep refs current without re-registering event listeners
  useEffect(() => { boardDataRef.current  = boardData; }, [boardData]);
  useEffect(() => { enginesRef.current    = engines; }, [engines]);
  useEffect(() => { onSelectionRef.current = onSelectionChange; }, [onSelectionChange]);
  useEffect(() => { onHoverRef.current    = onHoverChange; }, [onHoverChange]);

  // ── UI state — only what React needs to know ──────────────────────────────

  const [_selectedIds, setSelectedIds] = useState<string[]>([]);
  const [_hoveredId, setHoveredId]     = useState<string | null>(null);

  // ── Coordinate helpers (stable, use renderStateRef) ──────────────────────

  const getViewport = useCallback((): ViewportState => {
    const ext = enginesRef.current?.viewportManager;
    return ext ? ext.getViewport() : renderStateRef.current.viewport;
  }, []);

  const setViewport = useCallback((vp: ViewportState): void => {
    renderStateRef.current.viewport = vp;
    enginesRef.current?.viewportManager?.setViewport(vp);
    interactionRef.current.isDirty = true;
  }, []);

  const getScreenToWorld = useCallback((sx: number, sy: number): WorldPoint => {
    const vp = getViewport();
    const ext = enginesRef.current?.viewportManager;
    return ext ? ext.screenToWorld(sx, sy, vp) : screenToWorld(sx, sy, vp);
  }, [getViewport]);

  // ── Selection helpers ─────────────────────────────────────────────────────

  const commitSelection = useCallback((ids: string[]): void => {
    interactionRef.current.selectedIds = ids;
    setSelectedIds([...ids]);

    const snapshot: SelectionSnapshot = {
      selectedIds: Object.freeze([...ids]),
      count: ids.length,
    };
    onSelectionRef.current?.(snapshot);
    interactionRef.current.isDirty = true;
  }, []);

  const commitHover = useCallback((id: string | null): void => {
    if (interactionRef.current.hoveredId === id) return;
    interactionRef.current.hoveredId = id;
    enginesRef.current?.overlaySystem?.setHovered(id);
    setHoveredId(id);
    onHoverRef.current?.(id);
    interactionRef.current.isDirty = true;
  }, []);

  // ── Hit detection ─────────────────────────────────────────────────────────

  const hitTest = useCallback((sx: number, sy: number): string | null => {
    const bd = boardDataRef.current;
    if (!bd) return null;

    const worldPt = getScreenToWorld(sx, sy);
    const ext = enginesRef.current?.hitDetection;

    return ext
      ? ext.hitTest(worldPt, bd)
      : fallbackHitTest(worldPt, bd);
  }, [getScreenToWorld]);

  // ── Canvas sizing + DPR ───────────────────────────────────────────────────

  const resizeCanvas = useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = renderStateRef.current.canvasWidth;
    const cssH = renderStateRef.current.canvasHeight;

    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width  = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    renderStateRef.current.dpr = dpr;
    interactionRef.current.isDirty = true;
  }, []);

  // ── Core render frame ─────────────────────────────────────────────────────

  const renderFrame = useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rs    = renderStateRef.current;
    const vp    = getViewport();
    const bd    = boardDataRef.current;
    const eng   = enginesRef.current;
    const inter = interactionRef.current;

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!bd) {
      interactionRef.current.isDirty = false;
      return;
    }

    // Apply DPR + viewport transform
    ctx.save();
    ctx.scale(rs.dpr, rs.dpr);
    ctx.translate(vp.panX, vp.panY);
    ctx.scale(vp.zoom, vp.zoom);

    // Board + layers render pass
    const engineCtx: EngineRenderContext = {
      ctx,
      viewport: vp,
      boardBounds: bd.bounds,
    };

    if (eng?.pcbRenderer) {
      eng.pcbRenderer.render(engineCtx, bd);
    } else {
      // Fallback: reset to screen space for fallback renderer
      // (fallback renderer handles its own transforms)
      ctx.restore();
      ctx.save();
      ctx.scale(rs.dpr, rs.dpr);
      renderFallbackBoard(ctx, bd, vp);
    }

    // Overlay render pass (selections, hover, highlights)
    if (eng?.overlaySystem) {
      eng.overlaySystem.render(engineCtx, bd, inter.selectedIds, inter.hoveredId);
    } else {
      // Fallback overlay — works in screen space
      ctx.restore();
      ctx.save();
      ctx.scale(rs.dpr, rs.dpr);
      renderFallbackOverlay(ctx, bd, vp, inter.selectedIds, inter.hoveredId);
    }

    ctx.restore();

    inter.isDirty = false;
  }, [backgroundColor, getViewport]);

  // ── Animation loop ────────────────────────────────────────────────────────

  const scheduleFrame = useCallback((): void => {
    const rs = renderStateRef.current;
    if (!rs.isRunning) return;

    rs.animFrameId = requestAnimationFrame(() => {
      renderFrame();
      scheduleFrame();
    });
  }, [renderFrame]);

  const startRenderLoop = useCallback((): void => {
    const rs = renderStateRef.current;
    if (rs.isRunning) return;
    rs.isRunning = true;
    scheduleFrame();
  }, [scheduleFrame]);

  const stopRenderLoop = useCallback((): void => {
    const rs = renderStateRef.current;
    rs.isRunning = false;
    if (rs.animFrameId) {
      cancelAnimationFrame(rs.animFrameId);
      rs.animFrameId = 0;
    }
  }, []);

  // ── Event handlers — attached imperatively for stable refs ────────────────

  const handleWheel = useCallback((e: WheelEvent): void => {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? 1 : -1;
    const nextVp = computeZoomedViewport(getViewport(), sx, sy, delta);
    setViewport(nextVp);
  }, [getViewport, setViewport]);

  const handleMouseDown = useCallback((e: MouseEvent): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Middle mouse → pan
    if (e.button === 1) {
      e.preventDefault();
      const vp = getViewport();
      interactionRef.current.isPanning = true;
      interactionRef.current.panStartX = e.clientX;
      interactionRef.current.panStartY = e.clientY;
      interactionRef.current.panStartPanX = vp.panX;
      interactionRef.current.panStartPanY = vp.panY;
      canvas.style.cursor = "grabbing";
      return;
    }

    // Left click → hit test + select
    if (e.button === 0) {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const hitId = hitTest(sx, sy);

      if (hitId) {
        const sel = enginesRef.current?.selectionEngine;
        if (sel) {
          sel.clearSelection();
          sel.select(hitId);
          commitSelection(sel.getSelectedIds());
        } else {
          commitSelection([hitId]);
        }
      } else {
        // Empty click → clear selection
        const sel = enginesRef.current?.selectionEngine;
        if (sel) sel.clearSelection();
        commitSelection([]);
      }
    }
  }, [getViewport, hitTest, commitSelection, setViewport]);

  const handleMouseMove = useCallback((e: MouseEvent): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const inter = interactionRef.current;

    // Pan
    if (inter.isPanning) {
      const dx = e.clientX - inter.panStartX;
      const dy = e.clientY - inter.panStartY;
      setViewport({
        ...getViewport(),
        panX: inter.panStartPanX + dx,
        panY: inter.panStartPanY + dy,
      });
      return;
    }

    // Hover detection
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const hitId = hitTest(sx, sy);
    commitHover(hitId);
    canvas.style.cursor = hitId ? "pointer" : "default";
  }, [getViewport, setViewport, hitTest, commitHover]);

  const handleMouseUp = useCallback((e: MouseEvent): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (e.button === 1) {
      interactionRef.current.isPanning = false;
      canvas.style.cursor = "default";
    }
  }, []);

  const handleMouseLeave = useCallback((): void => {
    const inter = interactionRef.current;
    inter.isPanning = false;
    commitHover(null);
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = "default";
  }, [commitHover]);

  // ── ResizeObserver ────────────────────────────────────────────────────────

  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // ── Init + cleanup effect ─────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initial size
    renderStateRef.current.canvasWidth  = width;
    renderStateRef.current.canvasHeight = height;
    resizeCanvas();

    // ResizeObserver on the wrapper div
    const wrapper = wrapperRef.current;
    if (wrapper && typeof ResizeObserver !== "undefined") {
      resizeObserverRef.current = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width: w, height: h } = entry.contentRect;
        renderStateRef.current.canvasWidth  = w;
        renderStateRef.current.canvasHeight = h;
        resizeCanvas();
      });
      resizeObserverRef.current.observe(wrapper);
    }

    // Attach event listeners
    canvas.addEventListener("wheel",      handleWheel,      { passive: false });
    canvas.addEventListener("mousedown",  handleMouseDown);
    canvas.addEventListener("mousemove",  handleMouseMove);
    canvas.addEventListener("mouseup",    handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    // Start render loop
    startRenderLoop();

    // Cleanup
    return () => {
      stopRenderLoop();

      canvas.removeEventListener("wheel",      handleWheel);
      canvas.removeEventListener("mousedown",  handleMouseDown);
      canvas.removeEventListener("mousemove",  handleMouseMove);
      canvas.removeEventListener("mouseup",    handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseLeave);

      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — all handlers are stable refs

  // ── Canvas size sync ──────────────────────────────────────────────────────

  useEffect(() => {
    renderStateRef.current.canvasWidth  = width;
    renderStateRef.current.canvasHeight = height;
    resizeCanvas();
  }, [width, height, resizeCanvas]);

  // ── Initial viewport fit-to-board ─────────────────────────────────────────

  const hasFitRef = useRef(false);

  useEffect(() => {
    if (!boardData || hasFitRef.current) return;
    if (initialViewport?.zoom || initialViewport?.panX) return; // caller provided viewport

    const rs = renderStateRef.current;
    const { bounds } = boardData;

    if (bounds.width <= 0 || bounds.height <= 0) return;

    const padding = 40;
    const fitZoom = clampZoom(Math.min(
      (rs.canvasWidth  - padding * 2) / bounds.width,
      (rs.canvasHeight - padding * 2) / bounds.height
    ));

    const panX = (rs.canvasWidth  - bounds.width  * fitZoom) / 2 - bounds.x * fitZoom;
    const panY = (rs.canvasHeight - bounds.height * fitZoom) / 2 - bounds.y * fitZoom;

    setViewport({ zoom: fitZoom, panX, panY });
    hasFitRef.current = true;
  }, [boardData, initialViewport, setViewport]);

  // ── Viewport exposed via imperative handle ────────────────────────────────

  /**
   * Public API helpers — exposed via ref or callback if needed.
   * Kept as stable callbacks for potential forwardRef use.
   */
  const zoomToPoint = useCallback((
    worldX: number,
    worldY: number,
    targetZoom: number
  ): void => {
    const vp = getViewport();
    const { x: sx, y: sy } = worldToScreen(worldX, worldY, vp);
    const next = computeZoomedViewport(vp, sx, sy, 0); // no delta
    setViewport({ ...next, zoom: clampZoom(targetZoom) });
  }, [getViewport, setViewport]);

  const resetViewport = useCallback((): void => {
    hasFitRef.current = false;
    // Trigger fit on next boardData effect
    if (boardDataRef.current) {
      hasFitRef.current = false;
    }
  }, []);

  // Expose public API on canvas element as custom property for E2E testing
  useEffect(() => {
    const canvas = canvasRef.current as (HTMLCanvasElement & {
      __boardAPI?: {
        screenToWorld: (sx: number, sy: number) => WorldPoint;
        worldToScreen: (wx: number, wy: number) => WorldPoint;
        getViewport: () => ViewportState;
        zoomToPoint: (wx: number, wy: number, z: number) => void;
        resetViewport: () => void;
      };
    }) | null;

    if (!canvas) return;

    canvas.__boardAPI = {
      screenToWorld: (sx, sy) => getScreenToWorld(sx, sy),
      worldToScreen: (wx, wy) => worldToScreen(wx, wy, getViewport()),
      getViewport,
      zoomToPoint,
      resetViewport,
    };
  }, [getScreenToWorld, getViewport, zoomToPoint, resetViewport]);

  // ── Render ────────────────────────────────────────────────────────────────

  const wrapperStyle = useMemo<React.CSSProperties>(() => ({
    position: "relative",
    width,
    height,
    overflow: "hidden",
    userSelect: "none",
    ...style,
  }), [width, height, style]);

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={wrapperStyle}
      role="application"
      aria-label={ariaLabel}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          touchAction: "none",
        }}
      />
    </div>
  );
};
