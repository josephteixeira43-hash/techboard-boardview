# ARCHITECTURE_RULES.md

**Document type:** Permanent Engineering Contract  
**Module:** `techboard-boardview`  
**Authority:** Senior Systems Architecture  
**Status:** Binding — all contributors must comply  
**Version:** 1.0.0  

> This document is the authoritative engineering contract for Tech Board Pro.  
> Rules are binding. Violations must be corrected before merge, not after.  
> When in doubt, consult this document before writing code.

---

## Table of Contents

1. [Architectural Invariants](#1-architectural-invariants)
2. [Rendering Rules](#2-rendering-rules)
3. [Coordinate System Rules](#3-coordinate-system-rules)
4. [Overlay Synchronization Rules](#4-overlay-synchronization-rules)
5. [Virtual Layout Constraints](#5-virtual-layout-constraints)
6. [Net Graph Rules](#6-net-graph-rules)
7. [OCR / PDF Extraction Constraints](#7-ocr--pdf-extraction-constraints)
8. [Smart Grouping Rules](#8-smart-grouping-rules)
9. [Layer Virtualization Rules](#9-layer-virtualization-rules)
10. [Performance Constraints](#10-performance-constraints)
11. [State Management Rules](#11-state-management-rules)
12. [Type System Rules](#12-type-system-rules)
13. [Parser Isolation Rules](#13-parser-isolation-rules)
14. [BRD / FZ Compatibility Rules](#14-brd--fz-compatibility-rules)
15. [AI Diagnostic Engine Boundaries](#15-ai-diagnostic-engine-boundaries)
16. [Global Anti-Patterns](#16-global-anti-patterns)

---

## 1. Architectural Invariants

These invariants are unconditional. No exception, optimization, or deadline overrides them.

| ID | Invariant |
|---|---|
| **INV-01** | `Math.random()` is prohibited everywhere in the codebase, including tests, mocks, and utilities. |
| **INV-02** | `BoardComponent` is the sole abstraction through which anything is rendered on the board canvas. |
| **INV-03** | `CoordinateEngine` is the single source of truth for all spatial data. No coordinate is computed outside it. |
| **INV-04** | All rendering output is deterministic: identical input always produces identical output, across sessions and environments. |
| **INV-05** | No module imports internal symbols from a sibling module. All cross-module communication is through declared public API surfaces. |
| **INV-06** | Overlays never compute their own screen coordinates. They consume positions exclusively from `CoordinateEngine`. |
| **INV-07** | No Konva node is instantiated outside a `BoardComponent` boundary. |
| **INV-08** | Geometry calculations are never duplicated. One authoritative site computes each geometric fact; all consumers reference it. |
| **INV-09** | Hidden or implicit transforms are prohibited. Every spatial transform is declared, named, and owned by `CoordinateEngine`. |
| **INV-10** | Parser modules are isolated in `formats/`. They have no dependency on the rendering engine, overlay system, or React component tree. |

---

## 2. Rendering Rules

### R-01 — Deterministic Output

Every render pass must produce identical output given identical input state. Rendering must not depend on:

- Wall-clock time
- Random values
- Uninitialized or undefined state
- Browser-specific layout quirks not abstracted by the engine

**Violation:**
```
// Using timestamp as a visual seed — non-deterministic
const opacity = (Date.now() % 100) / 100;
```

**Compliant:**
```
// Opacity is a declared prop derived from stable component state
const opacity = component.isHighlighted ? 1.0 : 0.4;
```

---

### R-02 — BoardComponent as Canonical Abstraction

Every entity rendered on the board canvas — pad, trace, via, component body, overlay, annotation — must be expressed as a `BoardComponent`. No exceptions for "simple" or "temporary" elements.

**Violation:**
```
// Creating a Konva rect directly in a React component
const rect = new Konva.Rect({ x: 100, y: 200, width: 50, height: 50 });
layer.add(rect);
```

**Compliant:**
```
// Expressing the element as a BoardComponent with declared props
<BoardComponent id="pad-U4-A3" type="pad" geometry={padGeometry} />
```

---

### R-03 — No Inline Geometry

Raw numeric geometry values (x, y, width, height, rotation) must not be hardcoded inline in component JSX or Konva node config. All geometry flows from the type system through engine-resolved props.

**Violation:**
```
<BoardComponent x={142} y={88} width={24} height={12} />
```

**Compliant:**
```
<BoardComponent id="R12" geometry={engine.resolveGeometry("R12")} />
```

---

### R-04 — Konva Layer Ownership

Each Konva layer has a single declared owner. No two modules write to the same Konva layer. Layer ownership is declared in the module manifest and enforced at review time.

---

### R-05 — No Direct Canvas Mutation

React components and hooks must not call Konva imperative APIs (`node.move()`, `layer.draw()`, `stage.batchDraw()`) directly. All canvas mutations are mediated through `BoardComponent` lifecycle or explicit engine flush calls.

---

## 3. Coordinate System Rules

### C-01 — Single Source of Spatial Truth

`CoordinateEngine` owns all coordinate resolution. This includes:

- Board-space to canvas-space transforms
- Zoom and pan state
- Viewport clipping bounds
- Component anchor points
- Overlay attachment points

No other module performs these calculations. Any module that needs a screen position requests it from `CoordinateEngine`.

**Violation:**
```
// Overlay computing its own screen position from zoom level
const screenX = boardX * zoomLevel + panOffsetX;
```

**Compliant:**
```
// Overlay requesting position from CoordinateEngine
const screenPos = coordinateEngine.toScreen({ x: boardX, y: boardY });
```

---

### C-02 — Coordinate Space Declarations

Every variable or prop that holds a coordinate value must declare its coordinate space in its name or type annotation.

Accepted naming conventions:
- `boardX`, `boardY` — board-space coordinates (PCB units)
- `screenX`, `screenY` — canvas-space coordinates (pixels)
- `viewportX`, `viewportY` — viewport-relative coordinates

Mixing coordinate spaces in a single expression without an explicit `CoordinateEngine` transform is a violation.

**Violation:**
```
const midX = (boardX + screenX) / 2; // coordinate space mismatch, undefined result
```

**Compliant:**
```
const boardMid = { x: (boardA.x + boardB.x) / 2, y: (boardA.y + boardB.y) / 2 };
const screenMid = coordinateEngine.toScreen(boardMid);
```

---

### C-03 — No Hidden Transforms

Every transform applied to a coordinate must be explicit, named, and owned by `CoordinateEngine`. Implicit transforms — CSS `transform`, Konva `offsetX/offsetY` applied outside declared engine state, or undeclared stage scaling — are prohibited.

---

### C-04 — Zoom and Pan are Engine State

Zoom level and pan offset are state owned exclusively by `CoordinateEngine`. No component holds a local copy of zoom or pan. Components that need to respond to zoom/pan changes subscribe to engine events or read from the engine's reactive state surface.

---

### C-05 — Board Origin is Invariant

The board coordinate origin (0, 0) is defined by the loaded board format and does not change during a session. It is set once at board load time by the format parser and registered with `CoordinateEngine`. It must not be mutated after registration.

---

## 4. Overlay Synchronization Rules

### O-01 — Overlays are Coordinate Consumers

Overlays (annotations, highlights, tooltips, measurements) must not own or compute coordinates. They declare a `boardTarget` (a board-space point or component ID) and receive a resolved screen position from `CoordinateEngine`.

**Violation:**
```
// Annotation computing its own position
const pos = { x: component.x * zoom + panX, y: component.y * zoom + panY };
```

**Compliant:**
```
// Annotation declaring a target; engine resolves position
<AnnotationOverlay targetId="C22" label="Check ESR" />
// CoordinateEngine resolves C22's screen position on render
```

---

### O-02 — Overlays Re-resolve on Every Transform Change

When zoom, pan, or viewport changes, all active overlays must re-resolve their screen positions from `CoordinateEngine`. Caching a screen position across transform changes is prohibited.

---

### O-03 — Overlay Z-Order is Declared

Every overlay type has a declared z-order in the layer manifest. No overlay dynamically computes or mutates its z-order at runtime. Z-order disputes between overlay types are resolved in the manifest, not in component code.

---

### O-04 — No Overlay-to-Overlay Coordinate Dependencies

An overlay must not derive its position from another overlay's position. All overlays anchor independently to board-space targets via `CoordinateEngine`. Chained overlay positioning creates undeclared transform dependencies and is prohibited.

---

## 5. Virtual Layout Constraints

### VL-01 — Virtual Layout is Engine-Computed

The virtual layout (logical bounds, component slots, row/column grid if applicable) is computed by the layout engine, not by individual components. Components declare their `boardId` and receive their resolved layout slot.

---

### VL-02 — Layout Slots are Stable Across Sessions

Layout slot assignments must be deterministic and stable. The same board data must always produce the same layout assignments. Assignments must not depend on render order, component insertion order, or any runtime-variable input.

---

### VL-03 — No Layout Negotiation Between Components

Components do not communicate layout preferences to each other. There is no sibling-to-sibling layout negotiation. All layout is resolved top-down through the layout engine.

---

### VL-04 — Overflow Behavior is Declared

If a component's geometry extends beyond its declared layout slot, the overflow behavior (clip, scale-to-fit, flag-as-error) is declared in the component's type definition. Components do not handle overflow themselves.

---

## 6. Net Graph Rules

### N-01 — Net Graph is Immutable During Render

The net graph (the connectivity graph of all electrical nets on the board) must not be mutated during a render pass. Mutations to the net graph are queued and applied between render cycles.

---

### N-02 — Net IDs are Stable

Net identifiers are assigned by the format parser at board-load time and do not change during a session. No runtime process reassigns or regenerates net IDs.

---

### N-03 — Net Highlighting is an Overlay

Net highlight state (highlighting all pads and traces belonging to a net) is expressed as an overlay configuration, not as a mutation of the net graph or component geometry. The net graph is read-only during highlight operations.

---

### N-04 — No Derived Net Geometry

Net geometry (the visual path of a trace, the extents of a net) is not recomputed by overlay or diagnostic modules. It is computed once by the rendering engine from parser output and accessed by reference.

---

## 7. OCR / PDF Extraction Constraints

### OCR-01 — Extraction Output is Typed

All OCR and PDF extraction output must conform to declared types before entering the board data pipeline. Raw extraction strings must not be passed directly to rendering or engine modules.

---

### OCR-02 — Extraction is Isolated from Rendering

OCR and PDF extraction pipelines execute independently of the rendering engine. They produce structured board data as output. They have no dependency on `CoordinateEngine`, `BoardComponent`, or any Konva module.

---

### OCR-03 — Extraction Results are Deterministic

Given identical input files, the extraction pipeline must produce identical structured output. Extraction must not use probabilistic or non-deterministic post-processing steps without an explicit determinism guarantee.

---

### OCR-04 — Confidence Scores are Preserved but Not Rendered

If the extraction pipeline produces confidence scores for recognized elements, those scores are preserved in the structured output type. They are not directly rendered as visual elements unless explicitly requested through an overlay declaration.

---

### OCR-05 — Failed Extractions are Typed Errors

Extraction failures produce typed error values, not null, undefined, or thrown exceptions swallowed by a catch block. Downstream modules handle typed extraction errors explicitly.

---

## 8. Smart Grouping Rules

### SG-01 — Grouping is a View Concern

Smart grouping (visually clustering related components — bypass caps, decoupling networks, power rails) is a view-layer concern. It does not mutate the underlying board model or net graph.

---

### SG-02 — Group Membership is Deterministic

Group membership for a given component must be deterministic given the same board data. Grouping algorithms must not use random seeds, floating-point-sensitive heuristics, or render-order-dependent logic.

---

### SG-03 — Groups are Expressed as Overlay Configurations

A smart group is rendered as a set of overlay configurations (bounding region, label, highlight color). It is not a new canvas entity type. The existing overlay system handles its rendering.

---

### SG-04 — Grouping Algorithms Live in the Engine Layer

Smart grouping algorithms are implemented in the engine layer, not in React components or Konva node factories. Components consume group membership as a resolved prop.

---

## 9. Layer Virtualization Rules

### LV-01 — Layers are Declared, Not Discovered

All board layers (copper top, copper bottom, silkscreen, solder mask, drill, courtyard, etc.) are declared in the layer manifest at board-load time. The rendering engine does not discover layers dynamically at render time.

---

### LV-02 — Layer Visibility is Engine State

Layer visibility toggles are owned by the engine as explicit state. No individual `BoardComponent` holds a local visibility flag that could diverge from engine state.

---

### LV-03 — Off-Screen Layers are Not Rendered

Layers that are toggled off must not contribute to the Konva scene graph. Their `BoardComponent` instances are unmounted or their Konva nodes are removed from the stage. They must not remain as invisible nodes consuming memory and hit-test budget.

---

### LV-04 — Layer Z-Order is Immutable

The stacking order of layers is defined once in the layer manifest. It does not change during a session. No user action or diagnostic state reorders layers at runtime unless explicitly declared as a supported operation in the manifest.

---

## 10. Performance Constraints

### P-01 — No Synchronous Work in the Render Path

All expensive computation (geometry resolution, net traversal, group membership calculation) must be completed before the render pass begins. The render path receives already-resolved data. It does not trigger computation.

---

### P-02 — Component Count Drives Virtualization Threshold

If the number of `BoardComponent` instances in the active viewport exceeds the declared virtualization threshold (defined in the engine configuration), off-viewport components must be virtualized (removed from the Konva scene graph). The threshold is a configuration value, not a hardcoded constant.

---

### P-03 — No Layout Thrashing

Reading layout properties (position, size, bounds) and writing layout properties must not be interleaved within a single render cycle. All reads happen before all writes.

---

### P-04 — Overlay Count is Bounded

The maximum number of simultaneously active overlays is declared in the engine configuration. Requests to activate overlays beyond this bound are queued, not silently dropped or rendered as degraded overlays.

---

### P-05 — Hit Testing is Engine-Mediated

User interaction hit testing (pointer events mapped to board components) is handled by `HitEngine`, not by individual Konva node event listeners attached in `BoardComponent`. Components register with `HitEngine`; they do not self-register for pointer events.

---

## 11. State Management Rules

### SM-01 — Board State is Serializable

The complete board state (loaded board data, active overlays, layer visibility, zoom/pan, active nets, grouping config) must be fully serializable to a plain JSON structure at any point during a session.

---

### SM-02 — No Local State for Shared Concerns

State that affects more than one `BoardComponent` must not live as local React state inside a single component. It lives in the engine state surface and is consumed by components as props or context.

---

### SM-03 — State Mutations are Explicit

No module mutates engine state directly through object mutation. All state changes go through declared state transition functions. Object spread, `Object.assign`, or direct property assignment on engine state objects are prohibited outside of state transition functions.

---

### SM-04 — Derived State is Not Stored

Values that can be computed from existing state (e.g., screen position derived from board position and zoom) are not stored in state. They are computed on demand by `CoordinateEngine` or the appropriate engine module.

---

### SM-05 — Undo/Redo Applies to User Actions Only

The undo/redo stack (if present) tracks user-initiated actions only. Internal engine state transitions, overlay auto-updates, and background data loads are not undo-able.

---

## 12. Type System Rules

### T-01 — All Engine Interfaces are Typed

Every public function signature in every engine module (`CoordinateEngine`, `LayerEngine`, `HitEngine`, `LayoutEngine`) is fully typed. No `any` types on public interfaces. `unknown` is acceptable as an input type where input validation occurs immediately.

---

### T-02 — Coordinate Types Encode Space

Coordinate types declare their coordinate space in the type name or via a branded type pattern. `BoardPoint`, `ScreenPoint`, and `ViewportPoint` are distinct types. Functions that accept board-space coordinates must not accept screen-space coordinates without an explicit conversion.

---

### T-03 — BoardComponent Props are Fully Typed

The props interface for `BoardComponent` is the canonical type for all renderable board entities. Extending it for new entity types is done through declared discriminated union members, not through optional props or `any`.

---

### T-04 — Parser Output Types are Versioned

Types produced by format parsers (`BrdBoardData`, `FzBoardData`, `OcrBoardData`) carry a schema version field. The engine validates schema version at board-load time and rejects incompatible versions with a typed error.

---

### T-05 — No Type Assertions to Bypass Validation

Type assertions (`as SomeType`, `!` non-null assertions) are prohibited on data that has not been validated. Assertions are only acceptable on data that has passed through an explicit runtime validation function immediately prior.

---

## 13. Parser Isolation Rules

### PI-01 — Parsers Have No Rendering Dependencies

Format parsers (`formats/brd`, `formats/fz`, `formats/ocr`) must not import from `engine/`, `board/`, `overlays/`, or any React component module. Their only outputs are typed data structures conforming to the board data schema.

---

### PI-02 — Parsers Are Pure Functions

Format parsers are pure functions: given identical input bytes, they return identical structured output. They have no side effects and hold no internal state between invocations.

---

### PI-03 — Parsers Do Not Validate Business Rules

Parsers validate structural format compliance (is this a valid BRD file?). They do not validate business rules (are these net names consistent with the component library?). Business rule validation is a separate pipeline stage.

---

### PI-04 — Parser Errors Are Typed and Exhaustive

Every parser exposes a typed error union covering all known failure modes (unsupported version, corrupt header, missing required section, encoding error). Callers handle the full error union explicitly. Generic catch-all error handling is not acceptable at the parser boundary.

---

### PI-05 — New Format Parsers Do Not Modify Engine Code

Adding support for a new board format (e.g., FZ) requires adding a new module under `formats/` and a new adapter that maps the format's output to the canonical board data schema. It does not require modifications to `CoordinateEngine`, `BoardComponent`, or any overlay module.

---

## 14. BRD / FZ Compatibility Rules

### BF-01 — Canonical Board Schema is Format-Agnostic

The internal board data schema (the type that `CoordinateEngine` and `BoardComponent` consume) is defined independently of any file format. BRD and FZ parsers produce output that is mapped to this schema by format adapters.

---

### BF-02 — Format-Specific Concepts Are Isolated

Concepts that exist in BRD but not in FZ (or vice versa) are expressed as optional fields in the canonical schema with explicit absence semantics. They are never assumed to be present by engine or rendering code without an explicit presence check.

---

### BF-03 — Coordinate System Differences Are Resolved at Parse Time

If BRD and FZ use different coordinate origins, units, or axis orientations, these differences are normalized by the format adapter before data enters the engine. The engine always operates in the canonical coordinate system.

---

### BF-04 — Format Detection is Explicit

The format of a board file is determined by explicit format detection logic, not by file extension alone. Detection runs before the parser is selected. The result of detection is a typed discriminant, not a string.

---

## 15. AI Diagnostic Engine Boundaries

### AI-01 — Diagnostic Engine is a Consumer, Not a Renderer

The AI diagnostic engine consumes board state and produces diagnostic results (fault candidates, signal trace hypotheses, component risk scores). It does not render, does not write to engine state, and does not call `CoordinateEngine` directly.

---

### AI-02 — Diagnostic Results Enter the System as Typed Data

Diagnostic results are expressed as typed data structures that conform to the diagnostic result schema. The rendering pipeline consumes them as overlay configurations. There is no untyped or free-form diagnostic output path.

---

### AI-03 — Diagnostic Engine Has No Rendering Side Effects

Invoking the diagnostic engine must not trigger re-renders, state mutations, or layout recalculations as a side effect. It is a pure data computation. The caller decides when and how to apply its results to the view state.

---

### AI-04 — Diagnostic Confidence Values Are Bounded

All confidence scores, probability estimates, and risk scores produced by the diagnostic engine are normalized to the range `[0.0, 1.0]`. Values outside this range are a bug in the diagnostic engine, not a rendering concern.

---

### AI-05 — Non-Deterministic Diagnostic Models Are Isolated

If the diagnostic engine uses non-deterministic inference (stochastic models, sampling-based methods), that non-determinism is fully contained within the diagnostic engine module. It must not propagate to the rendering pipeline, overlay system, or coordinate engine. Diagnostic results, once produced, are treated as deterministic data by all downstream consumers.

---

### AI-06 — Diagnostic Engine Cannot Access Raw Canvas State

The diagnostic engine has no access to Konva nodes, canvas pixel data, or screen-space coordinates. It operates exclusively on board-space data from the canonical board data schema.

---

## 16. Global Anti-Patterns

The following patterns are prohibited regardless of context, urgency, or apparent convenience.

---

### AP-01 — Coordinate Leakage

Computing a screen position anywhere outside `CoordinateEngine`. Recognizable by: zoom level, pan offset, or pixel-per-unit calculations appearing outside the engine module.

---

### AP-02 — Geometry Duplication

Declaring the bounding box, center point, or extent of the same component in more than one place. Recognizable by: two modules both having `width` and `height` for the same logical entity.

---

### AP-03 — Hidden Transform Chains

Applying a CSS `transform`, Konva `scale`, or offset that is not registered in `CoordinateEngine` state. Recognizable by: visual positions that are correct at zoom level 1 but wrong at other zoom levels.

---

### AP-04 — Stale Overlay Positions

Caching a screen-space overlay position and not re-resolving it after a zoom or pan event. Recognizable by: overlays that drift away from their board targets when the user pans or zooms.

---

### AP-05 — Parser-Renderer Coupling

A format parser that imports from any rendering module, or a rendering module that contains format-specific logic. Recognizable by: `import` statements crossing the `formats/` boundary in either direction.

---

### AP-06 — State Smuggling via Ref

Using a React `ref` or Konva node attribute to store state that should live in engine state. Recognizable by: business logic reading from `ref.current` instead of from engine state.

---

### AP-07 — Diagnostic Rendering Bypass

A diagnostic engine result that is applied directly to a Konva node without going through the overlay system. Recognizable by: diagnostic code that holds a reference to a Konva layer or `BoardComponent` instance.

---

### AP-08 — Type Assertion as Validation

Using `as SomeType` or `!` to silence a TypeScript error on data that has not been validated. Recognizable by: assertions on data returned from parser output, network responses, or user input without a preceding validation call.

---

### AP-09 — Randomness in Visual State

Any visual property (color, opacity, position, size, z-order) that is computed using `Math.random()`, `crypto.getRandomValues()`, or any other non-deterministic source. No exceptions for "cosmetic" properties.

---

### AP-10 — Cross-Module Internal Imports

Importing a non-exported internal symbol from a sibling module using a deep path (e.g., `import { internalHelper } from '../overlays/internal/helpers'`). All cross-module imports must reference only the module's declared public API index.

---

*This document is binding. Architectural decisions recorded here supersede individual judgment calls in implementation. To propose a change to this contract, open a formal architecture decision record (ADR) and obtain sign-off before modifying this document.*
