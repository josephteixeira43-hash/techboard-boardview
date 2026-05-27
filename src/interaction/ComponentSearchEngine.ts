import type { BoardComponent } from '@/types/board'
import type { SearchMatch } from '@/types/interaction'
import type { NetEngine } from '@/core/boardview/NetEngine'

const RECENT_KEY = 'techboard-recent-searches'
const MAX_RECENT = 8

export class ComponentSearchEngine {
  private index: BoardComponent[] = []
  private netByComponent = new Map<string, string>()

  build(components: BoardComponent[], netEngine: NetEngine) {
    this.index = components
    this.netByComponent.clear()
    for (const c of components) {
      this.netByComponent.set(c.id, netEngine.getNetName(c.id))
    }
  }

  search(query: string, limit = 12): SearchMatch[] {
    const q = query.trim().toUpperCase()
    if (!q) return []

    const matches: SearchMatch[] = []

    for (const comp of this.index) {
      const name = comp.name.toUpperCase()
      const net = (
        comp.electrical_line?.trim() ||
        this.netByComponent.get(comp.id) ||
        ''
      ).toUpperCase()
      const cat = (comp.category ?? '').toUpperCase()
      const desc = (comp.description ?? '').toUpperCase()

      if (name === q) {
        matches.push({ component: comp, score: 100, matchType: 'name', label: comp.name })
        continue
      }
      if (name.startsWith(q)) {
        matches.push({ component: comp, score: 90, matchType: 'name', label: comp.name })
        continue
      }
      if (name.includes(q)) {
        matches.push({ component: comp, score: 75, matchType: 'name', label: comp.name })
        continue
      }
      if (net.includes(q)) {
        matches.push({
          component: comp,
          score: 70,
          matchType: 'net',
          label: `${comp.name} · ${net}`,
        })
        continue
      }
      if (name.match(/^TP/) && name.includes(q)) {
        matches.push({ component: comp, score: 85, matchType: 'testpoint', label: comp.name })
        continue
      }
      if (cat.includes(q)) {
        matches.push({ component: comp, score: 50, matchType: 'category', label: `${comp.name} (${cat})` })
        continue
      }
      if (desc.includes(q)) {
        matches.push({ component: comp, score: 40, matchType: 'description', label: comp.name })
      }
    }

    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  suggestions(query: string): string[] {
    return this.search(query, 6).map((m) => m.component.name)
  }

  getRecent(): string[] {
    if (typeof window === 'undefined') return []
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    } catch {
      return []
    }
  }

  pushRecent(term: string) {
    if (typeof window === 'undefined' || !term.trim()) return
    const recent = this.getRecent().filter((r) => r !== term)
    recent.unshift(term)
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
  }
}
