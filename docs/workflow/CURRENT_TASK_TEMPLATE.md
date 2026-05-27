# CURRENT_TASK_TEMPLATE.md

**Document type:** Implementation Session Template  
**Module:** `techboard-boardview` — per-session  
**Authority:** Engineering Workflow  
**Status:** Reusable — fill in before every session  
**Version:** 1.0.0  

> Copy this template at the start of every implementation session.  
> Fill in every section. Leave no field as "TBD".  
> An incomplete template is not a valid session start.

---

## HOW TO USE THIS TEMPLATE

1. Copy the full template below the divider.
2. Fill in every section before opening Cursor or starting a Claude conversation.
3. Paste the filled template as the **first message** of your session.
4. Do not ask the AI to "figure out the scope" — scope is your responsibility, declared here.
5. Reference the three permanent documents when a constraint is unclear:
   - `PROJECT_OVERVIEW.md` — platform context
   - `ARCHITECTURE_RULES.md` — binding engineering rules
   - `TYPES_REFERENCE.md` — canonical type contracts

---

## TASK SCOPING EXAMPLES

### ✅ GOOD — Scoped Task

```
Objective: Implement OverlayAnchor resolution for board_point kind inside CoordinateEngine.
Module: engine/CoordinateEngine
Files allowed: engine/CoordinateEngine.ts, engine/CoordinateEngine.test.ts
Files forbidden: types/*, board/BoardComponent.tsx, overlays/*
```

Why this is good:
- Single function, single file, named method
- Explicit forbidden list prevents drift
- Types are read-only — no schema mutation risk
- Test file is scoped to the same module

---

### ✅ GOOD — Scoped Task

```
Objective: Add CRYSTAL to ComponentCategory enum and update BoardComponent pad rendering for crystal footprint.
Module: types/core, board/BoardComponent
Files allowed: types/core.ts, board/BoardComponent.tsx
Files forbidden: engine/*, overlays/*, formats/*, hooks/*
```

Why this is good:
- Two-file scope with explicit justification (type + consumer)
- Enum addition is additive — no breaking change
- No engine or overlay code touched

---

### ❌ BAD — Broad Task

```
Objective: Improve the boardview rendering performance.
```

Why this is bad:
- No module scope declared
- "Improve" is not a measurable output
- Invites cross-module edits without authorization
- Will cause architectural drift in an AI-assisted session

---

### ❌ BAD — Broad Task

```
Objective: Refactor the coordinate system to be more flexible.
```

Why this is bad:
- "More flexible" is not a declared requirement
- CoordinateEngine is a shared, locked contract
- Modifying it without an ADR violates `ARCHITECTURE_RULES.md` INV-03
- High probability of breaking OverlayAnchor resolution

---

### ❌ BAD — Broad Task

```
Objective: Review the whole project and suggest improvements.
```

Why this is bad:
- Consumes entire context window with no deterministic output
- Produces suggestions that may contradict `ARCHITECTURE_RULES.md`
- Not a valid implementation session — use a dedicated review session instead

---

## TOKEN-EFFICIENT PROMPT EXAMPLES

### ✅ Efficient

```
Using TYPES_REFERENCE.md §9 (NetGraph types) and ARCHITECTURE_RULES.md §6 (Net Graph Rules),
implement NetGraph traversal from a given ComponentId in engine/NetEngine.ts.
Do not modify any types. Do not touch CoordinateEngine.
```

### ✅ Efficient

```
In overlays/AnnotationOverlay.tsx:
- Anchor type is already OverlayAnchor (board_point kind)
- CoordinateEngine.toScreen() is the only allowed position resolver
- Add support for rendering a leader line from overlay to boardTarget
- Do not add new props to OverlayConfig
```

### ✅ Efficient

```
Fix: HighlightOverlay retains stale screenBounds after pan event.
Root cause: screenBounds is cached, not re-resolved.
Fix location: overlays/HighlightOverlay.tsx, resolvePosition() method only.
Rule reference: ARCHITECTURE_RULES.md O-02.
Do not modify CoordinateEngine. Do not modify OverlayConfig type.
```

---

## DANGEROUS PROMPT EXAMPLES

### ⛔ Dangerous

```
Rewrite CoordinateEngine to use a more modern approach.
```

Risk: Destroys the single source of spatial truth. Violates INV-03.

### ⛔ Dangerous

```
Add a helper function to BoardComponent that computes screen position directly.
```

Risk: Creates hidden transform outside CoordinateEngine. Violates INV-03, C-01, O-01.

### ⛔ Dangerous

```
Use Math.random() to assign unique colors to component groups for now, we'll fix it later.
```

Risk: Violates INV-01. "We'll fix it later" is not acceptable for determinism violations.

### ⛔ Dangerous

```
Simplify the type system — there are too many interfaces, just use `any` for now.
```

