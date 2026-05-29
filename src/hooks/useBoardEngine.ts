'use client'
// src/hooks/useBoardEngine.ts — v5
// Fix: findComponentAtScreen usa positionsRef (sync) + vpManager.screenToBoard()

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

  const viewportRef  = useRef<HTMLDivElement>(null)
  const isDragging   = useRef(false)
  const dragStart    = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const didDrag      = useRef(false)
  // positionsRef: sempre sincronizado com computePositions — não depende de ciclo React
  const positionsRef = useRef<Map<string, ComputedPosition>>(new Map())
  // activeLayerRef: espelho síncrono do state activeLayer para uso em callbacks sem closure stale
  const activeLayerRef = useRef<'top' | 'bottom' | 'sub_top' | 'sub_bottom'>('top')

  const [viewport,     setViewport]     = useState<ViewportState>({ zoom: 1, panX: 0, panY: 0 })
  const [highlights,   setHighlights]   = useState<Map<string, ComponentHighlight>>(new Map())
  const [positions,    setPositions]    = useState<Map<string, ComputedPosition>>(new Map())
  const [nets,         setNets]         = useState<BoardNet[]>([])
  const [selected,     setSelected]     = useState<BoardComponent | null>(null)
  const [connectedIds, setConnectedIds] = useState<string[]>([])
  const [netColor,     setNetColor]     = useState('#00d4ff')
  const [netName,      setNetName]      = useState('GND')
  const [netVoltage,   setNetVoltage]   = useState('0V')
  const [activeLayer,  setActiveLayerState] = useState<'top' | 'bottom' | 'sub_top' | 'sub_bottom'>('top')

  // Wrapper que mantém ref e state sincronizados
  const setActiveLayer = useCallback((layer: 'top' | 'bottom' | 'sub_top' | 'sub_bottom') => {
    activeLayerRef.current = layer
    setActiveLayerState(layer)
  }, [])

  // ─── Computa posições e NETs — síncrono, popula positionsRef antes de qualquer render ───
  useEffect(() => {
    if (!components.length) return
    const computed = coordEngine.computePositions(components)
    const map = computed instanceof Map ? computed : new Map(computed)
    positionsRef.current = map
    setPositions(map)
    setNets(netEng.buildNets(components))
  }, [components, coordEngine, netEng])

  // ─── Reset viewport ───
  useEffect(() => {
    if (!components.length) return
    const doReset = () => {
      const el = viewportRef.current
      const w = el?.clientWidth  || window.innerWidth  - 240
      const h = el?.clientHeight || window.innerHeight - 60
      vpManager.reset(w, h, BOARD_W, BOARD_H)
    }
    doReset()
    const id1 = requestAnimationFrame(doReset)
    const id2 = setTimeout(doReset, 100)
    return () => { cancelAnimationFrame(id1); clearTimeout(id2) }
  }, [components.length, vpManager])

  // ─── Sync viewport e highlights para React state ───
  useEffect(() => vpManager.subscribe(setViewport), [vpManager])
  useEffect(() => hlEngine.subscribe(setHighlights), [hlEngine])

  // ─── Wheel zoom ───
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

  // ─── Drag (pan) ───
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

  // ─── Selecionar componente ───
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

    const connected = netEng.getConnectedComponents(comp.id)
    const color     = netEng.getNetColor(comp.id)
    const name      = netEng.getNetName(comp.id)
    const voltage   = netEng.getNetVoltage(comp.id)

    setConnectedIds(connected)
    setNetColor(color)
    setNetName(name)
    setNetVoltage(voltage)

    hlEngine.selectComponent(comp.id, comp.category, connected)

    const pos = positionsRef.current.get(comp.id)
    updateBoardviewContext({
      name:           comp.name,
      category:       comp.category,
      part_code:      comp.part_code,
      description:    comp.description,
      side:           comp.side,
      x:              pos?.x,
      y:              pos?.y,
      electricalLine: comp.electrical_line,
      voltage:        voltage,
      commonFaults:   comp.common_faults,
    })
  }, [hlEngine, netEng, setActiveLayer])

  // ─── Centralizar ───
  const centerOnComponent = useCallback((comp: BoardComponent, targetZoom?: number) => {
    const pos = positionsRef.current.get(comp.id)
    const el  = viewportRef.current
    if (!pos || !el) return
    const zoom = targetZoom ?? Math.max(vpManager.getState().zoom, 1)
    const dim = getComputedDimensions(pos)
    vpManager.centerOn(pos.x + dim.width / 2, pos.y + dim.height / 2, el.clientWidth, el.clientHeight, zoom)
  }, [vpManager])

  // ─── Focar por nome ───
  const focusComponent = useCallback((name: string) => {
    const comp = components.find(c => c.name.toLowerCase() === name.toLowerCase())
    if (!comp) return
    selectComponent(comp)
    requestAnimationFrame(() => centerOnComponent(comp, Math.max(vpManager.getState().zoom, 1.2)))
  }, [components, selectComponent, centerOnComponent, vpManager])

  // ─── Reset view ───
  const resetView = useCallback(() => {
    const el = viewportRef.current
    const w = el?.clientWidth  || window.innerWidth  - 240
    const h = el?.clientHeight || window.innerHeight - 60
    vpManager.reset(w, h, BOARD_W, BOARD_H)
  }, [vpManager])

  // ─── Hit testing — CORE FIX ───
  // 1. Usa vpManager.screenToBoard() para transformar coordenadas corretamente
  // 2. Usa positionsRef.current (ref síncrona) — nunca stale
  // 3. Usa activeLayerRef.current para evitar closure stale
  // 4. Aplica fallback de dimensões via getComputedDimensions
  const findComponentAtScreen = useCallback((sx: number, sy: number): BoardComponent | null => {
    // Converte screen → board-space usando a mesma transform do canvas
    const { x: bx, y: by } = vpManager.screenToBoard(sx, sy)

    const hasSides = components.some(
      c => c.side === 'top' || c.side === 'bottom' || c.side === 'sub_top' || c.side === 'sub_bottom'
    )
    const currentLayer = activeLayerRef.current
    const pool = hasSides ? components.filter(c => c.side === currentLayer) : components

    // Itera em ordem reversa para priorizar componentes renderizados por cima (último = topo)
    for (let i = pool.length - 1; i >= 0; i--) {
      const comp = pool[i]
      const pos = positionsRef.current.get(comp.id)
      if (!pos) continue

      const dim = getComputedDimensions(pos)
      const w = dim.width  || COMP_W
      const h = dim.height || COMP_H

      // Hit test em board-space — mesmas coordenadas usadas pelo renderer
      if (bx >= pos.x && bx <= pos.x + w && by >= pos.y && by <= pos.y + h) {
        return comp
      }
    }
    return null
  }, [components, vpManager])  // positionsRef e activeLayerRef são refs — não precisam ser deps

  // ─── Click ───
  const consumeDragClick = useCallback(() => {
    if (didDrag.current) { didDrag.current = false; return true }
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
    findComponentAtScreen,
    coordEngine,
    vpManager,
    hlEngine,
    netEng,
  }
}
