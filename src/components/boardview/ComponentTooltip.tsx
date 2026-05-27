'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { TooltipState } from '@/types/interaction'
import { CATEGORY_COLORS } from '@/lib/constants'

interface Props {
  tooltip: TooltipState
  containerRef: React.RefObject<HTMLDivElement | null>
}

export default function ComponentTooltip({ tooltip, containerRef }: Props) {
  const el = containerRef.current
  const cw = el?.clientWidth ?? 800
  const ch = el?.clientHeight ?? 600

  const meta = tooltip.metadata
  if (!tooltip.visible || !meta) return null

  const color = CATEGORY_COLORS[meta.category] || CATEGORY_COLORS.OTHER
  const w = 220
  const h = 168
  let left = tooltip.screenX + 16
  let top = tooltip.screenY - h - 12
  if (left + w > cw - 8) left = tooltip.screenX - w - 16
  if (top < 8) top = tooltip.screenY + 20
  if (top + h > ch - 8) top = ch - h - 8

  return (
    <AnimatePresence>
      <motion.div
        key={meta.id}
        initial={{ opacity: 0, y: 6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.98 }}
        transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'absolute',
          left,
          top,
          width: w,
          zIndex: 60,
          pointerEvents: 'none',
          background: 'rgba(4, 10, 18, 0.96)',
          border: `1px solid ${color}55`,
          borderRadius: 10,
          boxShadow: `0 8px 32px rgba(0,0,0,0.55), 0 0 24px ${color}22`,
          backdropFilter: 'blur(12px)',
          fontFamily: 'ui-monospace, monospace',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: 3,
            background: `linear-gradient(90deg, ${color}, transparent)`,
          }}
        />
        <div style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em' }}>
            COMPONENT ID
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color, marginBottom: 8 }}>{meta.name}</div>

          <Row label="Type" value={meta.type} />
          <Row label="Net" value={meta.net} accent={color} />
          <Row label="Layer" value={meta.layer} />
          <Row label="Coordinates" value={`X: ${meta.x}  Y: ${meta.y}`} />
          <Row
            label="Status"
            value={meta.hasRealCoords ? 'Detected' : 'Simulated'}
            accent={meta.hasRealCoords ? '#22c55e' : '#f59e0b'}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

function Row({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, fontSize: 10 }}>
      <span style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
      <span style={{ color: accent ?? 'rgba(255,255,255,0.75)', textAlign: 'right' }}>{value}</span>
    </div>
  )
}
