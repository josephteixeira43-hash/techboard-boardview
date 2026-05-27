import type { BoardComponent } from '@/types/board'
import type { PdfNetLabel } from '@/types/pdfNetGraph'
import { extractNetLabelsFromTextParts } from '@/core/pdf/PDFNetGraphEngine'
import { BOARD_H, BOARD_W } from '@/core/boardview/CoordinateEngine'
import { inferTypeFromDesignator } from '@/parsers/parseUtils'
import { getPdfJs } from './pdfjsClient'

/** Designators típicos de boardview/schematic PDF */
const DESIGNATOR_RE =
  /^(?:R|C|L|U|Q|D|J|CN|TP|FL|FB|SW|Y|X|ANT|PAM|PMIC|CPU|GPU|BAT|SIM|SD|LDO|OSC|XTAL|MIC|SPK|EAR|VIB|LED)[A-Z0-9]{0,8}$/i

export interface PdfTextHit {
  id: string
  x: number
  y: number
  width: number
  height: number
  confidence: number
  source: 'pdfjs' | 'ocr'
  pageIndex: number
}

export interface PdfExtractionResult {
  components: BoardComponent[]
  hits: PdfTextHit[]
  netLabels: PdfNetLabel[]
  pageCount: number
  pageIndex: number
  imageSize: { width: number; height: number }
  method: 'pdfjs' | 'hybrid' | 'json'
}

export interface PdfComponentJson {
  id: string
  name?: string
  x_top?: number
  y_top?: number
  x_bottom?: number
  y_bottom?: number
  width?: number
  height?: number
  side?: BoardComponent['side']
  type?: string
  category?: string
}

function normalizeDesignator(raw: string): string | null {
  const id = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (id.length < 2 || id.length > 12) return null
  if (!DESIGNATOR_RE.test(id)) return null
  return id
}

function mapPdfToBoard(
  x: number,
  y: number,
  w: number,
  h: number,
  pageW: number,
  pageH: number
): { x: number; y: number; width: number; height: number } {
  const scaleX = BOARD_W / pageW
  const scaleY = BOARD_H / pageH
  const width = Math.max(16, Math.min(120, w * scaleX))
  const height = Math.max(12, Math.min(80, h * scaleY))
  const bx = Math.max(0, Math.min(BOARD_W - width, x * scaleX))
  const by = Math.max(0, Math.min(BOARD_H - height, y * scaleY))
  return { x: bx, y: by, width, height }
}

function stableId(designator: string, deviceId: string): string {
  const slug = designator.replace(/[^A-Za-z0-9]/g, '_')
  return deviceId ? `${deviceId}_${slug}` : slug
}

export function hitsToBoardComponents(
  hits: PdfTextHit[],
  deviceId: string,
  side: BoardComponent['side'] = 'top'
): BoardComponent[] {
  const byId = new Map<string, PdfTextHit>()
  for (const h of hits) {
    const prev = byId.get(h.id)
    if (!prev || h.confidence > prev.confidence) byId.set(h.id, h)
  }

  return Array.from(byId.values()).map((h) => {
    const category = inferTypeFromDesignator(h.id)
    const comp: BoardComponent = {
      id: stableId(h.id, deviceId),
      name: h.id,
      category,
      side,
      width: h.width,
      height: h.height,
      device_id: deviceId,
      data_source: 'ocr',
    }
    if (side === 'bottom' || side === 'sub_bottom') {
      comp.x_bottom = h.x
      comp.y_bottom = h.y
    } else {
      comp.x_top = h.x
      comp.y_top = h.y
    }
    return comp
  })
}

export function parseManualJson(
  data: unknown,
  deviceId: string
): BoardComponent[] {
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { components?: unknown })?.components)
      ? (data as { components: PdfComponentJson[] }).components
      : null

  if (!list) throw new Error('JSON inválido — esperado array de componentes')

  const hits: PdfTextHit[] = []
  for (const row of list as PdfComponentJson[]) {
    const id = normalizeDesignator(String(row.id ?? row.name ?? ''))
    if (!id) continue
    const side = row.side ?? 'top'
    const useBottom = side === 'bottom' || side === 'sub_bottom'
    const x = useBottom ? (row.x_bottom ?? row.x_top ?? 0) : (row.x_top ?? row.x_bottom ?? 0)
    const y = useBottom ? (row.y_bottom ?? row.y_top ?? 0) : (row.y_top ?? row.y_bottom ?? 0)
    hits.push({
      id,
      x: Number(x) || 0,
      y: Number(y) || 0,
      width: Number(row.width) || 40,
      height: Number(row.height) || 20,
      confidence: 1,
      source: 'pdfjs',
      pageIndex: 0,
    })
  }

  return hitsToBoardComponents(hits, deviceId, 'top')
}

