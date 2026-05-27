/**
 * constants.ts — Tech Board Pro
 * Fonte única de verdade para constantes compartilhadas.
 * Substitui as 3 cópias duplicadas de CATEGORY_COLORS em:
 *   - src/lib/supabase.ts
 *   - src/components/diagnostic/DiagnosticAI.tsx
 *   - src/components/ui/ComponentSidebar.tsx
 */

// ─── Cores por categoria de componente ────────────────────────────────────────
export const CATEGORY_COLORS: Record<string, string> = {
  PMIC:    '#a855f7',
  CPU:     '#00d4ff',
  RF:      '#ef4444',
  AUDIO:   '#22c55e',
  CHARGER: '#06b6d4',
  TOUCH:   '#8b5cf6',
  DISPLAY: '#f59e0b',
  CAMERA:  '#10b981',
  WIFI:    '#f59e0b',
  NFC:     '#22c55e',
  MEMORY:  '#3b82f6',
  SENSOR:  '#ec4899',
  USB:     '#06b6d4',
  MOTOR:   '#f97316',
  POWER:   '#a855f7',
  OTHER:   '#64748b',
}

// ─── Constantes de layout do BoardView ────────────────────────────────────────
export const BOARD_W       = 1800
export const BOARD_H       = 1200
export const COMP_W        = 80
export const COMP_H        = 48
export const BOARD_PADDING = 48
export const MIN_ZOOM      = 0.25
export const MAX_ZOOM      = 3
export const COMP_BG_ALPHA = 0.7

// ─── Metadados da aplicação ────────────────────────────────────────────────────
export const APP_NAME    = 'Tech Board Pro'
export const APP_VERSION = '0.1.0'
