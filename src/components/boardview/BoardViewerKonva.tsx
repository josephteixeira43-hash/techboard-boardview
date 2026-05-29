'use client'
// src/components/boardview/BoardViewerKonva.tsx — v4
// Overlay system + hover tooltip + pads dourados + PCBRenderer v2

import { useEffect, useRef, useState, useCallback } from 'react'
import type { BoardComponent, ViewportState, ComputedPosition, ComponentHighlight } from '@/types/board'
import { BOARD_W, BOARD_H, COMP_W, COMP_H, getComputedDimensions } from '@/core/boardview/CoordinateEngine'
import { PCBRenderer, getLOD, hexToRgb } from '@/core/boardview/PCBRenderer'
import type { OverlayState } from '@/core/boardview/OverlaySystem'

function getBezierCP(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2-x1, dy = y2-y1
  const dist = Math.sqrt(dx*dx+dy*dy)
  const curve = Math.min(dist*0.4, 140)
  return { cp1x: x1+curve, cp1y: y1, cp2x: x2-curve, cp2y: y2 }
}

interface Props {
  components: BoardComponent[]
  positions: Map<string, ComputedPosition>
  highlights: Map<string, ComponentHighlight>
  selected: BoardComponent | null
  hovered: BoardComponent | null
  connectedIds: string[]
  netColor: string
  netName: string
  netVoltage: string
  activeLayer: string
  viewport: ViewportState
  boardImage: string | null
  loading: boolean
  overlay: OverlayState
  voltagesMap: Map<string, { node: string; value: string }[]>
  viewportRef: React.RefObject<HTMLDivElement>
  onMouseDown: (e: React.MouseEvent) => void
  onCanvasClick: (e: React.MouseEvent<HTMLDivElement>) => void
  onPointerMove?: (e: React.MouseEvent<HTMLDivElement>) => void
  onPointerLeave?: () => void
  onDoubleClick?: () => void
  isDragging?: boolean
  searchFocusId?: string | null
  errorComponentId?: string | null
  pulsePhase?: number
}

const TRACE_SPEED = 0.45
const TRACE_DASH  = 14
const TRACE_GAP   = 9

