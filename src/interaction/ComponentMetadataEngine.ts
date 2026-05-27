import type { BoardComponent, ComputedPosition } from '@/types/board'
import type { ComponentMetadata } from '@/types/interaction'
import { COMP_W, COMP_H, hasRealCoords, getRawCoords } from '@/core/boardview/CoordinateEngine'
import type { NetEngine } from '@/core/boardview/NetEngine'

export class ComponentMetadataEngine {
  build(
    comp: BoardComponent,
    pos: ComputedPosition | null,
    netEngine: NetEngine
  ): ComponentMetadata {
    const raw = hasRealCoords(comp) ? getRawCoords(comp) : null
    return {
      id: comp.id,
      name: comp.name,
      type: comp.category,
      category: comp.category,
      net: comp.electrical_line?.trim() || netEngine.getNetName(comp.id),
      voltage: netEngine.getNetVoltage(comp.id),
      layer: comp.side?.replace('_', ' ') ?? 'top',
      x: raw ? Math.round(raw.x) : pos ? Math.round(pos.x) : 0,
      y: raw ? Math.round(raw.y) : pos ? Math.round(pos.y) : 0,
      width: COMP_W,
      height: COMP_H,
      hasRealCoords: pos?.hasRealCoords ?? hasRealCoords(comp),
      description: comp.description,
      partCode: comp.part_code,
      status: pos?.hasRealCoords || hasRealCoords(comp) ? 'detected' : 'simulated',
      schematicRef: `/schematics/${comp.device_id ?? ''}?ref=${comp.name}`,
      repairNotes: undefined,
      testPoints: comp.name.match(/^TP/i) ? [comp.name] : undefined,
    }
  }
}
