# ROADMAP_EXECUTION_PLAN.md
## Tech Board Pro — Strategic Execution Roadmap
**Version:** 1.0  
**Status:** Master Execution Plan  
**Scope:** Post-Foundational Architecture Stabilization  
**Last Updated:** 2026-05-26

---

## TABLE OF CONTENTS

1. [Current Project Maturity Assessment](#1-current-project-maturity-assessment)
2. [Existing Stable Subsystems](#2-existing-stable-subsystems)
3. [Existing Partial Subsystems](#3-existing-partial-subsystems)
4. [High-Risk Architectural Areas](#4-high-risk-architectural-areas)
5. [Technical Debt Risks](#5-technical-debt-risks)
6. [AI Token-Cost Analysis by Subsystem](#6-ai-token-cost-analysis-by-subsystem)
7. [Recommended Implementation Order](#7-recommended-implementation-order)
8. [Parallelizable Development Tracks](#8-parallelizable-development-tracks)
9. [Milestone Structure](#9-milestone-structure)
10. [Long-Term Scalability Concerns](#10-long-term-scalability-concerns)
11. [Track A — PCB Realism](#track-a--pcb-realism)
12. [Track B — AI GSM](#track-b--ai-gsm)
13. [Track C — Real Board Support](#track-c--real-board-support)
14. [Track D — UX / Premium Experience](#track-d--ux--premium-experience)
15. [What NOT to Build Yet](#15-what-not-to-build-yet)
16. [Execution Anti-Patterns](#16-execution-anti-patterns)
17. [Cross-Module Risk Analysis](#17-cross-module-risk-analysis)
18. [Claude Session Cadence & Branching Strategy](#18-claude-session-cadence--branching-strategy)

---

## 1. CURRENT PROJECT MATURITY ASSESSMENT

### Overall Maturity: **Level 3 / 5 — Functional Foundation**

| Dimension                   | Maturity | Notes                                                   |
|-----------------------------|----------|---------------------------------------------------------|
| Data Architecture           | ★★★★☆    | Modular `src/data/` barrel pattern established          |
| Rendering Engine            | ★★★☆☆    | Functional but visually basic; no PCB realism layer     |
| Repair Guides Module        | ★★★★★    | Stable, complete, 8 guides, search + animated markers   |
| Test Points Module          | ★★★★☆    | Real images, arrow markers; lacks electrical context    |
| AI Diagnostics              | ★☆☆☆☆    | Not yet started; planned architecture only              |
| Real Board Parsing          | ★☆☆☆☆    | Not started; requires external parser strategy          |
| UX / Navigation             | ★★★☆☆    | Functional; no onboarding, overlays, or search          |
| Cloud / Sync                | ★☆☆☆☆    | Not started; preparation phase only                     |
| BoardView Web Companion     | ★★★☆☆    | Supabase-backed; homepage functional, `/boardview` WIP  |

### Key Assessment Findings

- The project has **solid module isolation** — the data barrel pattern (`src/data/index.js`) is the right foundation.
- The Electron + React stack is **proven and stable** for the current feature set.
- The biggest near-term risk is **scope expansion before stabilizing rendering** — adding AI or parsers before locking visual behavior creates compounding regression.
- The BoardView web companion has **real data** (Samsung A125F/M) but an **incomplete rendering surface**. Both apps must mature in parallel, not independently.

---

## 2. EXISTING STABLE SUBSYSTEMS

These subsystems are **locked** — changes require explicit regression testing before touching.

| Subsystem                    | Status   | File Location                        | Risk if Modified |
|------------------------------|----------|--------------------------------------|------------------|
| Repair Guides Module         | ✅ Stable | `src/data/guides.js`                  | HIGH             |
| Model Search + Autocomplete  | ✅ Stable | `src/data/brands.js` + UI component  | MEDIUM           |
| Animated Marker System       | ✅ Stable | Component layer                       | HIGH             |
| Test Points (image + arrows) | ✅ Stable | `src/data/testPoints.js`             | MEDIUM           |
| Data Barrel Index            | ✅ Stable | `src/data/index.js`                  | CRITICAL         |
| Supabase Schema (A125F/M)    | ✅ Stable | Supabase tables: devices, components | HIGH             |
| BoardView Homepage           | ✅ Stable | `techboard-boardview` / index page   | LOW              |

> **Principle:** Stable subsystems are **frozen surfaces**. Extend them via new modules, not by modifying their internals.

---

## 3. EXISTING PARTIAL SUBSYSTEMS

These subsystems are **in progress** and represent the active development frontier.

| Subsystem                 | Completion | Blocker                                            |
|---------------------------|------------|----------------------------------------------------|
| BoardView `/boardview` page | ~40%      | Incomplete file creation; still in loading state   |
| Schematic Lines Renderer  | ~50%       | `schematicLines.js` exists; no interactivity layer |
| Schematics Module         | ~60%       | Data present; UI rendering partial                 |
| Electrical Parts Layer    | ~30%       | Supabase table exists; no visualization connected  |
| Voltage Reference Layer   | ~30%       | Data in `voltages` table; no rendering             |
| Troubleshooting Flows     | ~35%       | 13 flows in Supabase; no UI tree renderer          |
| Dashboard Module          | ~70%       | Data in `dashboard.js`; display logic incomplete   |

> **Priority:** Complete `/boardview` rendering surface **before** building any new subsystem. A partial rendering surface blocks all downstream work.

---

## 4. HIGH-RISK ARCHITECTURAL AREAS

### 4.1 Cross-App Rendering Contract
The Electron app and the BoardView web app share **conceptual rendering** (markers, overlays, component positions) but have **no shared codebase**. This creates divergence risk as both evolve independently.

**Risk Level:** HIGH  
**Mitigation:** Define a shared JSON schema for component positions and marker data early. Do not share code — share the contract.

### 4.2 Framer Motion Injection (Cursor Agent Regression)
The Electron app has a documented recurring issue: Cursor Agent unpromptedly injects `motion.div` tags. This contaminates deterministic rendering with animation library dependencies.

**Risk Level:** MEDIUM-HIGH  
**Mitigation:** Add an explicit comment header to sensitive component files: `// DO NOT USE FRAMER MOTION IN THIS COMPONENT`. Treat any `motion.div` appearance as a regression signal.

### 4.3 Supabase as Single Source of Truth
All BoardView data lives in Supabase. Offline behavior, schema migrations, and query performance are currently unaddressed.

**Risk Level:** MEDIUM  
**Mitigation:** Add a local caching layer (`localStorage` or IndexedDB) before adding more device data. Do not couple rendering directly to network calls.

### 4.4 Real Board Parser Isolation
Introducing BRD/FZ parsers without strict isolation will contaminate the virtual/handcrafted board data layer.

**Risk Level:** CRITICAL (if introduced prematurely)  
**Mitigation:** Parsers must live in a completely separate module with an adapter interface. Virtual boards and parsed boards must never share the same rendering path without explicit normalization.

### 4.5 Windows File Extension Issue
Cursor GUI saves files with `.txt` extension on Windows, corrupting module files silently.

**Risk Level:** MEDIUM (operational)  
**Mitigation:** All file creation via `type nul > filename` in CMD or PowerShell `Set-Content`. Never trust Cursor GUI for file creation. Document this in project CONTRIBUTING notes.

---

## 5. TECHNICAL DEBT RISKS

| Debt Item                            | Severity | Payoff Timing         | Notes                                              |
|--------------------------------------|----------|-----------------------|----------------------------------------------------|
| No shared rendering schema between apps | HIGH   | Before Track C        | Blocks real board support integration              |
| No offline/cache layer in BoardView  | MEDIUM   | Before Milestone 3    | Will cause UX failures under bad connectivity      |
| Framer Motion contamination risk     | MEDIUM   | Ongoing               | Requires file-level documentation discipline       |
| No regression test suite            | HIGH     | Before Milestone 2    | Stable subsystems have no safety net               |
| Electrical data not connected to UI  | HIGH     | Milestone 2 blocker   | Voltages, traces, electrical_parts are orphaned    |
| `schematicLines.js` lacks interactivity | MEDIUM | Track A dependency   | Must be interactive before PCB realism layers add  |
| No error boundaries in React tree    | MEDIUM   | Before AI Track       | AI modules will introduce async failure states     |

---

## 6. AI TOKEN-COST ANALYSIS BY SUBSYSTEM

Token cost is a proxy for **session complexity** and **regression risk**. Higher token cost = smaller task slices needed per session.

| Subsystem                     | Token Cost | Reason                                                      |
|-------------------------------|------------|-------------------------------------------------------------|
| Repair Guides (stable)        | 🟢 Low      | Isolated, data-driven, no rendering complexity              |
| BoardView `/boardview` fix    | 🟡 Medium   | Rendering completion; known structure                       |
| PCB Silhouettes / Textures    | 🟡 Medium   | SVG/Canvas generation; contained scope                      |
| Copper Simulation             | 🟠 High     | Multi-layer visual logic; regression-prone                  |
| AI Symptom Inference          | 🔴 Very High | Architecture-spanning; requires electrical abstractions      |
| Voltage Path Analysis         | 🔴 Very High | Graph traversal + rendering; complex domain model           |
| BRD Parser                    | 🔴 Very High | Binary/proprietary format; high ambiguity                   |
| FZ Parser                     | 🔴 Very High | Similar to BRD; format documentation sparse                 |
| Electrical Heatmaps           | 🟠 High     | Requires voltage data integration + rendering fusion        |
| Troubleshooting Flow UI       | 🟡 Medium   | Tree renderer; data already exists in Supabase              |
| Onboarding / UX Overlays      | 🟢 Low      | Self-contained; no domain complexity                        |
| Cloud Sync Preparation        | 🟡 Medium   | Schema design only at this phase; no implementation         |

> **Rule:** Never attempt a 🔴 Very High subsystem in a single Claude session. Break into isolated sub-tasks with defined inputs and outputs.

---

## 7. RECOMMENDED IMPLEMENTATION ORDER

### Phase 0 — Stabilization (Current Priority)
1. Complete `/boardview?id=...` rendering (unblock all downstream)
2. Connect `electrical_parts` and `voltages` tables to BoardView UI
3. Render troubleshooting flows as interactive tree in BoardView
4. Add React error boundaries to both apps
5. Define and document the **shared component position JSON schema**

### Phase 1 — Visual Differentiation
1. Track D: UX improvements (search, contextual overlays, smooth navigation)
2. Track A: PCB silhouettes, board textures, via fields (visible, low-risk)
3. Track A: Fake routing and copper simulation (constrained to visual layer only)

### Phase 2 — Intelligence Foundation
1. Track B: Deterministic symptom → component mapping (no ML yet)
2. Track B: Smart highlighting and test point suggestion (rule-based)
3. Track B: Fault probability ranking (weighted rule system)

### Phase 3 — Real Board Readiness
1. Track C: Parser isolation module design (no implementation yet)
2. Track C: BRD parser proof-of-concept (single device, isolated)
3. Track C: Compatibility adapter layer

### Phase 4 — Advanced AI + Scale
1. Track B: ML fault inference (if data volume justifies)
2. Track C: Multi-board parser support
3. Track D: Cloud sync + marketplace preparation

---

## 8. PARALLELIZABLE DEVELOPMENT TRACKS

The following track pairs can be developed concurrently **without cross-contamination**, provided module boundaries are respected:

| Parallel Pair         | Safe Condition                                                  |
|-----------------------|-----------------------------------------------------------------|
| Track A + Track D     | Track A works on rendering layer; Track D on navigation/UX only |
| Track B + Track D     | Track B is pure logic/data; Track D is pure UI                  |
| Track C (parser only) | Must be fully isolated; never share state with Tracks A or B   |

> **WARNING:** Track B (AI GSM) and Track C (Real Board Parsing) must **never** be developed in the same session or branch. Their data models are incompatible until a normalization adapter exists.

---

## 9. MILESTONE STRUCTURE

### Milestone 0 — "Solid Ground" *(current target)*
- [ ] `/boardview` fully renders for Samsung A125F/M
- [ ] Electrical parts and voltages connected to UI
- [ ] Troubleshooting flows rendered as interactive tree
- [ ] React error boundaries in place
- [ ] Shared component position schema documented

**Exit Criteria:** A technician can load a board, see components, voltages, and navigate a troubleshooting flow — end-to-end, no loading states.

---

### Milestone 1 — "Visible Differentiation"
- [ ] PCB silhouettes and board textures live
- [ ] Via fields and shield zones rendered
- [ ] Flex connector visual regions defined
- [ ] Contextual overlays on component hover
- [ ] Advanced search (component name, voltage, symptom)

**Exit Criteria:** The app looks professionally distinct from any generic schematic viewer. First impressionable demo-ready state.

---

### Milestone 2 — "Smart Technician Assistant"
- [ ] Symptom input → component suggestion (deterministic rules)
- [ ] Smart highlighting (affected region on fault selection)
- [ ] Test point suggestion (rule-based, no ML)
- [ ] Fault probability ranking (weighted rules)
- [ ] Voltage path tracing (visual highlight along known traces)

**Exit Criteria:** A technician can describe a symptom and receive a guided diagnostic path without manual lookup.

---

### Milestone 3 — "Real Board Ready"
- [ ] Parser isolation module exists and is documented
- [ ] BRD parser proof-of-concept for one device
- [ ] Compatibility adapter normalizes parsed data to virtual schema
- [ ] Fallback to virtual board if parse fails

**Exit Criteria:** A parsed real board renders correctly in the existing viewer without breaking virtual board functionality.

---

### Milestone 4 — "Platform Scale"
- [ ] Cloud sync architecture designed and prototyped
- [ ] Marketplace data model defined
- [ ] Multi-device board support (5+ devices parsed)
- [ ] ML fault inference pilot (if training data available)

**Exit Criteria:** The product is architecturally ready to support a marketplace of boards and third-party data contributions.

---

## 10. LONG-TERM SCALABILITY CONCERNS

| Concern                           | Horizon    | Pre-emptive Action                                        |
|-----------------------------------|------------|-----------------------------------------------------------|
| Supabase row limits / query cost  | Milestone 3 | Add pagination and caching before adding more devices    |
| React tree size with many markers | Milestone 2 | Virtualize marker rendering (windowing) early             |
| Parser format fragmentation       | Milestone 3 | Adapter pattern — one canonical internal format          |
| Electron bundle size growth       | Ongoing    | Audit `node_modules`; lazy-load non-critical modules      |
| AI inference latency (user-facing)| Milestone 2 | All rule-based inference must be synchronous initially   |
| Multi-language board data         | Milestone 4 | Internationalization schema in Supabase from day one     |
| Offline technician use case       | Milestone 2 | Local-first caching before cloud sync is introduced      |

---

## TRACK A — PCB REALISM

**Priority:** HIGH (Milestone 1 core)  
**Goal:** Transform the visual layer from functional to professionally convincing PCB representation — without modifying the data or logic layers.

### Track A Subsystems

| Subsystem            | Order | Complexity | Rendering Risk | Token Cost | Dependencies                     |
|----------------------|-------|------------|----------------|------------|----------------------------------|
| Board Silhouettes    | 1     | Low        | Low            | 🟢 Low      | Device dimensions in data layer  |
| PCB Textures         | 2     | Low        | Low            | 🟢 Low      | SVG/Canvas; self-contained        |
| Via Fields           | 3     | Low        | Low            | 🟢 Low      | Position data; visual only        |
| Shield Zones         | 4     | Medium     | Low            | 🟡 Medium   | Component region definitions      |
| Fake Routing         | 5     | Medium     | Medium         | 🟡 Medium   | Must not use real trace data yet  |
| Flex Connectors      | 6     | Medium     | Medium         | 🟡 Medium   | Region + orientation data         |
| Copper Simulation    | 7     | High       | High           | 🟠 High     | Layer model must exist first      |
| Density Refinement   | 8     | Medium     | Medium         | 🟡 Medium   | All above subsystems stable       |
| Electrical Heatmaps  | 9     | High       | High           | 🟠 High     | Requires Track B voltage data     |

### Track A — Module Boundary Rules

- PCB visual layers must be **additive overlays**, never modifying the base component position model.
- Copper simulation must operate in its **own rendering pass** — not mixed into marker or component rendering.
- Electrical heatmaps are a **Track A + Track B intersection** — do not start until both upstream tracks reach Milestone 2.
- All visual layers must be individually **togglable** (show/hide) without affecting data integrity.

### Track A — Recommended Claude Workflow

- **Task granularity:** One visual layer per session (e.g., "implement via field renderer only").
- **Session start:** Paste current component position schema and current rendering file structure.
- **Session end:** Verify new layer does not affect marker hit-testing or component selection logic.
- **Never combine** texture + routing + copper in one session — each is a separate visual pass.

---

## TRACK B — AI GSM

**Priority:** MEDIUM-HIGH (Milestone 2 core)  
**Goal:** Build an intelligent, deterministic diagnostic assistant that guides technicians from symptom to fault — without machine learning in the first two phases.

### Track B Subsystems

| Subsystem                   | Order | Complexity | Regression Risk | Token Cost    | Dependencies                         |
|-----------------------------|-------|------------|-----------------|---------------|--------------------------------------|
| Symptom Inference (rules)   | 1     | Medium     | Low             | 🟡 Medium      | Troubleshooting flow data in Supabase |
| Troubleshooting Flow UI     | 2     | Medium     | Low             | 🟡 Medium      | Milestone 0 flow data complete        |
| Smart Highlighting          | 3     | Medium     | Medium          | 🟡 Medium      | Component position schema             |
| Test Point Suggestion       | 4     | Medium     | Medium          | 🟡 Medium      | `testPoints.js` + symptom map         |
| Fault Probability Ranking   | 5     | Medium     | Low             | 🟡 Medium      | Symptom inference module              |
| Voltage Path Analysis       | 6     | High       | High            | 🔴 Very High   | Voltage + trace data + render layer   |
| Intelligent Signal Tracing  | 7     | High       | High            | 🔴 Very High   | Real trace data OR virtual graph      |
| ML Fault Inference          | 8     | Very High  | High            | 🔴 Very High   | Milestone 4; requires training data   |

### Track B — Architecture Dependencies

- All Track B logic must live in a **pure logic module** (`src/ai/` or `src/diagnostics/`) — no rendering logic inside AI modules.
- The **electrical abstraction layer** must be defined before voltage path analysis: components are nodes, traces are edges, voltages are weights.
- Smart highlighting must call into the **rendering layer via a clean interface** — it must not directly manipulate SVG/Canvas elements.

### Track B — Deterministic Boundaries

- Phases 1–2 of Track B are **entirely rule-based and deterministic**. No probabilistic output yet.
- Fault probability ranking in Phase 2 uses **weighted static rules**, not learned weights.
- ML is a Phase 4 concern and must be treated as a **separate pluggable module** that can be disabled without breaking deterministic behavior.

### Track B — Future ML Opportunities

- Symptom pattern clustering (unsupervised, after 1000+ repair sessions logged)
- Automatic test point priority reordering based on technician feedback
- Fault recurrence prediction by device model

### Track B — Recommended Claude Workflow

- **Never combine** symptom inference + voltage analysis in one session. These are two separate domain models.
- **Session start:** Paste the electrical abstraction schema and current troubleshooting flow structure.
- **Session end:** Verify no rendering imports exist inside the AI module.
- For voltage path analysis: dedicate **minimum 2 sessions** — one for graph model, one for rendering integration.

---

## TRACK C — REAL BOARD SUPPORT

**Priority:** LOW (Milestone 3)  
**Goal:** Enable import of real PCB design files (BRD, FZ) as a rendering source — while fully preserving virtual board compatibility.

### Track C Subsystems

| Subsystem                  | Order | Complexity | Migration Risk | Token Cost    | Dependencies                         |
|----------------------------|-------|------------|----------------|---------------|--------------------------------------|
| Parser Isolation Module    | 1     | Medium     | Low            | 🟡 Medium      | None; greenfield                      |
| BRD Parser (POC)           | 2     | Very High  | Medium         | 🔴 Very High   | Isolation module + format docs        |
| FZ Parser (POC)            | 3     | Very High  | Medium         | 🔴 Very High   | Same isolation module                 |
| Compatibility Adapter      | 4     | High       | High           | 🔴 Very High   | Both parsers + virtual schema         |
| Real Traces Renderer       | 5     | High       | High           | 🟠 High        | Adapter + Track A rendering base      |
| Real Vias Renderer         | 6     | Medium     | Medium         | 🟡 Medium      | Real traces renderer                  |
| Copper Polygons            | 7     | High       | High           | 🟠 High        | Layer model + real traces             |
| Layer-Aware Rendering      | 8     | Very High  | Very High      | 🔴 Very High   | All above + rendering architecture    |

### Track C — Parser Isolation Strategy

```
src/
  parsers/
    index.js              ← public adapter interface ONLY
    brd/
      BRDParser.js        ← isolated; no rendering imports
      BRDNormalizer.js    ← transforms to canonical schema
    fz/
      FZParser.js         ← isolated; no rendering imports
      FZNormalizer.js     ← transforms to canonical schema
    schema/
      BoardSchema.js      ← canonical internal board format (shared contract)
```

- Parsers must never import from `src/data/` or any rendering module.
- All parsed output is **normalized to `BoardSchema`** before leaving the parser module.
- The rendering engine receives only `BoardSchema` objects — it does not know whether the source was virtual or parsed.

### Track C — Staged Rollout Strategy

1. **Stage 1:** Parser module exists; only used in developer testing, never exposed to production UI.
2. **Stage 2:** Single device (Samsung A125F/M BRD if available) parsed and rendered in isolated test route.
3. **Stage 3:** Compatibility adapter validated; virtual board regression tests pass with parsed data injected.
4. **Stage 4:** UI toggle to switch between virtual and parsed rendering mode (for testing).
5. **Stage 5:** Parsed mode promoted to primary for supported devices.

### Track C — Fallback Virtualization

If a parser fails or produces malformed output, the system must **silently fall back** to the virtual board for that device. This fallback must be tested explicitly before Stage 3.

### Track C — Recommended Claude Workflow

- Parser sessions are **the highest token-cost sessions in the entire project**. Limit to one parser function per session.
- Never work on BRD and FZ parsers in the same session.
- **Always define `BoardSchema` first** — before writing any parser code. The schema is the contract; parsers are just adapters.
- Treat every parser session as **potentially throwaway** — parsers are notoriously format-ambiguous.

---

## TRACK D — UX / PREMIUM EXPERIENCE

**Priority:** HIGH (Milestone 1 parallel track)  
**Goal:** Maximize perceived professional quality through UX improvements that require low implementation risk and deliver high user perception value.

### Track D Subsystems

| Subsystem                   | Order | Complexity | Regression Risk | Token Cost | User Perception Value |
|-----------------------------|-------|------------|-----------------|------------|-----------------------|
| Smooth Navigation           | 1     | Low        | Low             | 🟢 Low      | HIGH                  |
| Contextual Overlays         | 2     | Low        | Low             | 🟢 Low      | HIGH                  |
| Advanced Search             | 3     | Medium     | Low             | 🟡 Medium   | HIGH                  |
| Onboarding Flow             | 4     | Medium     | Low             | 🟡 Medium   | HIGH (first-run)      |
| Workflow Optimization       | 5     | Medium     | Medium          | 🟡 Medium   | MEDIUM                |
| Cloud Sync Preparation      | 6     | High       | Medium          | 🟡 Medium   | LOW (invisible now)   |
| Marketplace Preparation     | 7     | High       | Low             | 🟡 Medium   | LOW (invisible now)   |

### Track D — Low-Risk / High-Impact Improvements

These items can be implemented in any order, in isolated sessions, with minimal regression risk:

- **Smooth navigation:** CSS transitions between module views; no state changes.
- **Contextual overlays:** On component hover, show voltage reference + related guides link.
- **Advanced search:** Unified search across components, guides, test points, and symptoms.
- **Onboarding:** First-run tooltip sequence; state stored in `localStorage`; zero coupling.

### Track D — Implementation Sequencing Rules

- Implement UX improvements **strictly in self-contained components**. Never touch core rendering or data modules.
- Cloud sync and marketplace preparation are **schema design tasks only** at this phase — no backend implementation.
- Onboarding must be the **last Track D item before Milestone 1 exit** — it presupposes stable UI to guide users through.

### Track D — Recommended Claude Workflow

- **Ideal session size:** 2–3 UX items per session (they are low-complexity and low-token-cost).
- **Session start:** Paste current navigation/routing structure.
- **Never mix** Track D with Track A or Track B in the same session — UX context and rendering context do not compose well.

---

## 15. WHAT NOT TO BUILD YET

The following are explicitly **deferred** — building them now would create premature complexity and block stable progress:

| Item                            | Reason to Defer                                                       |
|---------------------------------|-----------------------------------------------------------------------|
| ML fault inference              | No training data; deterministic rules must prove concept first        |
| Full BRD/FZ multi-device parser | Too complex; single-device POC must validate the approach first       |
| Real-time collaboration         | Cloud sync foundation doesn't exist yet                               |
| Marketplace backend             | Requires stable API contract; data model not finalized                |
| Plugin/extension system         | Module boundaries are still settling; extensibility is premature      |
| Custom rendering engine         | React + SVG/Canvas is sufficient; native renderer adds no value now   |
| Automated regression tests      | Should be added at Milestone 0 exit — not deferred further            |
| 3D board visualization          | High complexity, low utility for repair technician workflow           |
| Multi-language UI               | Internationaliation schema is valuable; full translation is not yet   |
| WebAssembly parser acceleration | Performance is not the bottleneck at current scale                    |

---

## 16. EXECUTION ANTI-PATTERNS

These are the most likely failure modes, documented explicitly to prevent recurrence:

### Anti-Pattern 1: Cross-Module Implementation Bursts
**What it looks like:** Starting a session to fix one thing and ending up modifying 4 unrelated modules.  
**Why it happens:** A fix requires context from another module, which reveals another issue.  
**The trap:** Each change looks small; combined, they create untraceable regressions.  
**Prevention:** Define a single module boundary at session start. If a second module needs changing, **stop and open a new session.**

### Anti-Pattern 2: Premature Parser Complexity
**What it looks like:** Starting BRD parser before the adapter interface is defined.  
**Why it happens:** Parser implementation feels concrete and satisfying; schema design feels abstract.  
**The trap:** Parser output shape is defined by implementation accident, not by rendering requirements.  
**Prevention:** `BoardSchema.js` must exist and be reviewed **before** any parser line is written.

### Anti-Pattern 3: Framer Motion Contamination
**What it looks like:** A Claude or Cursor session introduces `motion.div` into a stable rendering component.  
**Why it happens:** AI agents pattern-match on "animation" and reach for Framer Motion automatically.  
**The trap:** Silent dependency injection that causes bundle bloat and rendering non-determinism.  
**Prevention:** File-level comment headers; post-session grep for `motion.` before committing.

### Anti-Pattern 4: Supabase Direct Coupling
**What it looks like:** A new UI component calls `supabase.from(...)` directly inside a React component.  
**Why it happens:** It works; Supabase client is globally available.  
**The trap:** Offline failure, loading state proliferation, no caching layer, test impossibility.  
**Prevention:** All Supabase calls must go through `src/lib/queries.ts`. Never query directly from components.

### Anti-Pattern 5: Milestone Skipping
**What it looks like:** Starting Track B (AI) before Milestone 0 is complete.  
**Why it happens:** AI features are exciting; `/boardview` rendering fix is tedious.  
**The trap:** AI module has no stable rendering surface to highlight into; everything regresses simultaneously.  
**Prevention:** Milestone exit criteria are hard gates. No Track B work until Milestone 0 sign-off.

### Anti-Pattern 6: Premature Optimization
**What it looks like:** Adding virtualized rendering, WebWorkers, or memoization before there is a measurable performance problem.  
**Why it happens:** Architectural planning surfaces these concerns; implementation urge follows.  
**The trap:** Optimization complexity obscures actual bugs; harder to debug; session token waste.  
**Prevention:** Measure first. Optimize only when a specific, reproducible slow path is identified.

---

## 17. CROSS-MODULE RISK ANALYSIS

| Module Interaction                     | Risk | Trigger Condition                              | Mitigation                                          |
|----------------------------------------|------|------------------------------------------------|-----------------------------------------------------|
| Track A Copper + Track B Heatmap       | HIGH | Both modify same rendering layer               | Heatmap must be a Track A overlay — not Track B code|
| Track B Signal Tracing + Track C Traces| HIGH | AI highlights real traces before adapter exists| Block Track B signal tracing until adapter is stable|
| Track D Search + Track B Symptoms      | MEDIUM | Search indexes AI symptom model prematurely  | Search first indexes only components and guides     |
| Track A Fake Routing + Track C Real    | MEDIUM | Visual regression when real routing replaces fake | Fake routing must be a **replaceable layer**       |
| Electron + BoardView schema drift      | HIGH | Both apps evolve independently                 | Lock shared JSON schema at Milestone 0              |
| Supabase migration + BoardView UI      | HIGH | Schema change breaks existing queries          | Always add columns; never rename or remove          |

---

## 18. CLAUDE SESSION CADENCE & BRANCHING STRATEGY

### Ideal Session Cadence

| Session Type            | Frequency      | Max Duration | Scope Limit                              |
|-------------------------|----------------|--------------|------------------------------------------|
| Stabilization sessions  | Daily          | 1 module     | One partial subsystem to completion      |
| Track A visual sessions | 2–3x per week  | 1 layer      | One visual layer (e.g., via fields only) |
| Track B logic sessions  | 1–2x per week  | 1 component  | One diagnostic function                  |
| Track C parser sessions | 1x per week    | 1 function   | One parser sub-component                 |
| Track D UX sessions     | 2–3x per week  | 2–3 items    | Self-contained UI components only        |
| Architecture sessions   | 1x per sprint  | N/A          | Schema, contracts, and plan updates only |

### Session Start Checklist

Before every Claude session, paste the following:
1. Current module file structure (relevant section only)
2. The component or data schema being modified
3. The **single output** expected from this session
4. Any known anti-patterns relevant to this session (from Section 16)

### Suggested Branching Strategy

```
main
├── milestone/0-solid-ground          ← current active milestone branch
│   ├── fix/boardview-rendering       ← specific fix branch
│   └── feat/electrical-parts-ui     ← feature branch
├── milestone/1-visible-differentiation
├── milestone/2-smart-assistant
├── milestone/3-real-board-ready
└── milestone/4-platform-scale
```

**Rules:**
- Never commit directly to `main`.
- Each Track has its own feature branch within the active milestone branch.
- Track C (parsers) always branches from `main` directly — never from a feature branch — to prevent contamination.
- Merge to milestone branch only when module is complete and manually regression-tested against stable subsystems.

### Token Budget Per Session (Rough Guide)

| Session Type            | Estimated Token Budget | Notes                                    |
|-------------------------|------------------------|------------------------------------------|
| Stabilization fix       | ~8k–15k tokens         | Known structure; targeted output         |
| Track A visual layer    | ~10k–20k tokens        | SVG/Canvas generation is token-moderate  |
| Track B logic module    | ~15k–25k tokens        | Domain complexity; clear inputs          |
| Track C parser work     | ~25k–40k tokens        | Highest cost; expect iteration           |
| Track D UX components   | ~5k–12k tokens         | Lowest cost; most sessions               |
| Architecture/schema     | ~8k–15k tokens         | Text-heavy; no code generation           |

> **Budget rule:** If a session is approaching 30k tokens and the task is not complete, **stop, document state, and continue in a new session**. Do not force completion — it degrades output quality and increases regression risk.

---

## DOCUMENT MAINTENANCE

This document should be reviewed and updated at:
- Every milestone exit
- When a new subsystem is promoted from "partial" to "stable"
- When a new high-risk area is discovered
- When a new anti-pattern is observed in practice

**Owner:** Ze (Tech Board Pro lead)  
**Reviewed with:** Claude Sonnet (AI pair programmer)  
**Next review trigger:** Milestone 0 completion

---

*End of ROADMAP_EXECUTION_PLAN.md*
