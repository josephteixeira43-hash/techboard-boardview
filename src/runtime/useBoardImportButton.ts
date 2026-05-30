/**
 * useBoardImportButton.ts
 * src/hooks/useBoardImportButton.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — Import BRD/FZ button integration hook
 *
 * Drop-in hook for the existing boardview page.
 * Wires the <input type="file"> to the full import pipeline.
 *
 * Usage in boardview page/component:
 *
 *   const {
 *     fileInputRef,
 *     canvasBoardData,
 *     importState,
 *     openFilePicker,
 *     statusLabel,
 *     isLoading,
 *   } = useBoardImportButton()
 *
 *   // Button:
 *   <button onClick={openFilePicker} disabled={isLoading}>
 *     Import BRD/FZ
 *   </button>
 *   <input ref={fileInputRef} type="file" style={{display:'none'}}
 *     accept=".brd,.kicad_pcb,.fz,.fzz" />
 *
 *   // Canvas:
 *   <InteractiveBoardCanvas boardData={canvasBoardData} ... />
 *
 *   // Status bar:
 *   <span style={{color: qualityColor}}>{statusLabel}</span>
 */

'use client'

import { useRef, useCallback } from 'react'
import {
  useBoardImport,
  isImportLoading,
  importStatusLabel,
  importQualityColor,
} from '@/runtime/BoardImportRuntime'
import type { ImportState, CanvasBoardData } from '@/runtime/BoardImportRuntime'

export interface UseBoardImportButtonReturn {
  /** Attach to <input type="file" ref={fileInputRef} style={{display:'none'}}> */
  fileInputRef:    React.RefObject<HTMLInputElement>

  /** Pass as boardData prop to InteractiveBoardCanvas */
  canvasBoardData: CanvasBoardData | null

  /** Full import state for UI feedback */
  importState:     ImportState

  /** Call from Import button onClick — opens file picker */
  openFilePicker:  () => void

  /** Human-readable status label */
  statusLabel:     string

  /** True while reading/parsing/injecting */
  isLoading:       boolean

  /** CSS color for quality indicator dot */
  qualityColor:    string

  /**
   * Load a demo board without a file.
   * Good for first-run experience.
   */
  loadDemo: (brand?: 'samsung' | 'xiaomi' | 'motorola' | 'iphone' | 'generic') => void

  /** Reset board to empty state */
  reset: () => void
}

export function useBoardImportButton(): UseBoardImportButtonReturn {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    canvasBoardData,
    importState,
    handleFileImport,
    loadMock,
    reset,
  } = useBoardImport()

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Called by <input onChange> — gets the selected file and starts pipeline
  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input value so the same file can be re-imported
    e.target.value = ''
    await handleFileImport(file)
  }, [handleFileImport])

  // Attach onChange to the ref after mount
  // We use a callback ref pattern to avoid adding it as a dep
  const setInputRef = useCallback((el: HTMLInputElement | null) => {
    ;(fileInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el
    if (el) {
      // Remove previous listener if any, then add fresh one
      el.onchange = (e) => onFileChange(e as unknown as React.ChangeEvent<HTMLInputElement>)
    }
  }, [onFileChange])

  return {
    fileInputRef:    fileInputRef as React.RefObject<HTMLInputElement>,
    canvasBoardData,
    importState,
    openFilePicker,
    statusLabel:     importStatusLabel(importState),
    isLoading:       isImportLoading(importState),
    qualityColor:    importQualityColor(importState.quality),
    loadDemo:        loadMock,
    reset,
  }
}
