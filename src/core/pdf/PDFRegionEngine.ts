/**
 * PDFRegionEngine — agrupamento inteligente de componentes extraídos de schematic PDF.
 * Gera regiões virtuais e coordenadas aproximadas para renderização sem geometria física do board.
 */

import type { BoardComponent } from '@/types/board'
import type {
  PdfRegionContext,
  PdfRegionEnrichmentResult,
  VirtualRegion,
  VirtualRegionName,
} from '@/types/pdfRegions'
import type { PdfTextHit } from '@/lib/pdfComponentExtractor'
import { BOARD_H, BOARD_W, COMP_H, COMP_W } from '@/core/boardview/CoordinateEngine'
import { CATEGORY_COLORS } from '@/lib/constants'

const REGION_PADDING = 48
const CLUSTER_GAP = 12
const CELL_W = COMP_W + 8
const CELL_H = COMP_H + 8

/** Slots no canvas virtual (proporção do board) */
const REGION_SLOTS: Record<
  VirtualRegionName,
  { x: number; y: number; w: number; h: number; color: string }
> = {
  CPU:      { x: 0.28, y: 0.22, w: 0.44, h: 0.36, color: CATEGORY_COLORS.CPU },
  PMIC:     { x: 0.04, y: 0.06, w: 0.22, h: 0.28, color: CATEGORY_COLORS.PMIC },
  RF:       { x: 0.74, y: 0.06, w: 0.22, h: 0.28, color: CATEGORY_COLORS.RF },
  AUDIO:    { x: 0.04, y: 0.62, w: 0.22, h: 0.28, color: CATEGORY_COLORS.AUDIO },
  CHARGING: { x: 0.04, y: 0.38, w: 0.22, h: 0.20, color: CATEGORY_COLORS.CHARGER },
  SIM:      { x: 0.74, y: 0.62, w: 0.22, h: 0.18, color: '#94a3b8' },
  DISPLAY:  { x: 0.28, y: 0.04, w: 0.44, h: 0.14, color: CATEGORY_COLORS.DISPLAY },
  OTHER:    { x: 0.74, y: 0.38, w: 0.22, h: 0.20, color: CATEGORY_COLORS.OTHER },
}

const PREFIX_PATTERN = /^(U|C|R|L|TP|Q|D|J|CN|FL|FB|SW|Y|MIC|SPK|BAT|SIM|PMIC|CPU|GPU|ANT|PAM)/i

export function getDesignatorPrefix(name: string): string {
  const m = name.trim().toUpperCase().match(PREFIX_PATTERN)
  return m ? m[1].toUpperCase() : 'OTHER'
}

function schematicPoint(
  comp: BoardComponent,
  hitMap: Map<string, PdfTextHit>
): { x: number; y: number; pageIndex: number } {
  const hit = hitMap.get(comp.name)
  if (hit) return { x: hit.x, y: hit.y, pageIndex: hit.pageIndex }
  const useBottom = comp.side === 'bottom' || comp.side === 'sub_bottom'
  const x = useBottom ? comp.x_bottom : comp.x_top
  const y = useBottom ? comp.y_bottom : comp.y_top
  return { x: Number(x) || 0, y: Number(y) || 0, pageIndex: 0 }
}

/** Heurística: designator + categoria → região funcional virtual */
export function inferVirtualRegion(comp: BoardComponent): VirtualRegionName {
  const name = comp.name.toUpperCase()
  const cat = comp.category.toUpperCase()

  if (/^SIM|^U\d*SIM|SIM\d/i.test(name) || cat === 'SIM') return 'SIM'
  if (/^PMIC|^U\d*PMIC/i.test(name) || cat === 'PMIC' || cat === 'POWER') return 'PMIC'
  if (/^PAM|^ANT|^U\d*RF/i.test(name) || cat === 'RF' || cat === 'WIFI' || cat === 'NFC') return 'RF'
  if (/^MIC|^SPK|^EAR|^U\d*AUDIO/i.test(name) || cat === 'AUDIO') return 'AUDIO'
  if (/^BAT|^CHG|^U\d*CHG|CHARG/i.test(name) || cat === 'CHARGER') return 'CHARGING'
  if (/^CPU|^GPU|^U\d*CPU|^U\d*AP|^U\d*SOC/i.test(name) || cat === 'CPU' || cat === 'IC') {
    if (/PMIC|CHG|BAT|SIM|ANT|PAM|MIC|SPK|DISP|LCD/i.test(name)) {
      /* fall through */
    } else if (cat === 'IC' && /^U\d/.test(name)) {
      return 'CPU'
    } else if (cat === 'CPU') {
      return 'CPU'
    }
  }
  if (/^CPU|^GPU|^SOC|^AP\d/i.test(name)) return 'CPU'
  if (/^DISP|^LCD|^LED\d{2,}|^U\d*DISP/i.test(name) || cat === 'DISPLAY' || cat === 'TOUCH') return 'DISPLAY'

  const prefix = getDesignatorPrefix(name)
  if (prefix === 'TP') return 'OTHER'
  if (prefix === 'C' || prefix === 'R' || prefix === 'L') {
    return inferPassiveRegion(comp, name)
  }
  if (prefix === 'U') return 'CPU'

  return 'OTHER'
}

