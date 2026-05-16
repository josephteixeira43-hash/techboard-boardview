'use client'
import { useEffect, useState, useRef, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { getComponents, getVoltages } from '@/lib/queries'
import { CATEGORY_COLORS } from '@/lib/supabase'

type DiagnosticResult = {
  diagnostico: string
  componentes: string[]
  tensoes: { ponto: string; valor: string }[]
  procedimento: string[]
  solucao_comum: string
}

const DEVICE_LABEL = 'Samsung Galaxy A12'

const BOARD_W = 1800
const BOARD_H = 1200
const COMP_W = 80
const COMP_H = 48
const BOARD_PADDING = 48
const MIN_ZOOM = 0.25
const MAX_ZOOM = 3
const COMP_BG_ALPHA = 0.7

function plateStorageSide(side: string): 'top' | 'bottom' {
  return side === 'bottom' || side === 'sub_bottom' ? 'bottom' : 'top'
}

function plateStorageKey(deviceId: string, side: string) {
  return `techboard-plate-${deviceId}-${plateStorageSide(side)}`
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '')
  if (h.length !== 6) return `rgba(100, 116, 139, ${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function isValidCoord(v: unknown): boolean {
  if (v == null || v === '') return false
  const n = Number(v)
  return !Number.isNaN(n) && n !== 0
}

function hasRealCoords(comp: {
  x_top?: number | null
  y_top?: number | null
  x_bottom?: number | null
  y_bottom?: number | null
  side?: string
}) {
  const useBottom = comp.side === 'bottom' || comp.side === 'sub_bottom'
  if (useBottom && isValidCoord(comp.x_bottom) && isValidCoord(comp.y_bottom)) {
    return true
  }
  return isValidCoord(comp.x_top) && isValidCoord(comp.y_top)
}

function getRawCoords(comp: {
  x_top?: number | null
  y_top?: number | null
  x_bottom?: number | null
  y_bottom?: number | null
  side?: string
}) {
  const useBottom = comp.side === 'bottom' || comp.side === 'sub_bottom'
  if (useBottom && isValidCoord(comp.x_bottom) && isValidCoord(comp.y_bottom)) {
    return { x: Number(comp.x_bottom), y: Number(comp.y_bottom) }
  }
  return { x: Number(comp.x_top), y: Number(comp.y_top) }
}

function gridPosition(index: number, total: number) {
  const usableW = BOARD_W - BOARD_PADDING * 2 - COMP_W
  const usableH = BOARD_H - BOARD_PADDING * 2 - COMP_H
  const cols = Math.max(1, Math.ceil(Math.sqrt(total * (BOARD_W / BOARD_H))))
  const rows = Math.ceil(total / cols)
  const cellW = usableW / cols
  const cellH = usableH / rows
  const col = index % cols
  const row = Math.floor(index / cols)
  return {
    x: BOARD_PADDING + col * cellW + Math.max(0, (cellW - COMP_W) / 2),
    y: BOARD_PADDING + row * cellH + Math.max(0, (cellH - COMP_H) / 2),
  }
}

function computeBoardPositions(components: any[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const withCoords: { comp: any; x: number; y: number }[] = []
  const withoutCoords: { comp: any; index: number }[] = []

  components.forEach((comp, index) => {
    if (hasRealCoords(comp)) {
      const { x, y } = getRawCoords(comp)
      withCoords.push({ comp, x, y })
    } else {
      withoutCoords.push({ comp, index })
    }
  })

  const usableW = BOARD_W - BOARD_PADDING * 2 - COMP_W
  const usableH = BOARD_H - BOARD_PADDING * 2 - COMP_H

  if (withCoords.length > 0) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    withCoords.forEach(({ x, y }) => {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    })
    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1
    const scale = Math.min(usableW / rangeX, usableH / rangeY)

    withCoords.forEach(({ comp, x, y }) => {
      positions.set(comp.id, {
        x: BOARD_PADDING + (x - minX) * scale,
        y: BOARD_PADDING + (y - minY) * scale,
      })
    })
  }

  withoutCoords.forEach(({ comp }, i) => {
    positions.set(comp.id, gridPosition(i, withoutCoords.length))
  })

  return positions
}

function BoardViewContent() {
  const searchParams = useSearchParams()
  const deviceId = searchParams.get('id') || ''
  const [components, setComponents] = useState<any[]>([])
  const [voltages, setVoltages] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [search, setSearch] = useState('')
  const [highlighted, setHighlighted] = useState<any>(null)
  const [diagnostic, setDiagnostic] = useState('')
  const [diagResult, setDiagResult] = useState<DiagnosticResult | null>(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const [diagError, setDiagError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [side, setSide] = useState('top')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [boardImage, setBoardImage] = useState<string | null>(null)

  const viewportRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const plateInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0 })

  useEffect(() => {
    if (!deviceId) return
    Promise.all([getComponents(deviceId), getVoltages(deviceId)]).then(([comp, volt]) => {
      const list = comp || []
      console.log(
        '[BoardView] Primeiros 5 componentes (coords):',
        list.slice(0, 5).map((c: any) => ({
          name: c.name,
          side: c.side,
          x_top: c.x_top,
          y_top: c.y_top,
          x_bottom: c.x_bottom,
          y_bottom: c.y_bottom,
        }))
      )
      setComponents(list)
      setVoltages(volt || [])
      setLoading(false)
    })
  }, [deviceId])

  useEffect(() => {
    if (!deviceId) {
      setBoardImage(null)
      return
    }
    try {
      const saved = localStorage.getItem(plateStorageKey(deviceId, side))
      setBoardImage(saved || null)
    } catch {
      setBoardImage(null)
    }
  }, [deviceId, side])

  const handlePlateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !deviceId) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setBoardImage(dataUrl)
      try {
        localStorage.setItem(plateStorageKey(deviceId, side), dataUrl)
      } catch (err) {
        console.warn('[BoardView] Imagem grande demais para localStorage:', err)
        alert('Imagem salva na sessão, mas pode ser grande demais para persistir no navegador.')
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleRemovePlate = () => {
    if (!deviceId) return
    setBoardImage(null)
    try {
      localStorage.removeItem(plateStorageKey(deviceId, side))
    } catch {
      /* ignore */
    }
  }

  const boardPositions = useMemo(() => computeBoardPositions(components), [components])

  const visibleOnBoard = useMemo(
    () =>
      components.filter(
        c => search === '' || c.name.toLowerCase().includes(search.toLowerCase())
      ),
    [components, search]
  )

  const resetView = useCallback(() => {
    const vp = viewportRef.current
    if (!vp) return
    setZoom(1)
    setPan({
      x: (vp.clientWidth - BOARD_W) / 2,
      y: (vp.clientHeight - BOARD_H) / 2,
    })
  }, [])

  useEffect(() => {
    if (!loading) resetView()
  }, [loading, resetView])

  const centerOnComponent = useCallback(
    (comp: any, targetZoom?: number) => {
      const vp = viewportRef.current
      const pos = boardPositions.get(comp.id)
      if (!vp || !pos) return
      const z = targetZoom ?? zoom
      const cx = pos.x + COMP_W / 2
      const cy = pos.y + COMP_H / 2
      if (targetZoom != null) setZoom(targetZoom)
      setPan({
        x: vp.clientWidth / 2 - cx * z,
        y: vp.clientHeight / 2 - cy * z,
      })
    },
    [zoom, boardPositions]
  )

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = vp.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      setZoom(prev => {
        const delta = e.deltaY > 0 ? -0.08 : 0.08
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta))
        const ratio = next / prev
        setPan(p => ({
          x: mouseX - (mouseX - p.x) * ratio,
          y: mouseY - (mouseY - p.y) * ratio,
        }))
        return next
      })
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, [loading])

  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current
      setPan({
        x: d.panX + (e.clientX - d.startX),
        y: d.panY + (e.clientY - d.startY),
      })
    }
    const onUp = () => setIsDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging])

  const handleBoardMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-component]')) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    setIsDragging(true)
  }

  const sideComponents = useMemo(
    () => components.filter(c => c.side === side),
    [components, side]
  )

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    sideComponents.forEach(c => {
      const cat = c.category || 'OTHER'
      counts[cat] = (counts[cat] || 0) + 1
    })
    return counts
  }, [sideComponents])

  const handleSearch = () => {
    const found = components.find(c => c.name.toLowerCase() === search.toLowerCase())
    if (found) {
      setHighlighted(found)
      setSelected(found)
      if (found.side) setSide(found.side)
      const targetZoom = zoom < 0.8 ? 1 : zoom
      requestAnimationFrame(() => centerOnComponent(found, targetZoom))
    }
  }

  const handleDiagnostic = async () => {
    if (!diagnostic.trim()) return
    setDiagLoading(true)
    setDiagResult(null)
    setDiagError(null)
    try {
      const res = await fetch('/api/diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symptom: diagnostic,
          device: DEVICE_LABEL,
        }),
      })
      if (!res.ok) throw new Error('API error')
      const data: DiagnosticResult = await res.json()
      setDiagResult(data)
    } catch {
      setDiagError('Não foi possível obter o diagnóstico. Verifique a chave GROQ_API_KEY e tente novamente.')
    } finally {
      setDiagLoading(false)
    }
  }

  const focusComponent = (name: string) => {
    const found = components.find(x => x.name === name)
    if (!found) return
    setSearch(name)
    setHighlighted(found)
    setSelected(found)
    if (found.side) setSide(found.side)
    requestAnimationFrame(() => centerOnComponent(found, Math.max(zoom, 1)))
  }

  const compVoltages = voltages.filter(v => selected && v.component_name === selected.name)
  const selectedPos = selected ? boardPositions.get(selected.id) ?? null : null
  const selectedColor = selected ? CATEGORY_COLORS[selected.category] || '#64748b' : '#64748b'

  return (
    <div className="min-h-screen bg-[#060c18] text-white font-mono flex flex-col">
      <div className="border-b border-cyan-500/20 p-4 flex items-center gap-4 flex-wrap">
        <a href="/" className="text-white/40 hover:text-white text-sm">
          ← Voltar
        </a>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
          ⚡
        </div>
        <h1 className="font-bold">
          TECH<span className="text-cyan-400">BOARD</span> PRO — BoardView
        </h1>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <input
            ref={plateInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePlateUpload}
          />
          <button
            type="button"
            onClick={() => plateInputRef.current?.click()}
            className="px-3 py-1 rounded-lg text-xs border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all"
          >
            📷 Carregar Placa
          </button>
          {boardImage && (
            <button
              type="button"
              onClick={handleRemovePlate}
              className="px-3 py-1 rounded-lg text-xs border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
            >
              🗑 Remover imagem
            </button>
          )}
          <span className="text-xs text-white/30 mr-1">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={resetView}
            className="px-3 py-1 rounded-lg text-xs border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-all"
          >
            ⊙ Centralizar
          </button>
          {['top', 'bottom', 'sub_top', 'sub_bottom'].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`px-3 py-1 rounded-lg text-xs border transition-all ${
                side === s
                  ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                  : 'border-white/10 text-white/40 hover:border-white/30'
              }`}
            >
              {s.replace('_', ' ').toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 border-r border-white/10 flex flex-col gap-4 p-4 overflow-y-auto shrink-0">
          <div>
            <div className="text-xs text-white/40 mb-2 tracking-widest">🔍 BUSCAR COMPONENTE</div>
            <div className="flex gap-2">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Ex: U5003, PMIC..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-cyan-500/50"
              />
              <button
                type="button"
                onClick={handleSearch}
                className="px-3 py-2 bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-400 text-sm hover:bg-cyan-500/30 transition-all"
              >
                →
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs text-white/40 mb-2 tracking-widest">🤖 IA DIAGNÓSTICO</div>
            <div className="flex flex-col gap-2">
              <input
                value={diagnostic}
                onChange={e => setDiagnostic(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleDiagnostic()}
                placeholder="Ex: sem rede, não liga..."
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500/50"
              />
              <button
                type="button"
                onClick={handleDiagnostic}
                disabled={diagLoading}
                className="px-3 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-purple-400 text-sm hover:bg-purple-500/30 transition-all disabled:opacity-50"
              >
                {diagLoading ? 'Analisando...' : 'Diagnosticar'}
              </button>
            </div>
            {diagError && (
              <div className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                {diagError}
              </div>
            )}
            {diagResult && (
              <div className="mt-3 space-y-3 bg-white/3 border border-white/10 rounded-lg p-3">
                <div>
                  <div className="text-[10px] text-white/40 mb-1 tracking-wider">DIAGNÓSTICO</div>
                  <div className="text-xs text-white/80 leading-relaxed">{diagResult.diagnostico}</div>
                </div>
                {diagResult.componentes?.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[10px] text-white/40 mb-2 tracking-wider">COMPONENTES</div>
                    <div className="flex flex-wrap gap-1">
                      {diagResult.componentes.map((c, k) => (
                        <button key={k} type="button" onClick={() => focusComponent(c)} className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded text-cyan-400 text-xs cursor-pointer hover:bg-cyan-500/20">{c}</button>
                      ))}
                    </div>
                  </div>
                )}
                {diagResult.tensoes?.length > 0 && (
                  <div>
                    <div className="text-[10px] text-white/40 mb-2 tracking-wider">TENSÕES</div>
                    <div className="rounded border border-white/10 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-white/5 text-white/40">
                            <th className="text-left px-2 py-1 font-normal">Ponto</th>
                            <th className="text-right px-2 py-1 font-normal">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diagResult.tensoes.map((t, i) => (
                            <tr key={i} className="border-t border-white/5">
                              <td className="px-2 py-1 text-white/70">{t.ponto}</td>
                              <td className="px-2 py-1 text-cyan-400 text-right font-bold">{t.valor}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {diagResult.procedimento?.length > 0 && (
                  <div>
                    <div className="text-[10px] text-white/40 mb-2 tracking-wider">PROCEDIMENTO</div>
                    <ol className="space-y-1.5 list-none">
                      {diagResult.procedimento.map((passo, i) => (
                        <li key={i} className="flex gap-2 text-xs text-white/70">
                          <span className="w-5 h-5 rounded bg-purple-500/20 text-purple-400 text-[10px] flex items-center justify-center shrink-0 font-bold">
                            {i + 1}
                          </span>
                          <span className="leading-relaxed">{passo}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {diagResult.solucao_comum && (
                  <div className="rounded-lg p-3 bg-green-500/10 border border-green-500/30">
                    <div className="text-[10px] text-green-400/80 mb-1 tracking-wider font-bold">
                      SOLUÇÃO COMUM
                    </div>
                    <div className="text-xs text-green-300 leading-relaxed">{diagResult.solucao_comum}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="text-xs text-white/40 mb-2 tracking-widest">
              🎨 CATEGORIAS ({sideComponents.length})
            </div>
            <div className="space-y-1">
              {Object.entries(CATEGORY_COLORS)
                .filter(([cat]) => (categoryCounts[cat] ?? 0) > 0)
                .map(([cat, color]) => (
                  <div key={cat} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-white/60 truncate">{cat}</span>
                    </div>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0"
                      style={{ background: `${color}22`, color }}
                    >
                      {categoryCounts[cat]}
                    </span>
                  </div>
                ))}
              {sideComponents.length === 0 && (
                <div className="text-xs text-white/30">Nenhum componente neste lado</div>
              )}
            </div>
          </div>

          <div className="text-[10px] text-white/25 leading-relaxed border-t border-white/5 pt-3">
            Scroll: zoom · Arrastar: mover · Duplo clique no fundo: centralizar
          </div>
        </div>

        <div
          ref={viewportRef}
          className={`flex-1 relative overflow-hidden select-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onMouseDown={handleBoardMouseDown}
          onDoubleClick={resetView}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full gap-3 text-white/40 bg-[#060e1a]">
              <div className="w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              Carregando componentes...
            </div>
          ) : (
            <div
              className="absolute origin-top-left will-change-transform"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                width: BOARD_W,
                height: BOARD_H,
              }}
            >
              <div
                ref={boardRef}
                className="relative rounded-sm overflow-hidden shadow-2xl shadow-black/50"
                style={{
                  width: BOARD_W,
                  height: BOARD_H,
                  background: boardImage
                    ? '#0a1a10'
                    : `linear-gradient(145deg, #0a2216 0%, #0d3320 35%, #0a2818 70%, #071f12 100%)`,
                }}
              >
                {boardImage && (
                  <img
                    src={boardImage}
                    alt={`Placa ${plateStorageSide(side)}`}
                    width={BOARD_W}
                    height={BOARD_H}
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
                  />
                )}
                {/* Trilhas PCB */}
                <div
                  className={`absolute inset-0 pointer-events-none ${boardImage ? 'opacity-20' : ''}`}
                  style={{
                    backgroundImage: `
                      linear-gradient(90deg, rgba(52, 211, 153, 0.12) 1px, transparent 1px),
                      linear-gradient(rgba(52, 211, 153, 0.12) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(16, 185, 129, 0.06) 1px, transparent 1px),
                      linear-gradient(rgba(16, 185, 129, 0.06) 1px, transparent 1px)
                    `,
                    backgroundSize: '80px 80px, 80px 80px, 20px 20px, 20px 20px',
                  }}
                />
                <div
                  className={`absolute inset-0 pointer-events-none ${boardImage ? 'opacity-15' : 'opacity-40'}`}
                  style={{
                    backgroundImage: `
                      repeating-linear-gradient(
                        0deg,
                        transparent,
                        transparent 38px,
                        rgba(34, 197, 94, 0.15) 38px,
                        rgba(34, 197, 94, 0.15) 40px
                      ),
                      repeating-linear-gradient(
                        90deg,
                        transparent,
                        transparent 58px,
                        rgba(34, 197, 94, 0.1) 58px,
                        rgba(34, 197, 94, 0.1) 60px
                      )
                    `,
                  }}
                />
                <div
                  className="absolute inset-4 rounded border border-emerald-900/60 pointer-events-none"
                  style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.4)' }}
                />

                {visibleOnBoard.map(comp => {
                  const pos = boardPositions.get(comp.id)
                  if (!pos) return null
                  const color = CATEGORY_COLORS[comp.category] || '#64748b'
                  const isHighlighted = highlighted?.id === comp.id
                  const isSelected = selected?.id === comp.id
                  const isActiveSide = comp.side === side
                  const category = comp.category || 'OTHER'
                  return (
                    <div
                      key={comp.id}
                      data-component
                      role="button"
                      tabIndex={0}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={() => {
                        setSelected(comp)
                        setHighlighted(comp)
                        if (comp.side) setSide(comp.side)
                      }}
                      style={{
                        position: 'absolute',
                        left: pos.x,
                        top: pos.y,
                        width: COMP_W,
                        height: COMP_H,
                        opacity: isActiveSide ? 1 : 0.35,
                        borderColor: isHighlighted || isSelected ? color : `${color}66`,
                        background: isSelected
                          ? hexToRgba(color, COMP_BG_ALPHA + 0.15)
                          : hexToRgba(color, COMP_BG_ALPHA),
                        boxShadow: isHighlighted
                          ? undefined
                          : isSelected
                            ? `0 0 12px ${color}66`
                            : 'none',
                        ['--neon-color' as string]: color,
                      }}
                      className={`rounded border-2 flex flex-col items-center justify-center cursor-pointer transition-all text-xs font-bold
                        ${isSelected ? 'z-10 ring-1 ring-white/30' : isActiveSide ? 'hover:brightness-125 z-0' : 'z-0 hover:opacity-60'}
                        ${isHighlighted ? 'z-20 neon-highlight !opacity-100' : ''}`}
                    >
                      <span
                        style={{ color, fontSize: 10 }}
                        className="truncate px-1 max-w-full leading-tight font-bold"
                      >
                        {comp.name}
                      </span>
                      <span
                        style={{ color, fontSize: 8 }}
                        className="truncate px-1 max-w-full opacity-75 leading-tight"
                      >
                        {category}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="w-80 border-l border-white/10 p-4 overflow-y-auto shrink-0">
          {!selected ? (
            <div className="text-center text-white/20 mt-20">
              <div className="text-4xl mb-4">📍</div>
              <div className="text-sm">Clique em um componente para ver detalhes</div>
              <div className="text-xs text-white/15 mt-4 px-4">
                {visibleOnBoard.length} no board · {sideComponents.length} no lado {side.replace('_', ' ')}
              </div>
            </div>
          ) : (
            <div>
              <div
                className="rounded-xl p-4 mb-4 border"
                style={{
                  background: `linear-gradient(135deg, ${selectedColor}15, transparent)`,
                  borderColor: `${selectedColor}44`,
                  boxShadow: `0 0 24px ${selectedColor}22`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold shrink-0"
                    style={{
                      background: `${selectedColor}22`,
                      border: `2px solid ${selectedColor}`,
                      color: selectedColor,
                    }}
                  >
                    {selected.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-lg truncate" style={{ color: selectedColor }}>
                      {selected.name}
                    </div>
                    <div
                      className="text-xs font-semibold mt-0.5 px-2 py-0.5 rounded inline-block"
                      style={{ background: `${selectedColor}22`, color: selectedColor }}
                    >
                      {selected.category}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <DetailRow label="ID" value={selected.id} mono />
                {selectedPos && (
                  <DetailRow label="COORDENADAS" value={`X: ${selectedPos.x} · Y: ${selectedPos.y}`} mono />
                )}
                {selected.side && <DetailRow label="LADO" value={selected.side.replace('_', ' ').toUpperCase()} />}
                {selected.part_code && (
                  <DetailRow label="PART CODE" value={selected.part_code} accent={selectedColor} />
                )}
                <DetailRow
                  label="DESCRIÇÃO"
                  value={selected.description || 'Sem descrição cadastrada'}
                  multiline
                />
                {selected.package && <DetailRow label="PACKAGE" value={selected.package} />}
                {selected.rotation != null && <DetailRow label="ROTAÇÃO" value={`${selected.rotation}°`} />}
                <DetailRow
                  label="NA CATEGORIA"
                  value={`${categoryCounts[selected.category] || 0} componente(s) ${selected.category} neste lado`}
                />
                {compVoltages.length > 0 && (
                  <div className="bg-white/3 rounded-lg p-3 mt-2">
                    <div className="text-xs text-white/40 mb-2">⚡ TENSÕES ({compVoltages.length})</div>
                    <div className="space-y-1.5">
                      {compVoltages.map((v, i) => (
                        <div
                          key={i}
                          className="flex justify-between text-xs py-1 border-b border-white/5 last:border-0"
                        >
                          <span className="text-white/60">{v.node}</span>
                          <span className="text-cyan-400 font-bold">{v.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => centerOnComponent(selected)}
                  className="w-full mt-3 py-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs hover:bg-cyan-500/20 transition-all"
                >
                  🎯 Focar no board
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes neonPulse {
          0%,
          100% {
            box-shadow:
              0 0 6px var(--neon-color),
              0 0 14px var(--neon-color),
              0 0 28px color-mix(in srgb, var(--neon-color) 60%, transparent);
            transform: scale(1.08);
          }
          50% {
            box-shadow:
              0 0 12px var(--neon-color),
              0 0 28px var(--neon-color),
              0 0 48px color-mix(in srgb, var(--neon-color) 80%, transparent),
              0 0 64px color-mix(in srgb, var(--neon-color) 40%, transparent);
            transform: scale(1.14);
          }
        }
        .neon-highlight {
          animation: neonPulse 1.2s ease-in-out infinite;
          z-index: 20;
        }
      `}</style>
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono,
  accent,
  multiline,
}: {
  label: string
  value: string
  mono?: boolean
  accent?: string
  multiline?: boolean
}) {
  return (
    <div className="bg-white/3 rounded-lg p-3">
      <div className="text-[10px] text-white/40 mb-1 tracking-wider">{label}</div>
      <div
        className={`text-sm ${mono ? 'font-mono text-cyan-300/90' : ''} ${multiline ? 'leading-relaxed' : 'truncate'}`}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
    </div>
  )
}

export default function BoardViewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#060c18] flex items-center justify-center text-white/40">
          Carregando...
        </div>
      }
    >
      <BoardViewContent />
    </Suspense>
  )
}
