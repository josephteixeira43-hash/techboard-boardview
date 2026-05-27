'use client'
// src/components/boardview/BoardViewer.tsx
// Canvas principal do BoardView — usa CoordinateEngine + ViewportManager + HighlightEngine

import { useRef, useCallback } from 'react'
import type { BoardComponent, ViewportState, ComputedPosition, ComponentHighlight } from '@/types/board'
import { CATEGORY_COLORS } from '@/lib/constants'
import { COMP_W, COMP_H, BOARD_W, BOARD_H } from '@/core/boardview/CoordinateEngine'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return `rgba(100,116,139,${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface BoardViewerProps {
  // Dados
  components: BoardComponent[]
  positions: Map<string, ComputedPosition>
  highlights: Map<string, ComponentHighlight>
  selected: BoardComponent | null
  activeLayer: string
  viewport: ViewportState
  boardImage: string | null
  loading: boolean

  // Refs e eventos
  viewportRef: React.RefObject<HTMLDivElement>
  onMouseDown: (e: React.MouseEvent) => void
  onCanvasClick: (e: React.MouseEvent<HTMLDivElement>) => void
  onDoubleClick?: () => void

  // Cursor
  isDragging?: boolean
}

// ─── Componente individual ────────────────────────────────────────────────────

interface ComponentNodeProps {
  comp: BoardComponent
  pos: ComputedPosition
  highlight: ComponentHighlight | null
  hasAnyHighlight: boolean
  isActiveSide: boolean
  onClick: (e: React.MouseEvent) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

function ComponentNode({
  comp, pos, highlight, hasAnyHighlight, isActiveSide,
  onClick, onMouseEnter, onMouseLeave,
}: ComponentNodeProps) {
  const color   = CATEGORY_COLORS[comp.category] || CATEGORY_COLORS.OTHER
  const isSelected  = highlight?.type === 'selected'
  const isConnected = highlight?.type === 'connected'
  const isSearch    = highlight?.type === 'search'
  const isAI        = highlight?.type === 'ai'
  const isHighlighted = !!highlight

  // Opacidade: se há highlight mas este não está, fica transparente
  const opacity = hasAnyHighlight && !isHighlighted ? 0.2 : isActiveSide ? 1 : 0.35

  // Background
  const bg = isSelected
    ? hexToRgba(color, 0.85)
    : isConnected
    ? hexToRgba(color, 0.45)
    : isActiveSide
    ? hexToRgba(color, 0.15)
    : hexToRgba(color, 0.08)

  // Border
  const borderColor = isSelected || isSearch
    ? color
    : isConnected
    ? `${color}bb`
    : isAI
    ? '#00d4ff'
    : `${color}55`

  const borderWidth = isSelected || isSearch ? 2 : 1

  // Glow
  const boxShadow = isSelected
    ? highlight?.color
      ? `0 0 10px ${highlight.color}, 0 0 20px ${highlight.color}66, 0 0 40px ${highlight.color}33`
      : 'none'
    : isConnected
    ? `0 0 6px ${color}88`
    : isSearch
    ? `0 0 14px #00d4ff, 0 0 28px #00d4ff66`
    : 'none'

  const isLarge = COMP_W >= 54

  return (
    <div
      data-component-id={comp.id}
      role="button"
      tabIndex={0}
      onMouseDown={e => e.stopPropagation()}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: COMP_W,
        height: COMP_H,
        opacity,
        background: bg,
        border: `${borderWidth}px solid ${borderColor}`,
        borderRadius: isLarge ? 6 : 4,
        boxShadow,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'opacity 0.15s, box-shadow 0.15s',
        zIndex: isSelected ? 20 : isHighlighted ? 10 : 1,
        // Animação CSS para selecionado
        animation: isSelected || isSearch ? 'boardNeonPulse 1.4s ease-in-out infinite' : 'none',
        // CSS var para animação
        ['--neon' as string]: highlight?.color || color,
      }}
    >
      {/* Pads IC para componentes grandes */}
      {isLarge && (
        <svg
          style={{ position: 'absolute', inset: -4, width: COMP_W + 8, height: COMP_H + 8, pointerEvents: 'none' }}
          viewBox={`0 0 ${COMP_W + 8} ${COMP_H + 8}`}
        >
          {/* Pads top */}
          {Array.from({ length: Math.floor(COMP_W / 14) }).map((_, i) => (
            <rect key={`pt${i}`} x={8 + i * 14} y={0} width={8} height={4}
              fill={`${color}66`} rx={1} />
          ))}
          {/* Pads bottom */}
          {Array.from({ length: Math.floor(COMP_W / 14) }).map((_, i) => (
            <rect key={`pb${i}`} x={8 + i * 14} y={COMP_H + 4} width={8} height={4}
              fill={`${color}66`} rx={1} />
          ))}
          {/* Pads left */}
          {Array.from({ length: Math.floor(COMP_H / 12) }).map((_, i) => (
            <rect key={`pl${i}`} x={0} y={8 + i * 12} width={4} height={8}
              fill={`${color}66`} rx={1} />
          ))}
          {/* Pads right */}
          {Array.from({ length: Math.floor(COMP_H / 12) }).map((_, i) => (
            <rect key={`pr${i}`} x={COMP_W + 4} y={8 + i * 12} width={4} height={8}
              fill={`${color}66`} rx={1} />
          ))}
        </svg>
      )}

      {/* Nome do componente */}
      <span style={{
        color: isHighlighted ? color : `${color}cc`,
        fontSize: 10,
        fontWeight: 700,
        fontFamily: 'monospace',
        letterSpacing: '0.04em',
        maxWidth: COMP_W - 8,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
      }}>
        {comp.name}
      </span>

      {/* Categoria */}
      <span style={{
        color: `${color}77`,
        fontSize: 8,
        fontFamily: 'monospace',
        maxWidth: COMP_W - 8,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        marginTop: 2,
      }}>
        {comp.category}
      </span>
    </div>
  )
}

