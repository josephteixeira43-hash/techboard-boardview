// src/core/boardview/PCBRenderer.ts — v2
// PCB Rendering Engine profissional
// v2: pads dourados, cores premium, overlay system, smart hover tooltip

import type { BoardComponent, ComputedPosition, ComponentHighlight } from '@/types/board'
import { CATEGORY_COLORS } from '@/lib/constants'
import { COMP_W, COMP_H, getComputedDimensions } from '@/core/boardview/CoordinateEngine'
import type { OverlayState } from '@/core/boardview/OverlaySystem'

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  if (h.length !== 6) return [100, 116, 139]
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}

// Dourado metálico para pads
const PAD_GOLD_1 = 'rgba(212,175,55,0.85)'
const PAD_GOLD_2 = 'rgba(255,215,0,0.65)'
const PAD_GOLD_3 = 'rgba(184,142,30,0.9)'

// ─── LOD ──────────────────────────────────────────────────────────────────────

export type LOD = 'low' | 'medium' | 'high' | 'ultra'

export function getLOD(zoom: number): LOD {
  if (zoom < 0.5) return 'low'
  if (zoom < 1.0) return 'medium'
  if (zoom < 2.0) return 'high'
  return 'ultra'
}

// ─── Component Shape ──────────────────────────────────────────────────────────

type ComponentShape = 'ic_qfp' | 'ic_bga' | 'capacitor' | 'resistor' | 'inductor' | 'connector' | 'ic_generic'

function getShape(comp: BoardComponent): ComponentShape {
  const cat  = comp.category?.toUpperCase() || 'OTHER'
  const name = comp.name?.toUpperCase() || ''
  if (cat === 'CPU' || name.match(/^U4\d\d/)) return 'ic_bga'
  if (cat === 'PMIC' || cat === 'MEMORY' || cat === 'RF') return 'ic_qfp'
  if (name.startsWith('C')) return 'capacitor'
  if (name.startsWith('R')) return 'resistor'
  if (name.startsWith('L')) return 'inductor'
  if (name.startsWith('J') || name.startsWith('CN') || cat === 'CONNECTOR') return 'connector'
  if (name.startsWith('U') || ['AUDIO','CHARGER','WIFI','NFC','SENSOR','TOUCH','DISPLAY','CAMERA'].includes(cat)) return 'ic_generic'
  return 'ic_generic'
}

// ─── PCBRenderer v2 ───────────────────────────────────────────────────────────

export class PCBRenderer {

  drawComponent(
    ctx: CanvasRenderingContext2D,
    comp: BoardComponent,
    pos: ComputedPosition,
    highlight: ComponentHighlight | null,
    hasAnyHighlight: boolean,
    isActiveSide: boolean,
    isHovered: boolean,
    lod: LOD,
    overlay: OverlayState,
    voltages?: { node: string; value: string }[]
  ) {
    const color   = highlight?.color || CATEGORY_COLORS[comp.category] || CATEGORY_COLORS.OTHER
    const [r,g,b] = hexToRgb(color)
    const shape   = getShape(comp)
    const isHL    = !!highlight
    const isSel   = highlight?.type === 'selected'
    const isConn  = highlight?.type === 'connected'
    const isSearch = highlight?.type === 'search'

    const alpha = hasAnyHighlight && !isHL ? 0.13 : isActiveSide ? 1 : 0.28
    ctx.globalAlpha = alpha

    // Glow
    ctx.shadowBlur  = 0
    ctx.shadowColor = color
    if (isSel || isSearch) ctx.shadowBlur = 26
    else if (isConn)       ctx.shadowBlur = 12
    else if (isHovered)    ctx.shadowBlur = 8

    // Shape
    switch (shape) {
      case 'ic_bga':    this.drawBGA(ctx, comp, pos, color, r,g,b, isSel, isHL, lod, overlay); break
      case 'ic_qfp':    this.drawQFP(ctx, comp, pos, color, r,g,b, isSel, isHL, lod, overlay); break
      case 'capacitor': this.drawCapacitor(ctx, comp, pos, color, r,g,b, isSel, isHL, lod, overlay); break
      case 'resistor':  this.drawResistor(ctx, comp, pos, color, r,g,b, isSel, isHL, lod, overlay); break
      case 'inductor':  this.drawInductor(ctx, comp, pos, color, r,g,b, isSel, isHL, lod, overlay); break
      case 'connector': this.drawConnector(ctx, comp, pos, color, r,g,b, isSel, isHL, lod, overlay); break
      default:          this.drawICGeneric(ctx, comp, pos, color, r,g,b, isSel, isHL, lod, overlay); break
    }

    // Silkscreen
    if (overlay.showSilkscreen && lod !== 'low') {
      this.drawSilkscreen(ctx, comp, pos, color, r,g,b, isSel || isHovered, lod)
    }

    // Voltage overlay
    if (overlay.showVoltages && voltages && voltages.length > 0 && lod !== 'low') {
      this.drawVoltageLabel(ctx, comp, pos, voltages[0].value, r,g,b)
    }

    ctx.shadowBlur  = 0
    ctx.globalAlpha = 1
  }

