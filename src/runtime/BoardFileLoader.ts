/**
 * BoardFileLoader.ts
 * src/runtime/BoardFileLoader.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TECHBOARD PRO — File → BoardData pipeline
 *
 * Responsibilities:
 *   1. Read a File object into ArrayBuffer (safe, error-handled)
 *   2. Detect format from file extension
 *   3. Route to BRDParser or FZParser
 *   4. Return normalized BoardData
 *
 * Never throws — always returns a LoadResult with success/error info.
 * On parse failure: returns a deterministic mock BoardData so the renderer
 * never sees null and never crashes.
 *
 * No React. No DOM side effects. No external dependencies.
 * Same file bytes → same BoardData output every time.
 */

import { BRDParser } from '@/parsers/brd/BRDParser'
import { FZParser }  from '@/parsers/fz/FZParser'
import type { BoardData } from '@/parsers/common/BoardTypes'

// ─── Result type ──────────────────────────────────────────────────────────────

export type LoadStatus = 'success' | 'parse_error' | 'read_error' | 'unsupported'

export interface LoadResult {
  readonly status:    LoadStatus
  readonly boardData: BoardData        // always present — mock on failure
  readonly fileName:  string
  readonly fileSize:  number           // bytes
  readonly durationMs: number          // parse time
  readonly error:     string | null    // human-readable error, null on success
}

// ─── Supported extensions ─────────────────────────────────────────────────────

const BRD_EXTENSIONS = new Set(['brd', 'kicad_pcb', 'kicad'])
const FZ_EXTENSIONS  = new Set(['fz', 'fzz'])
const ALL_EXTENSIONS = new Set([...BRD_EXTENSIONS, ...FZ_EXTENSIONS])

export function isSupportedExtension(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return ALL_EXTENSIONS.has(ext)
}

export function getExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

// ─── File reader (Promise-based, no async/await in the engine itself) ─────────

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error(`FileReader error: ${reader.error?.message ?? 'unknown'}`))
    reader.readAsArrayBuffer(file)
  })
}

// ─── Parser singletons (reused across calls — allocation-conscious) ───────────

const brdParser = new BRDParser()
const fzParser  = new FZParser()

// ─── Main loader ──────────────────────────────────────────────────────────────

export class BoardFileLoader {

  /**
   * Load a board file and return normalized BoardData.
   *
   * @param file   Browser File object from <input type="file"> or drag-drop
   * @returns      LoadResult — always contains valid BoardData (mock on error)
   */
  async load(file: File): Promise<LoadResult> {
    const t0       = performance.now()
    const fileName = file.name
    const fileSize = file.size
    const ext      = getExtension(fileName)

    // ── 1. Check supported extension ────────────────────────────────────────
    if (!ALL_EXTENSIONS.has(ext)) {
      const mock = brdParser.mock()
      return {
        status:     'unsupported',
        boardData:  mock,
        fileName,
        fileSize,
        durationMs: performance.now() - t0,
        error:      `Unsupported file type ".${ext}". Supported: .brd, .kicad_pcb, .fz, .fzz`,
      }
    }

    // ── 2. Read file bytes ───────────────────────────────────────────────────
    let buffer: ArrayBuffer
    try {
      buffer = await readFileAsArrayBuffer(file)
    } catch (err) {
      const mock = brdParser.mock()
      return {
        status:     'read_error',
        boardData:  mock,
        fileName,
        fileSize,
        durationMs: performance.now() - t0,
        error:      `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    // ── 3. Parse ─────────────────────────────────────────────────────────────
    try {
      let boardData: BoardData

      if (FZ_EXTENSIONS.has(ext)) {
        boardData = fzParser.parse(buffer, fileName)
      } else {
        boardData = brdParser.parse(buffer, fileName)
      }

      const durationMs = performance.now() - t0

      // If parser returned quality='mock' or errors, still treat as success
      // but surface warnings via the result field
      const hasErrors = boardData.result.errors.length > 0
      const status: LoadStatus = hasErrors ? 'parse_error' : 'success'
      const error = hasErrors
        ? boardData.result.errors.join('; ')
        : null

      return { status, boardData, fileName, fileSize, durationMs, error }

    } catch (err) {
      // Parser threw — return mock so renderer never sees null
      const mock = brdParser.mock()
      return {
        status:     'parse_error',
        boardData:  mock,
        fileName,
        fileSize,
        durationMs: performance.now() - t0,
        error:      `Parse error: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  /**
   * Synchronously generate a mock board for a given brand.
   * Used as the initial state before any file is loaded.
   */
  mockBoard(brand: 'samsung' | 'xiaomi' | 'motorola' | 'iphone' | 'generic' = 'generic'): BoardData {
    const names = {
      samsung:  'Samsung Galaxy A12',
      xiaomi:   'Xiaomi Redmi Note 10',
      motorola: 'Motorola G84',
      iphone:   'iPhone 14 Pro',
      generic:  'Demo Board',
    }
    return brdParser.mock(names[brand])
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const boardFileLoader = new BoardFileLoader()
