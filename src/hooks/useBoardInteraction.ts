'use client'
// src/hooks/useBoardInteraction.ts — v7
// Fix: metaEngine.registerComponents() recebe RawComponent shape correto
// Fix: remove hitEngine.rebuild() desnecessário (engine.findComponentAtScreen já opera em board-space)

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { BoardComponent } from '@/types/board'
import type { SearchMatch, TooltipState } from '@/types/interaction'
import type { RawComponent } from '@/interaction/ComponentMetadataEngine'
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

export interface ComponentMetadata {
  id:              string
  name:            string
  category:        string
  part_code?:      string | null
  description?:    string | null
  side?:           string | null
  electrical_line?: string | null
  common_faults?:  string | null
  x?:              number
  y?:              number
  voltage?:        string
  nets?:           string[]
}

export function useBoardInteraction({ engine, components, deviceId }: Options) {
  const metaEngine   = useMemo(() => new ComponentMetadataEngine(), [])
  const searchEngine = useMemo(() => new ComponentSearchEngine(), [])
  const camera       = useMemo(() => new CameraAnimator(), [])

  const [hovered,          setHovered]          = useState<BoardComponent | null>(null)
  const [tooltip,          setTooltip]          = useState<TooltipState>({
    visible: false, screenX: 0, screenY: 0, metadata: null,
  })
  const [searchQuery,      setSearchQuery]      = useState('')
  const [searchMatches,    setSearchMatches]    = useState<SearchMatch[]>([])
  const [recentSearches,   setRecentSearches]   = useState<string[]>([])
  const [searchFocusId,    setSearchFocusId]    = useState<string | null>(null)
  const [errorComponentId, setErrorComponentId] = useState<string | null>(null)
  const pulseRef = useRef(0)

  // ── Index engines when components change ────────────────────────────────────
  useEffect(() => {
    if (!components.length) return

    // Build RawComponent[] with correct shape for ComponentMetadataEngine
    const raw: RawComponent[] = components.map(comp => {
      const pos = engine.positions.get(comp.id)
      return {
        id:        comp.id,
        reference: comp.name,
        value:     comp.part_code ?? comp.name,
        package:   comp.package  ?? '',
        layer:     comp.side     ?? 'top',
        type:      comp.category ?? 'OTHER',
        // nets array: connectedNets[] if available, else electrical_line as single-element
        nets:      Array.isArray(comp.connectedNets) && comp.connectedNets.length > 0
          ? comp.connectedNets
          : comp.electrical_line
            ? [comp.electrical_line]
            : [],
        x:         pos?.x,
        y:         pos?.y,
        width:     pos?.width,
        height:    pos?.height,
        tags:      comp.category ? [comp.category.toLowerCase()] : [],
      }
    })

    metaEngine.registerComponents(raw)
    searchEngine.build(components, engine.netEng)
    setRecentSearches(searchEngine.getRecent())
  }, [components, engine.positions, engine.netEng, metaEngine, searchEngine])

  // ── Metadata builder ────────────────────────────────────────────────────────
  // Builds metadata directly from BoardComponent — no metaEngine.build() (doesn't exist)
  // Uses metaEngine.getComponentById() for enriched net data when available
  const getMetadata = useCallback(
    (comp: BoardComponent | null): ComponentMetadata | null => {
      if (!comp) return null
      const pos = engine.positions.get(comp.id)

      // Get enriched nets from metadata engine if available
      const normalized = metaEngine.getComponentById(comp.id)
      const nets = normalized
        ? [...normalized.nets]
        : comp.connectedNets ?? (comp.electrical_line ? [comp.electrical_line] : [])

      return {
        id:              comp.id,
        name:            comp.name,
        category:        comp.category,
        part_code:       comp.part_code      ?? null,
        description:     comp.description    ?? null,
        side:            comp.side           ?? null,
        electrical_line: comp.electrical_line ?? null,
        common_faults:   comp.common_faults  ?? null,
        x:               pos?.x,
        y:               pos?.y,
        voltage:         engine.netVoltage,
        nets,
      }
    },
    [engine.positions, engine.netVoltage, metaEngine]
  )

  // ── Hit testing — delegates to engine.findComponentAtScreen ────────────────
  const findAtScreen = useCallback(
    (screenX: number, screenY: number): BoardComponent | null =>
      engine.findComponentAtScreen(screenX, screenY),
    [engine]
  )

  // ── Pointer move ────────────────────────────────────────────────────────────
  const handlePointerMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const sx   = e.clientX - rect.left
      const sy   = e.clientY - rect.top
      const comp = findAtScreen(sx, sy)

      if (comp?.id !== hovered?.id) setHovered(comp)

      if (comp && comp.id !== engine.selected?.id) {
        setTooltip({ visible: true, screenX: sx, screenY: sy, metadata: getMetadata(comp) })
      } else if (!comp) {
        setTooltip(t => ({ ...t, visible: false, metadata: null }))
      }
    },
    [findAtScreen, hovered?.id, engine.selected?.id, getMetadata]
  )

  // ── Pointer leave ───────────────────────────────────────────────────────────
  const handlePointerLeave = useCallback(() => {
    setHovered(null)
    setTooltip(t => ({ ...t, visible: false, metadata: null }))
  }, [])

  // ── Canvas click ────────────────────────────────────────────────────────────
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
            engine.vpManager, engine.coordEngine, comp.id,
            el.clientWidth, el.clientHeight,
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

  // ── Focus component by name ─────────────────────────────────────────────────
  const focusComponent = useCallback(
    (name: string, options?: { fromSearch?: boolean; markError?: boolean }) => {
      const comp = components.find(c => c.name.toLowerCase() === name.trim().toLowerCase())
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
          engine.vpManager, engine.coordEngine, comp.id,
          el.clientWidth, el.clientHeight, 1.45,
          () => { if (options?.fromSearch) setTimeout(() => setSearchFocusId(null), 1200) }
        )
      }

      if (options?.markError) setErrorComponentId(comp.id)
      else setErrorComponentId(null)
      return true
    },
    [components, engine, camera, searchEngine]
  )

  // ── Search ──────────────────────────────────────────────────────────────────
  const runSearch = useCallback((query: string) => {
    setSearchQuery(query)
    const matches = searchEngine.search(query)
    setSearchMatches(matches)
    return matches
  }, [searchEngine])

  const submitSearch = useCallback((query?: string) => {
    const q = (query ?? searchQuery).trim()
    if (!q) return
    const matches = runSearch(q)
    if (matches.length > 0) {
      focusComponent(matches[0].component.name, { fromSearch: true })
    } else {
      setErrorComponentId('__missing__')
      setTimeout(() => setErrorComponentId(null), 800)
    }
  }, [searchQuery, runSearch, focusComponent])

  useEffect(() => {
    if (searchQuery.length < 1) { setSearchMatches([]); return }
    const t = setTimeout(() => runSearch(searchQuery), 120)
    return () => clearTimeout(t)
  }, [searchQuery, runSearch])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
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