Risk: Destroys type contract. Violates T-01. Propagates to parser and diagnostic boundaries.

### ⛔ Dangerous

```
Since BRD support isn't built yet, just hardcode the coordinate origin to (0, 0).
```

Risk: Creates implicit assumption that breaks BRD/FZ compatibility. Violates BF-03.

---

---

# ── SESSION TEMPLATE (copy from here) ──────────────────────────────────────────

## 1. Current Objective

> One sentence. Start with a verb. Be specific enough that a passing engineer
> can confirm when it is done without asking questions.

```
[ FILL IN ]
```

Example: `Implement toScreen() resolution for OverlayAnchor kind "net" in CoordinateEngine.`

---

## 2. Current Module

> The single module this session operates within.
> If you need two modules, create two sessions.

```
Module path : [ FILL IN ]   (e.g. engine/CoordinateEngine)
Module owner: [ FILL IN ]   (e.g. types/core, engine, overlays, formats, board, hooks)
```

---

## 3. Allowed Files To Edit

> Exhaustive list. If a file is not here, it must not be touched.
> The AI must ask for explicit authorization before editing anything outside this list.

```
1. [ FILL IN ]
2. [ FILL IN ]
3. [ optional ]
```

---

## 4. Forbidden Files

> Explicit list of files that must not be modified under any circumstances in this session.
> Always include shared type files unless type modification is the declared objective.

```
- types/*           (shared type contracts — read only unless explicitly authorized)
- ARCHITECTURE_RULES.md
- TYPES_REFERENCE.md
- PROJECT_OVERVIEW.md
- [ ADD any additional files specific to this session ]
```

---

## 5. Dependencies In Scope

> List only the modules/files this session's code is allowed to import from.
> Importing from anything outside this list requires a new session.

```
Allowed imports:
- [ FILL IN ]   (e.g. types/core — read only)
- [ FILL IN ]   (e.g. engine/CoordinateEngine — read only, no modifications)
- [ FILL IN ]
```

---

## 6. Required Existing Contracts

> List the specific interfaces, types, or rules this session must conform to.
> Reference document and section for each.

```
- TYPES_REFERENCE.md §[ # ] — [ type name ]     : [ why it applies ]
- TYPES_REFERENCE.md §[ # ] — [ type name ]     : [ why it applies ]
- ARCHITECTURE_RULES.md §[ # ] — [ rule ID ]    : [ why it applies ]
- ARCHITECTURE_RULES.md §[ # ] — [ rule ID ]    : [ why it applies ]
```

---

## 7. Rendering Constraints

> Declare which rendering rules apply to this session.
> Copy rule IDs from ARCHITECTURE_RULES.md §2.

```
Active rendering rules: [ e.g. R-01, R-02, R-05 ]

Session-specific notes:
- [ FILL IN or "none beyond standard rules" ]
```

---

## 8. Determinism Constraints

> Confirm determinism requirements for this session's output.

```
[ ] Math.random() is prohibited in all files touched this session.
[ ] All seeded or computed values derive from stable, declared input props or engine state.
[ ] Visual state produced by this session's code is identical given identical input.
[ ] No timestamp, UUID, or environment variable is used as a visual seed.

Session-specific determinism notes:
- [ FILL IN or "none beyond standard rules" ]
```

---

## 9. Coordinate System Constraints

> Declare which coordinate rules apply and which coordinate spaces are in use.

```
Active coordinate rules: [ e.g. C-01, C-02, C-03 ]

Coordinate spaces used in this session:
- [ ] BOARD_SPACE   — used for: [ FILL IN ]
- [ ] SCREEN_SPACE  — used for: [ FILL IN ]
- [ ] VIEWPORT_SPACE — used for: [ FILL IN ]

Resolution path:
All screen positions are resolved via: [ e.g. CoordinateEngine.toScreen() ]

Session-specific coordinate notes:
- [ FILL IN or "none beyond standard rules" ]
```

---

## 10. Overlay Constraints

> Fill in only if this session touches overlay code. Otherwise mark N/A.

```
Applies: [ YES / NO / N/A ]

If YES:
Active overlay rules: [ e.g. O-01, O-02, O-03 ]

- Overlays compute their own coordinates: [ MUST BE: NO ]
- Overlay screen positions are resolved by: [ MUST BE: CoordinateEngine ]
- Overlay re-resolves on zoom/pan: [ MUST BE: YES ]
- New overlay type added: [ YES / NO ] — if YES, added to layer manifest: [ YES / NO ]
```

---

## 11. Performance Constraints

> Declare performance rules active for this session.
> Copy rule IDs from ARCHITECTURE_RULES.md §10.

```
Active performance rules: [ e.g. P-01, P-03 ]

- Does this session's code execute during the render path? [ YES / NO ]
  If YES: all expensive computation must complete BEFORE render pass begins.

- Does this session add new Konva nodes? [ YES / NO ]
  If YES: virtualization threshold check required. Rule: P-02.

- Does this session add new overlays? [ YES / NO ]
  If YES: overlay count bounded by engine config. Rule: P-04.
```

