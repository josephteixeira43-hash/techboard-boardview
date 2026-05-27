'use client'

import { useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'

interface ExtractedComponent {
  name: string
  category: string
  x: number
  y: number
  width: number
  height: number
  confidence: number
  layer: string
  bbox: { x: number; y: number; w: number; h: number }
}

interface ExtractionResult {
  device_id: string
  page_index: number
  components: ExtractedComponent[]
  image_size: { width: number; height: number }
}

interface PythonExtractResponse {
  status: string
  source?: string
  data?: ExtractionResult
  message?: string
}

export function usePCBExtractor(hasRealBoardData = false) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExtractionResult | null>(null)

  const isElectron = useMemo(
    () => typeof window !== 'undefined' && !!window.electronAPI,
    []
  )

  const ocrEnabled = isElectron && !hasRealBoardData

  const saveToSupabase = useCallback(async (data: ExtractionResult, deviceId: string) => {
    const componentRows = data.components.map((comp) => ({
      device_id: deviceId,
      name: comp.name,
      x_top: comp.layer === 'top' ? comp.x : null,
      y_top: comp.layer === 'top' ? comp.y : null,
      x_bottom: comp.layer === 'bottom' ? comp.x : null,
      y_bottom: comp.layer === 'bottom' ? comp.y : null,
      category: comp.category,
    }))

    if (componentRows.length > 0) {
      const { error: compError } = await supabase
        .from('components')
        .upsert(componentRows, { onConflict: 'device_id,name' })

      if (compError) throw new Error(compError.message)
    }

    const { error: cacheError } = await supabase.from('ocr_cache').upsert(
      {
        device_id: deviceId,
        page_index: data.page_index,
        components: data.components,
        processed_at: new Date().toISOString(),
        confidence:
          data.components.length > 0
            ? data.components.reduce((s, c) => s + c.confidence, 0) / data.components.length
            : 0,
      },
      { onConflict: 'device_id,page_index' }
    )

    if (cacheError) throw new Error(cacheError.message)
  }, [])

  const extractFromPDF = useCallback(
    async (pdfPath: string, deviceId: string, pageIndex = 0) => {
      if (!ocrEnabled || !window.electronAPI) {
        setError(
          hasRealBoardData
            ? 'OCR desativado — board parseado com geometria real'
            : 'Python OCR requer Electron desktop app'
        )
        return null
      }

      if (!deviceId) {
        setError('deviceId é obrigatório')
        return null
      }

      if (!pdfPath?.trim()) {
        setError('Caminho do PDF inválido')
        return null
      }

      setProcessing(true)
      setProgress(10)
      setError(null)

      try {
        setProgress(30)
        const response = (await window.electronAPI.extractPDF({
          pdfPath,
          deviceId,
          pageIndex,
        })) as PythonExtractResponse

        if (response.status !== 'ok' || !response.data) {
          throw new Error(response.message || 'Extraction failed')
        }

        setProgress(70)
        const data = response.data

        await saveToSupabase(data, deviceId)
        setProgress(100)
        setResult(data)
        return data
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Extraction failed'
        setError(message)
        return null
      } finally {
        setProcessing(false)
      }
    },
    [ocrEnabled, hasRealBoardData, saveToSupabase]
  )

  return {
    extractFromPDF,
    processing,
    progress,
    error,
    result,
    isElectron,
    ocrEnabled,
    hasRealBoardData,
  }
}
