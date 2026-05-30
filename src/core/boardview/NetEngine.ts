// src/core/boardview/NetEngine.ts — v2
// Fix: usa connectedNets[] real do parser quando disponível
// Mantém fallback por categoria para componentes sem dados de net

import type { BoardComponent, BoardNet } from '@/types/board'
import { CATEGORY_COLORS } from '@/lib/constants'

const CATEGORY_TO_NET: Record<string, { net: string; voltage: string; color: string }> = {
  PMIC:    { net: 'VBAT_MAIN',  voltage: '3.8V',  color: '#a855f7' },
  CPU:     { net: 'PP_CPU',     voltage: '1.1V',  color: '#00d4ff' },
  RF:      { net: 'RF_ANT',     voltage: '3.3V',  color: '#ef4444' },
  AUDIO:   { net: 'AUDIO_OUT',  voltage: '1.8V',  color: '#22c55e' },
  CHARGER: { net: 'VBUS',       voltage: '5V',    color: '#06b6d4' },
  TOUCH:   { net: 'VDD_TOUCH',  voltage: '3.3V',  color: '#8b5cf6' },
  DISPLAY: { net: 'MIPI_DSI',   voltage: '1.8V',  color: '#f59e0b' },
  CAMERA:  { net: 'CAM_MCLK',   voltage: '1.8V',  color: '#10b981' },
  WIFI:    { net: 'WIFI_CLK',   voltage: '3.3V',  color: '#f59e0b' },
  NFC:     { net: 'NFC_VCC',    voltage: '3.3V',  color: '#22c55e' },
  MEMORY:  { net: 'VCC_UFS',    voltage: '3.3V',  color: '#3b82f6' },
  SENSOR:  { net: 'VDD_SENSOR', voltage: '1.8V',  color: '#ec4899' },
  USB:     { net: 'USB_DP',     voltage: '5V',    color: '#06b6d4' },
  MOTOR:   { net: 'VDD_MOTOR',  voltage: '3.3V',  color: '#f97316' },
  POWER:   { net: 'VBAT_MAIN',  voltage: '3.8V',  color: '#a855f7' },
  OTHER:   { net: 'GND',        voltage: '0V',    color: '#64748b' },
}

// Paleta de cores para nets reais do parser (determinística por nome)
const NET_PALETTE = [
  '#00d4ff', '#a855f7', '#ef4444', '#22c55e', '#f59e0b',
  '#06b6d4', '#8b5cf6', '#10b981', '#f97316', '#ec4899',
  '#3b82f6', '#84cc16', '#e11d48', '#0ea5e9', '#d946ef',
]

function netColor(netName: string, index: number): string {
  if (!netName) return NET_PALETTE[0]
  const n = netName.toUpperCase()
  if (/GND|VSS|AGND/.test(n))      return '#64748b'
  if (/VBAT|VBUS|VSYS/.test(n))    return '#a855f7'
  if (/PP_CPU|VDD_CPU|VCORE/.test(n)) return '#00d4ff'
  if (/RF|ANT|PA_/.test(n))        return '#ef4444'
  if (/AUDIO|CODEC/.test(n))       return '#22c55e'
  if (/MIPI|DSI|CSI/.test(n))      return '#f59e0b'
  if (/USB|VBUS/.test(n))          return '#06b6d4'
  if (/1V8|PP1V8/.test(n))         return '#8b5cf6'
  if (/3V3|PP3V3/.test(n))         return '#10b981'
  return NET_PALETTE[index % NET_PALETTE.length]
}

export class NetEngine {
  private netMap    = new Map<string, BoardNet>()
  private compToNet = new Map<string, string>()   // compId → primary netId
  private compAllNets = new Map<string, string[]>() // compId → all net names

  buildNets(components: BoardComponent[]): BoardNet[] {
    this.netMap.clear()
    this.compToNet.clear()
    this.compAllNets.clear()

    // ── Strategy 1: use real net data from parser (connectedNets[]) ──────────
    const hasRealNets = components.some(
      c => Array.isArray(c.connectedNets) && c.connectedNets.length > 0
    )

    if (hasRealNets) {
      return this.buildFromRealNets(components)
    }

    // ── Strategy 2: use electrical_line field (single net string) ────────────
    const hasElectricalLine = components.some(
      c => c.electrical_line && c.electrical_line.trim().length > 0
    )

    if (hasElectricalLine) {
      return this.buildFromElectricalLine(components)
    }

    // ── Strategy 3: fallback by category ─────────────────────────────────────
    return this.buildFromCategory(components)
  }

