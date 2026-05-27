import { supabase } from './supabase'

export async function getDevices() {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .order('brand')
  if (error) throw error
  return data
}

export async function getDeviceByModel(modelCode: string) {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('model_code', modelCode)
    .single()
  if (error) throw error
  return data
}

export async function getComponents(deviceId: string) {
  const { data, error } = await supabase
    .from('components')
    .select('*')
    .eq('device_id', deviceId)
  if (error) throw error
  return data
}

export async function saveBoardGeometry(
  deviceId: string,
  rows: Array<{
    component_name: string
    x: number
    y: number
    width?: number
    height?: number
    layer?: string
  }>
) {
  if (!rows.length) return
  const payload = rows.map((r) => ({
    device_id: deviceId,
    component_name: r.component_name,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    layer: r.layer ?? 'top',
    source: 'parsed',
  }))
  const { error } = await supabase.from('board_geometry').upsert(payload)
  if (error && error.code !== '42P01') throw error
}

export async function getBoardGeometry(deviceId: string) {
  const { data, error } = await supabase
    .from('board_geometry')
    .select('component_name, x, y, width, height, layer, bbox')
    .eq('device_id', deviceId)
  if (error) {
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      return []
    }
    throw error
  }
  return data ?? []
}

export async function searchComponent(deviceId: string, name: string) {
  const { data, error } = await supabase
    .from('components')
    .select('*')
    .eq('device_id', deviceId)
    .ilike('name', `%${name}%`)
  if (error) throw error
  return data
}

export async function getVoltages(deviceId: string, componentName?: string) {
  let query = supabase
    .from('voltages')
    .select('*')
    .eq('device_id', deviceId)
  if (componentName) {
    query = query.eq('component_name', componentName)
  }
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getTroubleshooting(deviceId: string, symptom?: string) {
  let query = supabase
    .from('troubleshooting')
    .select('*')
    .eq('device_id', deviceId)
  if (symptom) {
    query = query.ilike('symptom', `%${symptom}%`)
  }
  const { data, error } = await query
  if (error) throw error
  return data
}
