/**
 * VirtualBoardLayoutEngine — layout PCB virtual realista (smartphone).
 * Pure function: components + regions [+ optional nets] → coords + bounds.
 * Não altera viewer, CoordinateEngine, Region/Net engines.
 */

import type { BoardComponent } from '@/types/board'
import type { NetGraph } from '@/types/pdfNetGraph'
import type { VirtualRegion, VirtualRegionName } from '@/types/pdfRegions'
import { BOARD_H, BOARD_W, COMP_H, COMP_W } from '@/core/boardview/CoordinateEngine'
import { CATEGORY_COLORS } from '@/lib/constants'

// ─── Canvas & density ─────────────────────────────────────────────────────────

const OUTER_PAD = 44
const REGION_GAP = 12
const CLUSTER_GAP = 8
const MIN_CLUSTER = 200
const MAX_CLUSTER_LIGHT = 240
const MAX_CLUSTER_DENSE = 300
const TARGET_FILL = 0.86

type Point = { x: number; y: number }
type BoardRect = { x: number; y: number; w: number; h: number }
type Anchor = { nx: number; ny: number; nw: number; nh: number }

interface ClusterLayout {
  clusterId: string
  regionName: VirtualRegionName
  components: BoardComponent[]
  width: number
  height: number
  positions: Map<string, Point>
}

interface RegionPack {
  regionName: VirtualRegionName
  regionId: string
  clusters: ClusterLayout[]
  width: number
  height: number
  density: number
}

const REGION_COLORS: Record<VirtualRegionName, string> = {
  CPU: CATEGORY_COLORS.CPU,
  PMIC: CATEGORY_COLORS.PMIC,
  RF: CATEGORY_COLORS.RF,
  AUDIO: CATEGORY_COLORS.AUDIO,
  CHARGING: CATEGORY_COLORS.CHARGER,
  SIM: '#94a3b8',
  DISPLAY: CATEGORY_COLORS.DISPLAY,
  OTHER: CATEGORY_COLORS.OTHER,
}

const REGION_ORDER: VirtualRegionName[] = [
  'DISPLAY',
  'CPU',
  'PMIC',
  'RF',
  'CHARGING',
  'AUDIO',
  'SIM',
  'OTHER',
]

const DENSE_REGIONS = new Set<VirtualRegionName>(['CPU', 'PMIC', 'RF'])

// ─── 1. Hierarquia realista — anchors normalizados ───────────────────────────

/** Centro + tamanho relativo da região no canvas (smartphone vertical) */
export function getRegionAnchor(regionName: VirtualRegionName): Anchor {
  const anchors: Record<VirtualRegionName, Anchor> = {
    DISPLAY:  { nx: 0.5,  ny: 0.07, nw: 0.88, nh: 0.11 },
    CPU:      { nx: 0.5,  ny: 0.26, nw: 0.42, nh: 0.22 },
    PMIC:     { nx: 0.58, ny: 0.36, nw: 0.24, nh: 0.14 },
    RF:       { nx: 0.84, ny: 0.24, nw: 0.2,  nh: 0.2 },
    CHARGING: { nx: 0.5,  ny: 0.76, nw: 0.3,  nh: 0.12 },
    SIM:      { nx: 0.88, ny: 0.68, nw: 0.14, nh: 0.1 },
    AUDIO:    { nx: 0.14, ny: 0.7,  nw: 0.22, nh: 0.14 },
    OTHER:    { nx: 0.22, ny: 0.48, nw: 0.18, nh: 0.12 },
  }
  return anchors[regionName] ?? anchors.OTHER
}

// ─── 5. Board shape — slots orgânicos com “neck” entre CPU↔PMIC ─────────────

