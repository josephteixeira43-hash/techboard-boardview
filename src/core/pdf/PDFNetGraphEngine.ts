/**
 * PDFNetGraphEngine — extração semântica de nets/sinais do schematic PDF.
 * Grafo Component ↔ Net ↔ Component; sem alterar CoordinateEngine nem viewer core.
 */

import type { BoardComponent } from '@/types/board'
import type { PdfTextHit } from '@/lib/pdfComponentExtractor'
import type {
  ComponentGraph,
  ComponentGraphNode,
  NetGraph,
  NetGraphEdge,
  PdfNetGraphContext,
  PdfNetGraphResult,
  PdfNetLabel,
  PdfNetNode,
  SignalType,
} from '@/types/pdfNetGraph'
import type { VirtualRegionName } from '@/types/pdfRegions'
import { BOARD_W } from '@/core/boardview/CoordinateEngine'

const PROXIMITY_FACTOR = 0.12
const PROXIMITY_MIN = BOARD_W * 0.06
const PROXIMITY_MAX = BOARD_W * 0.22

export const SIGNAL_COLORS: Record<SignalType, string> = {
  power: '#a855f7',
  usb: '#06b6d4',
  i2c: '#22c55e',
  spi: '#3b82f6',
  clock: '#f59e0b',
  reset: '#ef4444',
  sim: '#94a3b8',
  rf: '#ef4444',
  gpio: '#64748b',
  other: '#64748b',
}

const SIGNAL_PRIORITY: Record<SignalType, number> = {
  power: 10,
  usb: 9,
  rf: 8,
  i2c: 7,
  spi: 7,
  clock: 6,
  reset: 6,
  sim: 5,
  gpio: 3,
  other: 1,
}

interface NetPattern {
  re: RegExp
  signalType: SignalType
}

const NET_PATTERNS: NetPattern[] = [
  { re: /^VBAT[\w_]*/i, signalType: 'power' },
  { re: /^VPH_PWR[\w_]*/i, signalType: 'power' },
  { re: /^PP_[A-Z0-9_]+/i, signalType: 'power' },
  { re: /^USB_DP[\w_]*/i, signalType: 'usb' },
  { re: /^USB_DM[\w_]*/i, signalType: 'usb' },
  { re: /^USB_[\w]+/i, signalType: 'usb' },
  { re: /^I2C_[A-Z0-9_]+/i, signalType: 'i2c' },
  { re: /^SPI_[A-Z0-9_]+/i, signalType: 'spi' },
  { re: /^CLK[A-Z0-9_]*/i, signalType: 'clock' },
  { re: /^RESET[A-Z0-9_]*/i, signalType: 'reset' },
  { re: /^SIM_[A-Z0-9_]+/i, signalType: 'sim' },
  { re: /^RF_[A-Z0-9_]+/i, signalType: 'rf' },
  { re: /^RF[\w_]+/i, signalType: 'rf' },
  { re: /^ANT[\w_]*/i, signalType: 'rf' },
  { re: /^MIPI_[\w]+/i, signalType: 'spi' },
  { re: /^VBUS[\w_]*/i, signalType: 'power' },
  { re: /^GND[\w_]*/i, signalType: 'other' },
]

const REGION_INFERRED_NETS: Record<
  VirtualRegionName,
  { name: string; signalType: SignalType }[]
> = {
  PMIC: [
    { name: 'VBAT', signalType: 'power' },
    { name: 'VPH_PWR', signalType: 'power' },
  ],
  CHARGING: [{ name: 'VBUS', signalType: 'power' }, { name: 'VBAT', signalType: 'power' }],
  CPU: [{ name: 'PP_CPU', signalType: 'power' }],
  RF: [{ name: 'RF_ANT', signalType: 'rf' }],
  AUDIO: [{ name: 'AUDIO_OUT', signalType: 'gpio' }],
  SIM: [{ name: 'SIM_CLK', signalType: 'sim' }, { name: 'SIM_DATA', signalType: 'sim' }],
  DISPLAY: [{ name: 'MIPI_DSI', signalType: 'spi' }],
  OTHER: [{ name: 'GND', signalType: 'other' }],
}

