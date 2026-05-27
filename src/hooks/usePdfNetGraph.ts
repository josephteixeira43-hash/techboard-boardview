'use client'

import { useState, useCallback, useMemo } from 'react'
import type { ComponentGraph, NetGraph } from '@/types/pdfNetGraph'
import {
  getComponentIdsForNet,
  getTraceTargets,
} from '@/core/pdf/PDFNetGraphEngine'

/**
 * Estado React do grafo semântico PDF — APIs para highlight/trace sem tocar no canvas core.
 */
export function usePdfNetGraph() {
  const [netGraph, setNetGraph] = useState<NetGraph | null>(null)
  const [componentGraph, setComponentGraph] = useState<ComponentGraph | null>(null)
  const [highlightedNetId, setHighlightedNetId] = useState<string | null>(null)
  const [tracedComponentId, setTracedComponentId] = useState<string | null>(null)

  const applyGraph = useCallback((graph: NetGraph | null, compGraph: ComponentGraph | null) => {
    setNetGraph(graph)
    setComponentGraph(compGraph)
    setHighlightedNetId(null)
    setTracedComponentId(null)
  }, [])

  const clearGraph = useCallback(() => {
    applyGraph(null, null)
  }, [applyGraph])

  const highlightNet = useCallback((netId: string) => {
    setHighlightedNetId(netId)
    setTracedComponentId(null)
  }, [])

  const traceSignal = useCallback(
    (componentId: string) => {
      setTracedComponentId(componentId)
      setHighlightedNetId(null)
    },
    []
  )

  const clearNetHighlight = useCallback(() => {
    setHighlightedNetId(null)
    setTracedComponentId(null)
  }, [])

  const highlightedComponentIds = useMemo(() => {
    if (highlightedNetId && netGraph) {
      return getComponentIdsForNet(netGraph, highlightedNetId)
    }
    if (tracedComponentId && componentGraph) {
      return getTraceTargets(componentGraph, tracedComponentId).componentIds
    }
    return []
  }, [highlightedNetId, tracedComponentId, netGraph, componentGraph])

  const highlightedNetIds = useMemo(() => {
    if (tracedComponentId && componentGraph) {
      return getTraceTargets(componentGraph, tracedComponentId).netIds
    }
    if (highlightedNetId) return [highlightedNetId]
    return []
  }, [highlightedNetId, tracedComponentId, componentGraph])

  const activeNet = useMemo(() => {
    if (!highlightedNetId || !netGraph) return null
    return netGraph.nets.find((n) => n.netId === highlightedNetId) ?? null
  }, [highlightedNetId, netGraph])

  return {
    netGraph,
    componentGraph,
    highlightedNetId,
    tracedComponentId,
    highlightedComponentIds,
    highlightedNetIds,
    activeNet,
    applyGraph,
    clearGraph,
    highlightNet,
    traceSignal,
    clearNetHighlight,
  }
}