function generateVirtualBoardShape(
  packs: RegionPack[]
): Map<VirtualRegionName, BoardRect> {
  const usableW = BOARD_W - OUTER_PAD * 2
  const usableH = BOARD_H - OUTER_PAD * 2
  const slots = new Map<VirtualRegionName, BoardRect>()

  for (const pack of packs) {
    const a = getRegionAnchor(pack.regionName)
    const densityBoost = pack.density > 1.2 ? 0.92 : 1
    const countBoost = Math.min(1.15, 1 + pack.clusters.reduce((s, c) => s + c.components.length, 0) * 0.004)

    let w = usableW * a.nw * countBoost * densityBoost
    let h = usableH * a.nh * countBoost * densityBoost

    if (pack.regionName === 'DISPLAY') {
      w = Math.min(usableW * 0.92, w)
      h = Math.max(usableH * 0.08, Math.min(h, usableH * 0.12))
    }
    if (pack.regionName === 'CPU') {
      w = Math.min(usableW * 0.45, w)
      h = Math.min(usableH * 0.24, h)
    }
    if (pack.regionName === 'PMIC') {
      w = Math.min(usableW * 0.26, w * 0.95)
      h = Math.min(usableH * 0.16, h)
    }
    if (pack.regionName === 'SIM') {
      w = Math.min(usableW * 0.16, w)
      h = Math.min(usableH * 0.11, h)
    }

    const cx = OUTER_PAD + a.nx * usableW
    const cy = OUTER_PAD + a.ny * usableH
    slots.set(pack.regionName, {
      x: Math.round(cx - w / 2),
      y: Math.round(cy - h / 2),
      w: Math.round(w),
      h: Math.round(h),
    })
  }

  const cpu = slots.get('CPU')
  const pmic = slots.get('PMIC')
  if (cpu && pmic) {
    pmic.x = Math.round(cpu.x + cpu.w * 0.52)
    pmic.y = Math.round(cpu.y + cpu.h * 0.55)
  }

  const charging = slots.get('CHARGING')
  if (charging && cpu) {
    charging.y = Math.max(charging.y, cpu.y + cpu.h + REGION_GAP * 2)
  }

  return slots
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compSize(comp: BoardComponent): { w: number; h: number } {
  const w = Number(comp.width)
  const h = Number(comp.height)
  return {
    w: Number.isFinite(w) && w > 0 ? Math.min(w, COMP_W) : COMP_W,
    h: Number.isFinite(h) && h > 0 ? Math.min(h, COMP_H) : COMP_H,
  }
}

function isPrimaryIc(name: string): boolean {
  const u = name.toUpperCase()
  return /^U\d/.test(u) || /^PMIC|^CPU|^GPU|^SOC|^AP\d/.test(u)
}

function isPassive(name: string): boolean {
  const u = name.toUpperCase()
  return /^[CRL]\d/.test(u) || /^FB\d|^FL\d/.test(u)
}

type PassiveRole = 'decouple' | 'pull' | 'filter' | 'osc' | 'other'

function passiveRole(name: string, region: VirtualRegionName): PassiveRole {
  const u = name.toUpperCase()
  if (/^Y\d|^XTAL|^OSC/.test(u)) return 'osc'
  if (/^L\d|^FB\d|^FL\d/.test(u)) return 'filter'
  if (/^C\d/.test(u)) return 'decouple'
  if (/^R\d/.test(u)) return 'pull'
  if (region === 'CPU' || region === 'RF') return 'decouple'
  return 'other'
}

function passiveRadius(role: PassiveRole, region: VirtualRegionName): number {
  const dense = DENSE_REGIONS.has(region)
  switch (role) {
    case 'decouple':
      return dense ? 22 : 28
    case 'pull':
      return dense ? 38 : 46
    case 'filter':
      return dense ? 52 : 58
    case 'osc':
      return 34
    default:
      return 44
  }
}

function maxClusterSize(region: VirtualRegionName, count: number): number {
  const base = DENSE_REGIONS.has(region) ? MAX_CLUSTER_DENSE : MAX_CLUSTER_LIGHT
  const scaled = MIN_CLUSTER + Math.min(80, count * 6)
  return Math.min(base, Math.max(MIN_CLUSTER, scaled))
}

function shrinkCluster(layout: ClusterLayout, maxW: number, maxH: number): ClusterLayout {
  if (layout.width <= maxW && layout.height <= maxH) return layout
  const s = Math.min(maxW / layout.width, maxH / layout.height)
  const next = new Map<string, Point>()
  for (const [id, p] of layout.positions) {
    next.set(id, { x: p.x * s, y: p.y * s })
  }
  return {
    ...layout,
    positions: next,
    width: layout.width * s,
    height: layout.height * s,
  }
}

// ─── 2. Placement radial de passivos ─────────────────────────────────────────

export function layoutPassiveComponentsAroundIC(
  components: BoardComponent[],
  regionName: VirtualRegionName
): { positions: Map<string, Point>; width: number; height: number } {
  const positions = new Map<string, Point>()
  const n = components.length
  if (n === 0) return { positions, width: 0, height: 0 }

  const ics = components.filter((c) => isPrimaryIc(c.name))
  const passives = components.filter((c) => isPassive(c.name))
  const others = components.filter((c) => !isPrimaryIc(c.name) && !isPassive(c.name))

  const primary = ics[0] ?? others[0] ?? components[0]
  const { w: icW, h: icH } = compSize(primary)
  const cx = maxClusterSize(regionName, n) / 2
  const cy = maxClusterSize(regionName, n) / 2

  positions.set(primary.id, { x: cx - icW / 2, y: cy - icH / 2 })

  const filters = passives.filter((c) => passiveRole(c.name, regionName) === 'filter')
  const nonFilterPassives = passives.filter((c) => !filters.includes(c))
  const oscs = [...nonFilterPassives, ...others].filter(
    (c) => passiveRole(c.name, regionName) === 'osc' || /^Y|^XTAL/i.test(c.name)
  )
  const ringPassives = nonFilterPassives.filter((c) => !oscs.includes(c))

  let ringIdx = 0
  const ringN = Math.max(1, ringPassives.length)
  for (const comp of ringPassives) {
    const role = passiveRole(comp.name, regionName)
    const r = passiveRadius(role, regionName)
    const angle = (2 * Math.PI * ringIdx) / ringN - Math.PI / 2
    const { w, h } = compSize(comp)
    positions.set(comp.id, {
      x: cx + Math.cos(angle) * r - w / 2,
      y: cy + Math.sin(angle) * r - h / 2,
    })
    ringIdx++
  }

  filters.forEach((comp, i) => {
    const { w, h } = compSize(comp)
    positions.set(comp.id, {
      x: cx - w / 2 + (i - (filters.length - 1) / 2) * (w + 10),
      y: cy + passiveRadius('filter', regionName) + 8,
    })
  })

  oscs.forEach((comp, i) => {
    if (positions.has(comp.id)) return
    const { w, h } = compSize(comp)
    positions.set(comp.id, {
      x: cx + 40 + i * (w + 6),
      y: cy - passiveRadius('osc', regionName) - h,
    })
  })

  others.forEach((comp, i) => {
    if (positions.has(comp.id)) return
    const { w, h } = compSize(comp)
    const angle = (2 * Math.PI * i) / Math.max(1, others.length)
    positions.set(comp.id, {
      x: cx + Math.cos(angle) * 50 - w / 2,
      y: cy + Math.sin(angle) * 50 - h / 2,
    })
  })

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const comp of components) {
    const p = positions.get(comp.id)
    if (!p) continue
    const { w, h } = compSize(comp)
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + w)
    maxY = Math.max(maxY, p.y + h)
  }
  if (!Number.isFinite(minX)) return { positions, width: COMP_W, height: COMP_H }

  const pad = CLUSTER_GAP
  const norm = new Map<string, Point>()
  for (const [id, p] of positions) {
    norm.set(id, { x: p.x - minX + pad, y: p.y - minY + pad })
  }
  return {
    positions: norm,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  }
}

