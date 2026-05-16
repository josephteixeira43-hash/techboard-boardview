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