  // ── QFP ─────────────────────────────────────────────────────────────────────
  private drawQFP(ctx: CanvasRenderingContext2D, comp: BoardComponent, pos: ComputedPosition,
    color: string, r: number, g: number, b: number, isSel: boolean, isHL: boolean, lod: LOD, overlay: OverlayState) {
    const { width: w, height: h } = getComputedDimensions(pos)
    const x = pos.x, y = pos.y

    // Body
    const grad = ctx.createLinearGradient(x, y, x, y+h)
    grad.addColorStop(0, `rgba(${r},${g},${b},${isSel?0.6:0.3})`)
    grad.addColorStop(1, `rgba(${r},${g},${b},${isSel?0.35:0.14})`)
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 5); ctx.fill()

    // Border
    ctx.strokeStyle = `rgba(${r},${g},${b},${isSel?0.95:isHL?0.75:0.55})`
    ctx.lineWidth   = isSel ? 2.5 : 1.5
    ctx.setLineDash([])
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 5); ctx.stroke()

    // Pin 1
    ctx.fillStyle = `rgba(${r},${g},${b},0.75)`
    ctx.beginPath(); ctx.arc(x+7, y+7, 3, 0, Math.PI*2); ctx.fill()

    // Gold pads
    if (overlay.showPads && lod !== 'low') {
      const pw = 6, ph = 3.5, pg = 11
      for (let i = 0; i*pg+10 < w-10; i++) {
        this.drawGoldPad(ctx, x+10+i*pg, y-ph, pw, ph)
        this.drawGoldPad(ctx, x+10+i*pg, y+h,  pw, ph)
      }
      const ph2=6, pw2=3.5, pg2=10
      for (let i = 0; i*pg2+8 < h-8; i++) {
        this.drawGoldPad(ctx, x-pw2,  y+8+i*pg2, pw2, ph2)
        this.drawGoldPad(ctx, x+w,    y+8+i*pg2, pw2, ph2)
      }
    }

    // Die
    if (lod === 'high' || lod === 'ultra') {
      ctx.fillStyle = `rgba(${r},${g},${b},0.07)`
      ctx.beginPath(); ctx.roundRect(x+10, y+10, w-20, h-20, 3); ctx.fill()
      ctx.strokeStyle = `rgba(${r},${g},${b},0.18)`; ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(x+w/2-6,y+h/2); ctx.lineTo(x+w/2+6,y+h/2)
      ctx.moveTo(x+w/2,y+h/2-4); ctx.lineTo(x+w/2,y+h/2+4)
      ctx.stroke()
    }
  }

  // ── BGA ─────────────────────────────────────────────────────────────────────
  private drawBGA(ctx: CanvasRenderingContext2D, comp: BoardComponent, pos: ComputedPosition,
    color: string, r: number, g: number, b: number, isSel: boolean, isHL: boolean, lod: LOD, overlay: OverlayState) {
    const { width: w, height: h } = getComputedDimensions(pos)
    const x = pos.x, y = pos.y

    ctx.fillStyle = isSel ? `rgba(${r},${g},${b},0.5)` : `rgba(16,20,28,0.94)`
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill()
    ctx.strokeStyle = isSel ? `rgba(${r},${g},${b},0.95)` : `rgba(${r},${g},${b},0.6)`
    ctx.lineWidth   = isSel ? 2.5 : 1.5
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.stroke()

    // BGA balls dourados
    if (overlay.showPads && lod !== 'low') {
      const cols=5, rows=3, ballR=2.2
      const gapX = (w-20)/(cols-1), gapY = (h-16)/(rows-1)
      for (let row=0; row<rows; row++) {
        for (let col=0; col<cols; col++) {
          const bx = x+10+col*gapX, by = y+8+row*gapY
          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.35)'
          ctx.beginPath(); ctx.arc(bx+0.5,by+0.5,ballR,0,Math.PI*2); ctx.fill()
          // Ball dourado
          const bg2 = ctx.createRadialGradient(bx-0.5,by-0.5,0.3,bx,by,ballR)
          bg2.addColorStop(0, 'rgba(255,220,80,0.95)')
          bg2.addColorStop(0.5, 'rgba(200,160,30,0.85)')
          bg2.addColorStop(1, 'rgba(140,100,15,0.7)')
          ctx.fillStyle = bg2
          ctx.beginPath(); ctx.arc(bx,by,ballR,0,Math.PI*2); ctx.fill()
        }
      }
    }

    if (lod === 'ultra') {
      ctx.strokeStyle = `rgba(${r},${g},${b},0.22)` ; ctx.lineWidth = 0.5
      ctx.setLineDash([2,3])
      ctx.beginPath(); ctx.roundRect(x+5,y+5,w-10,h-10,2); ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // ── Capacitor ────────────────────────────────────────────────────────────────
  private drawCapacitor(ctx: CanvasRenderingContext2D, comp: BoardComponent, pos: ComputedPosition,
    color: string, r: number, g: number, b: number, isSel: boolean, isHL: boolean, lod: LOD, overlay: OverlayState) {
    const { width: w, height: h } = getComputedDimensions(pos)
    const x = pos.x, y = pos.y
    const padW = 13, bodyW = w - padW*2

    if (overlay.showPads) {
      this.drawGoldPad(ctx, x, y+h*0.2, padW, h*0.6)
      this.drawGoldPad(ctx, x+w-padW, y+h*0.2, padW, h*0.6)
    }

    const bg = ctx.createLinearGradient(x+padW,y,x+padW,y+h)
    bg.addColorStop(0, `rgba(${r},${g},${b},${isSel?0.55:0.28})`)
    bg.addColorStop(1, `rgba(${r},${g},${b},${isSel?0.35:0.14})`)
    ctx.fillStyle = bg
    ctx.beginPath(); ctx.roundRect(x+padW, y+2, bodyW, h-4, 2); ctx.fill()
    ctx.strokeStyle = `rgba(${r},${g},${b},${isSel?0.9:0.6})`
    ctx.lineWidth = isSel ? 2 : 1; ctx.setLineDash([])
    ctx.beginPath(); ctx.roundRect(x+padW, y+2, bodyW, h-4, 2); ctx.stroke()

    if (lod !== 'low') {
      ctx.strokeStyle = `rgba(${r},${g},${b},0.45)`; ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x+padW+4, y+h*0.3); ctx.lineTo(x+padW+4, y+h*0.7)
      ctx.stroke()
    }
  }

  // ── Resistor ─────────────────────────────────────────────────────────────────
  private drawResistor(ctx: CanvasRenderingContext2D, comp: BoardComponent, pos: ComputedPosition,
    color: string, r: number, g: number, b: number, isSel: boolean, isHL: boolean, lod: LOD, overlay: OverlayState) {
    const { width: w, height: h } = getComputedDimensions(pos)
    const x = pos.x, y = pos.y
    const padW = 12

    if (overlay.showPads) {
      this.drawGoldPad(ctx, x, y+h*0.25, padW, h*0.5)
      this.drawGoldPad(ctx, x+w-padW, y+h*0.25, padW, h*0.5)
    }

    ctx.fillStyle = isSel ? `rgba(${r},${g},${b},0.4)` : 'rgba(28,22,18,0.9)'
    ctx.beginPath(); ctx.roundRect(x+padW, y+3, w-padW*2, h-6, 2); ctx.fill()
    ctx.strokeStyle = `rgba(${r},${g},${b},${isSel?0.85:0.55})`
    ctx.lineWidth = isSel ? 1.8 : 1; ctx.setLineDash([])
    ctx.beginPath(); ctx.roundRect(x+padW, y+3, w-padW*2, h-6, 2); ctx.stroke()

    if (lod !== 'low') {
      const bx = x + padW + (w-padW*2)*0.4
      ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(bx,y+5); ctx.lineTo(bx,y+h-5); ctx.stroke()
    }
  }

  // ── Indutor ──────────────────────────────────────────────────────────────────
  private drawInductor(ctx: CanvasRenderingContext2D, comp: BoardComponent, pos: ComputedPosition,
    color: string, r: number, g: number, b: number, isSel: boolean, isHL: boolean, lod: LOD, overlay: OverlayState) {
    const { width: w, height: h } = getComputedDimensions(pos)
    const x = pos.x, y = pos.y
    const padW = 11

    if (overlay.showPads) {
      this.drawGoldPad(ctx, x, y+h*0.2, padW, h*0.6)
      this.drawGoldPad(ctx, x+w-padW, y+h*0.2, padW, h*0.6)
    }

    ctx.fillStyle = isSel ? `rgba(${r},${g},${b},0.4)` : 'rgba(18,18,24,0.92)'
    ctx.beginPath(); ctx.roundRect(x+padW, y+2, w-padW*2, h-4, 3); ctx.fill()
    ctx.strokeStyle = `rgba(${r},${g},${b},${isSel?0.9:0.55})`
    ctx.lineWidth = isSel ? 2 : 1.2; ctx.setLineDash([])
    ctx.beginPath(); ctx.roundRect(x+padW, y+2, w-padW*2, h-4, 3); ctx.stroke()

    if (lod !== 'low') {
      const coils = 3, cw = (w-padW*2-8)/coils
      ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`; ctx.lineWidth = 1.5
      for (let i=0;i<coils;i++) {
        const cx = x+padW+4+i*cw+cw/2
        ctx.beginPath(); ctx.arc(cx, y+h/2, cw/2*0.7, 0, Math.PI); ctx.stroke()
      }
    }
  }

  // ── Connector ────────────────────────────────────────────────────────────────
  private drawConnector(ctx: CanvasRenderingContext2D, comp: BoardComponent, pos: ComputedPosition,
    color: string, r: number, g: number, b: number, isSel: boolean, isHL: boolean, lod: LOD, overlay: OverlayState) {
    const { width: w, height: h } = getComputedDimensions(pos)
    const x = pos.x, y = pos.y

    ctx.fillStyle = isSel ? `rgba(${r},${g},${b},0.45)` : 'rgba(22,28,40,0.92)'
    ctx.beginPath(); ctx.roundRect(x,y,w,h,4); ctx.fill()
    ctx.strokeStyle = `rgba(${r},${g},${b},${isSel?0.95:0.65})`
    ctx.lineWidth = isSel ? 2.5 : 1.5; ctx.setLineDash([])
    ctx.beginPath(); ctx.roundRect(x,y,w,h,4); ctx.stroke()

    if (overlay.showPads && lod !== 'low') {
      const pinCount=5, pinW=7, pinH=h*0.55
      const totalW = pinCount*pinW+(pinCount-1)*3
      const startX = x+(w-totalW)/2
      for (let i=0;i<pinCount;i++) {
        const px = startX+i*(pinW+3)
        this.drawGoldPad(ctx, px, y+(h-pinH)/2, pinW, pinH)
      }
    }
  }

  // ── IC Generic ───────────────────────────────────────────────────────────────
  private drawICGeneric(ctx: CanvasRenderingContext2D, comp: BoardComponent, pos: ComputedPosition,
    color: string, r: number, g: number, b: number, isSel: boolean, isHL: boolean, lod: LOD, overlay: OverlayState) {
    const { width: w, height: h } = getComputedDimensions(pos)
    const x = pos.x, y = pos.y

    const grad = ctx.createLinearGradient(x,y,x+w,y+h)
    grad.addColorStop(0, `rgba(${r},${g},${b},${isSel?0.58:0.24})`)
    grad.addColorStop(1, `rgba(${r},${g},${b},${isSel?0.32:0.10})`)
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.roundRect(x,y,w,h,5); ctx.fill()
    ctx.strokeStyle = `rgba(${r},${g},${b},${isSel?0.95:isHL?0.82:0.55})`
    ctx.lineWidth = isSel ? 2.5 : 1.5; ctx.setLineDash([])
    ctx.beginPath(); ctx.roundRect(x,y,w,h,5); ctx.stroke()

    if (overlay.showPads && lod !== 'low') {
      const pw=6, ph=3, pg=12
      for (let i=0; i*pg+10<w-8; i++) {
        this.drawGoldPad(ctx, x+10+i*pg, y-ph, pw, ph)
        this.drawGoldPad(ctx, x+10+i*pg, y+h,  pw, ph)
      }
      const ph2=6, pw2=3, pg2=10
      for (let i=0; i*pg2+6<h-6; i++) {
        this.drawGoldPad(ctx, x-pw2,  y+6+i*pg2, pw2, ph2)
        this.drawGoldPad(ctx, x+w,    y+6+i*pg2, pw2, ph2)
      }
    }

    // Pin 1 mark
    ctx.fillStyle = `rgba(${r},${g},${b},0.65)`
    ctx.beginPath(); ctx.arc(x+6,y+6,2.5,0,Math.PI*2); ctx.fill()

    if (lod === 'ultra') {
      ctx.fillStyle = `rgba(${r},${g},${b},0.06)`
      ctx.beginPath(); ctx.roundRect(x+9,y+9,w-18,h-18,2); ctx.fill()
    }
  }

  // ── Gold pad ─────────────────────────────────────────────────────────────────
  private drawGoldPad(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const grad = ctx.createLinearGradient(x,y,x,y+h)
    grad.addColorStop(0,   'rgba(255,223,80,0.92)')
    grad.addColorStop(0.35,'rgba(212,175,55,0.85)')
    grad.addColorStop(0.7, 'rgba(180,138,25,0.88)')
    grad.addColorStop(1,   'rgba(255,210,60,0.80)')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.roundRect(x,y,w,h,1.5); ctx.fill()
    // Brilho
    ctx.strokeStyle = 'rgba(255,240,120,0.25)'; ctx.lineWidth = 0.4
    ctx.stroke()
    // Solder mask shadow
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.3
    ctx.beginPath(); ctx.roundRect(x+0.5,y+0.5,w-1,h-1,1); ctx.stroke()
  }

  // ── Silkscreen ────────────────────────────────────────────────────────────────
  private drawSilkscreen(ctx: CanvasRenderingContext2D, comp: BoardComponent, pos: ComputedPosition,
    color: string, r: number, g: number, b: number, highlighted: boolean, lod: LOD) {
    const { width: w, height: h } = getComputedDimensions(pos)
    const x = pos.x, y = pos.y
    ctx.save()
    ctx.shadowBlur  = highlighted ? 7 : 0
    ctx.shadowColor = color
    ctx.fillStyle   = `rgba(${r},${g},${b},${highlighted?1:0.88})`
    ctx.font        = `bold ${lod==='ultra'?11:10}px "JetBrains Mono", monospace`
    ctx.textAlign   = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(comp.name, x+w/2, y-2, w+22)
    if (lod === 'high' || lod === 'ultra') {
      ctx.fillStyle = `rgba(${r},${g},${b},0.48)` ; ctx.font = '8px monospace'
      ctx.textBaseline = 'top'
      ctx.fillText(comp.category, x+w/2, y+h+3, w+10)
    }
    ctx.restore()
  }

  // ── Voltage label ─────────────────────────────────────────────────────────────
  private drawVoltageLabel(ctx: CanvasRenderingContext2D, comp: BoardComponent, pos: ComputedPosition,
    voltage: string, r: number, g: number, b: number) {
    const x = pos.x + COMP_W/2, y = pos.y - 16
    ctx.save()
    ctx.font = 'bold 9px monospace'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    // Badge background
    const tw = ctx.measureText(voltage).width + 8
    ctx.fillStyle = 'rgba(4,8,15,0.85)'
    ctx.beginPath(); ctx.roundRect(x-tw/2, y-7, tw, 14, 4); ctx.fill()
    ctx.strokeStyle = `rgba(${r},${g},${b},0.6)`; ctx.lineWidth = 0.8
    ctx.stroke()
    // Text
    ctx.fillStyle = `rgba(${r},${g},${b},0.95)`
    ctx.fillText(voltage, x, y)
    ctx.restore()
  }

  // ── Via ───────────────────────────────────────────────────────────────────────
  drawVia(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, zoom: number, lod: LOD) {
    const outerR = Math.max(3.5, 5.5 * Math.min(zoom, 2))
    const innerR = outerR * 0.42

    // Copper ring dourado
    const grad = ctx.createRadialGradient(x-outerR*0.3, y-outerR*0.3, outerR*0.1, x, y, outerR)
    grad.addColorStop(0,   'rgba(255,220,80,0.9)')
    grad.addColorStop(0.5, 'rgba(200,160,30,0.85)')
    grad.addColorStop(1,   'rgba(140,100,15,0.75)')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(x,y,outerR,0,Math.PI*2); ctx.fill()

    // Drill hole
    ctx.fillStyle = 'rgba(3,6,12,0.97)'
    ctx.beginPath(); ctx.arc(x,y,innerR,0,Math.PI*2); ctx.fill()

    // Glow ring
    if (lod !== 'low') {
      ctx.strokeStyle = `rgba(255,200,50,0.2)`; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(x,y,outerR+1.5,0,Math.PI*2); ctx.stroke()
    }
  }

  // ── Board texture ─────────────────────────────────────────────────────────────
  drawBoardTexture(ctx: CanvasRenderingContext2D, w: number, h: number) {
    // PCB green base gradient
    const bg = ctx.createLinearGradient(0,0,w,h)
    bg.addColorStop(0,   '#061508')
    bg.addColorStop(0.25,'#0a2410')
    bg.addColorStop(0.5, '#082010')
    bg.addColorStop(0.75,'#071a0c')
    bg.addColorStop(1,   '#051208')
    ctx.fillStyle = bg
    ctx.beginPath(); ctx.roundRect(0,0,w,h,10); ctx.fill()

    // Fibra de vidro — hatching
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.strokeStyle = '#0d2a10'; ctx.lineWidth = 0.5
    for (let i=-h; i<w+h; i+=12) {
      ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i+h,h); ctx.stroke()
    }
    for (let i=-h; i<w+h; i+=12) {
      ctx.beginPath(); ctx.moveTo(i,h); ctx.lineTo(i+h,0); ctx.stroke()
    }
    ctx.restore()

    // Grid major 80px
    ctx.strokeStyle = 'rgba(52,211,153,0.07)'; ctx.lineWidth = 0.8
    for (let x=0;x<w;x+=80) { ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke() }
    for (let y=0;y<h;y+=80) { ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke() }

    // Grid minor 20px
    ctx.strokeStyle = 'rgba(52,211,153,0.025)'; ctx.lineWidth = 0.3
    for (let x=0;x<w;x+=20) { ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke() }
    for (let y=0;y<h;y+=20) { ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke() }

    // Vias decorativas com gold
    for (let x=80;x<w;x+=80) {
      for (let y=80;y<h;y+=80) {
        // Outer copper ring
        const grad = ctx.createRadialGradient(x,y,0.5,x,y,3.5)
        grad.addColorStop(0, 'rgba(200,160,30,0.3)')
        grad.addColorStop(1, 'rgba(140,100,15,0.15)')
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(x,y,3.5,0,Math.PI*2); ctx.fill()
        // Drill
        ctx.fillStyle = 'rgba(4,10,6,0.85)'
        ctx.beginPath(); ctx.arc(x,y,1.5,0,Math.PI*2); ctx.fill()
      }
    }

    // Copper traces decorativos
    ctx.strokeStyle = 'rgba(34,197,94,0.07)'; ctx.lineWidth = 2
    for (let y=160;y<h;y+=320) {
      ctx.beginPath();ctx.moveTo(30,y);ctx.lineTo(w-30,y);ctx.stroke()
    }
    for (let x=240;x<w;x+=480) {
      ctx.beginPath();ctx.moveTo(x,30);ctx.lineTo(x,h-30);ctx.stroke()
    }

    // PCB border
    ctx.strokeStyle = 'rgba(52,211,153,0.2)'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(14,14,w-28,h-28,6); ctx.stroke()

    // Corner markers
    ;[[20,20],[w-20,20],[20,h-20],[w-20,h-20]].forEach(([cx,cy]) => {
      ctx.strokeStyle = 'rgba(52,211,153,0.45)'; ctx.lineWidth = 1.8
      ctx.beginPath(); ctx.arc(cx as number,cy as number,18,0,Math.PI*2); ctx.stroke()
      ctx.fillStyle = 'rgba(52,211,153,0.08)'; ctx.fill()
      ctx.strokeStyle = 'rgba(52,211,153,0.3)'; ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo((cx as number)-8,(cy as number)); ctx.lineTo((cx as number)+8,(cy as number))
      ctx.moveTo((cx as number),(cy as number)-8); ctx.lineTo((cx as number),(cy as number)+8)
      ctx.stroke()
    })
  }

  // ── Hover tooltip ─────────────────────────────────────────────────────────────
  drawHoverTooltip(
    ctx: CanvasRenderingContext2D,
    comp: BoardComponent,
    pos: ComputedPosition,
    netName: string,
    netVoltage: string,
    color: string,
    viewport: { zoom: number; panX: number; panY: number },
    canvasW: number
  ) {
    const [r,g,b] = hexToRgb(color)
    // Posição em screen coords
    const sx = (pos.x + COMP_W/2) * viewport.zoom + viewport.panX
    const sy = pos.y * viewport.zoom + viewport.panY - 8

    ctx.save()
    ctx.setTransform(1,0,0,1,0,0) // reset transform para coordenadas de tela

    const lines  = [comp.name, `${netName} · ${netVoltage}`, comp.category]
    const maxW   = Math.max(...lines.map(l => ctx.measureText(l).width)) + 18
    const boxH   = 52
    const bx     = Math.min(Math.max(sx - maxW/2, 8), canvasW - maxW - 8)
    const by     = sy - boxH - 4

    // Background glassmorphism
    ctx.fillStyle = 'rgba(4,8,15,0.94)'
    ctx.beginPath(); ctx.roundRect(bx, by, maxW, boxH, 7); ctx.fill()
    ctx.strokeStyle = `rgba(${r},${g},${b},0.55)`; ctx.lineWidth = 1
    ctx.stroke()

    // Left accent bar
    ctx.fillStyle = color
    ctx.beginPath(); ctx.roundRect(bx, by+8, 2.5, boxH-16, 2); ctx.fill()

    // Component name
    ctx.fillStyle = color; ctx.font = 'bold 11px "JetBrains Mono", monospace'
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(comp.name, bx+10, by+8)

    // Net
    ctx.fillStyle = `rgba(${r},${g},${b},0.7)`; ctx.font = '9px monospace'
    ctx.fillText(`${netName} · ${netVoltage}`, bx+10, by+24)

    // Category
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '9px monospace'
    ctx.fillText(comp.category, bx+10, by+37)

    ctx.restore()
  }
}

export const pcbRenderer = new PCBRenderer()