// ─── Inferência leve de nets (heurística PDFNetGraph-compatible) ─────────────

function inferNetKeys(comp: BoardComponent): string[] {
  const keys: string[] = []
  const name = comp.name.toUpperCase()
  const line = (comp.electrical_line ?? '').toUpperCase()
  const nets = comp.connectedNets ?? []
  const tokens = [name, line, ...nets]

  for (const raw of tokens) {
    const t = String(raw).toUpperCase()
    if (/VBAT|VPH_PWR|PP_|VBUS/.test(t)) keys.push('VBAT')
    if (/USB_DP|USB_DM|USB_/.test(t)) keys.push('USB')
    if (/I2C_/.test(t)) keys.push('I2C')
    if (/SPI_|MIPI_/.test(t)) keys.push('SPI')
    if (/CLK/.test(t)) keys.push('CLK')
    if (/RESET/.test(t)) keys.push('RESET')
    if (/SIM_/.test(t)) keys.push('SIM')
    if (/RF_|^ANT|^PAM/.test(t)) keys.push('RF')
    if (/GND/.test(t)) keys.push('GND')
  }

  const region = comp.regionName as VirtualRegionName | undefined
  if (region === 'PMIC' || region === 'CHARGING') keys.push('VBAT')
  if (region === 'SIM') keys.push('SIM')
  if (region === 'RF') keys.push('RF')
  if (region === 'CPU') keys.push('CLK')
  if (region === 'CHARGING') keys.push('USB')

  return [...new Set(keys)]
}

