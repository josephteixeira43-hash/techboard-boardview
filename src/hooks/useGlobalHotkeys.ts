'use client'
// hooks/useGlobalHotkeys.ts
// Intercepta atalhos globais sem conflito com o navegador.
// Usa capture: true em document E window para garantir
// que preventDefault() rode antes do browser processar Ctrl+K etc.

import { useEffect } from 'react'

export interface HotkeyConfig {
  /** Tecla alvo (case-insensitive). Ex: 'k', 'Escape', 'F1' */
  key: string
  /** Requer Ctrl (ou Cmd no Mac) */
  ctrl?: boolean
  /** Requer Shift */
  shift?: boolean
  /** Requer Alt */
  alt?: boolean
  /** Função executada quando o atalho é ativado */
  handler: () => void
  /** Descrição legível — útil para debug e paleta de comandos */
  description?: string
}

export function useGlobalHotkeys(hotkeys: HotkeyConfig[]) {
  useEffect(() => {
    if (!hotkeys.length) return

    const handler = (e: KeyboardEvent) => {
      for (const hk of hotkeys) {
        const keyMatch   = e.key.toLowerCase() === hk.key.toLowerCase()
        // ctrl/meta: se hk.ctrl=true exige ctrl/meta; se false garante que NÃO está pressionado
        const ctrlMatch  = hk.ctrl
          ? (e.ctrlKey || e.metaKey)
          : (!e.ctrlKey && !e.metaKey)
        const shiftMatch = hk.shift ? e.shiftKey : !e.shiftKey
        const altMatch   = hk.alt   ? e.altKey   : !e.altKey

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          hk.handler()
          return
        }
      }
    }

    // Capture phase garante interceptação antes do browser (ex: Ctrl+K abre bookmarks)
    document.addEventListener('keydown', handler, { capture: true })
    window.addEventListener('keydown', handler, { capture: true })

    return () => {
      document.removeEventListener('keydown', handler, { capture: true })
      window.removeEventListener('keydown', handler, { capture: true })
    }
  // hotkeys muda referência a cada render — usar JSON como dep evita re-registro desnecessário
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(hotkeys.map(h => ({ key: h.key, ctrl: h.ctrl, shift: h.shift, alt: h.alt })))])
}
