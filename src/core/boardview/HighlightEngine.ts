// src/core/boardview/HighlightEngine.ts
// Gerencia highlights de componentes sincronizados com o viewport
// Resolve o problema de highlights desalinhados com zoom/pan

import type { ComponentHighlight, HighlightType } from '@/types/board'
import { CATEGORY_COLORS } from '@/lib/constants'

export class HighlightEngine {
  private highlights = new Map<string, ComponentHighlight>()
  private listeners: Array<(highlights: Map<string, ComponentHighlight>) => void> = []

  subscribe(fn: (highlights: Map<string, ComponentHighlight>) => void): () => void {
    this.listeners.push(fn)
    return () => { this.listeners = this.listeners.filter(l => l !== fn) }
  }

  private notify() {
    this.listeners.forEach(fn => fn(new Map(this.highlights)))
  }

  /**
   * Seleciona um componente — limpa seleção anterior e destaca connected.
   */
  selectComponent(
    componentId: string,
    category: string,
    connectedIds: string[] = []
  ): void {
    this.highlights.clear()
    const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.OTHER

    // Componente principal — animado
    this.highlights.set(componentId, {
      componentId,
      type: 'selected',
      color,
      animated: true,
    })

    // Conectados — sem animação, mesma cor
    connectedIds.forEach(id => {
      if (id !== componentId) {
        this.highlights.set(id, {
          componentId: id,
          type: 'connected',
          color,
          animated: false,
        })
      }
    })

    this.notify()
  }

  /**
   * Destaca resultado de busca.
   */
  highlightSearch(componentId: string, category: string): void {
    const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.OTHER
    this.highlights.set(componentId, {
      componentId,
      type: 'search',
      color,
      animated: true,
    })
    this.notify()
  }

  /**
   * Destaca componentes mencionados pela IA.
   */
  highlightAI(componentIds: string[]): void {
    componentIds.forEach(id => {
      if (!this.highlights.has(id)) {
        this.highlights.set(id, {
          componentId: id,
          type: 'ai',
          color: '#00d4ff',
          animated: false,
        })
      }
    })
    this.notify()
  }

  /**
   * Remove highlight de um componente.
   */
  remove(componentId: string): void {
    this.highlights.delete(componentId)
    this.notify()
  }

  /**
   * Limpa todos os highlights.
   */
  clear(): void {
    this.highlights.clear()
    this.notify()
  }

  /**
   * Retorna o highlight de um componente.
   */
  get(componentId: string): ComponentHighlight | null {
    return this.highlights.get(componentId) ?? null
  }

  /**
   * Verifica se um componente está destacado.
   */
  has(componentId: string): boolean {
    return this.highlights.has(componentId)
  }

  /**
   * Retorna todos os highlights ativos.
   */
  getAll(): Map<string, ComponentHighlight> {
    return new Map(this.highlights)
  }

  /**
   * Retorna a opacidade de um componente baseada no estado atual.
   * Se há seleção ativa, componentes não destacados ficam opacos.
   */
  getOpacity(componentId: string): number {
    if (this.highlights.size === 0) return 1
    if (this.highlights.has(componentId)) return 1
    return 0.2
  }

  /**
   * Retorna o glow CSS para um componente.
   */
  getGlowStyle(componentId: string): string {
    const h = this.highlights.get(componentId)
    if (!h) return 'none'

    if (h.type === 'selected') {
      return `0 0 12px ${h.color}, 0 0 24px ${h.color}66, 0 0 48px ${h.color}33`
    }
    if (h.type === 'connected') {
      return `0 0 8px ${h.color}88, 0 0 16px ${h.color}44`
    }
    if (h.type === 'search') {
      return `0 0 16px #00d4ff, 0 0 32px #00d4ff66`
    }
    if (h.type === 'ai') {
      return `0 0 10px #00d4ff66`
    }
    return 'none'
  }
}

export const highlightEngine = new HighlightEngine()