  // ── Strategy 1: real nets from parser ──────────────────────────────────────
  private buildFromRealNets(components: BoardComponent[]): BoardNet[] {
    // Build net → component[] map from connectedNets[]
    const netToComps = new Map<string, BoardComponent[]>()

    for (const comp of components) {
      const nets = comp.connectedNets ?? []
      const primaryNet = nets[0] ?? comp.electrical_line ?? 'GND'

      this.compAllNets.set(comp.id, nets.length > 0 ? nets : [primaryNet])

      for (const netName of (nets.length > 0 ? nets : [primaryNet])) {
        if (!netToComps.has(netName)) netToComps.set(netName, [])
        netToComps.get(netName)!.push(comp)
      }
    }

    let idx = 0
    netToComps.forEach((comps, netName) => {
      const netId = `net_${netName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
      const color = netColor(netName, idx++)

      // Infer voltage from net name
      const voltage = inferVoltage(netName)

      const net: BoardNet = {
        id:         netId,
        name:       netName,
        voltage,
        color,
        power_rail: netName.split('_')[0],
        components: comps.map(c => c.id),
      }
      this.netMap.set(netId, net)

      // Map each comp to their primary net (first net = primary)
      for (const comp of comps) {
        const allNets = this.compAllNets.get(comp.id) ?? []
        if (allNets[0] === netName || !this.compToNet.has(comp.id)) {
          this.compToNet.set(comp.id, netId)
        }
      }
    })

    return Array.from(this.netMap.values())
  }

  // ── Strategy 2: electrical_line as single net ────────────────────────────
  private buildFromElectricalLine(components: BoardComponent[]): BoardNet[] {
    const groups = new Map<string, BoardComponent[]>()

    for (const comp of components) {
      const netName = (comp.electrical_line?.trim() || comp.category || 'OTHER').toUpperCase()
      if (!groups.has(netName)) groups.set(netName, [])
      groups.get(netName)!.push(comp)
      this.compAllNets.set(comp.id, [netName])
    }

    let idx = 0
    groups.forEach((comps, netName) => {
      const netId = `net_${netName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
      const color = netColor(netName, idx++)
      const net: BoardNet = {
        id:         netId,
        name:       netName,
        voltage:    inferVoltage(netName),
        color,
        power_rail: netName.split('_')[0],
        components: comps.map(c => c.id),
      }
      this.netMap.set(netId, net)
      comps.forEach(c => this.compToNet.set(c.id, netId))
    })

    return Array.from(this.netMap.values())
  }

  // ── Strategy 3: category-based fallback ──────────────────────────────────
  private buildFromCategory(components: BoardComponent[]): BoardNet[] {
    const groups = new Map<string, BoardComponent[]>()

    for (const comp of components) {
      const key = (comp.electrical_line || comp.category || 'OTHER').toUpperCase().trim()
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(comp)
    }

    groups.forEach((comps, key) => {
      const meta = CATEGORY_TO_NET[key] || CATEGORY_TO_NET[comps[0].category] || CATEGORY_TO_NET.OTHER
      const netId = `net_${key.toLowerCase()}`
      const parsedNet = comps[0].electrical_line?.trim()
      const displayName =
        parsedNet && parsedNet.length > 0 && parsedNet !== comps[0].category
          ? parsedNet : meta.net

      const net: BoardNet = {
        id:         netId,
        name:       displayName,
        voltage:    meta.voltage,
        color:      meta.color,
        power_rail: displayName.split('_')[0],
        components: comps.map(c => c.id),
      }
      this.netMap.set(netId, net)
      comps.forEach(c => this.compToNet.set(c.id, netId))
    })

    return Array.from(this.netMap.values())
  }

  // ── Public API (unchanged) ────────────────────────────────────────────────

  getNetForComponent(id: string): BoardNet | null {
    const netId = this.compToNet.get(id)
    return netId ? (this.netMap.get(netId) ?? null) : null
  }

  getConnectedComponents(id: string): string[] {
    const net = this.getNetForComponent(id)
    return net ? net.components.filter(c => c !== id) : []
  }

  getNetColor(id: string): string {
    return this.getNetForComponent(id)?.color ?? CATEGORY_COLORS.OTHER
  }

  getNetName(id: string): string {
    return this.getNetForComponent(id)?.name ?? 'GND'
  }

  getNetVoltage(id: string): string {
    return this.getNetForComponent(id)?.voltage ?? '0V'
  }

  getAllNets(): BoardNet[] {
    return Array.from(this.netMap.values())
  }

  /** Returns all net names for a component (multi-net support). */
  getAllNetNames(id: string): string[] {
    return this.compAllNets.get(id) ?? []
  }
}

// ── Voltage inference (deterministic) ────────────────────────────────────────
function inferVoltage(netName: string): string {
  const n = netName.toUpperCase()
  if (/GND|VSS|AGND|DGND|PGND/.test(n)) return '0V'
  if (/VBAT|VSYS/.test(n))     return '4.2V'
  if (/VBUS/.test(n))          return '5V'
  if (/PP3V3|3V3/.test(n))     return '3.3V'
  if (/PP1V8|1V8/.test(n))     return '1.8V'
  if (/PP1V2|1V2/.test(n))     return '1.2V'
  if (/VCORE|PP0V9/.test(n))   return '0.9V'
  if (/PP5V|5V0/.test(n))      return '5V'
  const m = n.match(/(\d+)V(\d*)/)
  if (m) {
    const major = parseInt(m[1], 10)
    const minor = m[2] ? parseInt(m[2], 10) : 0
    if (major >= 0 && major <= 48) return minor > 0 ? `${major}.${minor}V` : `${major}V`
  }
  return 'unknown'
}
