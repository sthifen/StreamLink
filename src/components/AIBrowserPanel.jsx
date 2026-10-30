import React, { useState, useRef } from 'react'
import { ChevronLeft, X } from 'lucide-react'

const AI_TABS = [
  {
    id: 'claude',
    label: 'Claude',
    url: 'https://claude.ai',
    color: '#d97706',
    emoji: '🟠',
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    url: 'https://chatgpt.com',
    color: '#10b981',
    emoji: '🟢',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    url: 'https://gemini.google.com',
    color: '#4f6ef7',
    emoji: '🔵',
  },
  {
    id: 'claudecode',
    label: 'Docs',
    url: 'https://docs.anthropic.com',
    color: '#8b5cf6',
    emoji: '📚',
  },
]

export default function AIBrowserPanel({ hasWallpaper }) {
  const [open,   setOpen]   = useState(false)
  const [active, setActive] = useState('claude')
  const [urls,   setUrls]   = useState(
    Object.fromEntries(AI_TABS.map(t => [t.id, t.url]))
  )
  const [inputs, setInputs] = useState(
    Object.fromEntries(AI_TABS.map(t => [t.id, t.url]))
  )
  const webviewRefs = useRef({})

  const PANEL_W = 400
  const currentTab = AI_TABS.find(t => t.id === active)

  const navigate = (id, url) => {
    let u = url.trim()
    if (!u.startsWith('http')) u = 'https://' + u
    setUrls(v => ({ ...v, [id]: u }))
    setInputs(v => ({ ...v, [id]: u }))
  }

  const glassStyle = { background: 'rgba(12,14,20,0.82)', backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)' }

  return (
    <>
      {/* ── Botón flotante ── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Asistentes IA"
        style={{
          position: 'fixed',
          right: open ? PANEL_W : 0,
left: 'auto',
          top: '40%',
          transform: 'translateY(-50%)',
          zIndex: 150,
          width: 28, height: 80,
         borderRadius: '10px 0 0 10px',
          background: open ? currentTab?.color : (hasWallpaper ? 'rgba(139,92,246,0.85)' : '#8b5cf6'),
          backdropFilter: 'blur(8px)',
          border: 'none', cursor: 'pointer',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 4,
          transition: 'right 0.38s cubic-bezier(0.4,0,0.2,1), background 0.2s',
          boxShadow: '3px 0 16px rgba(139,92,246,0.3)',
        }}
      >
        <ChevronLeft
          size={14} color="#fff"
          style={{ transition: 'transform 0.3s', transform: open ? 'rotate(0deg)' : 'rotate(180deg)' }}
        />
        <span style={{ fontSize: 9, color: '#fff', fontWeight: 800, letterSpacing: 0.3, writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
          AI
        </span>
      </button>

      {/* ── Panel deslizante ── */}
      <div style={{
        position: 'fixed',
        right: open ? 0 : -PANEL_W,
left: 'auto',
        top: 0, bottom: 0,
        width: PANEL_W,
        zIndex: 149,
        display: 'flex', flexDirection: 'column',
        transition: 'right 0.38s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: open ? '4px 0 32px rgba(0,0,0,0.35)' : 'none',
        ...glassStyle,
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderBottom: '0.5px solid var(--border-lit)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-h)' }}>✨ Asistentes IA</span>
          <button onClick={() => setOpen(false)} style={{
            marginLeft: 'auto', background: 'var(--bg-elem)', border: 'none',
            borderRadius: 7, padding: '4px 8px', cursor: 'pointer', color: 'var(--text-2)',
            display: 'flex', alignItems: 'center',
          }}><X size={13}/></button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 4, padding: '8px 10px',
          borderBottom: '0.5px solid var(--border-lit)', flexShrink: 0,
        }}>
          {AI_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              style={{
                flex: 1, padding: '6px 4px', borderRadius: 8, border: 'none',
                background: active === t.id ? t.color : 'var(--bg-elem)',
                color: active === t.id ? '#fff' : 'var(--text-2)',
                fontSize: 11, fontWeight: active === t.id ? 700 : 400,
                cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}
            >
              <span style={{ fontSize: 14 }}>{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* URL bar */}
        <div style={{
          display: 'flex', gap: 6, padding: '6px 10px',
          borderBottom: '0.5px solid var(--border-lit)', flexShrink: 0,
          background: 'var(--bg-elem)',
        }}>
          <button
            onClick={() => webviewRefs.current[active]?.goBack?.()}
            style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>‹</button>
          <button
            onClick={() => webviewRefs.current[active]?.goForward?.()}
            style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>›</button>
          <button
            onClick={() => webviewRefs.current[active]?.reload?.()}
            style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>↺</button>
          <input
            value={inputs[active] || ''}
            onChange={e => setInputs(v => ({ ...v, [active]: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && navigate(active, inputs[active])}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6, padding: '4px 10px',
              color: '#fff', fontSize: 11, outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Webviews — solo montar cuando el panel está abierto */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {open && AI_TABS.map(t => (
            <webview
              key={t.id}
              ref={el => { if (el) webviewRefs.current[t.id] = el }}
              src={urls[t.id]}
              partition="persist:aibrowser"
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                display: active === t.id ? 'flex' : 'none',
              }}
            />
          ))}
        </div>
      </div>
    </>
  )
}
