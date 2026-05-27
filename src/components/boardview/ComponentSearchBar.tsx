'use client'

import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { SearchMatch } from '@/types/interaction'
import { CATEGORY_COLORS } from '@/lib/constants'

interface Props {
  searchQuery: string
  setSearchQuery: (q: string) => void
  matches: SearchMatch[]
  recentSearches: string[]
  onSubmit: () => void
  onSelect: (name: string) => void
  onSearchChange: (q: string) => void
}

export default function ComponentSearchBar({
  searchQuery,
  setSearchQuery,
  matches,
  recentSearches,
  onSubmit,
  onSelect,
  onSearchChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const showDropdown = searchQuery.length >= 1 && (matches.length > 0 || recentSearches.length > 0)

  return (
    <div className="relative">
      <div className="text-xs text-white/40 mb-2 tracking-widest font-mono flex items-center justify-between">
        <span>BUSCAR COMPONENTE</span>
        <span className="text-[10px] text-cyan-500/50">Ctrl+K</span>
      </div>
      <div className="flex gap-2">
        <input
          id="board-component-search"
          ref={inputRef}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            onSearchChange(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit()
            if (e.key === 'ArrowDown' && matches[0]) onSelect(matches[0].component.name)
          }}
          placeholder="U3200, PP_VDD_MAIN, TP1001..."
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-500/50 font-mono text-white"
          autoComplete="off"
        />
        <button
          onClick={onSubmit}
          className="px-3 py-2 bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-400 text-sm hover:bg-cyan-500/30 transition-all font-mono"
        >
          →
        </button>
      </div>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute left-0 right-0 top-full mt-1 z-40 rounded-lg border border-cyan-500/20 bg-[#030608]/98 shadow-xl overflow-hidden max-h-48 overflow-y-auto"
          >
            {matches.length > 0 ? (
              matches.map((m) => {
                const color = CATEGORY_COLORS[m.component.category] || CATEGORY_COLORS.OTHER
                return (
                  <button
                    key={m.component.id}
                    type="button"
                    onClick={() => onSelect(m.component.name)}
                    className="w-full text-left px-3 py-2 hover:bg-cyan-500/10 border-b border-white/5 last:border-0 flex items-center gap-2"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                    />
                    <span className="font-mono text-xs text-cyan-300">{m.component.name}</span>
                    <span className="text-[10px] text-white/30 ml-auto">{m.matchType}</span>
                  </button>
                )
              })
            ) : (
              recentSearches.slice(0, 5).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onSelect(r)}
                  className="w-full text-left px-3 py-1.5 text-[10px] text-white/40 hover:bg-white/5 font-mono"
                >
                  ↺ {r}
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