---

## 12. Output Expectations

> Describe what "done" looks like. Be explicit. Vague outputs are not acceptable.

```
When this session is complete, the following will be true:

1. [ FILL IN — specific, verifiable statement ]
2. [ FILL IN — specific, verifiable statement ]
3. [ FILL IN — optional ]

The following will NOT have changed:
1. [ FILL IN — what must remain untouched ]
2. [ FILL IN ]
```

---

## 13. Acceptance Checklist

> All items must be checked before the session output is considered complete.

```
FUNCTIONAL
[ ] Objective stated in §1 is fully implemented
[ ] No regressions in directly related existing functionality
[ ] All new functions have explicit TypeScript types on all parameters and return values
[ ] No `any` types introduced in any file touched this session

DETERMINISM
[ ] No Math.random() added
[ ] No non-deterministic seeds in visual state
[ ] Identical input produces identical output

COORDINATE SYSTEM
[ ] All new coordinates are named with their space (boardX, screenY, etc.)
[ ] No coordinate computed outside CoordinateEngine
[ ] No hidden transforms introduced

ARCHITECTURE
[ ] No files outside §3 Allowed Files were modified
[ ] No imports outside §5 Dependencies In Scope were added
[ ] No shared types modified without explicit authorization in §1
[ ] No new Konva nodes created outside a BoardComponent boundary

OVERLAYS (if applicable)
[ ] Overlays do not compute their own screen coordinates
[ ] Overlays re-resolve positions after zoom/pan
[ ] New overlay types registered in layer manifest

REVIEW
[ ] Code reviewed against relevant rules in ARCHITECTURE_RULES.md
[ ] No anti-patterns from ARCHITECTURE_RULES.md §16 introduced
```

---

## 14. Explicit Non-Goals

> List what this session explicitly does NOT do.
> This prevents scope creep during AI-assisted implementation.

```
This session does NOT:
- [ FILL IN ]   (e.g. "implement BRD parser — that is a separate session")
- [ FILL IN ]   (e.g. "modify CoordinateEngine internals")
- [ FILL IN ]   (e.g. "change any shared type in types/")
- [ FILL IN ]   (e.g. "add new overlay types beyond what is declared in §1")
```

---

## 15. Regression Prevention Checklist

> Identify the specific existing behaviors that must not break.
> Run or manually verify each before closing the session.

```
The following existing behaviors must remain unchanged:

[ ] [ FILL IN — e.g. "AnnotationOverlay remains anchored to component center after pan" ]
[ ] [ FILL IN — e.g. "ComponentCategory.RESISTOR renders correctly on TOP_SIDE" ]
[ ] [ FILL IN — e.g. "LayerVisibility toggle removes nodes from Konva scene graph" ]
[ ] [ FILL IN — e.g. "CoordinateEngine.toScreen() returns identical results for identical input" ]

Test files to run (if applicable):
- [ FILL IN or "none — manual verification" ]
```

---

## 16. AI Context Budget Recommendations

> Follow these to minimize token waste and prevent context window pollution.

```
CONTEXT TO INCLUDE IN SESSION PROMPT
[ ] This filled template (always)
[ ] Relevant section(s) from ARCHITECTURE_RULES.md (cite section, do not paste full doc)
[ ] Relevant type(s) from TYPES_REFERENCE.md (cite section, do not paste full doc)
[ ] Only the specific files listed in §3 Allowed Files To Edit
[ ] Specific error message or failing test output if this is a bug fix

CONTEXT TO EXCLUDE FROM SESSION PROMPT
[ ] Full project file tree
[ ] Unrelated modules not in §5 Dependencies In Scope
[ ] Previous session transcripts (start fresh each session)
[ ] Full contents of ARCHITECTURE_RULES.md or TYPES_REFERENCE.md
    — reference by section number instead

PROMPT STRUCTURE RECOMMENDATION
  1. Paste this filled template
  2. One sentence: "Implement / Fix / Add [objective]"
  3. Paste only the specific files from §3
  4. Cite rules by ID, not by pasting them
  5. State what must NOT change (from §14 and §15)

CONTEXT BUDGET TARGET
  Aim for < 2,000 tokens of context per session.
  If your context exceeds this, your scope is too broad — split into two sessions.

TOKEN ANTI-PATTERNS TO AVOID
  ⛔ "Here is the full project, analyze it and implement X"
  ⛔ Pasting all three architecture docs in full
  ⛔ Including files from modules not in scope
  ⛔ Asking for "suggestions" before stating the objective
  ⛔ Combining a bug fix and a new feature in one session
```

---

*Fill every section. A session with an incomplete template risks architectural drift,  
scope creep, and non-deterministic output — the exact failure modes this template prevents.*
