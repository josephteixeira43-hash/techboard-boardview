'use client'

import { useEffect, useRef } from 'react'
import { BoardDebugger, type DebugStage } from './BoardDebugger'

export function useBoardDebug(
  stage: DebugStage,
  context: Record<string, unknown>,
  componentName: string
) {
  const prevValues = useRef<Record<string, unknown>>({})

  useEffect(() => {
    Object.entries(context).forEach(([key, value]) => {
      if (prevValues.current[key] !== value) {
        BoardDebugger.log(stage, 'TRACE', `${componentName}: ${key} changed`, {
          key,
          oldValue: prevValues.current[key],
          newValue: value,
          type: typeof value,
          isArray: Array.isArray(value),
          length: Array.isArray(value) ? value.length : undefined,
        })
        prevValues.current[key] = value
      }
    })
  })

  const logLifecycle = (event: 'mount' | 'update' | 'unmount') => {
    BoardDebugger.log(stage, 'INFO', `${componentName} ${event}`, {
      component: componentName,
      event,
      context: Object.keys(context),
    })
  }

  const logRender = (renderCount: number, specificData?: Record<string, unknown>) => {
    BoardDebugger.log(
      stage,
      'TRACE',
      `${componentName} render #${renderCount}`,
      specificData ?? context
    )
  }

  return { logLifecycle, logRender }
}