function inferPassiveRegion(comp: BoardComponent, name: string): VirtualRegionName {
  const cat = comp.category.toUpperCase()
  if (cat === 'PMIC' || cat === 'POWER') return 'PMIC'
  if (cat === 'RF') return 'RF'
  if (cat === 'AUDIO') return 'AUDIO'
  if (cat === 'CHARGER') return 'CHARGING'
  if (cat === 'DISPLAY') return 'DISPLAY'
  if (/PMIC|VBAT|VDD|LDO/i.test(name)) return 'PMIC'
  return 'OTHER'
}

/** Distância euclidiana para proximidade textual no schematic */
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Agrupa componentes por proximidade no schematic (single-linkage simplificado).
 * Retorna clusterId por component id.
 */
function clusterByProximity(
  items: { id: string; x: number; y: number; pageIndex: number }[],
  threshold: number
): Map<string, string> {
  const parent = new Map<string, string>()
  for (const item of items) parent.set(item.id, item.id)

  const find = (id: string): string => {
    let p = parent.get(id)!
    while (p !== parent.get(p)) {
      parent.set(id, parent.get(p)!)
      p = parent.get(p)!
    }
    return p
  }

  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]
      const b = items[j]
      if (a.pageIndex !== b.pageIndex) continue
      if (dist(a, b) <= threshold) union(a.id, b.id)
    }
  }

  const rootToLabel = new Map<string, string>()
  let idx = 0
  const out = new Map<string, string>()
  for (const item of items) {
    const root = find(item.id)
    if (!rootToLabel.has(root)) rootToLabel.set(root, `c${idx++}`)
    out.set(item.id, rootToLabel.get(root)!)
  }
  return out
}

function computeProximityThreshold(
  points: { x: number; y: number }[]
): number {
  if (points.length < 2) return BOARD_W * 0.08
  let sum = 0
  let count = 0
  for (let i = 0; i < Math.min(points.length, 40); i++) {
    for (let j = i + 1; j < Math.min(points.length, 40); j++) {
      sum += dist(points[i], points[j])
      count++
    }
  }
  const avg = count > 0 ? sum / count : BOARD_W * 0.1
  return Math.max(BOARD_W * 0.04, Math.min(BOARD_W * 0.15, avg * 0.35))
}

/** Layout em grid dentro do slot da região */
function layoutInSlot(
  count: number,
  slotX: number,
  slotY: number,
  slotW: number,
  slotH: number
): { x: number; y: number }[] {
  const innerW = slotW - REGION_PADDING * 2
  const innerH = slotH - REGION_PADDING * 2
  const cols = Math.max(1, Math.ceil(Math.sqrt(count * (innerW / innerH))))
  const rows = Math.ceil(count / cols)
  const cellW = Math.min(CELL_W, innerW / cols)
  const cellH = Math.min(CELL_H, innerH / rows)
  const positions: { x: number; y: number }[] = []
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    positions.push({
      x: slotX + REGION_PADDING + col * cellW + (cellW - COMP_W) / 2,
      y: slotY + REGION_PADDING + row * cellH + (cellH - COMP_H) / 2,
    })
  }
  return positions
}

function slotPixels(slot: (typeof REGION_SLOTS)[VirtualRegionName]) {
  return {
    x: Math.round(slot.x * BOARD_W),
    y: Math.round(slot.y * BOARD_H),
    w: Math.round(slot.w * BOARD_W),
    h: Math.round(slot.h * BOARD_H),
  }
}

/**
 * Enriquece componentes PDF com regiões virtuais, clusters e coordenadas de layout.
 * Atualiza x_top/y_top com x_virtual/y_virtual para o pipeline existente (CoordinateEngine inalterado).
 */