function buildAffinityFromNetGraph(netGraph: NetGraph | null | undefined): Map<string, string[]> {
  const map = new Map<string, string[]>()
  if (!netGraph) return map
  for (const net of netGraph.nets) {
    const key = net.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
    for (const cid of net.componentIds) {
      if (!map.has(cid)) map.set(cid, [])
      map.get(cid)!.push(key)
    }
  }
  return map
}

// ─── 4. Afinidade elétrica (uma passada, O(n·k)) ───────────────────────────

export function applyElectricalAffinity(
  positions: Map<string, Point>,
  components: BoardComponent[],
  netGraph?: NetGraph | null
): Map<string, Point> {
  const next = new Map(positions)
  const byId = new Map(components.map((c) => [c.id, c]))

  const netMembers = new Map<string, string[]>()
  const graphAffinity = buildAffinityFromNetGraph(netGraph)

  for (const comp of components) {
    const keys = graphAffinity.get(comp.id)?.length
      ? graphAffinity.get(comp.id)!
      : inferNetKeys(comp)
    for (const key of keys) {
      if (!netMembers.has(key)) netMembers.set(key, [])
      netMembers.get(key)!.push(comp.id)
    }
  }

  const spineX = BOARD_W * 0.52
  const chargingAnchor = getRegionAnchor('CHARGING')
  const usbY = OUTER_PAD + chargingAnchor.ny * (BOARD_H - OUTER_PAD * 2)
  const cpuAnchor = getRegionAnchor('CPU')
  const clkY = OUTER_PAD + cpuAnchor.ny * (BOARD_H - OUTER_PAD * 2)

  for (const [key, ids] of netMembers) {
    if (ids.length < 2) continue

    let sx = 0
    let sy = 0
    let count = 0
    for (const id of ids) {
      const p = next.get(id)
      if (!p) continue
      sx += p.x
      sy += p.y
      count++
    }
    if (!count) continue
    const cx = sx / count
    const cy = sy / count

    const pull = key === 'VBAT' ? 0.22 : key === 'GND' ? 0.08 : 0.14
    const maxDelta = key === 'VBAT' ? 36 : 28

    for (const id of ids) {
      const p = next.get(id)
      if (!p) continue
      let tx = p.x + (cx - p.x) * pull
      let ty = p.y + (cy - p.y) * pull

      if (key === 'VBAT') {
        const comp = byId.get(id)
        const rn = comp?.regionName as VirtualRegionName | undefined
        if (rn === 'PMIC' || rn === 'CHARGING') {
          tx = tx * 0.6 + spineX * 0.4
        }
      }
      if (key === 'USB') {
        ty = ty * 0.65 + usbY * 0.35
      }
      if (key === 'CLK') {
        ty = ty * 0.7 + clkY * 0.3
      }
      if (key === 'RF') {
        const rfAnchor = getRegionAnchor('RF')
        const rx = OUTER_PAD + rfAnchor.nx * (BOARD_W - OUTER_PAD * 2)
        tx = tx * 0.55 + rx * 0.45
      }
      if (key === 'SIM') {
        const simAnchor = getRegionAnchor('SIM')
        const sx2 = OUTER_PAD + simAnchor.nx * (BOARD_W - OUTER_PAD * 2)
        tx = tx * 0.5 + sx2 * 0.5
      }

      next.set(id, {
        x: p.x + Math.max(-maxDelta, Math.min(maxDelta, tx - p.x)),
        y: p.y + Math.max(-maxDelta, Math.min(maxDelta, ty - p.y)),
      })
    }
  }

  return next
}

// ─── Cluster & region build ───────────────────────────────────────────────────

function layoutCluster(
  components: BoardComponent[],
  regionName: VirtualRegionName
): ClusterLayout {
  const clusterId = components[0]?.clusterId ?? `cluster-${regionName}`
  const { positions, width, height } = layoutPassiveComponentsAroundIC(
    components,
    regionName
  )
  const maxSz = maxClusterSize(regionName, components.length)
  const layout: ClusterLayout = {
    clusterId,
    regionName,
    components,
    width: Math.max(width, COMP_W),
    height: Math.max(height, COMP_H),
    positions,
  }
  return shrinkCluster(layout, maxSz, maxSz)
}

