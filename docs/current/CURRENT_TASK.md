# CURRENT_TASK.md
## Session: Track A — PCB Realism | Task 2 of 9
**Module:** PCBRenderer / PCBTextureLayer
**Feature:** PCB Texture Layer
**Session Type:** Visual Layer Implementation
**Token Budget:** ~10k–18k tokens
**Depends On:** Task 1 complete — `BoardSilhouetteGenerator.ts` stable
**Status:** READY TO EXECUTE

---

## OBJECTIVE

Implement a deterministic, silhouette-aware PCB substrate texture layer that
renders between the board silhouette and the future copper/component layers.

The output is a set of **SVG pattern definitions and filled paths** that simulate
the visual material properties of a real PCB substrate — fiber weave, surface
tonal variation, edge shading — derived purely from board dimensions and the
existing `BoardSilhouette` contract. No randomness. No runtime procedural
generation. No new runtime dependencies.

---

## SCOPE

| In Scope                                  | Out of Scope                        |
|-------------------------------------------|-------------------------------------|
| SVG `<pattern>` definitions               | Copper simulation                   |
| Silhouette-clipped texture fill           | Trace rendering                     |
| Deterministic tonal variation             | Via rendering                       |
| Board material substrate shading          | Electrical heatmaps                 |
| Edge vignette (border darkening)          | Animated / reactive effects         |
| Fiber weave approximation (SVG lines)     | WebGL or canvas-based rendering     |
| `PCBTextureLayer.ts` creation             | Shader systems                      |
| Minimal `PCBRenderer.ts` integration      | AI / diagnostic systems             |
|                                           | Overlay system modifications        |
|                                           | Interaction or hit-test modules     |

> If any implementation impulse points toward the Out of Scope column — stop.
> Document the need as a future task note and continue within scope.

---

## ALLOWED FILES

Only the following files may be **created or modified** in this session:

```
src/
  renderer/
    PCBTextureLayer.ts          ← create this file (texture logic + SVG output)
    utils/
      textureUtils.ts           ← create only if 3+ repeated SVG patterns emerge
    PCBRenderer.ts              ← minimal integration only (populate layer 2 group)
```

### Forbidden Files — DO NOT TOUCH

```
BoardSilhouetteGenerator.ts    ← stable; do not modify
CoordinateEngine.*
NetGraphEngine.*
OCRPipeline.*
parsers/**
ai/**
diagnostics/**
overlay/**
interaction/**
```

> If texture logic requires data not currently available in `BoardSilhouette`
> or `BoardLayout`, document the gap and define the minimal interface extension
> needed — do not reach into forbidden modules to retrieve it.

---

## DEPENDENCY CONTRACT

`PCBTextureLayer` consumes the output of `BoardSilhouetteGenerator` directly.
It must never re-derive the board silhouette or re-import the generator.

```typescript
// PCBTextureLayer receives:
import type { BoardSilhouette, BoardLayout } from "./BoardSilhouetteGenerator";

// PCBTextureLayer produces:
// A React functional component that renders SVG <defs> + <g> elements
// for insertion into the PCBRenderer layer stack.
```

The texture layer must be **entirely clipped** to the board silhouette outer
path. It must not render outside the board boundary under any zoom level or
viewport dimension.

---

## TARGET OUTCOME

At the end of this session, the following must be true:

1. **Substrate material appearance** — the board surface has the characteristic
   dark-green (or dark-blue, configurable) matte finish of a real PCB, with
   subtle tonal depth rather than a flat fill.
2. **Fiber weave simulation** — a very subtle diagonal or orthogonal line grid
   approximates the glass-fiber weave visible on real PCB substrates at close
   zoom. Must be low-contrast and non-distracting at normal zoom.
3. **Edge vignette** — board edges are slightly darker than the center,
   simulating the material thickness and realism of a physical board.
4. **Silhouette-correct clipping** — texture does not bleed outside the board
   outline, including chamfered corners and connector notch areas.
5. **Layer order preserved** — texture renders above silhouette, below
   copper/components/markers. DOM group order in `PCBRenderer` is unchanged.
6. **Deterministic output** — identical `BoardSilhouette` + `BoardLayout` input
   always produces identical SVG markup.