export default function BoardViewerKonva({
  components, positions, highlights,
  selected, hovered, connectedIds, netColor, netName, netVoltage,
  activeLayer, viewport, boardImage, loading,
  overlay, voltagesMap,
  viewportRef, onMouseDown, onCanvasClick, onPointerMove, onPointerLeave,
  onDoubleClick,
  isDragging = false,
  searchFocusId = null,
  errorComponentId = null,
  pulsePhase = 0,
}: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const bgRef      = useRef<HTMLCanvasElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const imgRef     = useRef<HTMLImageElement | null>(null)
  const imgLoaded  = useRef(false)
  const animRef    = useRef(0)
  const traceOff   = useRef(0)
  const renderer   = useRef(new PCBRenderer())
  const [size, setSize] = useState({ w: 800, h: 600 })

  // Resize
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect
      const w = Math.max(1, Math.round(width))
      const h = Math.max(1, Math.round(height))
      if (canvasRef.current) { canvasRef.current.width = w; canvasRef.current.height = h }
      setSize({ w, h })
    })
    ro.observe(el)
    const w = Math.max(1, el.clientWidth || 800)
    const h = Math.max(1, el.clientHeight || 600)
    if (canvasRef.current) { canvasRef.current.width = w; canvasRef.current.height = h }
    setSize({ w, h })
    return () => ro.disconnect()
  }, [viewportRef])

  // Imagem da placa
  useEffect(() => {
    if (!boardImage) { imgLoaded.current = false; imgRef.current = null; return }
    const img = new Image()
    img.onload = () => { imgLoaded.current = true }
    img.src = boardImage
    imgRef.current = img
  }, [boardImage])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    el.style.cursor = hovered ? 'pointer' : isDragging ? 'grabbing' : 'grab'
  }, [hovered, isDragging, viewportRef])

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })!
    const { w, h } = size
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    const { zoom, panX, panY } = viewport
    const lod = getLOD(zoom)

    ctx.fillStyle = '#030608'
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.translate(panX, panY)
    ctx.scale(zoom, zoom)

    // Background PCB
    if (bgRef.current) ctx.drawImage(bgRef.current, 0, 0)

    // Board image
    if (imgLoaded.current && imgRef.current) {
      ctx.globalAlpha = 0.78
      ctx.drawImage(imgRef.current, 0, 0, BOARD_W, BOARD_H)
      ctx.globalAlpha = 1
    }

    const hasHL  = highlights.size > 0
    const selPos = selected ? positions.get(selected.id) : null
    const [nr,ng,nb] = hexToRgb(netColor || '#00d4ff')

    // ── COPPER TRACES ────────────────────────────────────────────────────────
    if (overlay.showTraces && selected && selPos && connectedIds.length > 0) {
      const selDim = getComputedDimensions(selPos)
      const fromX = selPos.x + selDim.width / 2, fromY = selPos.y + selDim.height / 2

      connectedIds.forEach(cid => {
        const tPos = positions.get(cid)
        if (!tPos) return
        const tDim = getComputedDimensions(tPos)
        const toX = tPos.x + tDim.width / 2, toY = tPos.y + tDim.height / 2
        const { cp1x,cp1y,cp2x,cp2y } = getBezierCP(fromX,fromY,toX,toY)

        ctx.save()
        // Halo
        ctx.strokeStyle = `rgba(${nr},${ng},${nb},0.04)`; ctx.lineWidth = 24; ctx.setLineDash([])
        ctx.beginPath(); ctx.moveTo(fromX,fromY); ctx.bezierCurveTo(cp1x,cp1y,cp2x,cp2y,toX,toY); ctx.stroke()
        // Copper glow
        ctx.strokeStyle = `rgba(${nr},${ng},${nb},0.14)`; ctx.lineWidth = 8
        ctx.shadowColor = netColor; ctx.shadowBlur = 10
        ctx.beginPath(); ctx.moveTo(fromX,fromY); ctx.bezierCurveTo(cp1x,cp1y,cp2x,cp2y,toX,toY); ctx.stroke()
        ctx.shadowBlur = 0
        // Copper base
        ctx.strokeStyle = `rgba(${nr},${ng},${nb},0.38)`; ctx.lineWidth = 3.5
        ctx.beginPath(); ctx.moveTo(fromX,fromY); ctx.bezierCurveTo(cp1x,cp1y,cp2x,cp2y,toX,toY); ctx.stroke()
        // Animated dash
        ctx.strokeStyle = `rgba(${nr},${ng},${nb},0.92)`; ctx.lineWidth = 1.8
        ctx.shadowColor = netColor; ctx.shadowBlur = 8
        ctx.setLineDash([TRACE_DASH,TRACE_GAP]); ctx.lineDashOffset = -traceOff.current
        ctx.beginPath(); ctx.moveTo(fromX,fromY); ctx.bezierCurveTo(cp1x,cp1y,cp2x,cp2y,toX,toY); ctx.stroke()
        ctx.setLineDash([]); ctx.shadowBlur = 0
        // Electron particle
        const t = (traceOff.current/(TRACE_DASH+TRACE_GAP))%1
        const bx = Math.pow(1-t,3)*fromX+3*Math.pow(1-t,2)*t*cp1x+3*(1-t)*t*t*cp2x+t*t*t*toX
        const by = Math.pow(1-t,3)*fromY+3*Math.pow(1-t,2)*t*cp1y+3*(1-t)*t*t*cp2y+t*t*t*toY
        ctx.fillStyle = netColor; ctx.shadowColor = netColor; ctx.shadowBlur = 14
        ctx.beginPath(); ctx.arc(bx,by,3.5,0,Math.PI*2); ctx.fill(); ctx.shadowBlur = 0
        // Vias endpoints
        if (overlay.showVias && lod !== 'low') {
          renderer.current.drawVia(ctx, fromX, fromY, netColor, zoom, lod)
          renderer.current.drawVia(ctx, toX,   toY,   netColor, zoom, lod)
        }
        ctx.restore()
      })
    }

    // ── COMPONENTES ──────────────────────────────────────────────────────────
    const hasSides = components.some(c => c.side === 'top' || c.side === 'bottom' || c.side === 'sub_top' || c.side === 'sub_bottom')
    const visComps = hasSides ? components.filter(c => c.side === activeLayer) : components
    visComps.forEach(comp => {
      const pos = positions.get(comp.id)
      if (!pos) return
      // Viewport culling
      const dim = getComputedDimensions(pos)
      const sx = pos.x*zoom+panX, sy = pos.y*zoom+panY
      if (sx+dim.width*zoom<0||sx>w||sy+dim.height*zoom<0||sy>h) return

      const hl = highlights.get(comp.id)
      const voltages = voltagesMap.get(comp.name)
      const isHovered = hovered?.id === comp.id
      const isSearchPulse = searchFocusId === comp.id
      const isError = errorComponentId === comp.id

      renderer.current.drawComponent(
        ctx, comp, pos, hl??null,
        hasHL, comp.side===activeLayer,
        isHovered,
        lod, overlay, voltages
      )

      if (isHovered && !selected) {
        drawHoverAura(ctx, pos, '#00d4ff', pulsePhase)
      }
      if (isSearchPulse) {
        const pulse = 0.5 + 0.5 * Math.sin(pulsePhase * 3)
        drawSearchPulse(ctx, pos, '#00d4ff', pulse)
      }
      if (isError) {
        drawErrorGlow(ctx, pos)
      }
    })

    ctx.restore()

    renderMinimap()
  }, [components, positions, highlights, selected, hovered, connectedIds, netColor, netName, netVoltage,
      activeLayer, viewport, size, overlay, voltagesMap, searchFocusId, errorComponentId, pulsePhase])

  // Minimap
  const renderMinimap = useCallback(() => {
    const mc = minimapRef.current
    if (!mc) return
    const MW=130, MH=86
    if (mc.width!==MW) mc.width=MW
    if (mc.height!==MH) mc.height=MH
    const mCtx = mc.getContext('2d')!
    const scX=MW/BOARD_W, scY=MH/BOARD_H

    mCtx.fillStyle='#020507'; mCtx.fillRect(0,0,MW,MH)
    mCtx.strokeStyle='rgba(52,211,153,0.06)'; mCtx.lineWidth=0.3
    for(let x=0;x<MW;x+=16){mCtx.beginPath();mCtx.moveTo(x,0);mCtx.lineTo(x,MH);mCtx.stroke()}
    for(let y=0;y<MH;y+=10){mCtx.beginPath();mCtx.moveTo(0,y);mCtx.lineTo(MW,y);mCtx.stroke()}

    // Traces
    if (selected) {
      const sp = positions.get(selected.id)
      if (sp) {
        const [nr,ng,nb] = hexToRgb(netColor)
        connectedIds.forEach(cid => {
          const tp = positions.get(cid)
          if (!tp) return
          mCtx.strokeStyle=`rgba(${nr},${ng},${nb},0.55)`; mCtx.lineWidth=0.7
          mCtx.beginPath()
          mCtx.moveTo((sp.x+COMP_W/2)*scX,(sp.y+COMP_H/2)*scY)
          mCtx.lineTo((tp.x+COMP_W/2)*scX,(tp.y+COMP_H/2)*scY)
          mCtx.stroke()
        })
      }
    }

    const _hasSides = components.some(c => c.side === 'top' || c.side === 'bottom')
    components.filter(c=> !_hasSides || c.side===activeLayer).forEach(comp=>{
      const pos=positions.get(comp.id); if(!pos) return
      const hl=highlights.get(comp.id)
      const [r,g,b] = hexToRgb(hl?.color||'#2a4a3a')
      mCtx.fillStyle = hl?`rgba(${r},${g},${b},0.85)`:`rgba(${r},${g},${b},0.28)`
      const mDim = getComputedDimensions(pos)
      mCtx.fillRect(pos.x*scX,pos.y*scY,Math.max(2.5,mDim.width*scX),Math.max(1.5,mDim.height*scY))
    })

    const {zoom,panX,panY}=viewport
    mCtx.strokeStyle='rgba(0,212,255,0.85)'; mCtx.lineWidth=1.2; mCtx.setLineDash([3,2])
    mCtx.strokeRect((-panX/zoom)*scX,(-panY/zoom)*scY,(size.w/zoom)*scX,(size.h/zoom)*scY)
    mCtx.setLineDash([])
    mCtx.strokeStyle='rgba(0,212,255,0.18)'; mCtx.lineWidth=0.5
    mCtx.strokeRect(0,0,MW,MH)
  }, [components,positions,highlights,selected,connectedIds,netColor,activeLayer,viewport,size])

  // Animation loop
  useEffect(() => {
    let running = true
    const loop = () => {
      if (!running) return
      traceOff.current = (traceOff.current+TRACE_SPEED)%(TRACE_DASH+TRACE_GAP)
      render()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => { running=false; cancelAnimationFrame(animRef.current) }
  }, [render])

  return (
    <div
      ref={viewportRef}
      style={{ flex:1, position:'relative', overflow:'hidden',
        height:'100%', minHeight:0,
        cursor: isDragging?'grabbing':'grab',
        background:'#030608', userSelect:'none' }}
      onMouseDown={onMouseDown}
      onClick={onCanvasClick}
      onMouseMove={onPointerMove}
      onMouseLeave={onPointerLeave}
      onDoubleClick={onDoubleClick}
    >
      <canvas ref={bgRef} style={{display:'none'}}/>
      <canvas ref={canvasRef} style={{display:'block',position:'absolute',inset:0}}/>

      {loading && (
        <div style={{position:'absolute',inset:0,zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(3,6,8,0.95)'}}>
          <div style={{textAlign:'center'}}>
            <div style={{width:44,height:44,margin:'0 auto 14px',border:'2px solid rgba(0,212,255,0.12)',borderTop:'2px solid #00d4ff',borderRadius:'50%',animation:'pcbSpin 0.7s linear infinite'}}/>
            <div style={{color:'#00d4ff',fontSize:11,fontFamily:'monospace',letterSpacing:'0.1em'}}>LOADING PCB...</div>
          </div>
        </div>
      )}

      {/* NET badge */}
      {selected && (
        <div style={{position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',
          background:'rgba(3,6,12,0.94)',border:`1px solid ${netColor}44`,borderRadius:20,
          padding:'5px 16px',display:'flex',alignItems:'center',gap:8,fontSize:11,
          fontFamily:'monospace',boxShadow:`0 0 20px ${netColor}22`,pointerEvents:'none',backdropFilter:'blur(8px)'}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:netColor,boxShadow:`0 0 8px ${netColor}`}}/>
          <span style={{color:netColor,fontWeight:700,letterSpacing:'0.07em'}}>{netName}</span>
          <span style={{color:'rgba(255,255,255,0.3)'}}>·</span>
          <span style={{color:'rgba(255,255,255,0.65)'}}>{netVoltage}</span>
          {connectedIds.length>0&&<>
            <span style={{color:'rgba(255,255,255,0.3)'}}>·</span>
            <span style={{color:'rgba(255,255,255,0.45)',fontSize:10}}>{connectedIds.length} conexões</span>
          </>}
        </div>
      )}

      {/* Layer badge */}
      <div style={{position:'absolute',top:12,left:12,background:'rgba(3,6,12,0.88)',
        border:'0.5px solid rgba(0,212,255,0.22)',borderRadius:6,padding:'4px 10px',
        fontSize:9,color:'#00d4ff',fontFamily:'monospace',letterSpacing:'0.1em',pointerEvents:'none'}}>
        ◈ {activeLayer.replace('_',' ').toUpperCase()}
      </div>

      {/* Minimap */}
      <div style={{position:'absolute',bottom:14,right:14,background:'rgba(2,5,8,0.96)',
        border:'0.5px solid rgba(0,212,255,0.18)',borderRadius:7,overflow:'hidden',
        boxShadow:'0 4px 28px rgba(0,0,0,0.7)'}}>
        <div style={{padding:'3px 8px',borderBottom:'0.5px solid rgba(0,212,255,0.12)',
          fontSize:9,color:'#2a6090',fontFamily:'monospace',letterSpacing:'0.07em',
          display:'flex',alignItems:'center',gap:5}}>
          <div style={{width:5,height:5,borderRadius:'50%',background:'#00d4ff',boxShadow:'0 0 5px #00d4ff'}}/>
          MINIMAP
        </div>
        <canvas ref={minimapRef}/>
      </div>

      <style>{`@keyframes pcbSpin{to{transform:rotate(360deg);}}`}</style>
    </div>
  )
}

function drawHoverAura(
  ctx: CanvasRenderingContext2D,
  pos: ComputedPosition,
  color: string,
  phase: number
) {
  const dim = getComputedDimensions(pos)
  const pulse = 0.85 + 0.15 * Math.sin(phase * 2)
  ctx.save()
  ctx.strokeStyle = `rgba(0, 212, 255, ${0.35 * pulse})`
  ctx.lineWidth = 1.5
  ctx.shadowColor = color
  ctx.shadowBlur = 14 * pulse
  ctx.beginPath()
  ctx.roundRect(pos.x - 3, pos.y - 3, dim.width + 6, dim.height + 6, 8)
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.restore()
}

function drawSearchPulse(
  ctx: CanvasRenderingContext2D,
  pos: ComputedPosition,
  color: string,
  alpha: number
) {
  const dim = getComputedDimensions(pos)
  ctx.save()
  ctx.strokeStyle = color
  ctx.globalAlpha = alpha * 0.9
  ctx.lineWidth = 2
  ctx.shadowColor = color
  ctx.shadowBlur = 22
  ctx.beginPath()
  ctx.roundRect(pos.x - 6, pos.y - 6, dim.width + 12, dim.height + 12, 10)
  ctx.stroke()
  ctx.restore()
}

function drawErrorGlow(ctx: CanvasRenderingContext2D, pos: ComputedPosition) {
  const dim = getComputedDimensions(pos)
  ctx.save()
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)'
  ctx.lineWidth = 2
  ctx.shadowColor = '#ef4444'
  ctx.shadowBlur = 18
  ctx.beginPath()
  ctx.roundRect(pos.x - 4, pos.y - 4, dim.width + 8, dim.height + 8, 8)
  ctx.stroke()
  ctx.restore()
}

function CATEGORY_COLORS_FALLBACK(category: string): string {
  const map: Record<string,string> = {
    PMIC:'#a855f7',CPU:'#00d4ff',RF:'#ef4444',AUDIO:'#22c55e',
    CHARGER:'#06b6d4',TOUCH:'#8b5cf6',DISPLAY:'#f59e0b',CAMERA:'#10b981',
    WIFI:'#f59e0b',NFC:'#22c55e',MEMORY:'#3b82f6',SENSOR:'#ec4899',
    USB:'#06b6d4',MOTOR:'#f97316',POWER:'#a855f7',OTHER:'#64748b',
  }
  return map[category] || '#64748b'
}