function packClustersInSlot(pack: RegionPack, slot: BoardRect): Map<string, Point> {
  const global = new Map<string, Point>()
  if (!pack.clusters.length) return global

  const isHorizontal = pack.regionName === 'DISPLAY'
  const cols = isHorizontal
    ? Math.min(3, pack.clusters.length)
    : pack.clusters.length <= 2
      ? pack.clusters.length
      : 2

  const colW: number[] = new Array(cols).fill(0)
  const rowH: number[] = []
  const rows = Math.ceil(pack.clusters.length / cols)
  for (let r = 0; r < rows; r++) rowH[r] = 0

  pack.clusters.forEach((cl, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    colW[col] = Math.max(colW[col], cl.width)
    rowH[row] = Math.max(rowH[row], cl.height)
  })

  const totalW = colW.reduce((a, b) => a + b, 0) + CLUSTER_GAP * Math.max(0, cols - 1)
  const totalH = rowH.reduce((a, b) => a + b, 0) + CLUSTER_GAP * Math.max(0, rows - 1)
  const scale = Math.min(1, (slot.w - REGION_GAP) / totalW, (slot.h - REGION_GAP) / totalH)

  const startX = slot.x + (slot.w - totalW * scale) / 2
  const startY = slot.y + (slot.h - totalH * scale) / 2

  let y = startY
  for (let r = 0; r < rows; r++) {
    let x = startX
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      const cl = pack.clusters[idx]
      if (!cl) continue
      for (const [id, local] of cl.positions) {
        global.set(id, { x: x + local.x * scale, y: y + local.y * scale })
      }
      x += colW[c] * scale + CLUSTER_GAP
    }
    y += rowH[r] * scale + CLUSTER_GAP
  }

  return global
}

function buildRegionPacks(components: BoardComponent[]): RegionPack[] {
  const byRegion = new Map<VirtualRegionName, Map<string, BoardComponent[]>>()

  for (const comp of components) {
    const regionName = (comp.regionName ?? 'OTHER') as VirtualRegionName
    const clusterId = comp.clusterId ?? `cluster-${regionName}`
    if (!byRegion.has(regionName)) byRegion.set(regionName, new Map())
    const clusters = byRegion.get(regionName)!
    if (!clusters.has(clusterId)) clusters.set(clusterId, [])
    clusters.get(clusterId)!.push(comp)
  }

  const packs: RegionPack[] = []

  for (const regionName of REGION_ORDER) {
    const clusters = byRegion.get(regionName)
    if (!clusters?.size) continue

    const clusterLayouts: ClusterLayout[] = []
    let totalComps = 0
    for (const [, comps] of clusters) {
      totalComps += comps.length
      clusterLayouts.push(layoutCluster(comps, regionName))
    }
    clusterLayouts.sort((a, b) => b.components.length - a.components.length)

    const cols =
      regionName === 'DISPLAY'
        ? Math.min(4, clusterLayouts.length)
        : clusterLayouts.length <= 2
          ? clusterLayouts.length
          : 2
    const rows = Math.ceil(clusterLayouts.length / cols)
    const colW = new Array(cols).fill(0)
    const rowH = new Array(rows).fill(0)
    clusterLayouts.forEach((cl, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      colW[col] = Math.max(colW[col], cl.width)
      rowH[row] = Math.max(rowH[row], cl.height)
    })

    const width =
      colW.reduce((a, b) => a + b, 0) + CLUSTER_GAP * Math.max(0, cols - 1) + REGION_GAP
    const height =
      rowH.reduce((a, b) => a + b, 0) + CLUSTER_GAP * Math.max(0, rows - 1) + REGION_GAP

    packs.push({
      regionName,
      regionId: `region-${regionName.toLowerCase()}`,
      clusters: clusterLayouts,
      width,
      height,
      density: DENSE_REGIONS.has(regionName) ? 1.35 : 1,
    })
  }

  return packs
}

// ─── 7. Fit zoom / centralização ─────────────────────────────────────────────

function fitToViewport(
  positions: Map<string, Point>,
  components: BoardComponent[]
): Map<string, Point> {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const comp of components) {
    const p = positions.get(comp.id)
    if (!p) continue
    const { w, h } = compSize(comp)
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + w)
    maxY = Math.max(maxY, p.y + h)
  }
  if (!Number.isFinite(minX)) return positions

  const bw = maxX - minX || 1
  const bh = maxY - minY || 1
  const usableW = BOARD_W - OUTER_PAD * 2
  const usableH = BOARD_H - OUTER_PAD * 2
  const scale = Math.min(
    (usableW * TARGET_FILL) / bw,
    (usableH * TARGET_FILL) / bh,
    1.15
  )
  const targetCx = BOARD_W / 2
  const targetCy = BOARD_H / 2
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  const next = new Map<string, Point>()
  for (const comp of components) {
    const p = positions.get(comp.id)
    if (!p) continue
    const { w, h } = compSize(comp)
    const sx = (p.x - cx) * scale + targetCx - (w * scale) / 2
    const sy = (p.y - cy) * scale + targetCy - (h * scale) / 2
    next.set(comp.id, {
      x: Math.max(OUTER_PAD, Math.min(BOARD_W - OUTER_PAD - w, sx)),
      y: Math.max(OUTER_PAD, Math.min(BOARD_H - OUTER_PAD - h, sy)),
    })
  }
  return next
}

