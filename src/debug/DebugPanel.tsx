'use client'

import React, { useEffect, useState } from 'react'
import { BoardDebugger, type DebugEvent, type DebugStage } from './BoardDebugger'

const STAGES: Array<DebugStage | 'ALL'> = [
  'ALL',
  'PARSER',
  'FILE_IMPORT',
  'REACT_STATE',
  'BOARD_VIEWER',
  'HIT_DETECTION',
  'INTERACTION_HOOK',
  'OCR_SYSTEM',
  'RENDER_ENGINE',
  'DEBUG',
]

export const DebugPanel: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false)
  const [events, setEvents] = useState<DebugEvent[]>([])
  const [filter, setFilter] = useState<string>('ALL')

  useEffect(() => {
    const updateEvents = () => setEvents(BoardDebugger.getEvents())
    updateEvents()
    const interval = setInterval(updateEvents, 1000)
    return () => clearInterval(interval)
  }, [])

  if (!isVisible) {
    return (
      <button
        type="button"
        onClick={() => setIsVisible(true)}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 9999,
          background: '#333',
          color: 'white',
          border: 'none',
          borderRadius: 5,
          padding: '8px 12px',
          cursor: 'pointer',
          fontFamily: 'monospace',
        }}
      >
        🐛 Debug
      </button>
    )
  }

  const filteredEvents =
    filter === 'ALL' ? events : events.filter((e) => e.stage === filter)

  const errorCount = events.filter((e) => e.level === 'ERROR').length
  const warningCount = events.filter((e) => e.level === 'WARN').length

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 600,
        height: 400,
        background: 'rgba(0,0,0,0.95)',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: 12,
        borderRadius: 5,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 9999,
        boxShadow: '0 0 20px rgba(0,0,0,0.5)',
      }}
    >
      <div
        style={{
          padding: 10,
          background: '#222',
          borderBottom: '1px solid #444',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          🐛 Board Debugger
          <span style={{ marginLeft: 10, fontSize: 10 }}>
            {errorCount > 0 && `❌ ${errorCount} `}
            {warningCount > 0 && `⚠️ ${warningCount} `}
          </span>
        </div>
        <div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              background: '#333',
              color: '#0f0',
              border: '1px solid #0f0',
              marginRight: 10,
            }}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              BoardDebugger.clearEvents()
              setEvents([])
            }}
            style={{
              background: '#333',
              color: '#0f0',
              border: '1px solid #0f0',
              marginRight: 10,
            }}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => BoardDebugger.exportReport()}
            style={{
              background: '#333',
              color: '#0f0',
              border: '1px solid #0f0',
              marginRight: 10,
            }}
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => setIsVisible(false)}
            style={{ background: '#f00', color: 'white', border: 'none', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
        {filteredEvents
          .slice()
          .reverse()
          .map((event, i) => (
            <div
              key={`${event.timestamp}-${i}`}
              role="button"
              tabIndex={0}
              style={{
                marginBottom: 5,
                borderBottom: '1px solid #333',
                padding: 5,
                cursor: 'pointer',
                background:
                  event.level === 'ERROR'
                    ? 'rgba(255,0,0,0.2)'
                    : event.level === 'WARN'
                      ? 'rgba(255,255,0,0.1)'
                      : 'transparent',
              }}
              onClick={() => console.log(event)}
              onKeyDown={(e) => e.key === 'Enter' && console.log(event)}
            >
              <span style={{ color: '#888' }}>[{event.stage}]</span>{' '}
              <span
                style={{
                  color:
                    event.level === 'ERROR'
                      ? '#f00'
                      : event.level === 'WARN'
                        ? '#ff0'
                        : event.level === 'SUCCESS'
                          ? '#0f0'
                          : '#fff',
                }}
              >
                {event.level}
              </span>{' '}
              {event.message}
            </div>
          ))}
      </div>
    </div>
  )
}
