'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { BoardComponent } from '@/types/board'
import type { ComponentMetadata, SearchMatch, TooltipState } from '@/types/interaction'
import { HitDetectionEngine } from '@/interaction/HitDetectionEngine'
import { ComponentMetadataEngine } from '@/interaction/ComponentMetadataEngine'
import { ComponentSearchEngine } from '@/interaction/ComponentSearchEngine'
import { CameraAnimator } from '@/interaction/CameraAnimator'
import type { useBoardEngine } from '@/hooks/useBoardEngine'

type BoardEngine = ReturnType<typeof useBoardEngine>

interface Options {
  engine: BoardEngine
  components: BoardComponent[]
  deviceId?: string
}

export function useBoardInteraction({ engine, components, deviceId }: Options) {
  const hitEngine = useMemo(() => new HitDetectionEngine(), [])
  const metaEngine = useMemo(() => new ComponentMetadataEngine(), [])
  const searchEngine = useMemo(() => new ComponentSearchEngine(), [])
  const camera = useMemo(() => new CameraAnimator(), [])

  const [hovered, setHovered] = useState<BoardComponent | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    screenX: 0,
    screenY: 0,
    metadata: null,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([])
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [searchFocusId, setSearchFocusId] = useState<string | null>(null)
  const [errorComponentId, setErrorComponentId] = useState<string | null>(null)
  const pulseRef = useRef(0)

  const layerIds = useMemo(
    () => hitEngine.getLayerIds(components, engine.activeLayer),
    [components, engine.activeLayer, hitEngine]
  )

  useEffect(() => {
    hitEngine.rebuild(components, engine.positions, engine.activeLayer)
    searchEngine.build(components, engine.netEng)
    setRecentSearches(searchEngine.getRecent())
  }, [components, engine.positions, engine.activeLayer, hitEngine, searchEngine, engine.netEng])

  useEffect(() => {
    engine.coordEngine.computePositions(components)
  }, [components, engine.coordEngine])

  const getMetadata = useCallback(
    (comp: BoardComponent | null): ComponentMetadata | null => {
      if (!comp) return null
      const pos = engine.positions.get(comp.id) ?? null
      return metaEngine.build(comp, pos, engine.netEng)
    },
    [engine.positions, engine.netEng, metaEngine]
  )

  const findAtScreen = useCallback(
    (screenX: number, screenY: number) => {
      const screen = { x: screenX, y: screenY }
      const fast = hitEngine.findAtFast(screen, engine.viewport, engine.coordEngine)
      if (fast) return fast
      return hitEngine.findAt(screen, engine.viewport, engine.coordEngine, layerIds)
    },
    [hitEngine, engine.viewport, engine.coordEngine, layerIds]
  )

  const handlePointerMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const comp = findAtScreen(sx, sy)

      if (comp?.id !== hovered?.id) {
        setHovered(comp)
      }

      if (comp && comp.id !== engine.selected?.id) {
        const meta = getMetadata(comp)
        setTooltip({
          visible: true,
          screenX: sx,
          screenY: sy,
          metadata: meta,
        })
      } else if (!comp) {
        setTooltip((t) => ({ ...t, visible: false, metadata: null }))
      }
    },
    [findAtScreen, hovered?.id, engine.selected?.id, getMetadata]
  )

  const handlePointerLeave = useCallback(() => {
    setHovered(null)
    setTooltip((t) => ({ ...t, visible: false, metadata: null }))
  }, [])

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (engine.consumeDragClick()) return
      const rect = e.currentTarget.getBoundingClientRect()
      const comp = findAtScreen(e.clientX - rect.left, e.clientY - rect.top)
      if (comp) {
        engine.selectComponent(comp)
        const el = engine.viewportRef.current
        if (el && !camera.isAnimating()) {
          camera.flyToComponent(
            engine.vpManager,
            engine.coordEngine,
            comp.id,
            el.clientWidth,
            el.clientHeight,
            Math.max(engine.viewport.zoom, 1.25)
          )
        }
        setSearchFocusId(null)
        setErrorComponentId(null)
      } else {
        engine.selectComponent(null)
      }
    },
    [findAtScreen, engine, camera]
  )

  const focusComponent = useCallback(
    (name: string, options?: { fromSearch?: boolean; markError?: boolean }) => {
      const comp = components.find(
        (c) => c.name.toLowerCase() === name.trim().toLowerCase()
      )
      if (!comp) {
        if (options?.markError) setErrorComponentId('__missing__')
        return false
      }

      if (options?.fromSearch) {
        searchEngine.pushRecent(name.trim().toUpperCase())
        setRecentSearches(searchEngine.getRecent())
        setSearchFocusId(comp.id)
        engine.hlEngine.clear()
        engine.hlEngine.highlightSearch(comp.id, comp.category)
      }

      engine.selectComponent(comp)
      engine.setActiveLayer(comp.side as typeof engine.activeLayer)

      const el = engine.viewportRef.current
      if (el) {
        camera.flyToComponent(
          engine.vpManager,
          engine.coordEngine,
          comp.id,
          el.clientWidth,
          el.clientHeight,
          1.45,
          () => {
            if (options?.fromSearch) {
              setTimeout(() => setSearchFocusId(null), 1200)
            }
          }
        )
      }

      if (options?.markError) setErrorComponentId(comp.id)
      else setErrorComponentId(null)

      return true
    },
    [components, engine, camera, searchEngine]
  )

  const runSearch = useCallback(
    (query: string) => {
      setSearchQuery(query)
      const matches = searchEngine.search(query)
      setSearchMatches(matches)
      return matches
    },
    [searchEngine]
  )

  const submitSearch = useCallback(
    (query?: string) => {
      const q = (query ?? searchQuery).trim()
      if (!q) return
      const matches = runSearch(q)
      if (matches.length > 0) {
        focusComponent(matches[0].component.name, { fromSearch: true })
      } else {
        setErrorComponentId('__missing__')
        setTimeout(() => setErrorComponentId(null), 800)
      }
    },
    [searchQuery, runSearch, focusComponent]
  )

  useEffect(() => {
    if (searchQuery.length < 1) {
      setSearchMatches([])
      return
    }
    const t = setTimeout(() => runSearch(searchQuery), 120)
    return () => clearTimeout(t)
  }, [searchQuery, runSearch])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        document.getElementById('board-component-search')?.focus()
      }
      if (e.key === 'Escape') {
        engine.selectComponent(null)
        setSearchQuery('')
        setSearchMatches([])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine])

  const selectedMetadata = useMemo(
    () => getMetadata(engine.selected),
    [engine.selected, getMetadata]
  )

  const tickPulse = useCallback(() => {
    pulseRef.current = (pulseRef.current + 0.04) % (Math.PI * 2)
    return pulseRef.current
  }, [])

  return {
    hovered,
    tooltip,
    selectedMetadata,
    searchQuery,
    setSearchQuery,
    searchMatches,
    recentSearches,
    searchFocusId,
    errorComponentId,
    handlePointerMove,
    handlePointerLeave,
    handleCanvasClick,
    focusComponent,
    submitSearch,
    getMetadata,
    tickPulse,
    camera,
    deviceId,
  }
}
