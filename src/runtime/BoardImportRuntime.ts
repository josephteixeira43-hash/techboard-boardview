/**
 * BoardImportRuntime.ts
 * src/runtime/BoardImportRuntime.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Import → Runtime injection pipeline
 *
 * Converts a normalized BoardData (from BoardFileLoader) into the shape
 * that InteractiveBoardCanvas expects (its internal BoardData/ComponentData
 * types), and provides a React hook for the full import flow.
 *
 * ARCHITECTURE
 * ────────────
 *
 *  File selected by user
 *       │
 *       ▼
 *  BoardFileLoader.load(file)        ← reads + parses + normalizes
 *       │
 *       ▼
 *  BoardImportRuntime.adapt(bd)      ← converts parser BoardData
 *       │                              → InteractiveBoardCanvas BoardData
 *       ▼
 *  setState(canvasBoardData)         ← single React setState call
 *       │                              (no re-render storm)
 *       ▼
 *  InteractiveBoardCanvas            ← receives new boardData prop
 *       │  boardDataRef.current = bd  ← ref updated without re-render
 *       │  hasFitRef = false          ← triggers auto-fit on next rAF
 *       ▼
 *  rAF render loop                   ← picks up new data automatically
 *
 * DESIGN DECISIONS
 * ────────────────
 * • InteractiveBoardCanvas uses boardDataRef internally — updating the
 *   boardData prop triggers ONE React render (the parent setState), which
 *   updates the ref via useEffect. The canvas render loop is unaffected.
 *
 * • All engine rebuilds (hit detection, overlays, viewport) happen inside
 *   the canvas render loop automatically when boardDataRef changes.
 *   No manual engine.rebuild() calls needed from outside.
 *
 * • Viewport auto-fit is handled by InteractiveBoardCanvas's own
 *   hasFitRef mechanism — resetting it to false triggers a new fit.
 *
 * • The hook returns importState for UI feedback (loading spinner,
 *   error banner, success toast) without polluting the canvas.
 *
 * No external dependencies. No new npm packages. Deterministic.
 */

'use client'

import { useState, useCallback, useRef } from 'react'
import { boardFileLoader }               from './BoardFileLoader'
import type { LoadResult }               from './BoardFileLoader'
import type { BoardData as ParserBoardData, NormalizedBoardComponent } from '@/parsers/common/BoardTypes'

// ─── InteractiveBoardCanvas internal types (mirrored here to avoid coupling) ──
// These match exactly what InteractiveBoardCanvas.tsx expects as props.

export interface CanvasComponentData {
  id:       string
  x:        number
  y:        number
  width:    number
  height:   number
  type?:    string
  nets?:    string[]
  metadata?: Record<string, unknown>
}

export interface CanvasBoardBounds {
  x:      number
  y:      number
  width:  number
  height: number
}

export interface CanvasBoardData {
  id?:        string
  bounds:     CanvasBoardBounds
  components: CanvasComponentData[]
  nets?:      Array<{ id: string; components: string[] }>
}

// ─── Import state for UI feedback ────────────────────────────────────────────

export type ImportPhase =
  | 'idle'       // no file loaded yet
  | 'reading'    // FileReader in progress
  | 'parsing'    // parser running
  | 'injecting'  // adapting + pushing to canvas
  | 'done'       // success
  | 'error'      // failed (but canvas has mock data)

export interface ImportState {
  phase:       ImportPhase
  fileName:    string | null
  fileSize:    number
  durationMs:  number
  error:       string | null
  quality:     'real' | 'partial' | 'mock' | null
  componentCount: number
  netCount:    number
}

const INITIAL_IMPORT_STATE: ImportState = {
  phase:          'idle',
  fileName:       null,
  fileSize:       0,
  durationMs:     0,
  error:          null,
  quality:        null,
  componentCount: 0,
  netCount:       0,
}

// ─── Adapter: parser BoardData → canvas BoardData ─────────────────────────────

/**
 * Converts the rich parser BoardData into the minimal shape that
 * InteractiveBoardCanvas expects.
 *
 * Mapping:
 *   NormalizedBoardComponent.id        → CanvasComponentData.id
 *   NormalizedBoardComponent.x/y       → position (already in mm, post-normalization)
 *   NormalizedBoardComponent.width/h   → dimensions
 *   NormalizedBoardComponent.category  → type
 *   NormalizedBoardComponent.nets      → nets
 *   all other fields                   → metadata (available to metadata engine)
 *
 * Scale: parser outputs mm; canvas uses the same units as its boardData.
 * No scaling needed — the canvas viewport handles zoom/pan.
 */
