# Tech Board Pro — Project Overview

**Document type:** Foundational Architecture Reference  
**Module:** `techboard-boardview`  
**Status:** Active Development  
**Version:** 1.0.0-arch  

---

## 1. Purpose

Tech Board Pro is an advanced **GSM boardview platform** designed for high-fidelity, deterministic rendering of printed circuit board (PCB) layouts. The platform enables engineers and technicians to inspect, annotate, and diagnose board-level components through a layered, interactive canvas interface.

The `techboard-boardview` module is the **canonical rendering engine** within the platform. It owns all visual representation of board geometry, component overlays, coordinate resolution, and user interaction on the board surface.

---

## 2. Platform Scope

| Domain | Description |
|---|---|
| **Board Rendering** | Deterministic, pixel-accurate rendering of PCB layers (copper, silkscreen, mask) |
| **Component Overlays** | Synchronized overlays for component highlight, annotation, and metadata display |
| **Coordinate Resolution** | All spatial operations route through `CoordinateEngine` — no raw pixel math in components |
| **Diagnostics Support** | Board state reflects hardware fault trees; supports GSM-level signal tracing |
| **Format Compatibility** | Architecture designed for future BRD and FZ board format ingestion |

---

## 3. Core Architectural Pillars

### 3.1 Deterministic Rendering

The platform enforces **fully deterministic output** across all rendering paths.

- `Math.random()` is **prohibited** at every layer of the stack.
- All visual states are derived exclusively from declarative props, stable IDs, and engine-computed transforms.
- Identical input data must always produce identical visual output — critical for reproducibility in diagnostic workflows.

### 3.2 React + Konva Rendering Architecture

The rendering stack is built on **React** (component model and state management) combined with **Konva** (canvas-based 2D scene graph).

- React manages lifecycle, data flow, and declarative board state.
- Konva manages the canvas scene: layers, nodes, hit detection, and transform groups.
- The two layers communicate strictly through the `BoardComponent` abstraction — neither layer reaches into the other directly.

### 3.3 BoardComponent as Canonical Abstraction

`BoardComponent` is the **single authoritative abstraction** for any entity rendered on the board canvas.

- Every rendered element — pads, traces, vias, component bodies, overlays — is expressed as a `BoardComponent`.
- No Konva node is instantiated outside of a `BoardComponent` boundary.
- `BoardComponent` is the only entry point through which props, layout hints, and engine-resolved coordinates flow into the canvas.

### 3.4 CoordinateEngine for Overlay Synchronization

All coordinate resolution is owned by `CoordinateEngine`.

- Converts between board-space coordinates (PCB units) and canvas-space coordinates (pixels).
- Handles zoom, pan, and viewport transforms centrally.
- Overlays (annotations, highlights, tooltips) **must** request their screen positions from `CoordinateEngine` — never compute them independently.
- This ensures overlays remain locked to their board targets across all zoom/pan states.

### 3.5 Modular Engine Separation

The rendering engine, coordinate system, and data ingestion are **physically separated modules** with strict API boundaries.

```
techboard-boardview/
├── engine/          # CoordinateEngine, LayerEngine, HitEngine
├── board/           # BoardComponent, BoardLayer, BoardScene
├── overlays/        # AnnotationOverlay, HighlightOverlay, TooltipOverlay
├── formats/         # (future) BRD parser, FZ parser
├── types/           # Shared TypeScript contracts (see TYPES_REFERENCE.md)
└── hooks/           # React hooks bridging engine state to components
```

No module imports across sibling boundaries except through their declared public API surface.

---

## 4. Future Compatibility Targets

The architecture is designed to accommodate the following without structural refactoring:

| Target | Notes |
|---|---|
| **BRD format** | Binary board description files from EDA tools (e.g. Cadence Allegro). Parser lives in `formats/` with no coupling to the rendering engine. |
| **FZ format** | Fritz!Box / alternative schematic-linked board format. Same isolation principle applies. |
| **Multi-board sessions** | `CoordinateEngine` instances are scoped per board; multiple boards can coexist in a session. |
| **Remote diagnostic mode** | Board state is serializable; the engine accepts board state snapshots over network transport. |

---

## 5. What This Module Does Not Own

To maintain clean separation of concerns, `techboard-boardview` explicitly **does not own**:

- Authentication or user session state
- Network data fetching (board data arrives via injected props or a data adapter contract)
- Application routing or navigation
- Diagnostic rule engines or fault tree logic (consumes results; does not compute them)
- Theming or design token generation (consumes a token contract; does not define it)

---

## 6. Key Constraints Summary

| Constraint | Rationale |
|---|---|
| No `Math.random()` anywhere | Deterministic rendering; reproducible diagnostics |
| All coordinates via `CoordinateEngine` | Single source of truth for spatial transforms |
| All canvas nodes via `BoardComponent` | Enforces lifecycle ownership and overlay sync |
| No cross-module internal imports | Enforces modular boundary integrity |
| BRD/FZ parsers isolated in `formats/` | Future format support without engine coupling |
| Konva nodes never created in React components directly | Canvas lifecycle managed exclusively by `BoardComponent` |

---

## 7. Related Documents

| Document | Purpose |
|---|---|
| `ARCHITECTURE_RULES.md` | Binding rules governing all implementation decisions |
| `TYPES_REFERENCE.md` | Canonical TypeScript type contracts for all engine and component interfaces |
| `CURRENT_TASK_TEMPLATE.md` | Template for scoping and tracking active development tasks |

---

*This document is part of the modular context workflow for Tech Board Pro. It is a living architecture reference — update it when foundational decisions change, not when implementation details change.*
