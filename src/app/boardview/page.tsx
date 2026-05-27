'use client'
import { useEffect, useState, useCallback, Suspense, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { getVoltages } from '@/lib/queries'
import { useBoardEngine } from '@/hooks/useBoardEngine'
import { useBoardData } from '@/hooks/useBoardData'
import { useBoardInteraction } from '@/hooks/useBoardInteraction'
import { usePCBExtractor } from '@/hooks/usePCBExtractor'
import { usePCBFromPDF } from '@/hooks/usePCBFromPDF'
import { usePdfNetGraph } from '@/hooks/usePdfNetGraph'
import { useTechAI } from '@/hooks/useTechAI'
import BoardViewer from '@/components/boardview/BoardViewerKonva'
import RegionOverlayLayer from '@/components/boardview/RegionOverlayLayer'
import NetGraphOverlayLayer from '@/components/boardview/NetGraphOverlayLayer'
import ComponentTooltip from '@/components/boardview/ComponentTooltip'
import ComponentSearchBar from '@/components/boardview/ComponentSearchBar'
import ComponentInspectorPanel from '@/components/boardview/ComponentInspectorPanel'
import type { BoardComponent } from '@/types/board'
import { CATEGORY_COLORS } from '@/lib/constants'
import { syncRegionsToComputedPositions } from '@/core/pdf/PDFRegionEngine'
import { SIGNAL_COLORS } from '@/core/pdf/PDFNetGraphEngine'
import type { PdfNetNode } from '@/types/pdfNetGraph'
import { OverlaySystem, DEFAULT_OVERLAY, type OverlayState } from '@/core/boardview/OverlaySystem'

function PdfNetsPanel({
  nets,
  activeNetId,
  onHighlight,
  onClear,
}: {
  nets: PdfNetNode[]
  activeNetId: string | null
  onHighlight: (netId: string) => void
  onClear: () => void
}) {
  if (!nets.length) return null
  return (
    <div
      className="absolute bottom-14 left-3 z-10 max-h-40 overflow-y-auto rounded-lg border font-mono text-[10px]"
      style={{
        background: 'rgba(3,6,12,0.92)',
        borderColor: 'rgba(0,212,255,0.2)',
        minWidth: 140,
      }}
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-white/10 text-cyan-500/80">
        <span>PDF NETS ({nets.length})</span>
        {activeNetId && (
          <button type="button" onClick={onClear} className="text-white/30 hover:text-white/70">
            ✕
          </button>
        )}
      </div>
      {nets.slice(0, 24).map((n) => (
        <button
          key={n.netId}
          type="button"
          onClick={() => onHighlight(n.netId)}
          className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-white/5"
          style={{
            color: activeNetId === n.netId ? n.color : 'rgba(255,255,255,0.55)',
            background: activeNetId === n.netId ? `${n.color}18` : 'transparent',
          }}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: SIGNAL_COLORS[n.signalType] }}
          />
          <span className="truncate">{n.name}</span>
          <span className="ml-auto text-white/25">{n.componentIds.length}</span>
        </button>
      ))}
    </div>
  )
}

// ─── Overlay Panel ────────────────────────────────────────────────────────────