7. **Clean zoom behavior** — SVG `patternUnits` and `gradientUnits` configured
   so the texture scales correctly with board zoom without aliasing or tile
   seam artifacts.

---

## HARD CONSTRAINTS

Non-negotiable. Any violation is a **session failure condition**.

| Constraint                          | Rule                                                                      |
|-------------------------------------|---------------------------------------------------------------------------|
| No randomness                       | `Math.random()` is **forbidden**. All texture variation from input data.  |
| No runtime procedural generation    | Pattern geometry is computed once at render time from deterministic math. |
| No WebGL or Canvas                  | SVG only. Renderer is SVG-native.                                         |
| No new npm packages                 | Zero new dependencies. SVG + React only.                                  |
| Texture clipped to silhouette       | `clipPath` referencing `outerPath` is mandatory.                          |
| `pointer-events="none"` on all      | Texture layer and all its children must never intercept interaction.      |
| No hidden transforms                | Every coordinate operation is explicit and traceable.                     |
| No SVG filter abuse                 | `<feGaussianBlur>` allowed only for edge vignette — max 1 filter def.    |
| No modification of Task 1 output    | `BoardSilhouetteGenerator.ts` is frozen for this session.                 |
| No renderer architecture redesign   | PCBRenderer integration is additive only.                                 |

---

## IMPLEMENTATION SPECIFICATION

### 1. `PCBTextureLayer.ts`

**Responsibility:** Given a `BoardSilhouette` and `BoardLayout`, produce SVG
`<defs>` (pattern and clipPath definitions) and a `<g>` render group that
together create the PCB substrate texture appearance.

**Props contract:**

```typescript
export interface PCBTextureLayerProps {
  /** Board silhouette produced by BoardSilhouetteGenerator */
  silhouette: BoardSilhouette;

  /** Board layout — used for dimension-derived pattern scaling */
  layout: BoardLayout;

  /**
   * Base substrate color.
   * Defaults to standard PCB green. Future: pass per-device color.
   * Examples: "#1a3a1a" (green), "#1a1a3a" (blue), "#2a1a0a" (brown)
   */
  substrateColor?: string;

  /** Layer opacity — allows renderer to fade texture for diagnostic overlays */
  opacity?: number;
}
```

**Internal rendering structure:**

```
<g data-sublayer="texture-content" pointer-events="none">

  <defs>
    <!-- 1. ClipPath — board silhouette outer contour -->
    <clipPath id="board-clip-{uid}">
      <path d={silhouette.outerPath} />
    </clipPath>

    <!-- 2. Fiber weave pattern — SVG <pattern> -->
    <pattern id="fiber-weave-{uid}" ...>
      <!-- orthogonal lines at fixed pitch, deterministic from board dimensions -->
    </pattern>

    <!-- 3. Edge vignette gradient — radialGradient -->
    <radialGradient id="vignette-gradient-{uid}" ...>
      <stop offset="0%" stop-color="black" stop-opacity="0" />
      <stop offset="100%" stop-color="black" stop-opacity="0.28" />
    </radialGradient>
  </defs>

  <!-- Clipped texture group -->
  <g clip-path="url(#board-clip-{uid})">

    <!-- Layer A: substrate base fill -->
    <path d={silhouette.outerPath} fill={substrateColor} />

    <!-- Layer B: fiber weave pattern fill -->
    <path d={silhouette.outerPath} fill="url(#fiber-weave-{uid})" opacity={weaveOpacity} />

    <!-- Layer C: edge vignette overlay -->
    <rect x={bb.x} y={bb.y} width={bb.width} height={bb.height}
          fill="url(#vignette-gradient-{uid})" />

  </g>

</g>
```

**ID uniqueness strategy:**
- `uid` derived deterministically:
  `uid = \`${Math.round(layout.width)}-${Math.round(layout.height)}\``
- Stable across re-renders for the same board.
- Unique across different boards rendered simultaneously in the same SVG doc.
- Never uses `Math.random()` or `Date.now()`.

---

### 2. Fiber Weave Pattern — Specification

Simulates the glass-reinforced epoxy (FR4) substrate visible on real PCBs.

