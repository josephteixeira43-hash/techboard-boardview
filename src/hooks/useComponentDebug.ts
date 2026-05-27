'use client'

import { useEffect, useRef } from 'react'
import { BoardDebugger } from '@/debug/BoardDebugger'

export function useComponentDebug(componentName: string, props: Record<string, unknown>) {
  const mountTime = useRef(Date.now())
  const renderCount = useRef(0)
  const prevProps = useRef<Record<string, unknown>>({})

  useEffect(() => {
    BoardDebugger.log('RENDER_ENGINE', 'INFO', `${componentName} mounted`, {
      props: Object.keys(props),
      mountTime: new Date(mountTime.current).toISOString(),
    })

    return () => {
      const lifetime = Date.now() - mountTime.current
      BoardDebugger.log('RENDER_ENGINE', 'INFO', `${componentName} unmounted`, {
        lifetime: `${lifetime}ms`,
        totalRenders: renderCount.current,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, [])

  renderCount.current++

  Object.entries(props).forEach(([key, value]) => {
    if (prevProps.current[key] === value) return
    prevProps.current[key] = value

    if (Array.isArray(value)) {
      BoardDebugger.log('RENDER_ENGINE', 'TRACE', `${componentName} prop ${key}`, {
        key,
        type: 'array',
        length: value.length,
        sample: value.slice(0, 3),
      })
    }
  })
}
