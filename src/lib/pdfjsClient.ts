/**
 * PDF.js singleton — worker path shared across boardview + schematics.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsLib: any = null

export async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib
  pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  return pdfjsLib
}
