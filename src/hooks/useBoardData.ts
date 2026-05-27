'use client'

import { useState, useCallback, useRef } from 'react'
import type { BoardComponent } from '@/types/board'
import type { BoardParseResult } from '@/types/parsed'
import type { PdfRegionContext } from '@/types/pdfRegions'
import type { VirtualRegion } from '@/types/pdfRegions'
import { enrichPdfComponents, isPdfVirtualLayout } from '@/core/pdf/PDFRegionEngine'
import { fitVirtualLayout } from '@/core/pdf/VirtualBoardLayoutEngine'
import { buildPdfNetGraph } from '@/core/pdf/PDFNetGraphEngine'
import type { ComponentGraph, NetGraph } from '@/types/pdfNetGraph'
import { boardDataPipeline, type BoardDataLoadResult } from '@/parsers/BoardDataPipeline'
import { getComponents, getBoardGeometry, saveBoardGeometry } from '@/lib/queries'

const BOARD_FILE_CACHE_KEY = 'techboard-board-file'

export function useBoardData(deviceId: string) {
  const [components, setComponents] = useState<BoardComponent[]>([])
  const [loading, setLoading] = useState(true)
  const [hasRealGeometry, setHasRealGeometry] = useState(false)
  const [ocrFallbackEnabled, setOcrFallbackEnabled] = useState(true)
  const [parseResult, setParseResult] = useState<BoardParseResult | null>(null)
  const [boardFileName, setBoardFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [virtualRegions, setVirtualRegions] = useState<VirtualRegion[]>([])
  const [pdfNetGraph, setPdfNetGraph] = useState<NetGraph | null>(null)
  const [pdfComponentGraph, setPdfComponentGraph] = useState<ComponentGraph | null>(null)
  const pipelineRef = useRef(boardDataPipeline)

  const applyLoadResult = useCallback((result: BoardDataLoadResult) => {
    setComponents(result.components)
    setHasRealGeometry(result.hasRealGeometry)
    setOcrFallbackEnabled(result.ocrFallbackEnabled)
    setParseResult(result.parseResult)
    setVirtualRegions([])
    setPdfNetGraph(null)
    setPdfComponentGraph(null)
  }, [])

  const loadDevice = useCallback(async () => {
    if (!deviceId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [supabaseRows, geometryRows] = await Promise.all([
        getComponents(deviceId),
        getBoardGeometry(deviceId).catch(() => []),
      ])

      let cachedParse: BoardParseResult | null = null
      try {
        const raw = localStorage.getItem(`${BOARD_FILE_CACHE_KEY}-${deviceId}`)
        if (raw) {
          const { filename, content } = JSON.parse(raw)
          cachedParse = pipelineRef.current.parseFile(filename, content)
          setBoardFileName(filename)
        }
      } catch {
        /* ignore cache */
      }

      const result = pipelineRef.current.load({
        deviceId,
        supabaseComponents: (supabaseRows ?? []) as BoardComponent[],
        parseResult: cachedParse,
        geometryRows: geometryRows ?? [],
      })

      applyLoadResult(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load board data')
    } finally {
      setLoading(false)
    }
  }, [deviceId, applyLoadResult])

  const importBoardFile = useCallback(
    async (file: File) => {
      if (!deviceId) return null

      setError(null)
      const parsed = await pipelineRef.current.parseFileInput(file)

      if (!parsed.success) {
        setError(parsed.errors.join('; ') || 'Parse failed')
        return parsed
      }

      try {
        const content = await file.text()
        localStorage.setItem(
          `${BOARD_FILE_CACHE_KEY}-${deviceId}`,
          JSON.stringify({ filename: file.name, content })
        )
      } catch {
        /* quota */
      }

      setBoardFileName(file.name)
      setParseResult(parsed)

      const supabaseRows = components.length ? components : ((await getComponents(deviceId)) ?? [])
      const result = pipelineRef.current.load({
        deviceId,
        supabaseComponents: supabaseRows as BoardComponent[],
        parseResult: parsed,
      })

      applyLoadResult(result)

      try {
        await saveBoardGeometry(
          deviceId,
          parsed.components.map((p) => ({
            component_name: p.id,
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height,
            layer: String(p.layer),
          }))
        )
      } catch {
        /* table may not exist yet */
      }

      return parsed
    },
    [deviceId, components, applyLoadResult]
  )

  const importPdfComponents = useCallback(
    (pdfComponents: BoardComponent[], regionContext?: PdfRegionContext) => {
      const { components: regionEnriched, regions: rawRegions } = enrichPdfComponents(
        pdfComponents,
        regionContext
      )
      const { components: layoutComponents, regions } = fitVirtualLayout(
        regionEnriched,
        rawRegions
      )
      console.log('LAYOUT RESULT:', JSON.stringify({
        totalComponents: layoutComponents.length,
        firstComponent: layoutComponents[0],
      }))
      const { components: enriched, netGraph, componentGraph } = buildPdfNetGraph(
        layoutComponents,
        {
          hits: regionContext?.hits,
          netLabels: regionContext?.netLabels,
          pageCount: regionContext?.pageCount,
        }
      )
      setVirtualRegions(regions)
      setPdfNetGraph(netGraph)
      setPdfComponentGraph(componentGraph)
      setComponents(enriched)
      const isVirtualPdf = isPdfVirtualLayout(enriched)
      const hasGeom =
        !isVirtualPdf &&
        enriched.length > 0 &&
        enriched.filter((c) => {
          const useBottom = c.side === 'bottom' || c.side === 'sub_bottom'
          const x = useBottom ? c.x_bottom : c.x_top
          const y = useBottom ? c.y_bottom : c.y_top
          return x != null && y != null && Number(x) !== 0 && Number(y) !== 0
        }).length >= Math.max(1, Math.ceil(enriched.length * 0.25))

      setHasRealGeometry(hasGeom)
      setOcrFallbackEnabled(isVirtualPdf || !hasGeom)
      setParseResult(null)
      setBoardFileName(null)

      if (deviceId && enriched.length > 0) {
        try {
          localStorage.setItem(
            `${BOARD_FILE_CACHE_KEY}-${deviceId}-pdf-components`,
            JSON.stringify({
              savedAt: new Date().toISOString(),
              count: enriched.length,
              regions: regions.map((r) => ({
                regionId: r.regionId,
                regionName: r.regionName,
                componentIds: r.componentIds,
              })),
              nets: netGraph.nets.map((n) => ({
                netId: n.netId,
                name: n.name,
                signalType: n.signalType,
                componentIds: n.componentIds,
              })),
              components: enriched.map((c) => ({
                id: c.name,
                x_top: c.x_top,
                y_top: c.y_top,
                x_virtual: c.x_virtual,
                y_virtual: c.y_virtual,
                width: c.width,
                height: c.height,
                side: c.side,
                type: c.category,
                regionId: c.regionId,
                regionName: c.regionName,
                clusterId: c.clusterId,
                connectedNets: c.connectedNets,
                connectedComponents: c.connectedComponents,
                signalType: c.signalType,
              })),
            })
          )
        } catch {
          /* quota */
        }
      }
    },
    [deviceId]
  )

  const clearBoardFile = useCallback(() => {
    if (deviceId) {
      try {
        localStorage.removeItem(`${BOARD_FILE_CACHE_KEY}-${deviceId}`)
      } catch {
        /* ignore */
      }
    }
    setBoardFileName(null)
    setParseResult(null)
    loadDevice()
  }, [deviceId, loadDevice])

  return {
    components,
    setComponents,
    loading,
    hasRealGeometry,
    ocrFallbackEnabled,
    parseResult,
    boardFileName,
    virtualRegions,
    pdfNetGraph,
    pdfComponentGraph,
    error,
    loadDevice,
    importBoardFile,
    importPdfComponents,
    clearBoardFile,
  }
}
