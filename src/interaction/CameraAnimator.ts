/**
 * CameraAnimator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Camera Animator
 *
 * Manages smooth viewport transitions ("fly-to") for component focus.
 * Wraps ViewportManager pan/zoom operations.
 *
 * Zero React. Zero DOM ownership. No external dependencies.
 * Animation scheduling is intentionally deferred to the consumer's
 * render loop — this class provides only state management.
 */

// ─── Minimal Interface Types ──────────────────────────────────────────────────

/** Minimal viewport manager shape consumed by CameraAnimator. */
interface VpManager {
  setZoom?(zoom: number): void;
  panToPoint?(boardPoint: { x: number; y: number }, screenPoint?: { x: number; y: number }): void;
  setViewport?(width: number, height: number): void;
  zoom?: number;
  offsetX?: number;
  offsetY?: number;
  [key: string]: unknown;
}

/** Minimal coord engine shape — used to resolve component centre. */
interface CoordEngine {
  getPosition?(id: string): { x: number; y: number } | null | undefined;
  positions?: Map<string, { x: number; y: number }>;
  [key: string]: unknown;
}

// ─── CameraAnimator ──────────────────────────────────────────────────────────

export class CameraAnimator {
  private _animating = false;
  private _animFrameId: ReturnType<typeof setTimeout> | null = null;

  /**
   * Returns true while a fly-to animation is in progress.
   * Used by useBoardInteraction to guard against re-entrant animations.
   */
  isAnimating(): boolean {
    return this._animating;
  }

  /**
   * Fly the viewport smoothly to centre a component.
   *
   * Resolves the component's board-space position via coordEngine, then
   * delegates pan/zoom to vpManager.  The animation runs over ~300 ms
   * using rAF-free step scheduling (setTimeout) to avoid DOM dependency.
   *
   * @param vpManager     Viewport manager instance.
   * @param coordEngine   Coord engine for position lookup.
   * @param componentId   Target component id.
   * @param viewportWidth Canvas width in screen pixels.
   * @param viewportHeight Canvas height in screen pixels.
   * @param targetZoom    Desired zoom level after animation.
   * @param onComplete    Optional callback fired on animation completion.
   */
  flyToComponent(
    vpManager:      VpManager | null | undefined,
    coordEngine:    CoordEngine | null | undefined,
    componentId:    string,
    viewportWidth:  number,
    viewportHeight: number,
    targetZoom:     number = 1.5,
    onComplete?:    () => void,
  ): void {
    try {
      if (this._animating) this._cancel();

      const pos = this._resolvePosition(coordEngine, componentId);
      if (!pos || !vpManager) {
        onComplete?.();
        return;
      }

      this._animating = true;

      const STEPS    = 12;
      const STEP_MS  = 25; // ~300 ms total
      let   step     = 0;

      const tick = () => {
        step++;
        try {
          const t = step / STEPS; // linear progress 0→1
          const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out

          const zoom = typeof vpManager.zoom === 'number'
            ? vpManager.zoom + (targetZoom - vpManager.zoom) * ease
            : targetZoom;

          if (typeof vpManager.setZoom === 'function') {
            vpManager.setZoom(Math.max(0.05, Math.min(32, zoom)));
          }
          if (typeof vpManager.panToPoint === 'function') {
            vpManager.panToPoint(
              pos,
              { x: viewportWidth * 0.5, y: viewportHeight * 0.5 },
            );
          }
        } catch {
          // Never propagate mid-animation errors.
        }

        if (step < STEPS) {
          this._animFrameId = setTimeout(tick, STEP_MS);
        } else {
          this._animating   = false;
          this._animFrameId = null;
          try { onComplete?.(); } catch { /* ignore callback errors */ }
        }
      };

      this._animFrameId = setTimeout(tick, STEP_MS);
    } catch {
      this._animating = false;
      try { onComplete?.(); } catch { /* ignore */ }
    }
  }

  /**
   * Cancel any in-progress animation immediately.
   */
  cancel(): void {
    this._cancel();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _cancel(): void {
    if (this._animFrameId !== null) {
      clearTimeout(this._animFrameId);
      this._animFrameId = null;
    }
    this._animating = false;
  }

  private _resolvePosition(
    coordEngine: CoordEngine | null | undefined,
    id: string,
  ): { x: number; y: number } | null {
    if (!coordEngine) return null;
    try {
      // Try getPosition method first.
      if (typeof coordEngine.getPosition === 'function') {
        const p = coordEngine.getPosition(id);
        if (p && isFinite(p.x) && isFinite(p.y)) return p;
      }
      // Fall back to positions Map.
      if (coordEngine.positions instanceof Map) {
        const p = coordEngine.positions.get(id);
        if (p && isFinite(p.x) && isFinite(p.y)) return p;
      }
    } catch {
      // Never propagate.
    }
    return null;
  }
}