/**
 * Extrai posições de texto do PDF via PDF.js (camada de texto vetorial).
 */
export async function extractFromPdfBuffer(
  buffer: ArrayBuffer,
  options: {
    deviceId: string
    pageIndex?: number
    onProgress?: (pct: number, message: string) => void
  }
): Promise<PdfExtractionResult> {
  const { deviceId, pageIndex = 0, onProgress } = options
  onProgress?.(5, 'Carregando PDF…')

  const lib = await getPdfJs()
  const doc = await lib.getDocument({ data: buffer }).promise
  const pageCount = doc.numPages
  const pageNum = Math.min(Math.max(1, pageIndex + 1), pageCount)

  onProgress?.(20, `Lendo página ${pageNum}/${pageCount}…`)

  const page = await doc.getPage(pageNum)
  const viewport = page.getViewport({ scale: 1 })
  const pageW = viewport.width
  const pageH = viewport.height

  const textContent = await page.getTextContent()
  const hits: PdfTextHit[] = []
  const netLabels: PdfNetLabel[] = []

  for (const item of textContent.items) {
    if (!('str' in item) || typeof item.str !== 'string') continue
    const parts = item.str.split(/\s+/).filter(Boolean)

    const tx = item.transform as number[]
    const fontSize = Math.abs(tx[0]) || Math.abs(tx[3]) || 10
    const pdfX = tx[4]
    const pdfY = tx[5]
    const w = item.width || fontSize * Math.max(parts.join(' ').length, 2) * 0.55
    const h = fontSize * 1.15
    const topY = pageH - pdfY - h
    const mapped = mapPdfToBoard(pdfX, topY, w, h, pageW, pageH)
    const pageIdx = pageNum - 1

    netLabels.push(...extractNetLabelsFromTextParts(parts, mapped, pageIdx))

    for (const part of parts) {
      const id = normalizeDesignator(part)
      if (!id) continue

      hits.push({
        id,
        ...mapped,
        confidence: 0.95,
        source: 'pdfjs',
        pageIndex: pageIdx,
      })
    }
  }

  await doc.destroy()

  onProgress?.(85, `Mapeados ${hits.length} designadores…`)

  const components = hitsToBoardComponents(hits, deviceId)

  onProgress?.(100, 'Concluído')

  return {
    components,
    hits,
    netLabels,
    pageCount,
    pageIndex: pageNum - 1,
    imageSize: { width: pageW, height: pageH },
    method: 'pdfjs',
  }
}

/**
 * OCR no canvas renderizado — complementa PDFs escaneados sem camada de texto.
 */
export async function supplementWithOcr(
  canvas: HTMLCanvasElement,
  existing: PdfTextHit[],
  options: {
    pageIndex: number
    onProgress?: (pct: number) => void
  }
): Promise<PdfTextHit[]> {
  const known = new Set(existing.map((h) => h.id))
  const merged = [...existing]

  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status === 'recognizing text' && m.progress != null) {
        options.onProgress?.(Math.round(m.progress * 100))
      }
    },
  })

  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6' })
    const { data } = await worker.recognize(canvas)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const words: any[] =
      data.words ??
      data.lines?.flatMap((l: { words?: unknown[] }) => l.words ?? []) ??
      data.blocks?.flatMap((b: { paragraphs?: Array<{ lines?: Array<{ words?: unknown[] }> }> }) =>
        b.paragraphs?.flatMap((p) => p.lines?.flatMap((l) => l.words ?? []) ?? []) ?? []
      ) ??
      []

    const scaleX = BOARD_W / canvas.width
    const scaleY = BOARD_H / canvas.height

    for (const w of words) {
      if ((w.confidence ?? 0) < 40) continue
      const id = normalizeDesignator(String(w.text ?? '').trim())
      if (!id || known.has(id)) continue
      known.add(id)
      const bw = (w.bbox.x1 - w.bbox.x0) * scaleX
      const bh = (w.bbox.y1 - w.bbox.y0) * scaleY
      merged.push({
        id,
        x: w.bbox.x0 * scaleX,
        y: w.bbox.y0 * scaleY,
        width: Math.max(16, bw),
        height: Math.max(12, bh),
        confidence: (w.confidence ?? 50) / 100,
        source: 'ocr',
        pageIndex: options.pageIndex,
      })
    }
  } finally {
    await worker.terminate()
  }

  return merged
}

export async function renderPdfPageToCanvas(
  buffer: ArrayBuffer,
  pageIndex: number,
  scale = 2
): Promise<{ canvas: HTMLCanvasElement; pageW: number; pageH: number }> {
  const lib = await getPdfJs()
  const doc = await lib.getDocument({ data: buffer }).promise
  const page = await doc.getPage(pageIndex + 1)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport }).promise
  await doc.destroy()
  return { canvas, pageW: viewport.width, pageH: viewport.height }
}
