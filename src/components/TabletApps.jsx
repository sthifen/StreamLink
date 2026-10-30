import React, { useState, useEffect, useRef, useCallback } from 'react'

function pkgColor(pkg) {
  const p = ['#7c6af7','#e05454','#4caf6e','#f0a040','#4aa8d8','#d864d8','#40b4a0','#e08840','#5a9ef5','#c45454']
  let h = 0
  for (let i = 0; i < pkg.length; i++) h = (h * 31 + pkg.charCodeAt(i)) & 0xffffffff
  return p[Math.abs(h) % p.length]
}

// ── App Card ──────────────────────────────────────────────────────────────────
function AppCard({ app, serial, onLaunch }) {
  const [icon, setIcon]   = useState(null)
  const [busy, setBusy]   = useState(false)
  const cardRef           = useRef(null)
  const fetchedRef        = useRef(false)

  useEffect(() => {
    if (!serial || fetchedRef.current) return
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || fetchedRef.current) return
      fetchedRef.current = true
      setBusy(true)
      window.api.adbGetIcon({ serial, pkg: app.packageName })
        .then(r => { if (r?.ok && r.data) setIcon(r.data) })
        .finally(() => setBusy(false))
      obs.disconnect()
    }, { rootMargin: '120px' })
    if (cardRef.current) obs.observe(cardRef.current)
    return () => obs.disconnect()
  }, [serial, app.packageName])

  const color  = pkgColor(app.packageName)
  const letter = app.appName.charAt(0).toUpperCase()

  return (
    <button
      ref={cardRef}
      onClick={() => onLaunch(app)}
      title={app.packageName}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        padding: '14px 8px 10px',
        background: 'rgba(255,255,255,0.03)',
        border: '0.5px solid rgba(255,255,255,0.07)',
        borderRadius: 14, cursor: 'pointer',
        transition: 'background 0.15s, transform 0.1s, border-color 0.15s',
        color: 'inherit', fontFamily: 'inherit',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}
      onMouseDown={e  => { e.currentTarget.style.transform = 'scale(0.95)' }}
      onMouseUp={e    => { e.currentTarget.style.transform = 'translateY(-2px)' }}
    >
      {/* Icon */}
      <div style={{
        width: 54, height: 54, borderRadius: 14, overflow: 'hidden', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: icon ? 'transparent' : `${color}18`,
        border: icon ? 'none' : `1px solid ${color}30`,
        position: 'relative',
      }}>
        {icon ? (
          <img src={icon} alt={app.appName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
        ) : (
          <span style={{ fontSize: 24, fontWeight: 700, color }}>{letter}</span>
        )}
        {busy && !icon && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: color, animation: 'appDot 1s infinite' }} />
          </div>
        )}
      </div>

      {/* Name */}
      <span style={{
        fontSize: 11, color: 'var(--text-2)',
        maxWidth: 84, overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', textAlign: 'center', lineHeight: 1.3,
      }}>
        {app.appName}
      </span>
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TabletApps({ activeDevice }) {
  const [apps,    setApps]    = useState([])
  const [loading, setLoading] = useState(false)
  const [search,  setSearch]  = useState('')
  const serial = activeDevice?.serial

  const loadApps = useCallback(async () => {
    if (!serial) return
    setLoading(true)
    const r = await window.api.adbListApps({ serial })
    if (r?.ok) setApps(r.apps)
    setLoading(false)
  }, [serial])

  useEffect(() => {
    if (serial) loadApps()
    else setApps([])
  }, [serial, loadApps])

  const filtered = search
    ? apps.filter(a =>
        a.appName.toLowerCase().includes(search.toLowerCase()) ||
        a.packageName.toLowerCase().includes(search.toLowerCase())
      )
    : apps

  const launch = (app) => {
    window.api.adbLaunchAppWindow({ serial, pkg: app.packageName, appName: app.appName })
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'transparent' }}>

      {/* Toolbar */}
      <div style={{
        padding: '12px 16px 10px',
        display: 'flex', alignItems: 'center', gap: 10,
        flexShrink: 0,
        borderBottom: '0.5px solid var(--border-lit)',
      }}>
        <input
          type="text"
          placeholder="Buscar apps..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, padding: '7px 12px', borderRadius: 9,
            background: 'rgba(255,255,255,0.06)',
            border: '0.5px solid var(--border-lit)',
            color: 'var(--text-h)', fontSize: 13, outline: 'none',
            fontFamily: 'inherit',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlur={e  => e.target.style.borderColor = 'var(--border-lit)'}
        />
        {serial && (
          <button
            onClick={loadApps}
            disabled={loading}
            style={{
              padding: '7px 14px', borderRadius: 9, fontSize: 12, fontWeight: 600,
              background: 'rgba(255,255,255,0.06)', border: '0.5px solid var(--border-lit)',
              color: 'var(--text-2)', cursor: 'pointer', whiteSpace: 'nowrap',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Cargando…' : '↻ Recargar'}
          </button>
        )}
        {filtered.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {filtered.length} apps
          </span>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {/* No device */}
        {!serial && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-3)' }}>
            <span style={{ fontSize: 40 }}>📱</span>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)' }}>Sin dispositivo</p>
            <span style={{ fontSize: 13 }}>Conecta la tablet por USB</span>
          </div>
        )}

        {/* Loading */}
        {serial && loading && apps.length === 0 && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
            <p style={{ fontSize: 14 }}>Cargando apps…</p>
          </div>
        )}

        {/* Grid */}
        {serial && filtered.length > 0 && (
          <div style={{
            height: '100%', overflowY: 'auto', padding: '14px 16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
            gap: 10, alignContent: 'start',
          }}>
            {filtered.map(app => (
              <AppCard key={app.packageName} app={app} serial={serial} onLaunch={launch} />
            ))}
          </div>
        )}

        {/* Empty search */}
        {serial && !loading && apps.length > 0 && filtered.length === 0 && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
            <p>Sin resultados para "{search}"</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes appDot {
          0%,100% { opacity: 0.3; transform: scale(1) }
          50% { opacity: 1; transform: scale(1.5) }
        }
        ::-webkit-scrollbar { width: 4px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px }
      `}</style>
    </div>
  )
}
