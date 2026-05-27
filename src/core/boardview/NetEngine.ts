// src/core/boardview/NetEngine.ts
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

export class NetEngine {
  private netMap    = new Map<string, BoardNet>()
  private compToNet = new Map<string, string>()

  buildNets(components: BoardComponent[]): BoardNet[] {
    this.netMap.clear()
    this.compToNet.clear()
    const groups = new Map<string, BoardComponent[]>()
    components.forEach(comp => {
      const key = (comp.electrical_line || comp.category || 'OTHER').toUpperCase().trim()
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(comp)
    })
    groups.forEach((comps, key) => {
      const meta = CATEGORY_TO_NET[key] || CATEGORY_TO_NET[comps[0].category] || CATEGORY_TO_NET.OTHER
      const netId = `net_${key.toLowerCase()}`
      const parsedNet = comps[0].electrical_line?.trim()
      const displayName =
        parsedNet && parsedNet.length > 0 && parsedNet !== comps[0].category
          ? parsedNet
          : meta.net

      const net: BoardNet = {
        id: netId,
        name: displayName,
        voltage: meta.voltage,
        color: meta.color,
        power_rail: displayName.split('_')[0],
        components: comps.map(c => c.id),
      }
      this.netMap.set(netId, net)
      comps.forEach(c => this.compToNet.set(c.id, netId))
    })
    return Array.from(this.netMap.values())
  }

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
}
