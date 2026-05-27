import { BoardDebugger } from './BoardDebugger'
import type { BoardComponent } from '@/types/board'

export interface GlobalDebugState {
  components: BoardComponent[]
  hasRealGeometry: boolean
  isOCRActive: boolean
  interactionEnabled?: boolean
  selectedComponent?: BoardComponent | null
}

export function initGlobalDebug() {
  if (typeof window === 'undefined') return

  window.__BOARD_DEBUG__ = {
    components: [],
    hasRealGeometry: false,
    isOCRActive: true,
    interactionEnabled: false,
    selectedComponent: null,
    debugger: BoardDebugger,

    timeline: () => {
      const events = BoardDebugger.getEvents()
      console.group('📅 Debug Timeline')
      events.forEach((event, i) => {
        console.log(`${i}: [${event.stage}] ${event.level} - ${event.message}`)
      })
      console.groupEnd()
    },

    findComponent: (id: string) => {
      const components = window.__BOARD_DEBUG__?.components ?? []
      const component = components.find(
        (c) => (c as BoardComponent).id === id || (c as BoardComponent).name === id
      )
      if (component) {
        console.log('Found component:', component)
      } else {
        console.log('Component not found:', id)
      }
      return component
    },

    report: () => BoardDebugger.exportReport(),
    testGeometryFlow: async () => {
      const { testGeometryFlow } = await import('./TestGeometryFlow')
      return testGeometryFlow()
    },
    testCanonicalModel: async () => {
      console.warn('testCanonicalModel removed — canonical architecture reverted')
      return false
    },
  }
}

export function syncGlobalDebug(state: GlobalDebugState) {
  if (typeof window === 'undefined' || !window.__BOARD_DEBUG__) return
  window.__BOARD_DEBUG__.components = state.components
  window.__BOARD_DEBUG__.hasRealGeometry = state.hasRealGeometry
  window.__BOARD_DEBUG__.isOCRActive = state.isOCRActive
  if (state.interactionEnabled !== undefined) {
    window.__BOARD_DEBUG__.interactionEnabled = state.interactionEnabled
  }
  if (state.selectedComponent !== undefined) {
    window.__BOARD_DEBUG__.selectedComponent = state.selectedComponent ?? null
  }
}
