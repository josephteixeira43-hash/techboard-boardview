'use client'

import { useEffect } from 'react'
import { DebugPanel } from './DebugPanel'
import { initGlobalDebug } from './initGlobalDebug'

const isDev = process.env.NODE_ENV === 'development'

export function DebugProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (isDev) initGlobalDebug()
  }, [])

  return (
    <>
      {children}
      {isDev && <DebugPanel />}
    </>
  )
}