**Implementation:**
- SVG `<pattern>` with `patternUnits="userSpaceOnUse"`.
- Tile is a square; size: `tileSize = clamp(shorter * 0.012, 4, 18)` in layout units.
- Contents: two perpendicular `<line>` elements (horizontal + vertical).
- Line color: substrate color lightened by a fixed ratio (~18%).
- Line `stroke-width`: `tileSize * 0.08` — thin, sub-pixel at normal zoom.
- Line opacity: 0.10 — barely perceptible; non-distracting at overview zoom.
- Total tile child elements: ≤ 4.

**Pattern must not:**
- Use diagonal lines (alias badly at small zoom levels).
- Use any `<filter>` inside the pattern tile.
- Use `patternTransform` with rotation.

---

### 3. Edge Vignette — Specification

Simulates material edge darkening from PCB thickness and edge routing.

**Implementation (no filter required):**
- SVG `<radialGradient>` centered at `(layout.width / 2, layout.height / 2)`.
- `gradientUnits="userSpaceOnUse"`.
- `r = Math.max(layout.width, layout.height) * 0.65`.
- Center stop: `stop-color="black" stop-opacity="0"` at `0%`.
- Edge stop: `stop-color="black" stop-opacity="0.28"` at `100%`.
- Applied as a `<rect>` covering the full bounding box, inside the clip group.
- Introduce `<feGaussianBlur>` **only** if radial gradient approach produces
  visually insufficient depth — and only then, with `stdDeviation` ≤ 12.

---

### 4. `PCBRenderer.ts` — Minimal Integration

Populate the `data-layer="texture"` group reserved in Task 1.

**Exact change surface (≤ 8 lines of new code):**

```typescript
// 1. New import at top of file:
import { PCBTextureLayer } from "./PCBTextureLayer";

// 2. New optional prop:
showTexture?: boolean;  // default: true

// 3. Populate the texture group (was empty):
<g data-layer="texture" aria-hidden="true" style={{ pointerEvents: "none" }}>
  {showTexture !== false && silhouette && (
    <PCBTextureLayer silhouette={silhouette} layout={layout} />
  )}
</g>
```

No other changes to `PCBRenderer.ts`. Layer order, prop names, children
rendering, silhouette memo — all untouched.

> `silhouette` is already computed by the Task 1 `useMemo`. Pass it directly
> to `PCBTextureLayer` — do not call `BoardSilhouetteGenerator` a second time.

---

### 5. `textureUtils.ts` — Create Only If Needed

Create only if `PCBTextureLayer.ts` requires 3+ of these helpers:

| Helper                    | Signature                                      | Purpose                                 |
|---------------------------|------------------------------------------------|-----------------------------------------|
| `lightenHex(hex, ratio)`  | `(string, number) => string`                   | Lighten hex color for weave line tint   |
| `clamp(v, min, max)`      | `(number, number, number) => number`           | Numeric clamp                           |
| `boardUID(w, h)`          | `(number, number) => string`                   | Deterministic ID from board dimensions  |
| `weaveTileSize(shorter)`  | `(number) => number`                           | Clamped tile size computation           |

If fewer than 3 are needed, define them inline in `PCBTextureLayer.ts`.

---

## PERFORMANCE CONSTRAINTS

| Element                            | Limit                                          |
|------------------------------------|------------------------------------------------|
| SVG `<pattern>` tile child count   | ≤ 4 elements                                   |
| SVG `<filter>` definitions total   | ≤ 1 per board instance                         |
| SVG `<defs>` total entries         | ≤ 4 (clipPath + pattern + up to 2 gradients)   |
| `<feGaussianBlur>` stdDeviation    | ≤ 12 (larger values cause layout reflow)       |
| Clipped `<path>` count             | ≤ 3 inside the clip group                      |
| Re-render trigger                  | Only on `layout` or `silhouette` reference change |

> Verify: with 40+ component markers active in `PCBRenderer`, texture layer
> must not introduce frame drops. If it does: remove the weave pattern first,
> keep substrate fill + vignette only.

---

## ACCEPTANCE CRITERIA

Verify all before closing the session:

- [ ] `PCBTextureLayer` renders without error for minimal input:
      `silhouette = { outerPath: "M 0,0 L 100,0 L 100,50 L 0,50 Z", cutouts: [], boundingBox: {x:0,y:0,width:100,height:50} }`.
