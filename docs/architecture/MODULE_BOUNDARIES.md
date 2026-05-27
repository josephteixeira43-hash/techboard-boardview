# MODULE_BOUNDARIES.md

**Document type:** Permanent Modular Isolation Contract  
**Module:** `techboard-boardview` — platform-wide  
**Authority:** Senior Systems Architecture  
**Status:** Binding — all contributors must comply  
**Version:** 1.0.0  

> This document defines strict ownership boundaries for every Tech Board Pro subsystem.  
> Dependency directions are binding. Boundary violations are merge-blocking defects.  
> When a new module is added, its boundaries must be declared here before implementation begins.

---

## Table of Contents

1. [Dependency Direction Master Rules](#1-dependency-direction-master-rules)
2. [Canonical Dependency Flow](#2-canonical-dependency-flow)
3. [Module Communication Rules](#3-module-communication-rules)
4. [Prohibited Architecture Patterns](#4-prohibited-architecture-patterns)
5. [Core — CoordinateEngine](#5-core--coordinateengine)
6. [Core — ViewportManager](#6-core--viewportmanager)
7. [Core — Shared Types](#7-core--shared-types)
8. [Rendering — PCBRenderer](#8-rendering--pcbrenderer)
9. [Rendering — RenderLayerSystem](#9-rendering--renderlayersystem)
10. [Rendering — HitEngine](#10-rendering--hitengine)
11. [PDF/OCR — PDFEngine](#11-pdfocr--pdfengine)
12. [PDF/OCR — OCRPipeline](#12-pdfocr--ocrpipeline)
13. [PDF/OCR — ExtractionNormalizer](#13-pdfocr--extractionnormalizer)
14. [Net Graph — NetGraphEngine](#14-net-graph--netgraphengine)
15. [Net Graph — SignalTracer](#15-net-graph--signaltracer)
16. [Virtual Layout — VirtualBoardLayoutEngine](#16-virtual-layout--virtualboardlayoutengine)
17. [Virtual Layout — SmartVisualGrouping](#17-virtual-layout--smartvisualgrouping)
18. [Overlays — OverlaySystem](#18-overlays--overlaysystem)
19. [Overlays — RegionOverlayLayer](#19-overlays--regionoverlaylayer)
20. [Overlays — NetGraphOverlayLayer](#20-overlays--netgraphoverlaylayer)
21. [Parsers — BRDParser](#21-parsers--brdparser)
22. [Parsers — FZParser](#22-parsers--fzparser)
23. [Parsers — FutureParserAdapters](#23-parsers--futureparseradapters)
24. [AI — DiagnosticEngine](#24-ai--diagnosticengine)
25. [AI — SymptomInferenceEngine](#25-ai--symptominferenceengine)
26. [AI — FutureVoltageAnalysisEngine](#26-ai--futurevoltaganalysisengine)
27. [UI — Panels](#27-ui--panels)
28. [UI — Search UI](#28-ui--search-ui)
29. [UI — Viewer Controls](#29-ui--viewer-controls)
30. [Boundary Violation Examples](#30-boundary-violation-examples)
31. [Future Scalability Notes](#31-future-scalability-notes)

---

## 1. Dependency Direction Master Rules

These rules govern every import and every runtime call across the entire platform.

| Rule | Statement |
|---|---|
| **DD-01** | Dependency flows downward only: `UI → Engines → Types`. Never upward. |
| **DD-02** | Parsers are leaves. They depend on `types/` only. Nothing else. |
| **DD-03** | AI engines are consumers. They read board data and produce typed results. They do not write to rendering state. |
| **DD-04** | Overlays are view consumers. They receive resolved data; they do not produce geometry or compute coordinates. |
| **DD-05** | `CoordinateEngine` has no dependencies on any other engine, overlay, or UI module. |
| **DD-06** | `Shared Types` (`types/`) has no runtime dependencies on anything. It is the dependency floor. |
| **DD-07** | No circular dependencies at any level. A module that depends on X must not be depended upon by X, directly or transitively. |
| **DD-08** | Cross-module communication is always through declared public contracts, never through internal paths. |
| **DD-09** | `PCBRenderer` depends on `CoordinateEngine` and `RenderLayerSystem`. It does not depend on overlays, AI, parsers, or UI. |
| **DD-10** | `OverlaySystem` depends on `CoordinateEngine` for position resolution. It does not depend on `PCBRenderer` internals. |

---

## 2. Canonical Dependency Flow

The following diagram shows the only legal dependency directions across the platform.  
An arrow `A → B` means "A depends on B" (A imports from B; B does not know A exists).

```
┌─────────────────────────────────────────────────────────────────────┐
│                          UI LAYER                                   │
│          Panels  ·  Search UI  ·  Viewer Controls                   │
└────────────┬───────────────────────────────┬────────────────────────┘
             │                               │
             ▼                               ▼
┌────────────────────────┐     ┌─────────────────────────────────────┐
│     OVERLAY LAYER      │     │            AI LAYER                 │
│  OverlaySystem         │     │  DiagnosticEngine                   │
│  RegionOverlayLayer    │     │  SymptomInferenceEngine             │
│  NetGraphOverlayLayer  │     │  FutureVoltageAnalysisEngine        │
└────────┬───────────────┘     └──────────────┬──────────────────────┘
         │                                    │
         │          ┌─────────────────────────┘
         │          │
         ▼          ▼
┌──────────────────────────────────────────────────────────────────┐
│                        ENGINE LAYER                              │
│                                                                  │
│  ┌─────────────────────┐   ┌──────────────────────────────────┐  │
│  │   CORE ENGINES      │   │       DOMAIN ENGINES             │  │
│  │  CoordinateEngine   │   │  NetGraphEngine  · SignalTracer  │  │
│  │  ViewportManager    │   │  VirtualBoardLayoutEngine        │  │
│  │                     │   │  SmartVisualGrouping             │  │
│  └─────────────────────┘   └──────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                   RENDERING ENGINES                      │    │
│  │   PCBRenderer  ·  RenderLayerSystem  ·  HitEngine        │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
         │          │
         ▼          ▼
┌──────────────────────────────────────────────────────────────────┐
│                       OCR / PDF LAYER                            │
│          PDFEngine  ·  OCRPipeline  ·  ExtractionNormalizer      │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                       PARSER LAYER                               │
│              BRDParser  ·  FZParser  ·  FutureParserAdapters     │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                      TYPES FLOOR                                 │
│                        types/                                    │
│   core · rendering · overlays · net · layout · ocr ·            │
│   diagnostics · formats                                          │
└──────────────────────────────────────────────────────────────────┘
```

**Reading the diagram:**
- Arrows point from dependent to dependency.
- Any import that creates an arrow pointing upward is a boundary violation.
- Same-layer imports are allowed only between modules that declare each other as allowed dependencies.
- `types/` is the only module with zero outbound dependencies.

---

## 3. Module Communication Rules

### MC-01 — Public API Surface Only
Modules communicate exclusively through their declared public API surface (exported index). Importing from internal paths (`../engine/internal/helpers`) is prohibited.

### MC-02 — No Shared Mutable State
Modules do not share mutable state via module-level variables, singletons, or global stores unless explicitly declared as a shared engine state contract in `types/`.

### MC-03 — Events Cross Layers Upward Only
If a lower-layer module needs to signal a higher-layer module, it does so via a declared event/callback contract injected at initialization. Lower layers do not import upper layers to call them directly.

### MC-04 — Engine Results Are Immutable
Data returned by engine modules is treated as immutable by consumers. Consumers must not mutate engine output objects. If mutation is needed, the consumer creates a local copy.

### MC-05 — Type Imports Are Always Allowed
Any module may import from `types/` in any direction. Type-only imports do not create runtime dependencies.

### MC-06 — Parser Output Is One-Way
Parsers produce data. Once `ParsedBoardData` is delivered to its consumer, the parser has no further involvement. Parsers do not receive callbacks, do not subscribe to engine events, and do not hold references to engine objects.

### MC-07 — AI Results Enter the System at the UI/Overlay Boundary
`DiagnosticEngine` results are passed to the UI layer, which transforms them into `OverlayConfig` instances. The AI engine does not interact with `OverlaySystem` directly.

---

## 4. Prohibited Architecture Patterns

| ID | Pattern | Why Prohibited |
|---|---|---|
| **PAP-01** | Parser imports from any engine or rendering module | Violates DD-02; parsers are leaves |
| **PAP-02** | Overlay computes screen position without CoordinateEngine | Violates DD-10, INV-06 |
| **PAP-03** | AI engine calls `OverlaySystem` or `PCBRenderer` directly | Violates DD-03, MC-07 |
| **PAP-04** | `CoordinateEngine` imports from `NetGraphEngine`, `OverlaySystem`, or any UI module | Violates DD-05 |
| **PAP-05** | Two engine modules in the same layer importing from each other in a cycle | Violates DD-07 |
| **PAP-06** | `PCBRenderer` imports from `OverlaySystem` | Renderer and overlays are peers; neither owns the other |
| **PAP-07** | UI component holds a reference to a Konva node or layer | Violates INV-07; Konva is owned by rendering layer |
| **PAP-08** | `HitEngine` dispatches events by calling UI handler functions directly | Violates MC-03; use injected callbacks |
| **PAP-09** | `SmartVisualGrouping` reads from `OverlaySystem` state | Layout and overlays are peers; layout does not consume overlay state |
| **PAP-10** | Any module uses `Math.random()` | Violates INV-01 unconditionally |
| **PAP-11** | `ExtractionNormalizer` produces `BoardComponent` objects with screen-space fields | OCR layer must produce board-space data only |
| **PAP-12** | `DiagnosticEngine` receives or stores `ScreenPoint` or `ScreenBounds` values | AI layer operates in board-space only |

---

## 5. Core — CoordinateEngine

**Purpose:**  
Single source of truth for all spatial transforms. Converts between board-space and screen-space. Owns zoom, pan, and viewport state.

**Owned Responsibilities:**
- Board-space to screen-space resolution (`toScreen()`)
- Screen-space to board-space inversion (`toBoard()`)
- Zoom level state and bounds enforcement
- Pan offset state
- Viewport visible area computation
- Overlay anchor resolution (converting `OverlayAnchor` board targets to `ScreenPoint`)
- Notification of transform changes to registered consumers

**Allowed Dependencies:**
- `types/core` — coordinate types, `ViewportState`, `BoardPoint`, `ScreenPoint`
- `types/rendering` — `ViewportState`

**Forbidden Dependencies:**
- Any rendering module (`PCBRenderer`, `RenderLayerSystem`, `HitEngine`)
- Any overlay module
- Any parser module
- Any AI module
- Any UI module
- `NetGraphEngine`, `VirtualBoardLayoutEngine`, or any domain engine

**Public Contracts Exposed:**
- `toScreen(point: BoardPoint): ScreenPoint`
- `toBoard(point: ScreenPoint): BoardPoint`
- `resolveOverlayAnchor(anchor: OverlayAnchor): ScreenPoint`
- `getViewportState(): ViewportState`
- `setZoom(level: number): void`
- `setPan(offset: ScreenPoint): void`
- `onTransformChange(callback: () => void): Unsubscribe`

**Internal-Only Concerns:**
- Zoom clamp logic
- Pan boundary enforcement
- Visible board bounds calculation
- Transform matrix construction

**Coordinate Space Ownership:**
- Owns the canonical definition of all three coordinate spaces.
- Is the only module allowed to perform cross-space transformations.

**Rendering Ownership:** None. Does not touch Konva.

**State Ownership:**  
Owns `ViewportState` exclusively. No other module stores zoom or pan state.

**Performance Responsibilities:**
- `toScreen()` and `toBoard()` must be synchronous and O(1).
- Transform change notifications must not trigger synchronous re-renders.

**Future Expansion Constraints:**
- Multi-board sessions: each board session gets an independent `CoordinateEngine` instance.
- 3D board support (future): coordinate spaces must be extended, not replaced.

---

## 6. Core — ViewportManager

**Purpose:**  
Manages the physical canvas element dimensions and communicates resize events to `CoordinateEngine`. Bridges the DOM/canvas boundary and the coordinate system.

**Owned Responsibilities:**
- Canvas element size observation (`ResizeObserver`)
- Forwarding canvas dimension changes to `CoordinateEngine`
- Device pixel ratio management
- Scroll and pinch-to-zoom gesture normalization before forwarding to `CoordinateEngine`

**Allowed Dependencies:**
- `CoordinateEngine` — forwards normalized transform inputs
- `types/core` — `ScreenBounds`, `ScreenPoint`

**Forbidden Dependencies:**
- Any rendering module internals
- Any overlay module
- Any parser, AI, or net graph module
- `HitEngine` (event routing is separate)

**Public Contracts Exposed:**
- `attachCanvas(element: HTMLCanvasElement): void`
- `detachCanvas(): void`
- `onResize(callback: (bounds: ScreenBounds) => void): Unsubscribe`

**Internal-Only Concerns:**
- DPR scaling calculations
- Gesture debouncing and normalization

**Coordinate Space Ownership:**
- Provides canvas dimensions in `SCREEN_SPACE` to `CoordinateEngine`.
- Does not perform coordinate transforms itself.

**Rendering Ownership:** None. Does not touch Konva.

**State Ownership:** Canvas physical dimensions only.

**Future Expansion Constraints:**
- Multi-canvas support: one `ViewportManager` per canvas element.

---

## 7. Core — Shared Types

**Purpose:**  
The dependency floor. Declares all canonical interfaces, type aliases, branded primitives, enums, and result types used across the platform.

**Owned Responsibilities:**
- All type definitions in `TYPES_REFERENCE.md`
- Schema versioning fields on cross-boundary types
- `Result<T, E>` pattern
- All branded primitive declarations

**Allowed Dependencies:** None. Zero runtime imports.

**Forbidden Dependencies:** Everything. `types/` is the floor.

**Public Contracts Exposed:** All exported types. Every type is public by definition.

**Internal-Only Concerns:** None. All types are exports.

**Coordinate Space Ownership:**
- Declares the `CoordinateSpace` enum and all coordinate point/bounds interfaces.
- Does not perform any spatial computation.

**Rendering Ownership:** None.

**State Ownership:** None. Types carry no runtime state.

**Future Expansion Constraints:**
- New types are added additively. Existing type modifications require schema version bump and ADR.
- Type files are never split by feature flag or environment.

---

## 8. Rendering — PCBRenderer

**Purpose:**  
Owns the Konva stage and scene graph. Instantiates and manages `BoardComponent` Konva representations. Drives the render loop.

**Owned Responsibilities:**
- Konva `Stage` lifecycle (mount, resize, destroy)
- `BoardComponent` Konva node instantiation and teardown
- Render loop orchestration (batch draw, dirty checking)
- Virtualization: removing off-viewport nodes from scene graph
- Consuming `RenderNode` data from `RenderLayerSystem`
- Consuming `ViewportState` from `CoordinateEngine` to trigger re-render on transform change

**Allowed Dependencies:**
- `CoordinateEngine` — viewport state, transform change subscription
- `RenderLayerSystem` — resolved `RenderNode` list
- `HitEngine` — registering components for hit testing
- `types/rendering` — `RenderNode`, `RendererLayer`, `ViewportState`, `RenderStats`
- `types/core` — `BoardComponent`, `ComponentId`

**Forbidden Dependencies:**
- `OverlaySystem` or any overlay module
- Any parser module
- Any AI module
- Any UI module
- `NetGraphEngine`, `VirtualBoardLayoutEngine`
- Direct access to `ParsedBoardData` (consumes resolved `RenderNode` only)

**Public Contracts Exposed:**
- `mountStage(container: HTMLElement): void`
- `unmountStage(): void`
- `getRenderStats(): RenderStats`
- `onRenderComplete(callback: (stats: RenderStats) => void): Unsubscribe`

**Internal-Only Concerns:**
- Konva node pooling and recycling
- Dirty region tracking
- Layer draw ordering
- DPR-adjusted canvas scaling

**Coordinate Space Ownership:**
- Consumes `SCREEN_SPACE` coordinates from `RenderNode`.
- Does not perform board-to-screen transforms; those are done by `CoordinateEngine` before data reaches this module.

**Rendering Ownership:**
- Sole owner of the Konva `Stage`.
- Sole instantiator of Konva nodes for `BoardComponent` entities.

**State Ownership:** Konva scene graph state only. No board data state.

**Performance Responsibilities:**
- All expensive computation completes before render pass begins (Rule P-01).
- Off-viewport components are virtualized at the declared threshold (Rule P-02).
- No layout thrashing (Rule P-03).

**Future Expansion Constraints:**
- WebGL renderer backend: swap render backend without changing `RenderNode` contract.
- Multi-board: one `PCBRenderer` instance per board canvas.

---

## 9. Rendering — RenderLayerSystem

**Purpose:**  
Manages layer declarations, layer visibility state, and produces the ordered `RenderNode` list consumed by `PCBRenderer`.

**Owned Responsibilities:**
- Layer manifest loading and validation
- Layer visibility state (toggled by UI via declared API)
- Layer z-order enforcement
- Resolving `BoardComponent` data into `RenderNode` list via `CoordinateEngine`
- Producing `VisibilityState` per component

**Allowed Dependencies:**
- `CoordinateEngine` — coordinate resolution for `RenderNode` screen bounds
- `types/core` — `BoardComponent`, `LayerId`, `ComponentId`
- `types/rendering` — `RendererLayer`, `RenderNode`, `VisibilityState`

**Forbidden Dependencies:**
- `PCBRenderer` internals (Konva nodes)
- Any overlay module
- Any parser, AI, or net graph module
- Any UI module

**Public Contracts Exposed:**
- `loadLayerManifest(layers: ReadonlyArray<RendererLayer>): void`
- `setLayerVisibility(layerId: LayerId, visible: boolean): void`
- `resolveRenderNodes(components: ReadonlyArray<BoardComponent>): ReadonlyArray<RenderNode>`
- `getVisibilityState(componentId: ComponentId): VisibilityState`

**Internal-Only Concerns:**
- Layer z-order index maintenance
- Visibility filter aggregation

**Coordinate Space Ownership:**
- Produces `SCREEN_SPACE` bounds in `RenderNode` by delegating to `CoordinateEngine`.
- Does not store screen-space values between transform changes.

**Rendering Ownership:** None. Produces data consumed by `PCBRenderer`.

**State Ownership:** Layer visibility state, layer manifest.

---

## 10. Rendering — HitEngine

**Purpose:**  
Maps pointer events (mouse/touch) from screen-space positions to `ComponentId` values. Owns hit-test registration and resolution.

**Owned Responsibilities:**
- Component hit-test registration (components register their board bounds)
- Screen-to-board-space pointer event conversion via `CoordinateEngine`
- Nearest-component resolution for a given pointer position
- Multi-select region resolution

**Allowed Dependencies:**
- `CoordinateEngine` — `toBoard()` for pointer position conversion
- `types/core` — `ComponentId`, `BoardBounds`, `ScreenPoint`

**Forbidden Dependencies:**
- `PCBRenderer` (Konva node event listeners — HitEngine is the event system, not Konva)
- Any overlay module
- Any UI module (dispatches events via injected callbacks only)
- Any parser or AI module

**Public Contracts Exposed:**
- `registerComponent(id: ComponentId, bounds: BoardBounds): void`
- `unregisterComponent(id: ComponentId): void`
- `resolveHit(screenPoint: ScreenPoint): ComponentId | null`
- `resolveRegionHit(screenBounds: ScreenBounds): ReadonlyArray<ComponentId>`
- `onComponentHit(callback: (id: ComponentId) => void): Unsubscribe`

**Internal-Only Concerns:**
- Spatial index (e.g., quadtree) for efficient hit resolution
- Debounced pointer move handling

**Coordinate Space Ownership:**
- Receives `SCREEN_SPACE` pointer positions.
- Converts to `BOARD_SPACE` via `CoordinateEngine` for all internal operations.

**Rendering Ownership:** None. Non-visual module.

**State Ownership:** Hit-test spatial index only.

---

## 11. PDF/OCR — PDFEngine

**Purpose:**  
Loads and decodes PDF files into page representations suitable for OCR processing. Boundary between raw file bytes and structured page data.

**Owned Responsibilities:**
- PDF file loading and decoding
- Page count and page dimension extraction
- Rendering PDF pages to image data for OCR input
- Detecting whether a PDF has a text layer

**Allowed Dependencies:**
- `types/ocr` — `OCRRegion`, `PDFExtractionError`
- `types/core` — `Result<T, E>`

**Forbidden Dependencies:**
- Any engine module (`CoordinateEngine`, `PCBRenderer`, etc.)
- Any rendering module
- Any overlay module
- Any AI module
- Any parser module
- Any net graph or layout module

**Public Contracts Exposed:**
- `loadPDF(bytes: Uint8Array): ParserResult<PDFDocument>`
- `renderPage(doc: PDFDocument, pageIndex: number): Promise<ImageData>`
- `hasTextLayer(doc: PDFDocument): boolean`

**Internal-Only Concerns:**
- PDF library integration
- Page rendering resolution management
- Text layer detection heuristics

**Coordinate Space Ownership:**
- Page coordinates are in a page-local space, declared as `SpatialBounds` with appropriate `coordinateSpace`.
- Does not produce board-space coordinates.

**Rendering Ownership:** None (page rendering is for OCR input, not canvas display).

---

## 12. PDF/OCR — OCRPipeline

**Purpose:**  
Processes image data from `PDFEngine` through OCR to produce raw text regions and blocks.

**Owned Responsibilities:**
- OCR execution on page image data
- `OCRRegion` and `OCRTextBlock` production
- Confidence score assignment
- Reading order determination

**Allowed Dependencies:**
- `PDFEngine` — page image data
- `types/ocr` — `OCRRegion`, `OCRTextBlock`, `OCRConfidence`
- `types/core` — `Result<T, E>`, `SpatialBounds`

**Forbidden Dependencies:**
- Any engine, rendering, overlay, AI, parser, or net graph module
- `CoordinateEngine` — OCR coordinates are page-local, not board-space

**Public Contracts Exposed:**
- `processPage(imageData: ImageData, pageIndex: number): Promise<Result<ReadonlyArray<OCRRegion>, OCRError>>`

**Internal-Only Concerns:**
- OCR engine configuration
- Image preprocessing (binarization, deskew)
- Confidence thresholding

**Coordinate Space Ownership:**
- All output coordinates are in page-local space. Board-space registration is `ExtractionNormalizer`'s responsibility.

---

## 13. PDF/OCR — ExtractionNormalizer

**Purpose:**  
Transforms raw OCR output into typed, structured `PDFExtractionResult`. Resolves designators. Does not produce board-space geometry.

**Owned Responsibilities:**
- `OCRTextBlock` → `ParsedDesignator` resolution
- Designator normalization (case, whitespace, separator conventions)
- Assembling `PDFExtractionResult`
- Typed error production for failed extractions

**Allowed Dependencies:**
- `OCRPipeline` — raw OCR output
- `types/ocr` — all OCR types
- `types/core` — `ComponentId`, `Result<T, E>`

**Forbidden Dependencies:**
- `CoordinateEngine` — does not produce screen or board coordinates
- Any rendering, overlay, AI, parser, or net graph module
- Direct access to `BoardComponent` model (receives `ComponentId` list for resolution; does not own the component model)

**Public Contracts Exposed:**
- `normalize(regions: ReadonlyArray<OCRRegion>, knownComponentIds: ReadonlyArray<ComponentId>): PDFExtractionResult`

**Internal-Only Concerns:**
- Designator pattern matching
- Fuzzy match scoring for partial designators

**Coordinate Space Ownership:**
- Does not transform coordinates. All spatial data remains in page-local space from `OCRPipeline`.

---

## 14. Net Graph — NetGraphEngine

**Purpose:**  
Constructs, stores, and queries the electrical connectivity graph of the loaded board.

**Owned Responsibilities:**
- `NetGraph` construction from `ParsedBoardData`
- Net membership queries (which components belong to a net)
- Pad-to-net mapping
- Net metadata (name, signal type, nominal voltage)
- Net graph immutability enforcement during render passes

**Allowed Dependencies:**
- `types/net` — all net graph types
- `types/core` — `ComponentId`, `NetId`, `BoardComponent`
- `types/formats` — `ParsedBoardData` (input source only)

**Forbidden Dependencies:**
- `CoordinateEngine` — net graph operates in board-space only; no screen-space awareness
- Any rendering module
- Any overlay module
- Any AI module
- Any parser module (receives `ParsedBoardData` as input; does not call parsers)
- Any UI module

**Public Contracts Exposed:**
- `loadFromBoardData(data: ParsedBoardData): void`
- `getNet(netId: NetId): NetGraph | null`
- `getNetsByComponent(componentId: ComponentId): ReadonlyArray<NetGraph>`
- `getAllNets(): ReadonlyArray<NetGraph>`
- `getPadNet(componentId: ComponentId, padDesignator: string): NetId | null`

**Internal-Only Concerns:**
- Adjacency index for fast net lookup
- Net deduplication

**Coordinate Space Ownership:** Board-space only. No screen-space data stored or produced.

**State Ownership:** `NetGraph` collection for the loaded board. Immutable after `loadFromBoardData`.

---

## 15. Net Graph — SignalTracer

**Purpose:**  
Traverses the net graph to resolve `TracePath` and `SignalRoute` between components.

**Owned Responsibilities:**
- Path traversal between two `ComponentId` values within a net
- `TracePath` assembly (ordered nodes, length, layer transitions)
- `SignalRoute` resolution (single net, differential pairs)

**Allowed Dependencies:**
- `NetGraphEngine` — graph queries
- `types/net` — `TracePath`, `SignalRoute`, `NetNode`, `NetEdge`
- `types/core` — `ComponentId`, `NetId`

**Forbidden Dependencies:**
- `CoordinateEngine` — operates in board-space only
- Any rendering, overlay, AI, or parser module
- Any UI module

**Public Contracts Exposed:**
- `traceRoute(from: ComponentId, to: ComponentId, netId: NetId): SignalRoute`
- `tracePath(from: ComponentId, netId: NetId): ReadonlyArray<TracePath>`

**Internal-Only Concerns:**
- Graph traversal algorithm (deterministic; no random walk)
- Cycle detection

**Coordinate Space Ownership:** Board-space only.

---

## 16. Virtual Layout — VirtualBoardLayoutEngine

**Purpose:**  
Computes the virtual layout: placement slots, region assignments, and cluster bounds for all board components.

**Owned Responsibilities:**
- `VirtualRegion` declaration and assignment
- `PlacementSlot` computation per component
- `LayoutCluster` assembly
- Layout constraint enforcement
- Deterministic slot assignment (same board data → same layout)

**Allowed Dependencies:**
- `types/layout` — all virtual layout types
- `types/core` — `BoardComponent`, `ComponentId`, `BoardBounds`
- `types/formats` — `ParsedBoardData` (input source)

**Forbidden Dependencies:**
- `CoordinateEngine` — layout is computed in board-space; no screen-space operations
- Any rendering module
- Any overlay module
- Any AI module
- Any parser module
- Any UI module

**Public Contracts Exposed:**
- `computeLayout(data: ParsedBoardData, constraints: LayoutConstraints): void`
- `getSlot(componentId: ComponentId): PlacementSlot | null`
- `getRegion(regionId: RegionId): VirtualRegion | null`
- `getAllRegions(): ReadonlyArray<VirtualRegion>`
- `getCluster(clusterId: string): LayoutCluster | null`

**Internal-Only Concerns:**
- Slot grid construction
- Overlap detection and resolution

**Coordinate Space Ownership:** Board-space only. All bounds are `BoardBounds`.

**State Ownership:** Computed layout state. Immutable after `computeLayout`.

---

## 17. Virtual Layout — SmartVisualGrouping

**Purpose:**  
Produces `RegionCluster` groupings of functionally or spatially related components. Operates on board data and net graph data; produces clustering metadata consumed by the overlay system.

**Owned Responsibilities:**
- Spatial clustering (components within proximity threshold)
- Functional clustering (components on same net or power domain)
- `RegionCluster` production
- Deterministic cluster membership assignment

**Allowed Dependencies:**
- `VirtualBoardLayoutEngine` — layout regions and slots
- `NetGraphEngine` — net membership for functional clustering
- `types/layout` — `RegionCluster`, `VirtualRegion`
- `types/core` — `ComponentId`, `BoardBounds`

**Forbidden Dependencies:**
- `CoordinateEngine` — no screen-space awareness
- Any rendering module
- Any overlay module (produces data for overlays; does not call overlay APIs)
- Any AI module
- Any parser or UI module

**Public Contracts Exposed:**
- `computeGroups(regions: ReadonlyArray<VirtualRegion>): ReadonlyArray<RegionCluster>`

**Internal-Only Concerns:**
- Clustering algorithm (deterministic implementation)
- Proximity threshold configuration

**Coordinate Space Ownership:** Board-space only.

---

## 18. Overlays — OverlaySystem

**Purpose:**  
Manages the lifecycle of all active overlay instances. Resolves anchor positions via `CoordinateEngine`. Enforces overlay count limits.

**Owned Responsibilities:**
- Overlay instance registry (add, remove, update)
- Overlay anchor resolution (delegates to `CoordinateEngine`)
- Overlay visibility management
- Z-order enforcement from layer manifest
- Overlay count enforcement (bounded by engine config)
- Re-resolution of all overlay positions on `CoordinateEngine` transform change

**Allowed Dependencies:**
- `CoordinateEngine` — anchor resolution, transform change subscription
- `types/overlays` — all overlay types
- `types/core` — `ComponentId`, `BoardPoint`, `NetId`, `RegionId`

**Forbidden Dependencies:**
- `PCBRenderer` internals (Konva nodes)
- Any parser module
- Any AI module (receives `OverlayConfig` from UI layer, which transforms AI results)
- `NetGraphEngine`, `VirtualBoardLayoutEngine` directly (receives overlay configs that already encode net/region references)

**Public Contracts Exposed:**
- `addOverlay(config: OverlayConfig): OverlayId`
- `removeOverlay(id: OverlayId): void`
- `updateOverlay(id: OverlayId, config: Partial<OverlayConfig>): void`
- `resolveOverlayBounds(id: OverlayId): OverlayBounds`
- `getActiveOverlays(): ReadonlyArray<OverlayConfig>`

**Internal-Only Concerns:**
- Overlay instance map
- Stale position invalidation on transform change
- Overflow queue management

**Coordinate Space Ownership:**
- Consumes board-space anchor targets.
- Produces screen-space `OverlayBounds` via `CoordinateEngine`.
- Never stores screen-space positions between transform changes.

**State Ownership:** Active overlay registry. `OverlayBounds` cache (invalidated on transform).

---

## 19. Overlays — RegionOverlayLayer

**Purpose:**  
Renders visual region indicators (bounding boxes, labels, shading) for `VirtualRegion` and `RegionCluster` entities.

**Owned Responsibilities:**
- Translating `VirtualRegion` and `RegionCluster` data into `OverlayConfig` instances
- Submitting overlay configs to `OverlaySystem`
- Reacting to region visibility changes

**Allowed Dependencies:**
- `OverlaySystem` — submits `OverlayConfig`
- `VirtualBoardLayoutEngine` — region data
- `SmartVisualGrouping` — cluster data
- `types/overlays`, `types/layout`, `types/core`

**Forbidden Dependencies:**
- `CoordinateEngine` directly (position resolution is `OverlaySystem`'s responsibility)
- `PCBRenderer` internals
- Any parser or AI module

**Public Contracts Exposed:**
- `showRegion(regionId: RegionId): void`
- `hideRegion(regionId: RegionId): void`
- `showCluster(clusterId: string): void`

**Internal-Only Concerns:**
- Region-to-overlay-config mapping
- Color assignment per region kind (deterministic, not random)

---

## 20. Overlays — NetGraphOverlayLayer

**Purpose:**  
Renders net highlight overlays: highlights all pads and traces belonging to a selected net.

**Owned Responsibilities:**
- Translating net highlight requests into `OverlayConfig` instances
- Submitting net highlight overlays to `OverlaySystem`
- Clearing net highlight state

**Allowed Dependencies:**
- `OverlaySystem` — submits `OverlayConfig`
- `NetGraphEngine` — net membership queries
- `types/overlays`, `types/net`, `types/core`

**Forbidden Dependencies:**
- `CoordinateEngine` directly
- `PCBRenderer` internals
- Net graph mutation (read-only access to `NetGraphEngine`)
- Any parser or AI module

**Public Contracts Exposed:**
- `highlightNet(netId: NetId): void`
- `clearNetHighlight(netId: NetId): void`
- `clearAllNetHighlights(): void`

**Internal-Only Concerns:**
- Net-to-overlay-config mapping
- Multi-net highlight stacking

---

## 21. Parsers — BRDParser

**Purpose:**  
Parses BRD format board files and produces `ParsedBoardData` conforming to the canonical schema.

**Owned Responsibilities:**
- BRD binary/text format decoding
- Structural validation of BRD format
- Coordinate system normalization to canonical board-space (board-space units, origin alignment)
- Mapping BRD-specific concepts to canonical types
- Producing typed `BoardParseError` on failure

**Allowed Dependencies:**
- `types/formats` — `ParsedBoardData`, `BoardParseError`, `ParserResult`
- `types/core` — all canonical types needed for output schema
- `types/net` — `NetGraph`, `NetNode`, `NetEdge`

**Forbidden Dependencies:**
- Any engine module (`CoordinateEngine`, `PCBRenderer`, `NetGraphEngine`, etc.)
- Any overlay module
- Any AI module
- Any UI module
- `OCRPipeline` or `PDFEngine`
- `FZParser` (parsers do not depend on each other)

**Public Contracts Exposed:**
- `parse(bytes: Uint8Array): ParserResult<ParsedBoardData>`
- `detect(bytes: Uint8Array): boolean`  (format detection)

**Internal-Only Concerns:**
- BRD file structure internals
- BRD version handling
- Unit conversion (mils to mm normalization)

**Coordinate Space Ownership:**
- Produces `BOARD_SPACE` coordinates only.
- Normalizes BRD coordinate origin to canonical board origin before producing output.

---

## 22. Parsers — FZParser

**Purpose:**  
Parses FZ format board files and produces `ParsedBoardData` conforming to the canonical schema. Mirrors `BRDParser` contract exactly.

**Owned Responsibilities:**
- FZ format decoding
- FZ-specific concept mapping to canonical types
- Coordinate system normalization
- Typed error production

**Allowed Dependencies:**
- `types/formats`, `types/core`, `types/net` (same as `BRDParser`)

**Forbidden Dependencies:**
- Same as `BRDParser`. Additionally: must not import from `BRDParser`.

**Public Contracts Exposed:**
- `parse(bytes: Uint8Array): ParserResult<ParsedBoardData>`
- `detect(bytes: Uint8Array): boolean`

**Coordinate Space Ownership:** Board-space only. Same normalization requirement as `BRDParser`.

---

## 23. Parsers — FutureParserAdapters

**Purpose:**  
Placeholder module boundary for future board format parsers (Altium, KiCad, Eagle, etc.).

**Boundary Contract:**  
Every future parser must:
1. Produce `ParserResult<ParsedBoardData>` as its sole output type.
2. Expose `parse(bytes: Uint8Array)` and `detect(bytes: Uint8Array)` as its sole public functions.
3. Depend only on `types/` modules.
4. Perform full coordinate normalization before emitting output.
5. Not depend on any existing parser module.
6. Not require modifications to `CoordinateEngine`, `PCBRenderer`, or any overlay module.

---

## 24. AI — DiagnosticEngine

**Purpose:**  
Orchestrates the diagnostic workflow. Accepts board data and observed symptoms; produces `FaultCandidate` results. Does not render; does not mutate rendering state.

**Owned Responsibilities:**
- Symptom collection and deduplication
- `DiagnosticRule` application
- `FaultCandidate` production
- `SuggestedTestPoint` selection
- Routing results to the UI layer via declared callback contract

**Allowed Dependencies:**
- `SymptomInferenceEngine` — symptom generation
- `NetGraphEngine` — net membership and signal type queries
- `types/diagnostics` — all diagnostic types
- `types/core` — `ComponentId`, `BoardPoint`
- `types/net` — `NetGraph`, `SignalType`

**Forbidden Dependencies:**
- `CoordinateEngine` (operates in board-space only; no screen-space awareness)
- Any rendering module (`PCBRenderer`, `RenderLayerSystem`, `HitEngine`)
- Any overlay module (results are delivered to UI; UI creates overlays)
- Any parser module (receives `ParsedBoardData` as input; does not call parsers)
- Any UI module

**Public Contracts Exposed:**
- `runDiagnostic(boardData: ParsedBoardData, symptoms: ReadonlyArray<DiagnosticSymptom>): ReadonlyArray<FaultCandidate>`
- `onDiagnosticComplete(callback: (results: ReadonlyArray<FaultCandidate>) => void): Unsubscribe`

**Internal-Only Concerns:**
- Rule engine implementation
- Fault candidate ranking

**Coordinate Space Ownership:**
- Operates exclusively in `BOARD_SPACE`.
- `SuggestedTestPoint.boardPosition` is in `BOARD_SPACE`.
- Never produces or consumes `ScreenPoint` or `ScreenBounds`.

**State Ownership:** Active symptom set, last diagnostic result. Both are ephemeral.

---

## 25. AI — SymptomInferenceEngine

**Purpose:**  
Infers `DiagnosticSymptom` values from raw measurement data, signal traces, and net state. Feeds `DiagnosticEngine`.

**Owned Responsibilities:**
- Measurement data interpretation
- Signal anomaly detection
- `DiagnosticSymptom` construction

**Allowed Dependencies:**
- `NetGraphEngine` — net and signal type queries
- `SignalTracer` — signal path context
- `types/diagnostics` — `DiagnosticSymptom`
- `types/core`, `types/net`

**Forbidden Dependencies:**
- Same as `DiagnosticEngine`. No rendering, overlay, parser, or UI dependencies.

**Public Contracts Exposed:**
- `inferSymptoms(boardData: ParsedBoardData, measurements: ReadonlyArray<RawMeasurement>): ReadonlyArray<DiagnosticSymptom>`

**Internal-Only Concerns:**
- Threshold configuration for anomaly detection
- Symptom deduplication heuristics

---

## 26. AI — FutureVoltageAnalysisEngine

**Purpose:**  
Placeholder boundary for a dedicated voltage path analysis engine. Will trace power delivery paths and identify voltage drop candidates.

**Boundary Contract:**  
When implemented, this engine must:
1. Depend on `NetGraphEngine` and `types/` only.
2. Produce `VoltagePath` and `FaultCandidate` typed outputs.
3. Not produce screen-space coordinates or rendering artifacts.
4. Not depend on `DiagnosticEngine` (peer, not dependent).
5. Deliver results to the UI layer via callback contract.

---

## 27. UI — Panels

**Purpose:**  
Sidebar and floating panel components displaying component metadata, net info, diagnostic results, and layer controls.

**Owned Responsibilities:**
- Rendering structured data delivered by engines as React UI
- Translating `FaultCandidate` results into `OverlayConfig` instances submitted to `OverlaySystem`
- Layer visibility toggle dispatching to `RenderLayerSystem`
- Diagnostic result display

**Allowed Dependencies:**
- `OverlaySystem` — submitting overlay configs
- `RenderLayerSystem` — layer visibility control
- `NetGraphEngine` — net data for display
- `DiagnosticEngine` — consuming diagnostic results
- `VirtualBoardLayoutEngine` — region data for display
- `types/*` — all types for display purposes

**Forbidden Dependencies:**
- `PCBRenderer` internals (Konva nodes, layers, stage)
- `CoordinateEngine` directly (no coordinate computation in UI)
- Any parser module

**Coordinate Space Ownership:** None. UI does not compute coordinates.

**Rendering Ownership:** React DOM only. No Konva ownership.

---

## 28. UI — Search UI

**Purpose:**  
Search input and results UI. Allows searching by designator, net name, component category, and signal type.

**Owned Responsibilities:**
- Search query input handling
- Querying `NetGraphEngine` and component model for matches
- Triggering highlight overlays for matched results via `OverlaySystem` or `NetGraphOverlayLayer`

**Allowed Dependencies:**
- `NetGraphEngine` — net name search
- `OverlaySystem` — highlight submission
- `NetGraphOverlayLayer` — net highlight trigger
- `HitEngine` — programmatic component selection after search
- `types/core`, `types/net`

**Forbidden Dependencies:**
- `PCBRenderer` internals
- `CoordinateEngine` directly
- Any parser or AI module

---

## 29. UI — Viewer Controls

**Purpose:**  
Zoom, pan, layer toggle, and fit-to-board controls surfaced in the UI.

**Owned Responsibilities:**
- Zoom in/out/reset dispatching to `CoordinateEngine`
- Pan gesture forwarding (via `ViewportManager`)
- Fit-to-board zoom calculation request to `CoordinateEngine`
- Layer visibility toggle dispatching to `RenderLayerSystem`

**Allowed Dependencies:**
- `CoordinateEngine` — zoom and pan control
- `ViewportManager` — gesture normalization
- `RenderLayerSystem` — layer visibility
- `types/rendering` — `ViewportState` for display

**Forbidden Dependencies:**
- `PCBRenderer` internals
- Any overlay, parser, or AI module

---

## 30. Boundary Violation Examples

### Violation 1 — Parser Reaching Into Renderer

```
// BRDParser.ts
import { RenderLayerSystem } from '../rendering/RenderLayerSystem'; // ❌ VIOLATION
```

**Rule broken:** DD-02, PAP-01  
**Consequence:** Parser lifecycle is now coupled to renderer lifecycle. Parser cannot be tested independently. Format changes break renderer.

---

### Violation 2 — Overlay Computing Its Own Coordinates

```
// AnnotationOverlay.tsx
const screenX = this.boardX * viewportState.zoomLevel + viewportState.panOffsetScreen.screenX; // ❌ VIOLATION
```

**Rule broken:** DD-10, PAP-02, INV-06  
**Consequence:** Overlay drifts from board target on zoom/pan. Two sources of spatial truth diverge.

---

### Violation 3 — AI Engine Calling OverlaySystem

```
// DiagnosticEngine.ts
import { OverlaySystem } from '../overlays/OverlaySystem'; // ❌ VIOLATION
overlaySystem.addOverlay(faultOverlayConfig);
```

**Rule broken:** DD-03, PAP-03, MC-07  
**Consequence:** Diagnostic engine now has UI side effects. Cannot be run headlessly. Creates undeclared coupling between AI results and overlay state.

---

### Violation 4 — CoordinateEngine Importing NetGraphEngine

```
// CoordinateEngine.ts
import { NetGraphEngine } from '../net/NetGraphEngine'; // ❌ VIOLATION
```

**Rule broken:** DD-05  
**Consequence:** Circular dependency potential. CoordinateEngine is no longer a stable foundation. Net graph changes can break coordinate resolution.

---

### Violation 5 — UI Holding a Konva Node Reference

```
// ComponentPanel.tsx
const konvaNode = pcbRenderer.getKonvaNode(componentId); // ❌ VIOLATION
konvaNode.fill('red');
```

**Rule broken:** PAP-07, INV-07  
**Consequence:** UI now owns part of the Konva scene graph lifecycle. Node may be recycled by PCBRenderer while UI holds a stale reference. Visual corruption.

---

### Violation 6 — SmartVisualGrouping Reading OverlaySystem State

```
// SmartVisualGrouping.ts
import { OverlaySystem } from '../overlays/OverlaySystem'; // ❌ VIOLATION
const active = overlaySystem.getActiveOverlays();
```

**Rule broken:** PAP-09  
**Consequence:** Layout computation depends on ephemeral overlay state. Grouping becomes non-deterministic relative to overlay activation order.

---

## 31. Future Scalability Notes

### Multi-Board Sessions
Each board session instantiates its own: `CoordinateEngine`, `NetGraphEngine`, `VirtualBoardLayoutEngine`, `PCBRenderer`. `OverlaySystem` and `HitEngine` are scoped per board. `Shared Types` and parser modules are stateless and shared.

### New Format Support
Add a new file under `parsers/`. Implement `parse()` and `detect()`. Produce `ParsedBoardData`. Zero changes to any engine or rendering module. See `FutureParserAdapters` boundary contract.

### New AI Capability
Add a new module under `ai/`. Depend on `types/` and engine query APIs only. Deliver results to the UI layer via callback. Zero changes to rendering, overlay, or parser modules.

### New Overlay Type
Add a new config type as a discriminated union member in `types/overlays`. Add the overlay variant handler in `OverlaySystem`. Add a dedicated overlay layer module if needed (following `RegionOverlayLayer` as the template). Zero changes to `PCBRenderer` or `CoordinateEngine`.

### WebGL Renderer
Replace `PCBRenderer` internals only. `RenderNode` contract is unchanged. `CoordinateEngine`, overlays, and all engine modules are unaffected.

---

*This document is the permanent modular isolation contract for Tech Board Pro.  
To add a new module, define its boundary here before writing any code.  
To change a module's allowed dependencies, open an ADR and update this document.  
Undeclared dependencies discovered in review are merge-blocking defects.*
