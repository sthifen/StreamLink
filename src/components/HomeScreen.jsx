// HomeScreen.jsx — Pantalla de inicio, va dentro del área de contenido de MainApp
// Props: devices, config, setConfig, hasWallpaper, onNavigate(tabId), lang

import React, { useState, useEffect } from 'react'
import { ChevronRight, RefreshCw } from 'lucide-react'

const T = {
  es: {
    greeting_morning:   '☀️ Buenos días',
    greeting_afternoon: '🌤 Buenas tardes',
    greeting_night:     '🌙 Buenas noches',
    connected:    'conectada · USB',
    disconnected: 'Sin dispositivo',
    connect_hint: 'Conecta la tablet por USB',
    android:  'Android 14',
    charging: 'Cargando',
    battery:  'Batería',
    wifi:     'Wi-Fi',
    syncthing: 'Syncthing',
    todo:  '¿Qué quieres hacer hoy?',
    quick: 'Acceso rápido',
    features: [
      { id: 'study',    title: 'Estudio',       desc: 'Abre PDFs, lee y consulta a la IA sobre tu material.',    cta: 'Abrir PDF',           color: '#e8741a' },
      { id: 'notes',    title: 'Notas',          desc: 'Escribe notas por bloques, organízalas en carpetas.',     cta: 'Nueva nota',          color: '#a78bfa' },
      { id: 'screen',   title: 'Espejo',         desc: 'Refleja tu tablet en tiempo real por USB o Wi-Fi.',       cta: 'Iniciar espejo',      color: '#22c55e' },
      { id: 'transfer', title: 'Transferencia',  desc: 'Envía archivos entre el PC y la tablet al instante.',     cta: 'Transferir archivos', color: '#3b82f6' },
    ],
  },
  en: {
    greeting_morning:   '☀️ Good morning',
    greeting_afternoon: '🌤 Good afternoon',
    greeting_night:     '🌙 Good evening',
    connected:    'connected · USB',
    disconnected: 'No device',
    connect_hint: 'Connect the tablet via USB',
    android:  'Android 14',
    charging: 'Charging',
    battery:  'Battery',
    wifi:     'Wi-Fi',
    syncthing: 'Syncthing',
    todo:  'What do you want to do today?',
    quick: 'Quick access',
    features: [
      { id: 'study',    title: 'Study',        desc: 'Open PDFs, read and ask the AI about your material.',      cta: 'Open PDF',            color: '#e8741a' },
      { id: 'notes',    title: 'Notes',         desc: 'Write block notes, organize them in folders.',             cta: 'New note',            color: '#a78bfa' },
      { id: 'screen',   title: 'Mirror',        desc: 'Mirror your tablet screen in real time via USB or Wi-Fi.', cta: 'Start mirror',        color: '#22c55e' },
      { id: 'transfer', title: 'Transfer',      desc: 'Send files between PC and tablet instantly.',              cta: 'Transfer files',      color: '#3b82f6' },
    ],
  },
}

function getGreeting(lang) {
  const h = new Date().getHours()
  const k = h < 12 ? 'greeting_morning' : h < 20 ? 'greeting_afternoon' : 'greeting_night'
  return T[lang][k]
}

function formatDate(lang) {
  const d = new Date().toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  return d.charAt(0).toUpperCase() + d.slice(1)
}

// ── Feature icons ─────────────────────────────────────────────────────────────
const ICONS = {
  study:    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  notes:    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  screen:   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  transfer: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
}