function adaptBoardData(parsed: ParserBoardData): CanvasBoardData {
  const components: CanvasComponentData[] = parsed.components.map(comp => ({
    id:     comp.id,
    x:      comp.x,
    y:      comp.y,
    width:  Math.max(comp.width,  0.5),   // guard: no zero-size components
    height: Math.max(comp.height, 0.5),
    type:   comp.category,
    nets:   [...comp.nets],
    metadata: {
      reference:    comp.reference,
      value:        comp.value,
      footprint:    comp.footprint,
      description:  comp.description,
      side:         comp.side,
      rotation:     comp.rotation,
      mpn:          comp.mpn,
      dnp:          comp.dnp,
      padCount:     comp.padIds.length,
    },
  }))

  const nets = parsed.nets.map(n => ({
    id:         n.name,
    components: [...n.componentIds],
  }))

  return {
    id:      parsed.name,
    bounds:  {
      x:      0,                     // normalized origin is always (0,0)
      y:      0,
      width:  parsed.bounds.width,
      height: parsed.bounds.height,
    },
    components,
    nets,
  }
}

// ─── React hook ───────────────────────────────────────────────────────────────

export interface UseBoardImportReturn {
  /** Current canvas board data — pass directly as boardData prop */
  canvasBoardData: CanvasBoardData | null

  /** Import state for UI feedback (loading, error, success) */
  importState: ImportState

  /**
   * Call this from the Import BRD/FZ button's onChange handler.
   * Handles the full pipeline: read → parse → adapt → inject.
   */
  handleFileImport: (file: File) => Promise<void>

  /**
   * Load a mock board (no file required).
   * Useful for demo/testing.
   */
  loadMock: (brand?: 'samsung' | 'xiaomi' | 'motorola' | 'iphone' | 'generic') => void

  /** Reset to idle state (clears board data) */
  reset: () => void
}

export function useBoardImport(): UseBoardImportReturn {
  const [canvasBoardData, setCanvasBoardData] = useState<CanvasBoardData | null>(null)
  const [importState,     setImportState]     = useState<ImportState>(INITIAL_IMPORT_STATE)

  // Prevent concurrent imports
  const isLoadingRef = useRef(false)

  const handleFileImport = useCallback(async (file: File) => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true

    // ── Phase: reading ───────────────────────────────────────────────────────
    setImportState(prev => ({
      ...prev,
      phase:    'reading',
      fileName: file.name,
      fileSize: file.size,
      error:    null,
    }))

    // ── Phase: parsing ───────────────────────────────────────────────────────
    setImportState(prev => ({ ...prev, phase: 'parsing' }))

    const result: LoadResult = await boardFileLoader.load(file)

    // ── Phase: injecting ─────────────────────────────────────────────────────
    setImportState(prev => ({ ...prev, phase: 'injecting' }))

    // Adapt parser output → canvas shape (synchronous, allocation-light)
    const adapted = adaptBoardData(result.boardData)

    // Single setState → ONE React render → boardDataRef updated via useEffect
    // Canvas render loop picks up new data on next rAF automatically
    setCanvasBoardData(adapted)

    // ── Phase: done / error ──────────────────────────────────────────────────
    setImportState({
      phase:          result.status === 'success' ? 'done' : 'error',
      fileName:       file.name,
      fileSize:       file.size,
      durationMs:     result.durationMs,
      error:          result.error,
      quality:        result.boardData.result.quality,
      componentCount: result.boardData.components.length,
      netCount:       result.boardData.nets.length,
    })

    isLoadingRef.current = false
  }, [])

  const loadMock = useCallback((
    brand: 'samsung' | 'xiaomi' | 'motorola' | 'iphone' | 'generic' = 'samsung'
  ) => {
    const parsed  = boardFileLoader.mockBoard(brand)
    const adapted = adaptBoardData(parsed)
    setCanvasBoardData(adapted)
    setImportState({
      phase:          'done',
      fileName:       parsed.name,
      fileSize:       0,
      durationMs:     0,
      error:          null,
      quality:        'mock',
      componentCount: parsed.components.length,
      netCount:       parsed.nets.length,
    })
  }, [])

  const reset = useCallback(() => {
    setCanvasBoardData(null)
    setImportState(INITIAL_IMPORT_STATE)
  }, [])

  return { canvasBoardData, importState, handleFileImport, loadMock, reset }
}

// ─── Import status helpers (pure, for UI rendering) ──────────────────────────

export function isImportLoading(state: ImportState): boolean {
  return state.phase === 'reading' || state.phase === 'parsing' || state.phase === 'injecting'
}

export function importStatusLabel(state: ImportState): string {
  switch (state.phase) {
    case 'idle':      return 'Nenhum arquivo carregado'
    case 'reading':   return 'Lendo arquivo...'
    case 'parsing':   return 'Analisando board...'
    case 'injecting': return 'Carregando no canvas...'
    case 'done':
      return state.quality === 'mock'
        ? `Demo board (${state.componentCount} componentes)`
        : `${state.fileName} — ${state.componentCount} componentes, ${state.netCount} nets`
    case 'error':
      return `Erro: ${state.error ?? 'falha desconhecida'} (usando demo)`
    default:
      return ''
  }
}

export function importQualityColor(quality: ImportState['quality']): string {
  switch (quality) {
    case 'real':    return '#00d4ff'   // cyan  — real parsed data
    case 'partial': return '#f59e0b'   // amber — some data missing
    case 'mock':    return '#6b7280'   // gray  — demo data
    default:        return '#6b7280'
  }
}