- [ ] Texture does not render outside board outline — `clipPath` references
      `silhouette.outerPath` and is applied to the texture group.
- [ ] Same input always produces identical SVG markup — determinism verified.
- [ ] No `Math.random()` in any new file (grep check).
- [ ] No import from any forbidden module (grep check).
- [ ] `pointer-events="none"` on `PCBTextureLayer` root group (grep check).
- [ ] `data-layer="texture"` group in `PCBRenderer` is populated (not empty).
- [ ] `data-layer` render order unchanged: silhouette → texture → copper →
      vias → children (grep/visual check).
- [ ] `showTexture={false}` cleanly suppresses the layer — no residual `<defs>`
      or groups rendered.
- [ ] No new `package.json` entries or `node_modules` additions.
- [ ] SVG pattern tile contains ≤ 4 child elements.
- [ ] SVG filter definitions ≤ 1 per board.
- [ ] `PCBRenderer.ts` integration required ≤ 8 new lines of code.

---

## VISUAL VERIFICATION CHECKLIST

Before closing, verify visually in the renderer:

- [ ] Board surface reads as matte PCB material — not a flat solid color.
- [ ] Fiber weave is subtle: perceptible on close zoom, invisible at thumbnail.
- [ ] Board edges have slight darkening — not harsh, not invisible.
- [ ] At 2× zoom: no tile seams visible in the weave pattern.
- [ ] At 0.25× zoom: uniform tonal depth — no pattern aliasing or moiré.
- [ ] Chamfered corners and notch areas correctly clipped — no texture bleed.
- [ ] Mounting hole areas show silhouette base color through the texture.

---

## WHAT TO PASTE AT SESSION START

1. This `CURRENT_TASK.md` (full content).
2. Current `PCBRenderer.ts` (full file).
3. `BoardSilhouetteGenerator.ts` — types section only (`BoardSilhouette`,
   `BoardLayout`, `BoardRegion`, `Point` interfaces).
4. A sample `BoardSilhouette` object for a known board (e.g. 800×400):
   paste the actual output from `BoardSilhouetteGenerator.generate()`.

**Do not paste:** Parser files, AI modules, CoordinateEngine, overlay modules,
or any file not listed above.

---

## SESSION FAILURE CONDITIONS

Stop and document state without forcing completion if:

- Texture requires electrical/copper data not in `BoardSilhouette` →
  document the data gap; do not reach into forbidden modules.
- Pattern tile causes measurable render lag with 40+ markers →
  fall back to substrate fill + vignette only; document limitation.
- `silhouette.outerPath` is not valid for `clipPath` use in the target
  browser/renderer → document the contract gap; do not patch Task 1 files.
- Integration into `PCBRenderer.ts` requires more than 8 new lines →
  redesign `PCBTextureLayer` to be more self-contained before proceeding.
- A new npm package is needed → find a pure SVG/math alternative or document
  the limitation; do not install.

---

## NEXT TASK (DO NOT START IN THIS SESSION)

```
NEXT: Track A — Task 3 of 9
Feature: Via Fields
Depends on: PCBTextureLayer.ts stable, BoardSilhouette contract stable
Files: ViaFieldLayer.ts, viaUtils.ts (if needed)
Renders into: data-layer="vias" (already reserved in PCBRenderer)
```

That task has its own `CURRENT_TASK.md`. Do not scope-creep into it.

---

## TRACK A LAYER DEPENDENCY MAP

```
PCBRenderer.ts
├── [layer 1] SilhouetteLayer        ← Task 1 ✅ COMPLETE
│     └── BoardSilhouetteGenerator   ← frozen
├── [layer 2] PCBTextureLayer        ← Task 2 ◀ THIS SESSION
│     └── consumes: BoardSilhouette (from layer 1 useMemo — do not re-generate)
├── [layer 3] CopperLayer            ← Task 7 (Copper Simulation) — future
├── [layer 4] ViaFieldLayer          ← Task 3 — next session
└── [layers 5–7] children            ← existing, untouched
```

---

*Session scoped under: ROADMAP_EXECUTION_PLAN.md → Track A → Milestone 1*
*Task granularity: single visual layer, single module boundary*
*Predecessor: Task 1 — Board Silhouettes ✅*
*Successor: Task 3 — Via Fields*
