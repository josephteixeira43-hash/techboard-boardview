import type { BoardComponent } from '@/types/board'
import type { ParsedComponent, ParsedLayer } from '@/types/parsed'
import { inferTypeFromDesignator } from './parseUtils'

function mapLayer(layer: ParsedLayer | string): BoardComponent['side'] {
  const l = String(layer).toLowerCase()
  if (l === 'bottom' || l === 'b') return 'bottom'
  if (l === 'sub_top') return 'sub_top'
  if (l === 'sub_bottom') return 'sub_bottom'
  return 'top'
}

function stableId(designator: string, deviceId: string): string {
  const slug = designator.replace(/[^A-Za-z0-9]/g, '_')
  return deviceId ? `${deviceId}_${slug}` : slug
}

export class ComponentMapper {
  static toBoardComponents(
    parsed: ParsedComponent[],
    deviceId: string
  ): BoardComponent[] {
    return parsed.map((p) => ComponentMapper.toBoardComponent(p, deviceId))
  }

  static toBoardComponent(p: ParsedComponent, deviceId: string): BoardComponent {
    const side = mapLayer(p.layer)
    const category = p.type || inferTypeFromDesignator(p.id)

    const base: BoardComponent = {
      id: stableId(p.id, deviceId),
      name: p.id,
      category,
      description: p.description,
      side,
      rotation: p.rotation,
      width: p.width,
      height: p.height,
      electrical_line: p.net,
      device_id: deviceId,
      data_source: 'parsed',
    }

    if (side === 'bottom' || side === 'sub_bottom') {
      base.x_bottom = p.x
      base.y_bottom = p.y
    } else {
      base.x_top = p.x
      base.y_top = p.y
    }

    return base
  }

  static mergeIntoSupabase(
    supabaseRows: BoardComponent[],
    parsed: ParsedComponent[],
    deviceId: string
  ): BoardComponent[] {
    const byName = new Map<string, ParsedComponent>()
    parsed.forEach((p) => byName.set(p.id.toUpperCase(), p))

    const merged: BoardComponent[] = []
    const used = new Set<string>()

    for (const row of supabaseRows) {
      const p = byName.get(row.name.toUpperCase())
      if (p) {
        merged.push({
          ...ComponentMapper.toBoardComponent(p, deviceId),
          id: row.id,
          description: row.description ?? p.description,
          part_code: row.part_code,
          common_faults: row.common_faults,
          data_source: 'merged',
        })
        used.add(p.id.toUpperCase())
      } else {
        merged.push(row)
      }
    }

    for (const p of parsed) {
      if (!used.has(p.id.toUpperCase())) {
        merged.push(ComponentMapper.toBoardComponent(p, deviceId))
      }
    }

    return merged
  }

  static fromBoardGeometryRow(row: {
    component_name: string
    x: number
    y: number
    width?: number
    height?: number
    layer?: string
    bbox?: { x?: number; y?: number; w?: number; h?: number }
  }): ParsedComponent | null {
    const id = row.component_name?.trim()
    if (!id) return null
    return {
      id: id.toUpperCase(),
      x: row.x,
      y: row.y,
      width: row.width ?? row.bbox?.w ?? 40,
      height: row.height ?? row.bbox?.h ?? 20,
      net: 'GND',
      layer: row.layer ?? 'top',
      type: inferTypeFromDesignator(id),
    }
  }
}
