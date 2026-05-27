export type DebugStage =
  | 'PARSER'
  | 'FILE_IMPORT'
  | 'REACT_STATE'
  | 'BOARD_VIEWER'
  | 'HIT_DETECTION'
  | 'INTERACTION_HOOK'
  | 'OCR_SYSTEM'
  | 'RENDER_ENGINE'
  | 'DEBUG'

export type DebugLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'TRACE'

export interface DebugEvent {
  stage: DebugStage
  level: DebugLevel
  message: string
  data?: unknown
  timestamp: number
  callStack?: string
}

class BoardDebuggerClass {
  private events: DebugEvent[] = []
  private enabled = true
  private logToConsole = true
  private logToStorage = false
  readonly sessionId: string

  constructor() {
    this.sessionId = `debug_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    if (typeof window !== 'undefined') {
      console.log(`🐛 Board Debugger initialized - Session: ${this.sessionId}`)
    }
  }

  log(stage: DebugStage, level: DebugLevel, message: string, data?: unknown) {
    if (!this.enabled) return

    const event: DebugEvent = {
      stage,
      level,
      message,
      data: this.sanitizeData(data),
      timestamp: Date.now(),
      callStack: new Error().stack,
    }

    this.events.push(event)

    if (this.logToConsole) {
      this.consoleLog(event)
    }

    if (this.logToStorage) {
      this.saveToStorage(event)
    }

    this.analyzeEvent(event)
  }

  private sanitizeData(data: unknown): unknown {
    if (data == null) return data

    try {
      const seen = new WeakSet<object>()
      return JSON.parse(
        JSON.stringify(data, (_key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) return '[Circular]'
            seen.add(value)
          }
          return value
        })
      )
    } catch {
      return { error: 'Unable to serialize data', originalType: typeof data }
    }
  }

  private consoleLog(event: DebugEvent) {
    const { stage, level, message, data, timestamp } = event
    const prefix = `[${stage}] ${new Date(timestamp).toISOString().slice(11, 23)}`

    const styles: Record<DebugStage, string> = {
      PARSER: 'background: #4CAF50; color: white; padding: 2px 4px; border-radius: 3px;',
      FILE_IMPORT: 'background: #2196F3; color: white; padding: 2px 4px; border-radius: 3px;',
      REACT_STATE: 'background: #9C27B0; color: white; padding: 2px 4px; border-radius: 3px;',
      BOARD_VIEWER: 'background: #FF9800; color: white; padding: 2px 4px; border-radius: 3px;',
      HIT_DETECTION: 'background: #E91E63; color: white; padding: 2px 4px; border-radius: 3px;',
      INTERACTION_HOOK: 'background: #00BCD4; color: white; padding: 2px 4px; border-radius: 3px;',
      OCR_SYSTEM: 'background: #F44336; color: white; padding: 2px 4px; border-radius: 3px;',
      RENDER_ENGINE: 'background: #795548; color: white; padding: 2px 4px; border-radius: 3px;',
      DEBUG: 'background: #607D8B; color: white; padding: 2px 4px; border-radius: 3px;',
    }

    const levelEmoji: Record<DebugLevel, string> = {
      INFO: 'ℹ️',
      WARN: '⚠️',
      ERROR: '❌',
      SUCCESS: '✅',
      TRACE: '🔍',
    }

    console.groupCollapsed(
      `%c${prefix} ${levelEmoji[level]} ${message}`,
      styles[stage] ?? 'background: #666; color: white;'
    )

    if (data) {
      console.log('Data:', data)
    }

    if (level === 'TRACE' && event.callStack) {
      console.log('Call stack:', event.callStack)
    }

    console.groupEnd()
  }

  private analyzeEvent(event: DebugEvent) {
    if (
      event.stage === 'PARSER' &&
      (event.message.includes('ZERO components') ||
        event.message.includes('parsed 0 components'))
    ) {
      console.error('🚨 CRITICAL: Parser found zero components!')
    }

    if (
      event.stage === 'REACT_STATE' &&
      event.message.includes('components changed') &&
      event.data &&
      typeof event.data === 'object' &&
      'newLength' in event.data &&
      'oldLength' in event.data
    ) {
      const { newLength, oldLength } = event.data as { newLength: number; oldLength: number }
      if (newLength === 0 && oldLength > 0) {
        console.error('🚨 CRITICAL: Components state unexpectedly emptied!')
        this.log('REACT_STATE', 'ERROR', 'CRITICAL: Component state reset to empty', event.data)
      }
    }

    if (
      event.stage === 'OCR_SYSTEM' &&
      event.message.includes('OCR') &&
      event.data &&
      typeof event.data === 'object' &&
      'hasRealGeometry' in event.data &&
      (event.data as { hasRealGeometry: boolean }).hasRealGeometry === true
    ) {
      console.error('🚨 CRITICAL: OCR active despite real geometry!')
      this.log('OCR_SYSTEM', 'ERROR', 'CRITICAL: False OCR activation', event.data)
    }
  }

  private saveToStorage(event: DebugEvent) {
    try {
      const stored = localStorage.getItem('board_debug_events') || '[]'
      const events = JSON.parse(stored) as DebugEvent[]
      events.push(event)
      if (events.length > 1000) events.shift()
      localStorage.setItem('board_debug_events', JSON.stringify(events))
    } catch (e) {
      console.warn('Failed to save debug event to storage:', e)
    }
  }

  getEvents(filter?: { stage?: DebugStage; level?: DebugLevel }) {
    let filtered = this.events
    if (filter?.stage) filtered = filtered.filter((e) => e.stage === filter.stage)
    if (filter?.level) filtered = filtered.filter((e) => e.level === filter.level)
    return filtered
  }

  clearEvents() {
    this.events = []
    try {
      localStorage.removeItem('board_debug_events')
    } catch {
      /* ignore */
    }
  }

  exportReport() {
    const report = {
      sessionId: this.sessionId,
      timestamp: Date.now(),
      totalEvents: this.events.length,
      events: this.events,
      summary: {
        byStage: this.events.reduce(
          (acc, e) => {
            acc[e.stage] = (acc[e.stage] || 0) + 1
            return acc
          },
          {} as Record<string, number>
        ),
        byLevel: this.events.reduce(
          (acc, e) => {
            acc[e.level] = (acc[e.level] || 0) + 1
            return acc
          },
          {} as Record<string, number>
        ),
        errors: this.events.filter((e) => e.level === 'ERROR').length,
        warnings: this.events.filter((e) => e.level === 'WARN').length,
      },
    }

    console.log('📊 Debug Report:', report)
    return report
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }

  setLogToStorage(enabled: boolean) {
    this.logToStorage = enabled
  }
}

export const BoardDebugger = new BoardDebuggerClass()
