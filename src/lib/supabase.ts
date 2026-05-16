import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export const CATEGORY_COLORS: Record<string, string> = {
  PMIC: '#a855f7',
  CPU: '#00d4ff',
  RF: '#ef4444',
  AUDIO: '#22c55e',
  CHARGER: '#06b6d4',
  TOUCH: '#8b5cf6',
  DISPLAY: '#f59e0b',
  CAMERA: '#10b981',
  WIFI: '#f59e0b',
  NFC: '#22c55e',
  MEMORY: '#3b82f6',
  SENSOR: '#ec4899',
  USB: '#06b6d4',
  MOTOR: '#f97316',
  POWER: '#a855f7',
  OTHER: '#64748b',
}
