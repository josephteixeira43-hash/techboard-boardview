'use client'

import { useState, useCallback } from 'react'
import type { BoardComponent } from '@/types/board'
import type { PdfExtractionResult } from '@/lib/pdfComponentExtractor'
import {
  extractFromPdfBuffer,
  hitsToBoardComponents,
  parseManualJson,
  renderPdfPageToCanvas,
  supplementWithOcr,
} from '@/lib/pdfComponentExtractor'

export type PdfImportMethod = 'pdfjs' | 'hybrid' | 'json'

export function usePCBFromPDF(deviceId: string) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<PdfExtractionResult | null>(null)
  const [extractedComponents, setExtractedComponents] = useState<BoardComponent[]>([])

  const setProg = useCallback((pct: number, msg: string) => {
    setProgress(pct)
    setStatusMessage(msg)
  }, [])

  const extractFromFile = useCallback(
    async (file: File, options?: { pageIndex?: number; useHybridOcr?: boolean }) => {
      if (!deviceId) {
        setError('Selecione um dispositivo (id) antes de importar o PDF')
        return null
      }

      setProcessing(true)
      setProgress(0)
      setError(null)
      setStatusMessage('Iniciando…')

      try {
        const buffer = await file.arrayBuffer()
        const pageIndex = options?.pageIndex ?? 0
        const useHybrid = options?.useHybridOcr !== false

        let result = await extractFromPdfBuffer(buffer, {
          deviceId,
          pageIndex,
          onProgress: setProg,
        })

        if (useHybrid && result.hits.length < 5) {
          setProg(40, 'Poucos textos no PDF — executando OCR híbrido…')
          const { canvas } = await renderPdfPageToCanvas(buffer, pageIndex, 2)
          const merged = await supplementWithOcr(canvas, result.hits, {
            pageIndex,
            onProgress: (p) => setProg(40 + Math.round(p * 0.45), `OCR híbrido ${p}%…`),
          })
          const components = hitsToBoardComponents(merged, deviceId)
          result = {
            ...result,
            hits: merged,
            components,
            method: 'hybrid',
          }
          setProg(95, `${components.length} componentes (PDF.js + OCR)`)
        }

        if (result.components.length === 0) {
          setError(
            'Nenhum componente detectado. Tente JSON manual ou um PDF com camada de texto.'
          )
          return null
        }

        setLastResult(result)
        setExtractedComponents(result.components)
        setProg(100, `${result.components.length} componentes extraídos`)
        return result
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Falha na extração do PDF'
        setError(msg)
        return null
      } finally {
        setProcessing(false)
      }
    },
    [deviceId, setProg]
  )

  const importFromJson = useCallback(
    async (file: File) => {
      if (!deviceId) {
        setError('deviceId obrigatório')
        return null
      }

      setProcessing(true)
      setProgress(0)
      setError(null)

      try {
        setProg(10, 'Lendo JSON…')
        const text = await file.text()
        const data = JSON.parse(text) as unknown
        setProg(50, 'Validando componentes…')
        const components = parseManualJson(data, deviceId)

        if (!components.length) {
          throw new Error('JSON não contém componentes válidos')
        }

        const result: PdfExtractionResult = {
          components,
          hits: [],
          netLabels: [],
          pageCount: 1,
          pageIndex: 0,
          imageSize: { width: 0, height: 0 },
          method: 'json',
        }

        setLastResult(result)
        setExtractedComponents(components)
        setProg(100, `${components.length} componentes do JSON`)
        return result
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'JSON inválido'
        setError(msg)
        return null
      } finally {
        setProcessing(false)
      }
    },
    [deviceId, setProg]
  )

  const clear = useCallback(() => {
    setExtractedComponents([])
    setLastResult(null)
    setError(null)
    setProgress(0)
    setStatusMessage(null)
  }, [])

  return {
    extractFromFile,
    importFromJson,
    clear,
    processing,
    progress,
    statusMessage,
    error,
    lastResult,
    extractedComponents,
  }
}