function OverlayPanel({ overlay, onToggle }: {
  overlay: OverlayState
  onToggle: (key: keyof OverlayState) => void
}) {
  const items: { key: keyof OverlayState; label: string; icon: string }[] = [
    { key: 'showPads',       label: 'Pads',       icon: '◉' },
    { key: 'showVias',       label: 'Vias',        icon: '⊙' },
    { key: 'showTraces',     label: 'Traces',      icon: '⌇' },
    { key: 'showNets',       label: 'NETs',        icon: '⬡' },
    { key: 'showLabels',     label: 'Labels',      icon: 'Aa' },
    { key: 'showSilkscreen', label: 'Silk',        icon: '◫' },
    { key: 'showVoltages',   label: 'Tensões',     icon: '⚡' },
    { key: 'showGrid',       label: 'Grid',        icon: '⊞' },
  ]

  return (
    <div style={{
      position: 'absolute', bottom: 110, right: 14,
      background: 'rgba(3,6,12,0.96)',
      border: '0.5px solid rgba(0,212,255,0.18)',
      borderRadius: 8, overflow: 'hidden',
      boxShadow: '0 4px 28px rgba(0,0,0,0.7)',
      fontFamily: 'monospace', fontSize: 10,
    }}>
      <div style={{ padding: '4px 8px', borderBottom: '0.5px solid rgba(0,212,255,0.12)',
        color: '#2a6090', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 4 }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00d4ff' }} />
        OVERLAYS
      </div>
      {items.map(({ key, label, icon }) => {
        const active = overlay[key]
        return (
          <button key={key} onClick={() => onToggle(key)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            width: '100%', padding: '5px 10px', border: 'none',
            background: active ? 'rgba(0,212,255,0.08)' : 'transparent',
            color: active ? '#00d4ff' : 'rgba(255,255,255,0.3)',
            cursor: 'pointer', fontSize: 10, fontFamily: 'monospace',
            transition: 'all 0.1s', textAlign: 'left',
            borderLeft: active ? '2px solid #00d4ff' : '2px solid transparent',
          }}>
            <span style={{ fontSize: 11, width: 14, textAlign: 'center' }}>{icon}</span>
            {label}
            <span style={{ marginLeft: 'auto', fontSize: 8,
              color: active ? '#00d4ff' : 'rgba(255,255,255,0.2)' }}>
              {active ? 'ON' : 'OFF'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function BoardSidebar({ searchBar, diagnostic, setDiagnostic, onDiagnose,
  diagLoading, diagResult, diagError, sideComponents, categoryCounts }: any) {
  return (
    <div className="w-72 border-r border-white/10 flex flex-col gap-4 p-4 overflow-y-auto shrink-0 bg-[#030608]">
      {searchBar}
      <div>
        <div className="text-xs text-white/40 mb-2 tracking-widest font-mono">IA DIAGNÓSTICO</div>
        <div className="flex flex-col gap-2">
          <input value={diagnostic} onChange={e => setDiagnostic(e.target.value)}
            onKeyDown={e => e.key==='Enter'&&onDiagnose()}
            placeholder="Ex: sem rede, não liga..."
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500/50 font-mono text-white"/>
          <button onClick={onDiagnose} disabled={diagLoading}
            className="px-3 py-2 bg-purple-500/20 border border-purple-500/30 rounded-lg text-purple-400 text-sm hover:bg-purple-500/30 disabled:opacity-50 font-mono">
            {diagLoading ? 'Analisando...' : 'Diagnosticar'}
          </button>
        </div>
        {diagError && <div className="mt-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{diagError}</div>}
        {diagResult && (
          <div className="mt-3 bg-white/3 border border-white/10 rounded-lg p-3 max-h-56 overflow-y-auto">
            <div className="text-[10px] text-white/40 mb-1 font-mono">DIAGNÓSTICO IA</div>
            <div className="text-xs text-white/80 leading-relaxed whitespace-pre-wrap">{diagResult}</div>
          </div>
        )}
      </div>
      <div>
        <div className="text-xs text-white/40 mb-2 tracking-widest font-mono">CATEGORIAS ({sideComponents.length})</div>
        <div className="space-y-1">
          {Object.entries(CATEGORY_COLORS).filter(([cat]) => (categoryCounts[cat]??0)>0).map(([cat,color]) => (
            <div key={cat} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-3 h-3 rounded-full shrink-0" style={{background:color as string}}/>
                <span className="text-white/60 truncate font-mono">{cat}</span>
              </div>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono"
                style={{background:`${color}22`,color:color as string}}>{categoryCounts[cat]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="text-[10px] text-white/20 leading-relaxed border-t border-white/5 pt-3 font-mono">
        Scroll: zoom · Arrastar: mover · Duplo clique: centralizar
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function BoardViewContent() {
  const searchParams = useSearchParams()
  const deviceId = searchParams.get('id') || ''
  const boardData = useBoardData(deviceId)
  const { components, loading, hasRealGeometry, ocrFallbackEnabled, boardFileName, parseResult, virtualRegions, pdfNetGraph, pdfComponentGraph, error: boardDataError, loadDevice, importBoardFile, importPdfComponents, clearBoardFile } = boardData
  const pdfNet = usePdfNetGraph()
  const [voltages, setVoltages] = useState<any[]>([])
  const boardFileInputRef = useRef<HTMLInputElement>(null)
  const pdfImportInputRef = useRef<HTMLInputElement>(null)
  const pdfJsonInputRef = useRef<HTMLInputElement>(null)
  const [diagnostic, setDiagnostic] = useState('')
  const [boardImage, setBoardImage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [overlay, setOverlay] = useState<OverlayState>(DEFAULT_OVERLAY)
  const [showOverlayPanel, setShowOverlayPanel] = useState(false)
  const [showVirtualRegions, setShowVirtualRegions] = useState(true)
  const plateInputRef = useRef<HTMLInputElement>(null)
  const overlaySystem = useRef(new OverlaySystem())

  const ai          = useTechAI()
  const engine      = useBoardEngine(components)
  const interaction = useBoardInteraction({ engine, components, deviceId })
  const extractor   = usePCBExtractor(hasRealGeometry)
  const pdfImport   = usePCBFromPDF(deviceId)
  const [pulsePhase, setPulsePhase] = useState(0)

  // Voltages map para lookup rápido
  const voltagesMap = useMemo(() => {
    const map = new Map<string, { node: string; value: string }[]>()
    voltages.forEach(v => {
      const key = v.component_name
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push({ node: v.node, value: v.value })
    })
    return map
  }, [voltages])

  // Sync overlay system
  useEffect(() => {
    return overlaySystem.current.subscribe(setOverlay)
  }, [])

  const handleToggleOverlay = (key: keyof OverlayState) => {
    overlaySystem.current.toggle(key)
  }

  useEffect(() => {
    if (!deviceId) return
    loadDevice()
    getVoltages(deviceId).then((volt) => setVoltages(volt || []))
  }, [deviceId, loadDevice])

  const {
    applyGraph: applyPdfNetGraph,
    traceSignal: tracePdfSignal,
    clearNetHighlight: clearPdfNetHighlight,
    netGraph: activePdfNetGraph,
  } = pdfNet

  useEffect(() => {
    applyPdfNetGraph(pdfNetGraph, pdfComponentGraph)
  }, [pdfNetGraph, pdfComponentGraph, applyPdfNetGraph])

  useEffect(() => {
    if (!activePdfNetGraph) return
    if (engine.selected) tracePdfSignal(engine.selected.id)
    else clearPdfNetHighlight()
  }, [engine.selected?.id, activePdfNetGraph, tracePdfSignal, clearPdfNetHighlight])

  useEffect(() => {
    if (!deviceId) return
    try {
      const saved = localStorage.getItem(`techboard-plate-${deviceId}-top`)
      setBoardImage(saved||null)
    } catch { setBoardImage(null) }
  }, [deviceId])

  useEffect(() => {
    let id = 0
    const loop = () => {
      setPulsePhase(interaction.tickPulse())
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [interaction])

  useEffect(() => {
    const up = () => setIsDragging(false)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const handleDiagnose = async () => {
    if (!diagnostic.trim()) return
    await ai.diagnose({
      userPrompt: diagnostic,
      troubleshooting: { symptom: diagnostic, deviceModel: deviceId },
      boardview: engine.selected
        ? { name: engine.selected.name, category: engine.selected.category, voltage: engine.netVoltage }
        : undefined,
    })
  }

  const sideComponents = components.filter(c => c.side === engine.activeLayer)
  const categoryCounts: Record<string,number> = {}
  sideComponents.forEach(c => { categoryCounts[c.category] = (categoryCounts[c.category]||0)+1 })

  const displayVirtualRegions = useMemo(
    () => syncRegionsToComputedPositions(virtualRegions, engine.positions),
    [virtualRegions, engine.positions]
  )

  return (
    <div className="min-h-screen bg-[#030608] text-white font-mono flex flex-col">
      {/* Toolbar */}
      <div className="border-b border-cyan-500/15 p-3 flex items-center gap-3 flex-wrap bg-[#030608]">
        <a href="/" className="text-white/40 hover:text-white text-sm font-mono">← Voltar</a>
        <a href={`/schematics/${deviceId}`} className="px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20 transition-all">
          <span className="text-yellow-300 text-xs font-mono">Esquemas Elétricos</span>
        </a>
        <h1 className="font-bold font-mono text-sm">TECH<span className="text-cyan-400">BOARD</span> PRO</h1>
        {hasRealGeometry && (
          <span className="text-[10px] px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-mono">
            REAL BOARD DATA
          </span>
        )}
        {virtualRegions.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 font-mono">
            VIRTUAL REGIONS ({virtualRegions.length})
          </span>
        )}
        {pdfNetGraph && pdfNetGraph.nets.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 font-mono">
            NET GRAPH ({pdfNetGraph.nets.length})
          </span>
        )}
        {boardFileName && (
          <span className="text-[10px] text-cyan-500/60 font-mono truncate max-w-[140px]" title={boardFileName}>
            {boardFileName}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <input
            ref={boardFileInputRef}
            type="file"
            accept=".brd,.fz,.board,.boardview,.boardview.json,.tbv,.json,.xml"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              await importBoardFile(file)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => boardFileInputRef.current?.click()}
            className="px-3 py-1 rounded-lg text-xs border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 font-mono"
          >
            📂 Import BRD/FZ
          </button>
          {boardFileName && (
            <button
              onClick={clearBoardFile}
              className="px-2 py-1 rounded-lg text-xs border border-white/10 text-white/40 hover:text-red-400 font-mono"
              title="Remover arquivo parseado"
            >
              ✕
            </button>
          )}
          <input ref={plateInputRef} type="file" accept="image/*" className="hidden" onChange={e => {
            const file = e.target.files?.[0]; if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
              const url = reader.result as string
              setBoardImage(url)
              try { localStorage.setItem(`techboard-plate-${deviceId}-top`, url) } catch {}
            }
            reader.readAsDataURL(file); e.target.value=''
          }}/>
          <button onClick={() => plateInputRef.current?.click()}
            className="px-3 py-1 rounded-lg text-xs border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-mono">📷 Placa</button>
          <input
            ref={pdfImportInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const result = await pdfImport.extractFromFile(file, { useHybridOcr: true })
              if (result?.components.length) {
                importPdfComponents(result.components, {
                  hits: result.hits,
                  pageCount: result.pageCount,
                  netLabels: result.netLabels,
                })
              }
              e.target.value = ''
            }}
          />
          <input
            ref={pdfJsonInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const result = await pdfImport.importFromJson(file)
              if (result?.components.length) {
                importPdfComponents(result.components, {
                  hits: result.hits,
                  pageCount: result.pageCount,
                  netLabels: result.netLabels,
                })
              }
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => pdfImportInputRef.current?.click()}
            disabled={pdfImport.processing || !deviceId}
            className="px-3 py-1 rounded-lg text-xs border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 font-mono disabled:opacity-50"
            title={pdfImport.error ?? pdfImport.statusMessage ?? 'PDF.js + OCR híbrido'}
          >
            {pdfImport.processing
              ? `PDF ${pdfImport.progress}%`
              : '📄 Importar PDF'}
          </button>
          <button
            type="button"
            onClick={() => pdfJsonInputRef.current?.click()}
            disabled={pdfImport.processing || !deviceId}
            className="px-3 py-1 rounded-lg text-xs border border-white/15 bg-white/5 text-white/50 hover:text-white/80 font-mono disabled:opacity-50"
            title="JSON manual: [{ id, x_top, y_top, width, height }]"
          >
            JSON
          </button>
          {pdfImport.processing && pdfImport.statusMessage && (
            <span className="text-[10px] text-amber-400/80 font-mono max-w-[200px] truncate">
              {pdfImport.statusMessage}
            </span>
          )}
          {pdfImport.error && (
            <span className="text-xs text-red-400 font-mono max-w-xs truncate" title={pdfImport.error}>
              {pdfImport.error}
            </span>
          )}
          {extractor.isElectron && extractor.ocrEnabled && (
            <button
              onClick={async () => {
                if (!deviceId) return
                let pdfPath: string | null = null
                if (window.electronAPI?.selectPdf) {
                  pdfPath = await window.electronAPI.selectPdf()
                } else {
                  pdfPath = await new Promise<string | null>((resolve) => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = '.pdf'
                    input.onchange = () => {
                      const file = input.files?.[0]
                      resolve((file as File & { path?: string })?.path ?? null)
                    }
                    input.click()
                  })
                }
                if (!pdfPath) return
                const data = await extractor.extractFromPDF(pdfPath, deviceId)
                if (data) await loadDevice()
              }}
              disabled={extractor.processing || !deviceId}
              className="px-3 py-1 rounded-lg text-xs border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 font-mono disabled:opacity-50"
              title={extractor.error ?? undefined}
            >
              {extractor.processing
                ? `OCR ${extractor.progress}%`
                : '🔬 Extrair PDF'}
            </button>
          )}
          {extractor.isElectron && !extractor.ocrEnabled && (
            <span className="text-[10px] text-emerald-500/70 font-mono" title="Geometria real carregada">
              OCR off
            </span>
          )}
          {extractor.error && extractor.isElectron && extractor.ocrEnabled && (
            <span className="text-xs text-red-400 font-mono max-w-xs truncate" title={extractor.error}>
              {extractor.error}
            </span>
          )}
          {boardImage && <button onClick={() => { setBoardImage(null); try{localStorage.removeItem(`techboard-plate-${deviceId}-top`)}catch{} }}
            className="px-3 py-1 rounded-lg text-xs border border-red-500/30 bg-red-500/10 text-red-400 font-mono">🗑</button>}
          <span className="text-xs text-white/30 font-mono">{Math.round(engine.viewport.zoom*100)}%</span>
          <button onClick={engine.resetView}
            className="px-3 py-1 rounded-lg text-xs border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 font-mono">⊙ Reset</button>
          {/* Overlay toggle */}
          <button onClick={() => setShowOverlayPanel(v => !v)}
            className={`px-3 py-1 rounded-lg text-xs border transition-all font-mono ${showOverlayPanel ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400' : 'border-white/10 text-white/40 hover:border-white/30'}`}>
            ⊞ Layers
          </button>
          {(['top','bottom','sub_top','sub_bottom'] as const).map(s => (
            <button key={s} onClick={() => engine.setActiveLayer(s)}
              className={`px-2 py-1 rounded-lg text-xs border transition-all font-mono ${engine.activeLayer===s?'border-cyan-500 bg-cyan-500/20 text-cyan-400':'border-white/10 text-white/40 hover:border-white/30'}`}>
              {s.replace('_',' ').toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {boardDataError && (
        <div className="px-4 py-2 text-xs text-red-400 bg-red-500/10 border-b border-red-500/20 font-mono">
          {boardDataError}
        </div>
      )}
      {parseResult && !parseResult.success && (
        <div className="px-4 py-2 text-xs text-amber-400 bg-amber-500/10 border-b border-amber-500/20 font-mono">
          Parse: {parseResult.errors.join(' · ')}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <BoardSidebar
          searchBar={
            <ComponentSearchBar
              searchQuery={interaction.searchQuery}
              setSearchQuery={interaction.setSearchQuery}
              matches={interaction.searchMatches}
              recentSearches={interaction.recentSearches}
              onSubmit={interaction.submitSearch}
              onSelect={(name) => interaction.focusComponent(name, { fromSearch: true })}
              onSearchChange={interaction.setSearchQuery}
            />
          }
          diagnostic={diagnostic} setDiagnostic={setDiagnostic} onDiagnose={handleDiagnose}
          diagLoading={ai.loading} diagResult={ai.response} diagError={ai.error}
          sideComponents={sideComponents} categoryCounts={categoryCounts}
        />

        <div className="flex-1 relative overflow-hidden">
          <BoardViewer
            components={components}
            positions={engine.positions}
            highlights={engine.highlights}
            selected={engine.selected}
            hovered={interaction.hovered}
            connectedIds={engine.connectedIds}
            netColor={engine.netColor}
            netName={engine.netName}
            netVoltage={engine.netVoltage}
            activeLayer={engine.activeLayer}
            viewport={engine.viewport}
            boardImage={boardImage}
            loading={loading}
            overlay={overlay}
            voltagesMap={voltagesMap}
            viewportRef={engine.viewportRef as any}
            onMouseDown={(e) => { setIsDragging(true); engine.onMouseDown(e) }}
            onCanvasClick={interaction.handleCanvasClick}
            onPointerMove={interaction.handlePointerMove}
            onPointerLeave={interaction.handlePointerLeave}
            onDoubleClick={engine.resetView}
            isDragging={isDragging}
            searchFocusId={interaction.searchFocusId}
            errorComponentId={interaction.errorComponentId}
            pulsePhase={pulsePhase}
          />
          <RegionOverlayLayer
            regions={displayVirtualRegions}
            viewport={engine.viewport}
            visible={showVirtualRegions && displayVirtualRegions.length > 0}
          />
          <NetGraphOverlayLayer
            highlightedComponentIds={pdfNet.highlightedComponentIds}
            positions={engine.positions}
            viewport={engine.viewport}
            visible={
              !!pdfNet.netGraph && pdfNet.highlightedComponentIds.length > 0
            }
            color={pdfNet.activeNet?.color ?? '#00d4ff'}
          />
          {pdfNet.netGraph && (
            <PdfNetsPanel
              nets={pdfNet.netGraph.nets}
              activeNetId={pdfNet.highlightedNetId}
              onHighlight={pdfNet.highlightNet}
              onClear={pdfNet.clearNetHighlight}
            />
          )}
          <ComponentTooltip tooltip={interaction.tooltip} containerRef={engine.viewportRef} />
          {virtualRegions.length > 0 && (
            <button
              type="button"
              onClick={() => setShowVirtualRegions((v) => !v)}
              className="absolute top-3 left-3 z-10 px-2 py-1 rounded-lg text-[10px] border font-mono transition-all"
              style={{
                borderColor: showVirtualRegions ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.15)',
                background: showVirtualRegions ? 'rgba(245,158,11,0.12)' : 'rgba(3,6,12,0.85)',
                color: showVirtualRegions ? '#fbbf24' : 'rgba(255,255,255,0.4)',
              }}
              title="Regiões virtuais do schematic PDF"
            >
              {showVirtualRegions ? '◧ Regiões ON' : '◨ Regiões OFF'}
            </button>
          )}
          {showOverlayPanel && (
            <OverlayPanel overlay={overlay} onToggle={handleToggleOverlay}/>
          )}
        </div>

        <ComponentInspectorPanel
          selected={engine.selected}
          metadata={interaction.selectedMetadata}
          voltages={voltages}
          onCenter={() => engine.selected && engine.centerOnComponent(engine.selected)}
          netName={engine.netName}
          netVoltage={engine.netVoltage}
          netColor={engine.netColor}
          connectedIds={engine.connectedIds}
          components={components}
          onFocusComponent={(name) => interaction.focusComponent(name, { fromSearch: true })}
          deviceId={deviceId}
        />
      </div>
    </div>
  )
}

export default function BoardViewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#030608] flex items-center justify-center text-white/40 font-mono">Carregando...</div>}>
      <BoardViewContent/>
    </Suspense>
  )
}

