'use client'

import { motion } from 'framer-motion'
import type { BoardComponent } from '@/types/board'
import type { ComponentMetadata } from '@/types/interaction'
import { CATEGORY_COLORS } from '@/lib/constants'

interface Props {
  selected: BoardComponent | null
  metadata: ComponentMetadata | null
  voltages: { node: string; value: string }[]
  netName: string
  netVoltage: string
  netColor: string
  connectedIds: string[]
  components: BoardComponent[]
  onCenter: () => void
  onFocusComponent: (name: string) => void
  deviceId?: string
}

export default function ComponentInspectorPanel({
  selected,
  metadata,
  voltages,
  netName,
  netVoltage,
  netColor,
  connectedIds,
  components,
  onCenter,
  onFocusComponent,
  deviceId,
}: Props) {
  if (!selected || !metadata) {
    return (
      <div className="w-80 border-l border-white/10 p-4 overflow-y-auto shrink-0 bg-[#030608]">
        <div className="text-center text-white/20 mt-20">
          <div className="text-4xl mb-4">🔍</div>
          <div className="text-sm font-mono">Clique em um componente</div>
          <div className="text-xs text-white/10 mt-2 font-mono leading-relaxed">
            Hover para preview · Busca Ctrl+K · Zoom suave ao selecionar
          </div>
        </div>
      </div>
    )
  }

  const color = CATEGORY_COLORS[selected.category] || CATEGORY_COLORS.OTHER
  const compVoltages = voltages.filter((v) => v.component_name === selected.name)
  const schematicHref = deviceId ? `/schematics/${deviceId}?ref=${selected.name}` : '#'

  return (
    <motion.div
      key={selected.id}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="w-80 border-l border-cyan-500/10 p-4 overflow-y-auto shrink-0 bg-[#030608]"
    >
      <div
        className="rounded-xl p-4 mb-4 border"
        style={{
          background: `linear-gradient(135deg, ${color}18, transparent)`,
          borderColor: `${color}44`,
          boxShadow: `0 0 24px ${color}18`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold font-mono"
            style={{ background: `${color}22`, border: `2px solid ${color}`, color }}
          >
            {selected.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-lg truncate font-mono" style={{ color }}>
              {selected.name}
            </div>
            <div
              className="text-xs font-semibold mt-0.5 px-2 py-0.5 rounded inline-block font-mono"
              style={{ background: `${color}22`, color }}
            >
              {metadata.type}
            </div>
          </div>
        </div>
      </div>

      <Section title="NET ELÉTRICA">
        <div className="rounded-lg p-3 border" style={{ background: `${netColor}0a`, borderColor: `${netColor}33` }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: netColor, boxShadow: `0 0 6px ${netColor}` }} />
            <span className="font-mono font-bold text-sm" style={{ color: netColor }}>
              {netName}
            </span>
            <span className="ml-auto font-mono text-xs" style={{ color: netColor }}>
              {netVoltage}
            </span>
          </div>
          {connectedIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {connectedIds.slice(0, 10).map((id) => {
                const comp = components.find((c) => c.id === id)
                if (!comp) return null
                return (
                  <button
                    key={id}
                    onClick={() => onFocusComponent(comp.name)}
                    className="text-xs px-2 py-0.5 rounded font-mono hover:scale-105 transition-transform"
                    style={{ background: `${netColor}15`, color: netColor, border: `1px solid ${netColor}33` }}
                  >
                    {comp.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </Section>

      <Section title="METADATA">
        <MetaRow label="Layer" value={metadata.layer} />
        <MetaRow label="Coordinates" value={`X ${metadata.x} · Y ${metadata.y}`} />
        <MetaRow label="Status" value={metadata.status} highlight={metadata.hasRealCoords} />
        {metadata.partCode && <MetaRow label="Part code" value={metadata.partCode} />}
        {metadata.description && <MetaRow label="Description" value={metadata.description} />}
      </Section>

      {compVoltages.length > 0 && (
        <Section title={`TENSÕES (${compVoltages.length})`}>
          {compVoltages.map((v, i) => (
            <div key={i} className="flex justify-between text-xs py-1 border-b border-white/5 font-mono">
              <span className="text-white/60">{v.node}</span>
              <span className="text-cyan-400 font-bold">{v.value}</span>
            </div>
          ))}
        </Section>
      )}

      <Section title="LINKS">
        <a
          href={schematicHref}
          className="block text-xs text-yellow-400/90 hover:text-yellow-300 font-mono py-1"
        >
          → Esquemático vinculado
        </a>
      </Section>

      <Section title="FUTURO">
        <Placeholder label="AI diagnosis" />
        <Placeholder label="Waveform analysis" />
        <Placeholder label="Repair history" />
      </Section>

      <button
        onClick={onCenter}
        className="w-full mt-2 py-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs hover:bg-cyan-500/20 transition-all font-mono"
      >
        🎯 Focar câmera no componente
      </button>
    </motion.div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] text-white/35 mb-2 tracking-widest font-mono">{title}</div>
      {children}
    </div>
  )
}

function MetaRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="bg-white/3 rounded-lg px-3 py-2 mb-1.5 flex justify-between gap-2 text-xs font-mono">
      <span className="text-white/40">{label}</span>
      <span className={highlight ? 'text-emerald-400' : 'text-white/75'}>{value}</span>
    </div>
  )
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="text-[10px] text-white/20 py-1 font-mono border border-dashed border-white/5 rounded px-2 mb-1">
      {label} — em breve
    </div>
  )
}