export function enrichPdfComponents(
  components: BoardComponent[],
  context?: PdfRegionContext
): PdfRegionEnrichmentResult {
  if (!components.length) return { components: [], regions: [] }

  const hitMap = new Map<string, PdfTextHit>()
  for (const h of context?.hits ?? []) {
    const prev = hitMap.get(h.id)
    if (!prev || h.confidence > prev.confidence) hitMap.set(h.id, h)
  }

  const byRegion = new Map<VirtualRegionName, BoardComponent[]>()
  for (const comp of components) {
    const region = inferVirtualRegion(comp)
    if (!byRegion.has(region)) byRegion.set(region, [])
    byRegion.get(region)!.push(comp)
  }

  const enriched: BoardComponent[] = []
  const regions: VirtualRegion[] = []

  for (const [regionName, group] of byRegion) {
    const slot = REGION_SLOTS[regionName]
    const { x: slotX, y: slotY, w: slotW, h: slotH } = slotPixels(slot)
    const regionId = `region-${regionName.toLowerCase()}`

    const schematicItems = group.map((comp) => {
      const pt = schematicPoint(comp, hitMap)
      return { id: comp.id, x: pt.x, y: pt.y, pageIndex: pt.pageIndex }
    })

    const threshold = computeProximityThreshold(schematicItems)
    const clusterMap = clusterByProximity(schematicItems, threshold)

    const byCluster = new Map<string, BoardComponent[]>()
    for (const comp of group) {
      const cid = `${regionId}-${clusterMap.get(comp.id) ?? 'c0'}`
      if (!byCluster.has(cid)) byCluster.set(cid, [])
      byCluster.get(cid)!.push(comp)
    }

    const clusterIds = Array.from(byCluster.keys())
    let layoutIndex = 0
    const allLayoutPositions: { comp: BoardComponent; x: number; y: number; clusterId: string }[] = []

    for (const [clusterId, clusterComps] of byCluster) {
      const positions = layoutInSlot(clusterComps.length, slotX, slotY, slotW, slotH)
      clusterComps.forEach((comp, i) => {
        const pos = positions[i] ?? positions[positions.length - 1]
        allLayoutPositions.push({
          comp,
          x: pos.x + (layoutIndex % 3) * 2,
          y: pos.y + Math.floor(layoutIndex / 3) * 2,
          clusterId,
        })
        layoutIndex++
      })
    }

    if (allLayoutPositions.length > 1) {
      const relayout = layoutInSlot(allLayoutPositions.length, slotX, slotY, slotW, slotH)
      allLayoutPositions.forEach((entry, i) => {
        entry.x = relayout[i]?.x ?? entry.x
        entry.y = relayout[i]?.y ?? entry.y
      })
    }

    const componentIds: string[] = []
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const { comp, x, y, clusterId } of allLayoutPositions) {
      const w = Number(comp.width) || COMP_W
      const h = Number(comp.height) || COMP_H
      const next: BoardComponent = {
        ...comp,
        regionId,
        regionName,
        clusterId,
        x_virtual: x,
        y_virtual: y,
        width: w,
        height: h,
        data_source: comp.data_source ?? 'ocr',
      }
      const useBottom = comp.side === 'bottom' || comp.side === 'sub_bottom'
      if (useBottom) {
        next.x_bottom = x
        next.y_bottom = y
      } else {
        next.x_top = x
        next.y_top = y
      }
      enriched.push(next)
      componentIds.push(comp.id)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x + w)
      maxY = Math.max(maxY, y + h)
    }

    regions.push({
      regionId,
      regionName,
      clusterIds,
      componentIds,
      x: minX - CLUSTER_GAP,
      y: minY - CLUSTER_GAP,
      width: Math.max(slotW * 0.5, maxX - minX + CLUSTER_GAP * 2),
      height: Math.max(slotH * 0.4, maxY - minY + CLUSTER_GAP * 2),
      color: slot.color,
    })
  }

  return { components: enriched, regions }
}

export function isPdfVirtualLayout(components: BoardComponent[]): boolean {
  return components.some((c) => c.regionId != null && c.x_virtual != null)
}

/** Alinha bounding boxes das regiões às posições já normalizadas pelo CoordinateEngine */
export function syncRegionsToComputedPositions(
  regions: VirtualRegion[],
  positions: Map<string, import('@/types/board').ComputedPosition>
): VirtualRegion[] {
  const gap = CLUSTER_GAP
  return regions
    .map((r) => {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const id of r.componentIds) {
        const pos = positions.get(id)
        if (!pos) continue
        const w = pos.width && pos.width > 0 ? pos.width : COMP_W
        const h = pos.height && pos.height > 0 ? pos.height : COMP_H
        minX = Math.min(minX, pos.x)
        minY = Math.min(minY, pos.y)
        maxX = Math.max(maxX, pos.x + w)
        maxY = Math.max(maxY, pos.y + h)
      }
      if (!Number.isFinite(minX)) return null
      return {
        ...r,
        x: minX - gap,
        y: minY - gap,
        width: maxX - minX + gap * 2,
        height: maxY - minY + gap * 2,
      }
    })
    .filter((r): r is VirtualRegion => r != null)
}