/** Parseia token de texto do PDF como nome de net/sinal */
export function parseNetToken(raw: string): { name: string; signalType: SignalType } | null {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_')
  if (cleaned.length < 3 || cleaned.length > 48) return null
  for (const { re, signalType } of NET_PATTERNS) {
    if (re.test(cleaned)) return { name: cleaned, signalType }
  }
  return null
}

/** Extrai nets de strings da camada de texto (PDF.js items) */
export function extractNetLabelsFromTextParts(
  parts: string[],
  mapped: { x: number; y: number; width: number; height: number },
  pageIndex: number
): PdfNetLabel[] {
  const found: PdfNetLabel[] = []
  for (const part of parts) {
    const parsed = parseNetToken(part)
    if (!parsed) continue
    found.push({
      name: part.trim(),
      normalizedName: parsed.name,
      ...mapped,
      pageIndex,
      signalType: parsed.signalType,
    })
  }
  const full = parts.join(' ')
  const globalMatches = full.match(
    /\b(?:VBAT[\w_]*|VPH_PWR[\w_]*|PP_[A-Z0-9_]+|USB_(?:DP|DM)[\w_]*|I2C_[A-Z0-9_]+|SPI_[A-Z0-9_]+|CLK[A-Z0-9_]*|RESET[A-Z0-9_]*|SIM_[A-Z0-9_]+|RF_[A-Z0-9_]+|RF[\w_]+)\b/gi
  )
  if (globalMatches) {
    for (const m of globalMatches) {
      const parsed = parseNetToken(m)
      if (!parsed) continue
      found.push({
        name: m,
        normalizedName: parsed.name,
        ...mapped,
        pageIndex,
        signalType: parsed.signalType,
      })
    }
  }
  return found
}

function dedupeNetLabels(labels: PdfNetLabel[]): PdfNetLabel[] {
  const map = new Map<string, PdfNetLabel>()
  for (const l of labels) {
    const prev = map.get(l.normalizedName)
    if (!prev) map.set(l.normalizedName, l)
  }
  return Array.from(map.values())
}