/** Aplica apenas coords virtuais do layout — preserva x_top/x_bottom (schematic/enrich). */
function applyCoords(comp: BoardComponent, p: Point): BoardComponent {
  const { w, h } = compSize(comp)
  return {
    ...comp,
    x_virtual: p.x,
    y_virtual: p.y,
    width: w,
    height: h,
  }
}

function rebuildRegions(
  components: BoardComponent[],
  positions: Map<string, Point>
): VirtualRegion[] {
  const byRegion = new Map<VirtualRegionName, string[]>()
  const clusterIds = new Map<VirtualRegionName, Set<string>>()

  for (const comp of components) {
    const rn = (comp.regionName ?? 'OTHER') as VirtualRegionName
    if (!byRegion.has(rn)) {
      byRegion.set(rn, [])
      clusterIds.set(rn, new Set())
    }
    byRegion.get(rn)!.push(comp.id)
    if (comp.clusterId) clusterIds.get(rn)!.add(comp.clusterId)
  }

  const regions: VirtualRegion[] = []
  const gap = CLUSTER_GAP

  for (const regionName of REGION_ORDER) {
    const ids = byRegion.get(regionName)
    if (!ids?.length) continue

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const id of ids) {
      const p = positions.get(id)
      const comp = components.find((c) => c.id === id)
      if (!p || !comp) continue
      const { w, h } = compSize(comp)
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + w)
      maxY = Math.max(maxY, p.y + h)
    }
    if (!Number.isFinite(minX)) continue

    regions.push({
      regionId: `region-${regionName.toLowerCase()}`,
      regionName,
      clusterIds: Array.from(clusterIds.get(regionName) ?? []),
      componentIds: ids,
      x: minX - gap,
      y: minY - gap,
      width: maxX - minX + gap * 2,
      height: maxY - minY + gap * 2,
      color: REGION_COLORS[regionName],
    })
  }

  return regions
}

function hasRealBoardGeometry(components: BoardComponent[]): boolean {
  const hasVirtual = components.some((c) => c.regionId != null || c.regionName != null)
  if (hasVirtual) return false
  return components.some(
    (c) =>
      (c.data_source === 'parsed' || c.data_source === 'merged') &&
      (c.x_top != null || c.x_bottom != null)
  )
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface VirtualLayoutResult {
  components: BoardComponent[]
  regions: VirtualRegion[]
}

/**
 * Layout PCB virtual realista — smartphone.
 * @param netGraph opcional — se fornecido, reforça applyElectricalAffinity (O(n)).
 */
export function fitVirtualLayout(
  components: BoardComponent[],
  regions: VirtualRegion[] = [],
  netGraph?: NetGraph | null
): VirtualLayoutResult {
  if (!components.length) return { components: [], regions: [] }

  const virtual = components.filter((c) => c.regionId != null || c.regionName != null)
  if (!virtual.length) {
    if (hasRealBoardGeometry(components)) return { components, regions }
    return { components, regions }
  }

  const packs = buildRegionPacks(virtual)
  const shape = generateVirtualBoardShape(packs)

  const positions = new Map<string, Point>()
  for (const pack of packs) {
    const slot = shape.get(pack.regionName)
    if (!slot) continue
    const placed = packClustersInSlot(pack, slot)
    for (const [id, p] of placed) positions.set(id, p)
  }

  const affinity = applyElectricalAffinity(positions, virtual, netGraph)
  const fitted = fitToViewport(affinity, virtual)

  const laidOut = components.map((c) => {
    const p = fitted.get(c.id)
    return p ? applyCoords(c, p) : c
  })

  const newRegions = rebuildRegions(laidOut, fitted)
  return {
    components: laidOut,
    regions: newRegions.length ? newRegions : regions,
  }
}

export function shouldFitVirtualLayout(components: BoardComponent[]): boolean {
  if (hasRealBoardGeometry(components)) return false
  return components.some((c) => c.regionId != null && c.x_virtual != null)
}
