/**
 * PCBRenderer.ts
 *
 * Virtual PCB board renderer.
 * Renders board layout as a layered SVG structure.
 *
 * LAYER ORDER (bottom → top):
 *   1. silhouette      ← Track A / Milestone 1 (this session)
 *   2. texture         ← Track A (future session — NOT implemented here)
 *   3. copper          ← Track A (future session — NOT implemented here)
 *   4. vias            ← Track A (future session — NOT implemented here)
 *   5. components      ← existing
 *   6. markers         ← existing
 *   7. overlays        ← existing
 *
 * ARCHITECTURAL INVARIANTS:
 *   - Each layer is an isolated <g data-layer="..."> group.
 *   - Silhouette layer has pointer-events="none" — never intercepts interaction.
 *   - Silhouette generation errors are caught silently — missing silhouette
 *     never crashes the renderer or hides other layers.
 *   - No imports from parsers/, ai/, CoordinateEngine, NetGraphEngine, OCRPipeline.
 *   - All layer groups are present in the DOM in fixed order regardless of
 *     whether their content is populated. This ensures z-order stability
 *     as future layers are filled in.
 */

import React, { useMemo } from "react";
import {
  BoardSilhouetteGenerator,
  BoardLayout,
  BoardSilhouette,
} from "./BoardSilhouetteGenerator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PCBRendererProps {
  /** Normalized board layout — the single source of truth for all layers */
  layout: BoardLayout;

  /** Viewport width in pixels */
  viewportWidth: number;

  /** Viewport height in pixels */
  viewportHeight: number;

  /**
   * Children are rendered above the managed layers (overlays, markers, etc.)
   * Pass existing component/marker layers as children to preserve their
   * existing render logic untouched.
   */
  children?: React.ReactNode;

  /** Optional className for the root SVG element */
  className?: string;

  // -------------------------------------------------------------------------
  // Layer visibility toggles
  // Future Track A layers will add their own toggle props here.
  // -------------------------------------------------------------------------

  /** Show/hide the silhouette layer. Default: true */
  showSilhouette?: boolean;

  // showTexture?: boolean;   ← Track A Task 2 (PCB Textures)
  // showCopper?: boolean;    ← Track A Task 7 (Copper Simulation)
  // showVias?: boolean;      ← Track A Task 3 (Via Fields)
}

// ---------------------------------------------------------------------------
// Silhouette visual constants
// These live here (not in BoardSilhouetteGenerator) because they are
// rendering concerns, not geometry concerns.
// ---------------------------------------------------------------------------

const SILHOUETTE_FILL = "#1a2e1a";          // dark PCB green
const SILHOUETTE_STROKE = "#2d4a2d";        // slightly lighter edge
const SILHOUETTE_STROKE_WIDTH = 0.8;        // in layout units
const MOUNTING_HOLE_FILL = "transparent";   // show board color through holes
const MOUNTING_HOLE_STROKE = "#4a7a4a";
const MOUNTING_HOLE_STROKE_WIDTH = 0.6;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PCBRenderer: React.FC<PCBRendererProps> = ({
  layout,
  viewportWidth,
  viewportHeight,
  children,
  className,
  showSilhouette = true,
}) => {
  // -------------------------------------------------------------------------
  // Silhouette generation — memoized, deterministic
  // Recomputes only when layout reference changes.
  // -------------------------------------------------------------------------
  const silhouette = useMemo<BoardSilhouette | null>(() => {
    if (!showSilhouette) return null;
    try {
      return BoardSilhouetteGenerator.generate(layout);
    } catch (err) {
      // Silhouette generation must never crash the renderer.
      // Log for developer visibility; render without silhouette.
      console.warn("[PCBRenderer] Silhouette generation failed:", err);
      return null;
    }
  }, [layout, showSilhouette]);

  // -------------------------------------------------------------------------
  // viewBox — maps layout coordinate space to SVG viewport
  // The board occupies the full layout coordinate space (0,0)→(width,height).
  // -------------------------------------------------------------------------
  const viewBox = `0 0 ${layout.width} ${layout.height}`;

  return (
    <svg
      className={className}
      viewBox={viewBox}
      width={viewportWidth}
      height={viewportHeight}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", overflow: "hidden" }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* LAYER 1: Silhouette — bottom-most, non-interactive                  */}
      {/* ------------------------------------------------------------------ */}
      <g
        data-layer="silhouette"
        aria-hidden="true"
        style={{ pointerEvents: "none" }}
      >
        {silhouette && (
          <SilhouetteLayer silhouette={silhouette} />
        )}
      </g>

      {/* ------------------------------------------------------------------ */}
      {/* LAYER 2: Texture — Track A Task 2 (reserved, not implemented)       */}
      {/* ------------------------------------------------------------------ */}
      <g data-layer="texture" aria-hidden="true" style={{ pointerEvents: "none" }}>
        {/* PCBTextureLayer will render here in Track A Task 2 */}
      </g>

      {/* ------------------------------------------------------------------ */}
      {/* LAYER 3: Copper — Track A Task 7 (reserved, not implemented)        */}
      {/* ------------------------------------------------------------------ */}
      <g data-layer="copper" aria-hidden="true" style={{ pointerEvents: "none" }}>
        {/* CopperLayer will render here in Track A Task 7 */}
      </g>

      {/* ------------------------------------------------------------------ */}
      {/* LAYER 4: Vias — Track A Task 3 (reserved, not implemented)          */}
      {/* ------------------------------------------------------------------ */}
      <g data-layer="vias" aria-hidden="true" style={{ pointerEvents: "none" }}>
        {/* ViaFieldLayer will render here in Track A Task 3 */}
      </g>

      {/* ------------------------------------------------------------------ */}
      {/* LAYERS 5–7: Components, markers, overlays — existing, untouched     */}
      {/* Passed as children to preserve existing render logic.               */}
      {/* ------------------------------------------------------------------ */}
      {children}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// SilhouetteLayer — isolated sub-component
//
// Separated from PCBRenderer so that:
//   1. Its SVG structure can be changed without touching the renderer.
//   2. Future Track A layers can import SilhouetteLayer for reference
//      without importing the full renderer.
// ---------------------------------------------------------------------------

interface SilhouetteLayerProps {
  silhouette: BoardSilhouette;
}

const SilhouetteLayer: React.FC<SilhouetteLayerProps> = ({ silhouette }) => {
  return (
    <g data-sublayer="silhouette-content">
      {/* Board outline — filled board shape with connector notches subtracted */}
      <path
        d={silhouette.outerPath}
        fill={SILHOUETTE_FILL}
        stroke={SILHOUETTE_STROKE}
        strokeWidth={SILHOUETTE_STROKE_WIDTH}
        strokeLinejoin="round"
        fillRule="evenodd"
        vectorEffect="non-scaling-stroke"
      />

      {/* Mounting hole cutouts — rendered as stroked circles over the board fill */}
      {silhouette.cutouts.map((cutoutPath, index) => (
        <path
          key={`mounting-hole-${index}`}
          d={cutoutPath}
          fill={MOUNTING_HOLE_FILL}
          stroke={MOUNTING_HOLE_STROKE}
          strokeWidth={MOUNTING_HOLE_STROKE_WIDTH}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
};

// ---------------------------------------------------------------------------
// Export SilhouetteLayer for future Track A layer composition
// ---------------------------------------------------------------------------

export { SilhouetteLayer };
export type { SilhouetteLayerProps };