function netIdFromName(name: string): string {
  return `net_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
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

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function proximityThreshold(labels: PdfNetLabel[], hits: PdfTextHit[]): number {
  const points = [
    ...labels.map((l) => ({ x: l.x, y: l.y })),
    ...hits.map((h) => ({ x: h.x, y: h.y })),
  ]
  if (points.length < 2) return BOARD_W * PROXIMITY_FACTOR
  let sum = 0
  let n = 0
  for (let i = 0; i < Math.min(points.length, 30); i++) {
    for (let j = i + 1; j < Math.min(points.length, 30); j++) {
      sum += dist(points[i], points[j])
      n++
    }
  }
  const avg = n > 0 ? sum / n : BOARD_W * 0.1
  return Math.max(PROXIMITY_MIN, Math.min(PROXIMITY_MAX, avg * 0.4))
}

function primarySignalType(netIds: string[], netById: Map<string, PdfNetNode>): SignalType {
  let best: SignalType = 'other'
  let score = 0
  for (const id of netIds) {
    const net = netById.get(id)
    if (!net) continue
    const p = SIGNAL_PRIORITY[net.signalType] ?? 1
    if (p > score) {
      score = p
      best = net.signalType
    }
  }
  return best
}

function buildComponentGraph(
  components: BoardComponent[],
  compToNets: Map<string, Set<string>>,
  netById: Map<string, PdfNetNode>
): ComponentGraph {
  const nodes: Record<string, ComponentGraphNode> = {}

  for (const comp of components) {
    const netIds = Array.from(compToNets.get(comp.id) ?? [])
    const connectedSet = new Set<string>()
    for (const netId of netIds) {
      const net = netById.get(netId)
      if (!net) continue
      for (const otherId of net.componentIds) {
        if (otherId !== comp.id) connectedSet.add(otherId)
      }
    }
    nodes[comp.id] = {
      componentId: comp.id,
      connectedNets: netIds,
      connectedComponents: Array.from(connectedSet),
      signalType: primarySignalType(netIds, netById),
    }
  }

  return { nodes }
}

/**
 * Pipeline: componentes já enriquecidos por PDFRegionEngine → nets + grafo semântico.
 */
export function buildPdfNetGraph(
  components: BoardComponent[],
  context?: PdfNetGraphContext
): PdfNetGraphResult {
  if (!components.length) {
    return {
      components: [],
      netGraph: { nets: [], edges: [] },
      componentGraph: { nodes: {} },
    }
  }

  const hitMap = new Map<string, PdfTextHit>()
  for (const h of context?.hits ?? []) {
    const prev = hitMap.get(h.id)
    if (!prev || h.confidence > prev.confidence) hitMap.set(h.id, h)
  }

  const labels = dedupeNetLabels(context?.netLabels ?? [])
  const threshold = proximityThreshold(labels, context?.hits ?? [])

  const netById = new Map<string, PdfNetNode>()
  for (const label of labels) {
    const id = netIdFromName(label.normalizedName)
    netById.set(id, {
      netId: id,
      name: label.normalizedName,
      signalType: label.signalType,
      componentIds: [],
      color: SIGNAL_COLORS[label.signalType],
      source: 'pdf_text',
    })
  }

  const compToNets = new Map<string, Set<string>>()

  const ensureNet = (
    name: string,
    signalType: SignalType,
    source: PdfNetNode['source']
  ): string => {
    const id = netIdFromName(name)
    if (!netById.has(id)) {
      netById.set(id, {
        netId: id,
        name,
        signalType,
        componentIds: [],
        color: SIGNAL_COLORS[signalType],
        source,
      })
    }
    return id
  }

  const linkCompNet = (componentId: string, netId: string) => {
    if (!compToNets.has(componentId)) compToNets.set(componentId, new Set())
    compToNets.get(componentId)!.add(netId)
    const net = netById.get(netId)
    if (net && !net.componentIds.includes(componentId)) {
      net.componentIds.push(componentId)
    }
  }

  for (const comp of components) {
    const pt = schematicPoint(comp, hitMap)

    for (const label of labels) {
      if (label.pageIndex !== pt.pageIndex) continue
      if (dist(pt, label) <= threshold) {
        const netId = ensureNet(label.normalizedName, label.signalType, 'pdf_text')
        linkCompNet(comp.id, netId)
      }
    }

    const region = (comp.regionName ?? 'OTHER') as VirtualRegionName
    const inferred = REGION_INFERRED_NETS[region] ?? REGION_INFERRED_NETS.OTHER
    for (const { name, signalType } of inferred) {
      const netId = ensureNet(name, signalType, 'region')
      linkCompNet(comp.id, netId)
    }

    const nameUpper = comp.name.toUpperCase()
    for (const label of labels) {
      if (nameUpper.includes(label.normalizedName.replace(/_/g, ''))) {
        linkCompNet(comp.id, netIdFromName(label.normalizedName))
      }
    }
  }

  const edges: NetGraphEdge[] = []
  for (const [componentId, netIds] of compToNets) {
    for (const netId of netIds) {
      edges.push({ componentId, netId })
    }
  }

  const componentGraph = buildComponentGraph(components, compToNets, netById)

  const enriched = components.map((comp) => {
    const node = componentGraph.nodes[comp.id]
    const primaryNet = node?.connectedNets[0]
    const netName = primaryNet ? netById.get(primaryNet)?.name : undefined
    return {
      ...comp,
      connectedNets: node?.connectedNets ?? [],
      connectedComponents: node?.connectedComponents ?? [],
      signalType: node?.signalType ?? 'other',
      electrical_line: netName ?? comp.electrical_line,
    }
  })

  return {
    components: enriched,
    netGraph: {
      nets: Array.from(netById.values()),
      edges,
    },
    componentGraph,
  }
}

/** IDs de componentes ligados a uma net (para highlightNet) */
export function getComponentIdsForNet(netGraph: NetGraph, netId: string): string[] {
  const net = netGraph.nets.find((n) => n.netId === netId)
  return net?.componentIds ?? []
}

/** Net + vizinhos para traceSignal */
export function getTraceTargets(
  componentGraph: ComponentGraph,
  componentId: string
): { componentIds: string[]; netIds: string[] } {
  const node = componentGraph.nodes[componentId]
  if (!node) return { componentIds: [componentId], netIds: [] }
  return {
    componentIds: [componentId, ...node.connectedComponents],
    netIds: node.connectedNets,
  }
}

export function hasPdfNetGraph(components: BoardComponent[]): boolean {
  return components.some((c) => (c.connectedNets?.length ?? 0) > 0)
}
