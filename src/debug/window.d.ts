declare global {
  interface Window {
    __BOARD_DEBUG__?: {
      components: unknown[]
      hasRealGeometry: boolean
      isOCRActive: boolean
      interactionEnabled: boolean
      selectedComponent: unknown | null
      debugger: typeof import('./BoardDebugger').BoardDebugger
      timeline: () => void
      findComponent: (id: string) => unknown
      report: () => ReturnType<typeof import('./BoardDebugger').BoardDebugger.exportReport>
      testGeometryFlow: () => Promise<boolean>
      testCanonicalModel: () => Promise<boolean>
    }
    testGeometryFlow?: () => Promise<boolean>
    testCanonicalModel?: () => Promise<boolean>
  }
}

export {}
