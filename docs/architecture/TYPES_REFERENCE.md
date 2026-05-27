# TYPES_REFERENCE.md

**Document type:** Canonical Type Contract  
**Module:** `techboard-boardview` — platform-wide  
**Authority:** Senior Systems Architecture  
**Status:** Binding — all modules must conform  
**Version:** 1.0.0  

> This document is the authoritative type contract for Tech Board Pro.  
> Types defined here govern the interface between rendering, parsing, overlays,  
> net graph, virtual layout, OCR extraction, AI diagnostics, and future format parsers.  
> No module may define a competing type for a concept declared here.

---

## Table of Contents

1. [Naming Conventions](#1-naming-conventions)
2. [Type Ownership Rules](#2-type-ownership-rules)
3. [Serialization Constraints](#3-serialization-constraints)
4. [Coordinate Space Contract](#4-coordinate-space-contract)
5. [Core Types](#5-core-types)
6. [Rendering Types](#6-rendering-types)
7. [Overlay Types](#7-overlay-types)
8. [OCR / PDF Extraction Types](#8-ocr--pdf-extraction-types)
9. [Net Graph Types](#9-net-graph-types)
10. [Virtual Layout Types](#10-virtual-layout-types)
11. [AI Diagnostic Types](#11-ai-diagnostic-types)
12. [Future BRD / FZ Parser Types](#12-future-brd--fz-parser-types)
13. [Compatibility Notes](#13-compatibility-notes)

---

## 1. Naming Conventions

| Convention | Rule | Example |
|---|---|---|
| **Interfaces** | `PascalCase`, noun or noun phrase | `BoardComponent`, `NetGraph` |
| **Type aliases** | `PascalCase`, noun or noun phrase | `ComponentId`, `NetId` |
| **Branded primitives** | `PascalCase` wrapping primitive | `ComponentId`, `NetId`, `LayerId` |
| **Enums** | `PascalCase` name, `SCREAMING_SNAKE_CASE` members | `ComponentSide.TOP_SIDE` |
| **Discriminated unions** | `kind` field as discriminant, never `type` | `kind: "pad" \| "via"` |
| **Coordinate-bearing fields** | Prefix with coordinate space | `boardOrigin`, `screenAnchor`, `viewportBounds` |
| **Optional fields** | Only when true absence is semantically meaningful | `physicalFootprint?: PhysicalBounds` |
| **Result types** | `Success<T>` / `Failure<E>` union, never `T \| null` | `ParserResult<ParsedBoardData>` |

---

## 2. Type Ownership Rules

Each type is owned by exactly one module. Owning module is the only place the type may be defined. All other modules import from the owner.

| Owner Module | Owns |
|---|---|
| `types/core` | All core types, coordinate types, branded IDs |
| `types/rendering` | Rendering types, viewport state, render stats |
| `types/overlays` | Overlay types, anchor types, overlay visibility |
| `types/net` | Net graph types, signal types, trace paths |
| `types/layout` | Virtual layout types, placement types, layout constraints |
| `types/ocr` | OCR and PDF extraction types |
| `types/diagnostics` | AI diagnostic types, fault candidates, test points |
| `types/formats` | Parser output types, physical board data, layer definitions |

**Rule:** A module may import types from any owner. It may not redefine or shadow a type from another owner.

---

## 3. Serialization Constraints

- All types in this document must be serializable to plain JSON without custom replacers.
- No `Date` objects. Timestamps are `number` (Unix epoch milliseconds) or `string` (ISO 8601).
- No `Map` or `Set` in serializable types. Use `Record<K, V>` or arrays with explicit key fields.
- No class instances in serializable types. All types are plain object interfaces.
- Branded primitives serialize as their underlying primitive (`string` or `number`).
- Discriminated union `kind` fields must be string literals, never numeric enums.
- Types that are intentionally non-serializable (e.g., engine handles, Konva refs) must be marked with the `// NON-SERIALIZABLE` comment and must not appear in any serializable type.

---

## 4. Coordinate Space Contract

All spatial types declare their coordinate space. The three canonical spaces are:

```typescript
/**
 * BOARD_SPACE: Physical PCB units (typically millimeters or mils).
 * Origin is defined by the loaded board format and registered at load time.
 * Immutable during a session.
 */
type CoordinateSpace = "BOARD_SPACE" | "SCREEN_SPACE" | "VIEWPORT_SPACE";
```

| Space | Unit | Origin | Mutates with zoom/pan? |
|---|---|---|---|
| `BOARD_SPACE` | PCB units (mm or mils, declared per board) | Board format origin | No |
| `SCREEN_SPACE` | CSS pixels | Canvas top-left corner | Yes |
| `VIEWPORT_SPACE` | CSS pixels | Visible viewport top-left | Yes |

**Rule:** Any interface with positional fields (`x`, `y`, `width`, `height`, `bounds`) must either
(a) prefix field names with their coordinate space (`boardX`, `screenWidth`), or  
(b) include a `coordinateSpace: CoordinateSpace` discriminant field.

---

## 5. Core Types

```typescript
// ─── Branded Primitives ───────────────────────────────────────────────────────

/** Stable, deterministic identifier for a board component. Never reassigned. */
type ComponentId = string & { readonly __brand: "ComponentId" };

/** Stable identifier for a net. Assigned by parser; never regenerated at runtime. */
type NetId = string & { readonly __brand: "NetId" };

/** Stable identifier for a board layer. Declared in layer manifest at load time. */
type LayerId = string & { readonly __brand: "LayerId" };

/** Stable identifier for an overlay instance. */
type OverlayId = string & { readonly __brand: "OverlayId" };

/** Stable identifier for a virtual layout region. */
type RegionId = string & { readonly __brand: "RegionId" };

/** Stable identifier for a parsed board session. */
type BoardSessionId = string & { readonly __brand: "BoardSessionId" };


// ─── Coordinate Types ─────────────────────────────────────────────────────────

/** A point in BOARD_SPACE. */
interface BoardPoint {
  readonly boardX: number;
  readonly boardY: number;
}

/** A point in SCREEN_SPACE. */
interface ScreenPoint {
  readonly screenX: number;
  readonly screenY: number;
}

/** A point in VIEWPORT_SPACE. */
interface ViewportPoint {
  readonly viewportX: number;
  readonly viewportY: number;
}

/** Axis-aligned bounding box in BOARD_SPACE. */
interface BoardBounds {
  readonly coordinateSpace: "BOARD_SPACE";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Axis-aligned bounding box in SCREEN_SPACE. */
interface ScreenBounds {
  readonly coordinateSpace: "SCREEN_SPACE";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Generic spatial bounds with explicit coordinate space declaration. */
interface SpatialBounds {
  readonly coordinateSpace: CoordinateSpace;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A resolved point with declared coordinate space. */
interface CoordinatePoint {
  readonly coordinateSpace: CoordinateSpace;
  readonly x: number;
  readonly y: number;
}


// ─── Component Taxonomy ───────────────────────────────────────────────────────

enum ComponentSide {
  TOP_SIDE = "TOP_SIDE",
  BOTTOM_SIDE = "BOTTOM_SIDE",
  INTERNAL = "INTERNAL",       // embedded components; future use
  UNKNOWN = "UNKNOWN",
}

enum ComponentCategory {
  RESISTOR        = "RESISTOR",
  CAPACITOR       = "CAPACITOR",
  INDUCTOR        = "INDUCTOR",
  DIODE           = "DIODE",
  TRANSISTOR      = "TRANSISTOR",
  IC              = "IC",
  CONNECTOR       = "CONNECTOR",
  CRYSTAL         = "CRYSTAL",
  FUSE            = "FUSE",
  TRANSFORMER     = "TRANSFORMER",
  RELAY           = "RELAY",
  SWITCH          = "SWITCH",
  MECHANICAL      = "MECHANICAL",
  FIDUCIAL        = "FIDUCIAL",
  TEST_POINT      = "TEST_POINT",
  UNKNOWN         = "UNKNOWN",
}


// ─── Board Component ──────────────────────────────────────────────────────────

/**
 * BoardComponent is the canonical abstraction for every entity rendered
 * on the board canvas. All rendering flows through this interface.
 * No Konva node is instantiated without a corresponding BoardComponent.
 */
interface BoardComponent {
  /** Stable, deterministic identifier. Never reassigned during a session. */
  readonly id: ComponentId;

  /** Human-readable designator as parsed from the board source (e.g. "R12", "U4"). */
  readonly designator: string;

  /** Component classification. */
  readonly category: ComponentCategory;

  /** Board side the component is mounted on. */
  readonly side: ComponentSide;

  /** Physical bounding box in BOARD_SPACE. */
  readonly boardBounds: BoardBounds;

  /** Center point of the component in BOARD_SPACE. */
  readonly boardCenter: BoardPoint;

  /**
   * Rotation in degrees clockwise from board-space north (0°).
   * Always in [0, 360). Negative values are normalized at parse time.
   */
  readonly rotationDegrees: number;

  /** Layer this component's body is primary on. */
  readonly primaryLayerId: LayerId;

  /** All layers this component occupies (body + pads + courtyard). */
  readonly occupiedLayerIds: ReadonlyArray<LayerId>;

  /** IDs of all nets this component connects to, keyed by pad designator. */
  readonly padNetMap: Readonly<Record<string, NetId>>;

  /**
   * Physical footprint polygon in BOARD_SPACE.
   * Absent for components with unknown or purely virtual geometry.
   */
  readonly physicalFootprint?: ReadonlyArray<BoardPoint>;

  /** Schema version of the source that produced this component. */
  readonly schemaVersion: string;
}


// ─── Generic Result Type ──────────────────────────────────────────────────────

interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

interface Failure<E> {
  readonly ok: false;
  readonly error: E;
}

type Result<T, E> = Success<T> | Failure<E>;
```

---

## 6. Rendering Types

```typescript
// ─── Layer ────────────────────────────────────────────────────────────────────

enum RendererLayerKind {
  COPPER        = "COPPER",
  SILKSCREEN    = "SILKSCREEN",
  SOLDER_MASK   = "SOLDER_MASK",
  PASTE_MASK    = "PASTE_MASK",
  COURTYARD     = "COURTYARD",
  DRILL         = "DRILL",
  COMPONENT     = "COMPONENT",
  OVERLAY       = "OVERLAY",
  HIT_TEST      = "HIT_TEST",      // non-visual, used by HitEngine only
}

interface RendererLayer {
  readonly id: LayerId;
  readonly kind: RendererLayerKind;
  readonly side: ComponentSide;
  /**
   * Declared z-order index. Immutable after layer manifest is loaded.
   * Higher values render on top.
   */
  readonly zIndex: number;
  readonly isVisible: boolean;
  readonly isLocked: boolean;       // locked layers reject hit-test events
}


// ─── Render Node ──────────────────────────────────────────────────────────────

/**
 * RenderNode is the resolved, engine-ready description of a single
 * BoardComponent ready for Konva instantiation.
 * All coordinates are in SCREEN_SPACE, resolved by CoordinateEngine.
 */
interface RenderNode {
  readonly componentId: ComponentId;
  readonly layerId: LayerId;
  /** Resolved screen-space bounds. Recomputed on every zoom/pan change. */
  readonly screenBounds: ScreenBounds;
  /** Resolved screen-space center. */
  readonly screenCenter: ScreenPoint;
  /** Rotation in degrees, adjusted for current viewport orientation. */
  readonly screenRotationDegrees: number;
  readonly isVisible: boolean;
  readonly isVirtualized: boolean;   // true = excluded from Konva scene graph
  readonly renderPriority: number;   // higher = rendered first within layer
}


// ─── Viewport State ───────────────────────────────────────────────────────────

/**
 * Complete, serializable state of the viewport.
 * Owned by CoordinateEngine. Read-only outside the engine.
 */
interface ViewportState {
  /** Current zoom factor. 1.0 = 100%. Always positive. */
  readonly zoomLevel: number;
  /** Minimum allowed zoom. Declared in engine config. */
  readonly zoomMin: number;
  /** Maximum allowed zoom. Declared in engine config. */
  readonly zoomMax: number;
  /** Pan offset in SCREEN_SPACE pixels from the board origin. */
  readonly panOffsetScreen: ScreenPoint;
  /** Visible area in BOARD_SPACE. Recomputed by CoordinateEngine on each transform. */
  readonly visibleBoardBounds: BoardBounds;
  /** Canvas dimensions in SCREEN_SPACE. */
  readonly canvasScreenBounds: ScreenBounds;
}


// ─── Visibility State ─────────────────────────────────────────────────────────

/**
 * Aggregated visibility state for a component across all active filters.
 * Resolved by the engine from layer visibility, active net filters, and group filters.
 */
interface VisibilityState {
  readonly componentId: ComponentId;
  readonly isVisible: boolean;
  readonly isHighlighted: boolean;
  readonly isDimmed: boolean;
  /** Reason codes for non-default visibility. Empty array = default state. */
  readonly visibilityReasons: ReadonlyArray<string>;
}


// ─── Render Stats ─────────────────────────────────────────────────────────────

/** Diagnostic telemetry for a completed render pass. Non-serializable fields excluded. */
interface RenderStats {
  readonly sessionId: BoardSessionId;
  readonly renderPassIndex: number;          // monotonically increasing, starts at 0
  readonly totalComponents: number;
  readonly renderedComponents: number;       // excludes virtualized
  readonly virtualizedComponents: number;
  readonly activeOverlays: number;
  readonly renderDurationMs: number;
  readonly coordinateResolutionDurationMs: number;
}
```

---

## 7. Overlay Types

```typescript
// ─── Overlay Foundation ───────────────────────────────────────────────────────

enum OverlayLayer {
  BELOW_COMPONENTS  = "BELOW_COMPONENTS",
  ABOVE_COMPONENTS  = "ABOVE_COMPONENTS",
  ABOVE_ALL         = "ABOVE_ALL",           // tooltips, critical alerts
}

enum OverlayVisibility {
  VISIBLE   = "VISIBLE",
  HIDDEN    = "HIDDEN",
  FADED     = "FADED",     // rendered at reduced opacity
}

/**
 * OverlayAnchor declares where an overlay attaches to the board.
 * Screen position is never stored here — it is resolved by CoordinateEngine
 * at render time from the boardTarget or componentId.
 */
type OverlayAnchor =
  | { readonly kind: "component";   readonly componentId: ComponentId }
  | { readonly kind: "board_point"; readonly boardTarget: BoardPoint }
  | { readonly kind: "net";         readonly netId: NetId }
  | { readonly kind: "region";      readonly regionId: RegionId };

/**
 * Resolved screen-space bounds for a rendered overlay.
 * Computed by CoordinateEngine. Never stored in overlay config.
 */
interface OverlayBounds {
  readonly overlayId: OverlayId;
  readonly screenBounds: ScreenBounds;
  /** The screen point the overlay leader line points to, if applicable. */
  readonly leaderTargetScreen?: ScreenPoint;
}

/**
 * Base interface for all overlay configurations.
 * Extended by specific overlay types (annotation, highlight, tooltip, etc.).
 */
interface OverlayConfig {
  readonly id: OverlayId;
  readonly layer: OverlayLayer;
  readonly visibility: OverlayVisibility;
  readonly anchor: OverlayAnchor;
  /** Declared z-order within the overlay layer. Higher = on top. */
  readonly zIndex: number;
}
```

---

## 8. OCR / PDF Extraction Types

```typescript
// ─── Confidence ───────────────────────────────────────────────────────────────

/**
 * Normalized confidence score in [0.0, 1.0].
 * 1.0 = certain. 0.0 = no confidence.
 * Values outside this range are a bug in the extraction pipeline.
 */
type OCRConfidence = number & { readonly __brand: "OCRConfidence" };


// ─── OCR Primitives ───────────────────────────────────────────────────────────

/**
 * A contiguous region of recognized text on a single PDF page.
 * All bounds are in BOARD_SPACE if geo-registered, otherwise in a
 * page-local coordinate space declared by coordinateSpace.
 */
interface OCRRegion {
  readonly id: string;
  readonly pageIndex: number;           // 0-based
  readonly bounds: SpatialBounds;       // coordinateSpace declared on bounds
  readonly confidence: OCRConfidence;
}

/**
 * A single recognized text block within an OCRRegion.
 */
interface OCRTextBlock {
  readonly regionId: string;
  readonly text: string;
  readonly bounds: SpatialBounds;
  readonly confidence: OCRConfidence;
  /** Reading order index within the region. Deterministic for identical input. */
  readonly readingOrder: number;
}

/**
 * A designator parsed from OCR output and resolved against the component model.
 */
interface ParsedDesignator {
  readonly rawText: string;
  readonly normalizedDesignator: string;
  /** Resolved component ID if the designator matched a known component. */
  readonly resolvedComponentId?: ComponentId;
  readonly confidence: OCRConfidence;
  readonly sourceRegionId: string;
}


// ─── PDF Extraction Result ────────────────────────────────────────────────────

type PDFExtractionError =
  | { readonly kind: "unsupported_format";  readonly detail: string }
  | { readonly kind: "corrupt_input";       readonly detail: string }
  | { readonly kind: "no_text_layer";       readonly detail: string }
  | { readonly kind: "extraction_timeout";  readonly detail: string };

interface PDFExtractionResult {
  readonly sourceFileHash: string;          // deterministic hash of input bytes
  readonly pageCount: number;
  readonly regions: ReadonlyArray<OCRRegion>;
  readonly textBlocks: ReadonlyArray<OCRTextBlock>;
  readonly parsedDesignators: ReadonlyArray<ParsedDesignator>;
  readonly extractionDurationMs: number;
  readonly schemaVersion: string;
}

type PDFExtractionOutcome = Result<PDFExtractionResult, PDFExtractionError>;
```

---

## 9. Net Graph Types

```typescript
// ─── Signal Classification ────────────────────────────────────────────────────

enum SignalType {
  POWER_RAIL    = "POWER_RAIL",
  GROUND        = "GROUND",
  CLOCK         = "CLOCK",
  DATA          = "DATA",
  CONTROL       = "CONTROL",
  ANALOG        = "ANALOG",
  DIFFERENTIAL  = "DIFFERENTIAL",
  UNKNOWN       = "UNKNOWN",
}


// ─── Net Primitives ───────────────────────────────────────────────────────────

/**
 * A net node represents a single electrically-connected point:
 * a pad on a component, a via, or a test point.
 * All positions are in BOARD_SPACE.
 */
interface NetNode {
  readonly id: string;
  readonly netId: NetId;
  readonly componentId: ComponentId;
  /** Pad designator within the component (e.g. "1", "A3", "GND"). */
  readonly padDesignator: string;
  readonly boardPosition: BoardPoint;
  readonly layerId: LayerId;
}

/**
 * A net edge represents a physical connection (trace or via) between two NetNodes.
 */
interface NetEdge {
  readonly id: string;
  readonly netId: NetId;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  /**
   * Trace width in board units. Absent for via connections.
   */
  readonly traceWidthBoardUnits?: number;
  readonly layerId: LayerId;
}

/**
 * Complete electrical net: all nodes and edges belonging to one net.
 */
interface NetGraph {
  readonly netId: NetId;
  readonly netName: string;
  readonly signalType: SignalType;
  readonly nodes: ReadonlyArray<NetNode>;
  readonly edges: ReadonlyArray<NetEdge>;
  /**
   * Nominal voltage in volts. Absent if not declared in board data.
   */
  readonly nominalVoltage?: number;
}

/**
 * An ordered sequence of NetNodes forming a continuous electrical path.
 * All positions in BOARD_SPACE.
 */
interface TracePath {
  readonly netId: NetId;
  readonly orderedNodes: ReadonlyArray<NetNode>;
  readonly totalLengthBoardUnits: number;
  readonly layerTransitions: number;     // number of via crossings in path
}

/**
 * A resolved signal route from source component to target component.
 */
interface SignalRoute {
  readonly netId: NetId;
  readonly sourceComponentId: ComponentId;
  readonly targetComponentId: ComponentId;
  readonly paths: ReadonlyArray<TracePath>;  // may be multiple for differential pairs
  readonly isComplete: boolean;              // false if route could not be fully resolved
}
```

---

## 10. Virtual Layout Types

```typescript
// ─── Placement ────────────────────────────────────────────────────────────────

/**
 * A single placement slot in the virtual layout grid.
 * boardSlot is in BOARD_SPACE. screenSlot is resolved by CoordinateEngine.
 */
interface PlacementSlot {
  readonly slotId: string;
  readonly regionId: RegionId;
  readonly boardSlot: BoardBounds;
  /** Assigned component. Absent for empty slots. */
  readonly assignedComponentId?: ComponentId;
  readonly isOccupied: boolean;
}

/**
 * An anchor point used to align a component within its placement slot.
 * boardAnchor is in BOARD_SPACE.
 */
interface PlacementAnchor {
  readonly componentId: ComponentId;
  readonly boardAnchor: BoardPoint;
  readonly anchorKind: "center" | "top_left" | "pad_1" | "custom";
}


// ─── Layout Regions ───────────────────────────────────────────────────────────

/**
 * A named rectangular region of the virtual layout.
 * Bounds are in BOARD_SPACE.
 */
interface VirtualRegion {
  readonly id: RegionId;
  readonly label: string;
  readonly boardBounds: BoardBounds;
  readonly containedComponentIds: ReadonlyArray<ComponentId>;
  /** Whether this region maps to a declared physical zone on the board. */
  readonly isPhysicallyMapped: boolean;
}

/**
 * A cluster of spatially or functionally related components.
 * Produced by the smart grouping engine.
 */
interface RegionCluster {
  readonly clusterId: string;
  readonly regionId: RegionId;
  readonly memberComponentIds: ReadonlyArray<ComponentId>;
  readonly clusterLabel: string;
  readonly boardBounds: BoardBounds;    // tight bounding box of all members
  readonly clusterKind: "spatial" | "functional" | "net" | "power_domain";
}

/**
 * Resolved layout assignment for a cluster, including all its placement slots.
 */
interface LayoutCluster {
  readonly clusterId: string;
  readonly slots: ReadonlyArray<PlacementSlot>;
  readonly boardBounds: BoardBounds;
}

/**
 * Immutable constraints applied to the virtual layout engine.
 * Declared in engine configuration; not computed at runtime.
 */
interface LayoutConstraints {
  readonly minSlotWidthBoardUnits: number;
  readonly minSlotHeightBoardUnits: number;
  readonly slotPaddingBoardUnits: number;
  readonly maxClustersPerRegion: number;
  readonly allowOverlappingSlots: boolean;
}
```

---

## 11. AI Diagnostic Types

```typescript
// ─── Diagnostic Primitives ────────────────────────────────────────────────────

/**
 * Normalized confidence score for a diagnostic result. [0.0, 1.0].
 * Distinct branded type from OCRConfidence to prevent accidental interchange.
 */
type DiagnosticConfidence = number & { readonly __brand: "DiagnosticConfidence" };

/**
 * A symptom observed on the board: a signal anomaly, missing voltage,
 * unexpected continuity, or other detectable fault indicator.
 */
interface DiagnosticSymptom {
  readonly id: string;
  readonly kind: "no_voltage" | "wrong_voltage" | "no_continuity" | "short" | "signal_absent" | "other";
  readonly affectedNetId?: NetId;
  readonly affectedComponentId?: ComponentId;
  readonly observedValue?: string;      // free-form measured value (e.g. "0.3V")
  readonly expectedValue?: string;      // free-form expected value (e.g. "3.3V")
  readonly description: string;
}

/**
 * A rule in the diagnostic engine that maps symptoms to fault candidates.
 * Rules are data; they do not contain executable logic in this type.
 */
interface DiagnosticRule {
  readonly id: string;
  readonly description: string;
  readonly matchedSymptomKinds: ReadonlyArray<DiagnosticSymptom["kind"]>;
  readonly impliedFaultKind: string;
  readonly confidence: DiagnosticConfidence;
}

/**
 * A voltage path traced from a power source through the net graph
 * to a target component. Used by the diagnostic engine to trace power delivery.
 * All positions in BOARD_SPACE.
 */
interface VoltagePath {
  readonly netId: NetId;
  readonly sourceComponentId: ComponentId;
  readonly targetComponentId: ComponentId;
  readonly nominalVoltage: number;
  readonly tracePath: TracePath;
  readonly isPathComplete: boolean;
}

/**
 * A suggested physical test point for a technician.
 * boardPosition is in BOARD_SPACE.
 */
interface SuggestedTestPoint {
  readonly componentId: ComponentId;
  readonly padDesignator: string;
  readonly boardPosition: BoardPoint;
  readonly netId: NetId;
  readonly rationale: string;
  readonly priority: number;             // lower = higher priority
}

/**
 * A candidate fault identified by the diagnostic engine.
 * This is a data result, not a render artifact. It becomes a render artifact
 * only after being transformed into an OverlayConfig by the view layer.
 */
interface FaultCandidate {
  readonly id: string;
  readonly affectedComponentIds: ReadonlyArray<ComponentId>;
  readonly affectedNetIds: ReadonlyArray<NetId>;
  readonly faultKind: string;
  readonly confidence: DiagnosticConfidence;
  readonly supportingSymptoms: ReadonlyArray<DiagnosticSymptom>;
  readonly suggestedTestPoints: ReadonlyArray<SuggestedTestPoint>;
  readonly diagnosticRuleId: string;
  readonly description: string;
}
```

---

## 12. Future BRD / FZ Parser Types

> These types define the canonical schema that BRD and FZ format adapters
> must produce. They are defined now to enforce adapter contracts before
> implementation begins. Parsers are prohibited from emitting any other schema.

```typescript
// ─── Physical Board Primitives ────────────────────────────────────────────────

/**
 * A physical copper trace segment between two board-space points.
 * All positions in BOARD_SPACE.
 */
interface PhysicalTrace {
  readonly id: string;
  readonly netId: NetId;
  readonly layerId: LayerId;
  readonly startPoint: BoardPoint;
  readonly endPoint: BoardPoint;
  readonly widthBoardUnits: number;
}

/**
 * A via connecting two or more layers at a board-space point.
 */
interface ViaPoint {
  readonly id: string;
  readonly netId: NetId;
  readonly boardPosition: BoardPoint;
  readonly fromLayerId: LayerId;
  readonly toLayerId: LayerId;
  readonly drillDiameterBoardUnits: number;
  readonly padDiameterBoardUnits: number;
}

/**
 * A filled copper polygon on a layer (typically a pour or flood fill).
 * All vertices in BOARD_SPACE.
 */
interface CopperPolygon {
  readonly id: string;
  readonly netId: NetId;
  readonly layerId: LayerId;
  readonly vertices: ReadonlyArray<BoardPoint>;  // closed polygon; last ≠ first
  readonly isFilled: boolean;
}

/**
 * A layer as declared in the board file.
 * Canonical layer IDs are assigned by the format adapter, not by the parser.
 */
interface LayerDefinition {
  readonly id: LayerId;
  /** Layer name as it appears in the source file. */
  readonly sourceName: string;
  readonly kind: RendererLayerKind;
  readonly side: ComponentSide;
  /**
   * Declared z-order from the source file.
   * The layer manifest may override this; source value is preserved for diagnostics.
   */
  readonly sourceZOrder: number;
}


// ─── Parsed Board Data ────────────────────────────────────────────────────────

/**
 * The complete output of a successful board format parse.
 * This is the canonical schema consumed by CoordinateEngine and BoardComponent.
 * BRD and FZ adapters both produce this type.
 */
interface ParsedBoardData {
  readonly sessionId: BoardSessionId;
  /** Declared format of the source file. */
  readonly sourceFormat: "BRD" | "FZ" | "OCR" | "UNKNOWN";
  readonly sourceFileHash: string;
  readonly schemaVersion: string;

  /** Board coordinate unit. Declared by the format adapter after normalization. */
  readonly boardUnit: "mm" | "mil";

  /** Board-space origin, registered with CoordinateEngine at load time. */
  readonly boardOrigin: BoardPoint;

  /** Physical board outline in BOARD_SPACE. */
  readonly boardOutline: ReadonlyArray<BoardPoint>;

  readonly layers: ReadonlyArray<LayerDefinition>;
  readonly components: ReadonlyArray<BoardComponent>;
  readonly nets: ReadonlyArray<NetGraph>;
  readonly traces: ReadonlyArray<PhysicalTrace>;
  readonly vias: ReadonlyArray<ViaPoint>;
  readonly copperPolygons: ReadonlyArray<CopperPolygon>;
}

type BoardParseError =
  | { readonly kind: "unsupported_version"; readonly version: string }
  | { readonly kind: "corrupt_file";        readonly detail: string }
  | { readonly kind: "missing_section";     readonly section: string }
  | { readonly kind: "encoding_error";      readonly detail: string }
  | { readonly kind: "schema_mismatch";     readonly expected: string; readonly got: string };

type ParserResult<T> = Result<T, BoardParseError>;
```

---

## 13. Compatibility Notes

### Current Session Types

All types in this document are compatible with the current rendering pipeline (`React + Konva`) and the existing `CoordinateEngine` interface. No breaking changes are required to adopt them.

### BRD / FZ Readiness

`ParsedBoardData` is the target output schema for both BRD and FZ format adapters. When these parsers are implemented, they must produce `ParsedBoardData` via a `ParserResult<ParsedBoardData>`. No modifications to engine or rendering types are required.

### OCR Integration

`PDFExtractionResult` feeds into `ParsedBoardData` via an OCR-to-board adapter that resolves `ParsedDesignator` entries against the component model and fills in `BoardComponent` fields where possible. The OCR pipeline and the board model are independently typed and never merged directly.

### AI Diagnostic Engine

`FaultCandidate` is the sole output type of the diagnostic engine. It becomes visible on the board by being transformed into `OverlayConfig` instances by the view layer. The diagnostic engine has no awareness of overlay types. The view layer has no awareness of `DiagnosticRule` internals.

### Versioning Strategy

All types that cross a module boundary or are persisted include a `schemaVersion: string` field. Version format is `MAJOR.MINOR.PATCH`. Consumers must validate schema version at the boundary and return a typed error (`schema_mismatch`) rather than attempting to parse an incompatible version.

### Branded Primitive Interoperability

Branded primitives (`ComponentId`, `NetId`, `LayerId`, etc.) serialize as plain strings. When deserializing from storage or network, the receiving module is responsible for re-branding values through its validation boundary before use.

---

*This document is the canonical type contract for Tech Board Pro. To add a type, open a type proposal. To modify an existing type in a breaking way, increment the schema version and update all affected module boundaries. No type may be silently changed.*
