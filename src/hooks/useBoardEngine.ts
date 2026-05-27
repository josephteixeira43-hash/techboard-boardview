'use client'
// src/hooks/useBoardEngine.ts — v3
// Integrado com NetEngine — passa conexões reais para o BoardViewerKonva

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { BoardComponent, ViewportState, ComputedPosition, ComponentHighlight, BoardNet } from '@/types/board'
import { CoordinateEngine, BOARD_W, BOARD_H, COMP_W, COMP_H, getComputedDimensions } from '@/core/boardview/CoordinateEngine'
import { ViewportManager, MIN_ZOOM, MAX_ZOOM } from '@/core/boardview/ViewportManager'
import { HighlightEngine } from '@/core/boardview/HighlightEngine'
import { NetEngine } from '@/core/boardview/NetEngine'
import { updateBoardviewContext } from '@/core/ai/techAIEngine'

export function useBoardEngine(components: BoardComponent[]) {
  const coordEngine = useMemo(() => new CoordinateEngine(), [])
  const vpManager   = useMemo(() => new ViewportManager(), [])
  const hlEngine    = useMemo(() => new HighlightEngine(), [])
  const netEng      = useMemo(() => new NetEngine(), [])

  const viewportRef = useRef<HTMLDivElement>(null)
  const isDragging  = useRef(false)
  const dragStart   = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const didDrag     = useRef(false)

  const [viewport,    setViewport]    = useState<ViewportState>({ zoom: 1, panX: 0, panY: 0 })
  const [highlights,  setHighlights]  = useState<Map<string, ComponentHighlight>>(new Map())
  const [positions,   setPositions]   = useState<Map<string, ComputedPosition>>(new Map())
  const [nets,        setNets]        = useState<BoardNet[]>([])
  const [selected,    setSelected]    = useState<BoardComponent | null>(null)
  const [connectedIds, setConnectedIds] = useState<string[]>([])
  const [netColor,    setNetColor]    = useState('#00d4ff')
  const [netName,     setNetName]     = useState('GND')
  const [netVoltage,  setNetVoltage]  = useState('0V')
  const [activeLayer, setActiveLayer] = useState<'top' | 'bottom' | 'sub_top' | 'sub_bottom'>('top')

  // Computa posições e NETs
  useEffect(() => {
    if (!components.length) return
    setPositions(new Map(coordEngine.computePositions(components)))
    const builtNets = netEng.buildNets(components)
    setNets(builtNets)
  }, [components, coordEngine, netEng])

  // Sync viewport e highlights
  useEffect(() => vpManager.subscribe(setViewport), [vpManager])
  useEffect(() => hlEngine.subscribe(setHighlights), [hlEngine])

  // Reset view ao carregar
  useEffect(() => {
    if (!components.length || !viewportRef.current) return
    const { clientWidth, clientHeight } = viewportRef.current
    vpManager.reset(clientWidth, clientHeight, BOARD_W, BOARD_H)
  }, [components.length, vpManager])

  // Wheel zoom
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      vpManager.zoomAt({ x: e.clientX - rect.left, y: e.clientY - rect.top }, e.deltaY > 0 ? -1 : 1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [vpManager])

  // Drag
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    isDragging.current = true
    didDrag.current    = false
    const vp = vpManager.getState()
    dragStart.current = { x: e.clientX, y: e.clientY, panX: vp.panX, panY: vp.panY }
  }, [vpManager])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true
      vpManager.setPan(dragStart.current.panX + dx, dragStart.current.panY + dy)
    }
    const onUp = () => { isDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [vpManager])

  // Selecionar componente
  const selectComponent = useCallback((comp: BoardComponent | null) => {
    if (!comp) {
      setSelected(null)
      setConnectedIds([])
      setNetColor('#00d4ff')
      setNetName('GND')
      setNetVoltage('0V')
      hlEngine.clear()
      updateBoardviewContext(null)
      return
    }

    setSelected(comp)
    setActiveLayer(comp.side as any)

    // NET data
    const connected = netEng.getConnectedComponents(comp.id)
    const color     = netEng.getNetColor(comp.id)
    const name      = netEng.getNetName(comp.id)
    const voltage   = netEng.getNetVoltage(comp.id)

    setConnectedIds(connected)
    setNetColor(color)
    setNetName(name)
    setNetVoltage(voltage)

    // Highlights
    hlEngine.selectComponent(comp.id, comp.category, connected)

    // Contexto IA
    updateBoardviewContext({
      name:           comp.name,
      category:       comp.category,
      part_code:      comp.part_code,
      description:    comp.description,
      side:           comp.side,
      x:              positions.get(comp.id)?.x,
      y:              positions.get(comp.id)?.y,
      electricalLine: comp.electrical_line,
      voltage:        voltage,
      commonFaults:   comp.common_faults,
    })
  }, [hlEngine, netEng, positions])

  // Centralizar
  const centerOnComponent = useCallback((comp: BoardComponent, targetZoom?: number) => {
    const pos = positions.get(comp.id)
    const el  = viewportRef.current
    if (!pos || !el) return
    const zoom = targetZoom ?? Math.max(vpManager.getState().zoom, 1)
    const dim = getComputedDimensions(pos)
    vpManager.centerOn(pos.x + dim.width / 2, pos.y + dim.height / 2, el.clientWidth, el.clientHeight, zoom)
  }, [positions, vpManager])

  // Focar por nome
  const focusComponent = useCallback((name: string) => {
    const comp = components.find(c => c.name.toLowerCase() === name.toLowerCase())
    if (!comp) return
    selectComponent(comp)
    requestAnimationFrame(() => centerOnComponent(comp, Math.max(vpManager.getState().zoom, 1.2)))
  }, [components, selectComponent, centerOnComponent, vpManager])

  // Reset view
  const resetView = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    vpManager.reset(el.clientWidth, el.clientHeight, BOARD_W, BOARD_H)
  }, [vpManager])

  // Hit testing para canvas 2D
  const findComponentAtScreen = useCallback((sx: number, sy: number): BoardComponent | null => {
    const vp = vpManager.getState()
    const cx = (sx - vp.panX) / vp.zoom
    const cy = (sy - vp.panY) / vp.zoom
    for (const comp of components.filter(c => c.side === activeLayer)) {
      const pos = positions.get(comp.id)
      if (!pos) continue
      if (cx >= pos.x && cx <= pos.x + COMP_W && cy >= pos.y && cy <= pos.y + COMP_H) return comp
    }
    return null
  }, [components, positions, activeLayer, vpManager])

  // Click
  const consumeDragClick = useCallback(() => {
    if (didDrag.current) {
      didDrag.current = false
      return true
    }
    return false
  }, [])

  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (didDrag.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const comp = findComponentAtScreen(e.clientX - rect.left, e.clientY - rect.top)
    comp ? selectComponent(comp) : selectComponent(null)
  }, [findComponentAtScreen, selectComponent])

  const visibleComponents = useMemo(
    () => components.filter(c => c.side === activeLayer),
    [components, activeLayer]
  )

  return {
    viewportRef,
    viewport,
    positions,
    highlights,
    nets,
    selected,
    connectedIds,
    netColor,
    netName,
    netVoltage,
    activeLayer,
    visibleComponents,
    BOARD_W, BOARD_H, COMP_W, COMP_H, MIN_ZOOM, MAX_ZOOM,
    setActiveLayer,
    selectComponent,
    centerOnComponent,
    focusComponent,
    resetView,
    onMouseDown,
    onCanvasClick,
    consumeDragClick,
    coordEngine,
    vpManager,
    hlEngine,
    netEng,
  }
}
