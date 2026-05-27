import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

// Re-exporta para compatibilidade com imports existentes.
// A fonte de verdade agora é src/lib/constants.ts
export { CATEGORY_COLORS } from './constants'