// ── Feature Card ──────────────────────────────────────────────────────────────
function FeatureCard({ feature, onClick, delay }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        borderRadius: 16, padding: '20px 20px 16px', cursor: 'pointer',
        background: hover ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${hover ? feature.color + '40' : 'rgba(255,255,255,0.07)'}`,
        transition: 'all 0.18s ease',
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? `0 8px 28px ${feature.color}18` : 'none',
        animation: `hsSlideUp 0.45s cubic-bezier(0.16,1,0.3,1) ${delay}ms both`,
      }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: 12, marginBottom: 14,
        background: hover ? `${feature.color}28` : `${feature.color}16`,
        border: `1px solid ${feature.color}25`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: feature.color, transition: 'background 0.18s',
      }}>
        {ICONS[feature.id]}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-h)', marginBottom: 6, letterSpacing: '-0.2px' }}>
        {feature.title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.55, marginBottom: 16 }}>
        {feature.desc}
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 12, fontWeight: 600, color: feature.color,
        background: `${feature.color}16`, border: `1px solid ${feature.color}28`,
        borderRadius: 8, padding: '5px 12px',
      }}>
        {feature.cta}
        <ChevronRight size={12} />
      </div>
    </div>
  )
}

// ── Quick access item ─────────────────────────────────────────────────────────
const SECTION_COLORS = { study: '#e8741a', notes: '#a78bfa', screen: '#22c55e', transfer: '#3b82f6' }

function QuickItem({ item, onClick, delay }) {
  const color = SECTION_COLORS[item.section] || 'var(--accent)'
  return (
    <button onClick={onClick} style={{
      flex: 1, display: 'flex', alignItems: 'center', gap: 10,
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
      fontFamily: 'inherit', textAlign: 'left', transition: 'background 0.15s',
      animation: `hsSlideUp 0.4s ease ${delay}ms both`,
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: `${color}16`, border: `1px solid ${color}28`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color,
      }}>
        <div style={{ transform: 'scale(0.75)' }}>{ICONS[item.section]}</div>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{item.label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{item.meta}</div>
      </div>
    </button>
  )
}

// ── Stat badge ────────────────────────────────────────────────────────────────
function StatBadge({ label, value, color }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      background: `${color}0c`, border: `1px solid ${color}20`,
      borderRadius: 10, padding: '8px 14px', minWidth: 88, flexShrink: 0,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function SectionLabel({ text }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
      color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 14,
    }}>{text}</div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function HomeScreen({ devices, config, setConfig, hasWallpaper, onNavigate, lang = 'es' }) {
  const tx = T[lang] || T.es
  const accentColor = config?.appearance?.accentColor || 'var(--accent)'

  const connected = devices?.find(d => d.status === 'device')
  const usbDevice = devices?.find(d => d.status === 'device' && !d.serial?.includes(':'))

  const [battery,     setBattery]     = useState(null)
  const [wifiRssi,    setWifiRssi]    = useState(null)
  const [syncRunning, setSyncRunning] = useState(false)
  const [recentItems, setRecentItems] = useState([
    { label: 'Apuntes_Fisica.pdf',  meta: 'Estudio · Hoy',  section: 'study'    },
    { label: 'Leyes de Newton',      meta: 'Notas · Hoy',    section: 'notes'    },
    { label: 'Última sesión espejo', meta: 'Pantalla · Ayer', section: 'screen'  },
  ])

  // Fetch battery + wifi
  useEffect(() => {
    if (!connected) return
    const fetch = async () => {
      const [battR, wifiR] = await Promise.all([
        window.api?.adbShell({ serial: connected.serial, cmd: 'dumpsys battery' }),
        window.api?.adbShell({ serial: connected.serial, cmd: 'dumpsys wifi | grep RSSI' }),
      ])
      if (battR?.out) {
        const level    = parseInt(battR.out.match(/level:\s*(\d+)/)?.[1]) || null
        const charging = battR.out.match(/status:\s*(\d+)/)?.[1] === '2'
        setBattery({ level, charging })
      }
      if (wifiR?.out) {
        const rssi = wifiR.out.match(/RSSI:\s*(-?\d+)/)?.[1]
        setWifiRssi(rssi ? `${rssi} dBm` : null)
      }
    }
    fetch()
  }, [connected?.serial])

  // Syncthing status
  useEffect(() => {
    window.api?.syncthingStatus?.().then(r => setSyncRunning(r?.running))
  }, [])

  // Recent from config
  useEffect(() => {
    if (config?.recentItems?.length) setRecentItems(config.recentItems.slice(0, 3))
  }, [config])

  const deviceName = connected?.model || connected?.serial || 'samsung SM-P613'

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '28px 28px 24px', background: 'transparent' }}>

      {/* Greeting */}
      <div style={{ marginBottom: 24, animation: 'hsSlideUp 0.4s ease both' }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-h)', letterSpacing: '-0.5px', marginBottom: 4 }}>
          {getGreeting(lang)}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{formatDate(lang)}</div>
      </div>

      {/* Status strip */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, animation: 'hsSlideUp 0.4s ease 60ms both' }}>
        {/* Connection */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 10,
          background: connected ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${connected ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
          borderRadius: 10, padding: '10px 14px',
        }}>
          <div style={{
            width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
            background: connected ? '#22c55e' : '#ef4444',
            animation: connected ? 'hsPulse 2s infinite' : 'none',
          }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: connected ? '#22c55e' : 'var(--error)' }}>
              {connected ? `${deviceName} ${tx.connected}` : tx.disconnected}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
              {connected
                ? `${tx.android} · ${tx.battery} ${battery?.level ?? '—'}%${battery?.charging ? ` · ${tx.charging}` : ''}`
                : tx.connect_hint}
            </div>
          </div>
        </div>

        <StatBadge label={tx.battery}   value={battery ? `${battery.level}%` : '—'} color={battery?.charging ? '#22c55e' : accentColor} />
        <StatBadge label={tx.wifi}      value={wifiRssi || '—'}   color="#22c55e" />
        <StatBadge label={tx.syncthing} value=":8384"             color="#a78bfa" />
      </div>

      {/* Section label */}
      <SectionLabel text={tx.todo} />

      {/* Feature cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
        {tx.features.map((f, i) => (
          <FeatureCard
            key={f.id}
            feature={f}
            delay={i * 55}
            onClick={() => onNavigate(f.id)}
          />
        ))}
      </div>

      {/* Quick access */}
      {recentItems.length > 0 && (
        <>
          <SectionLabel text={tx.quick} />
          <div style={{ display: 'flex', gap: 10 }}>
            {recentItems.map((item, i) => (
              <QuickItem
                key={i}
                item={item}
                delay={300 + i * 55}
                onClick={() => onNavigate(item.section)}
              />
            ))}
          </div>
        </>
      )}

      <style>{`
        @keyframes hsSlideUp { from { opacity:0; transform:translateY(14px) } to { opacity:9; transform:none } }
        @keyframes hsPulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  )
}