// ─── BoardViewer principal ────────────────────────────────────────────────────

export default function BoardViewer({
  components,
  positions,
  highlights,
  selected,
  activeLayer,
  viewport,
  boardImage,
  loading,
  viewportRef,
  onMouseDown,
  onCanvasClick,
  onDoubleClick,
  isDragging = false,
}: BoardViewerProps) {
  const hoveredRef = useRef<string | null>(null)

  const handleComponentClick = useCallback((comp: BoardComponent) => (e: React.MouseEvent) => {
    e.stopPropagation()
    // O click é propagado para onCanvasClick via data-component-id
    // mas aqui prevenimos o drag de triggar click
  }, [])

  const hasAnyHighlight = highlights.size > 0

  return (
    <div
      ref={viewportRef}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
        background: '#060c18',
        userSelect: 'none',
      }}
      onMouseDown={onMouseDown}
      onClick={onCanvasClick}
      onDoubleClick={onDoubleClick}
    >
      {/* Loading */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(6,12,24,0.9)',
        }}>
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
            <div style={{
              width: 40, height: 40, margin: '0 auto 12px',
              border: '2px solid rgba(0,212,255,0.2)',
              borderTop: '2px solid #00d4ff',
              borderRadius: '50%',
              animation: 'boardSpin 0.8s linear infinite',
            }} />
            <div style={{ fontSize: 13, fontFamily: 'monospace' }}>Carregando componentes...</div>
          </div>
        </div>
      )}

      {/* Canvas transformado */}
      <div
        style={{
          position: 'absolute',
          transformOrigin: '0 0',
          transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
          width: BOARD_W,
          height: BOARD_H,
          willChange: 'transform',
        }}
      >
        {/* Board PCB */}
        <div style={{
          position: 'relative',
          width: BOARD_W,
          height: BOARD_H,
          borderRadius: 4,
          overflow: 'hidden',
          background: boardImage
            ? '#0a1a10'
            : 'linear-gradient(145deg, #0a2216 0%, #0d3320 35%, #0a2818 70%, #071f12 100%)',
          boxShadow: '0 0 80px rgba(0,0,0,0.8)',
        }}>
          {/* Imagem da placa */}
          {boardImage && (
            <img
              src={boardImage}
              alt="PCB"
              draggable={false}
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            />
          )}

          {/* Grid PCB */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            opacity: boardImage ? 0.15 : 1,
            backgroundImage: `
              linear-gradient(90deg, rgba(52,211,153,0.12) 1px, transparent 1px),
              linear-gradient(rgba(52,211,153,0.12) 1px, transparent 1px),
              linear-gradient(90deg, rgba(16,185,129,0.05) 1px, transparent 1px),
              linear-gradient(rgba(16,185,129,0.05) 1px, transparent 1px)
            `,
            backgroundSize: '80px 80px, 80px 80px, 20px 20px, 20px 20px',
          }} />

          {/* Trilhas decorativas */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            opacity: boardImage ? 0.12 : 0.35,
            backgroundImage: `
              repeating-linear-gradient(0deg, transparent, transparent 38px, rgba(34,197,94,0.12) 38px, rgba(34,197,94,0.12) 40px),
              repeating-linear-gradient(90deg, transparent, transparent 58px, rgba(34,197,94,0.08) 58px, rgba(34,197,94,0.08) 60px)
            `,
          }} />

          {/* Borda interna */}
          <div style={{
            position: 'absolute', inset: 16,
            border: '1px solid rgba(52,211,153,0.15)',
            borderRadius: 2, pointerEvents: 'none',
            boxShadow: 'inset 0 0 60px rgba(0,0,0,0.4)',
          }} />

          {/* Componentes */}
          {components.map(comp => {
            const pos = positions.get(comp.id)
            if (!pos) return null
            const highlight = highlights.get(comp.id) ?? null
            const isActiveSide = comp.side === activeLayer

            return (
              <ComponentNode
                key={comp.id}
                comp={comp}
                pos={pos}
                highlight={highlight}
                hasAnyHighlight={hasAnyHighlight}
                isActiveSide={isActiveSide}
                onClick={(e) => { e.stopPropagation(); onCanvasClick(e) }}
                onMouseEnter={() => { hoveredRef.current = comp.id }}
                onMouseLeave={() => { hoveredRef.current = null }}
              />
            )
          })}
        </div>
      </div>

      {/* Animações globais */}
      <style>{`
        @keyframes boardNeonPulse {
          0%, 100% {
            box-shadow: 0 0 6px var(--neon), 0 0 12px var(--neon)66;
            transform: scale(1.05);
          }
          50% {
            box-shadow: 0 0 14px var(--neon), 0 0 28px var(--neon)99, 0 0 50px var(--neon)44;
            transform: scale(1.1);
          }
        }
        @keyframes boardSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

