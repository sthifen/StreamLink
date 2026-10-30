import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import DeviceHeader  from '../components/DeviceHeader.jsx'
import ScrcpyPage    from '../components/ScrcpyPage.jsx'
import TransferPage  from '../components/TransferPage.jsx'
import SunshinePage  from '../components/SunshinePage.jsx'
import TabletApps    from '../components/TabletApps.jsx'
import { applyAppearance } from '../App.jsx'

// ── Inline SVG icons ──────────────────────────────────────────────────────────
const Ico = {
  screen:   <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="2.5" width="10" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><path d="M5.5 10.5v2M3.5 12.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><rect x="12" y="4" width="2.5" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.1"/></svg>,
  transfer: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M3 5.5h9M9.5 3L12 5.5 9.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 9.5H3M5.5 7l-2.5 2.5L5.5 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  sunshine: <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="2.8" stroke="currentColor" strokeWidth="1.3"/><path d="M7.5 1.5v1.5M7.5 12v1.5M1.5 7.5H3M12 7.5h1.5M3.4 3.4l1 1M10.6 10.6l1 1M3.4 11.6l1-1M10.6 4.4l1-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  config:   <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3"/><path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M2.93 2.93l1.06 1.06M11.01 11.01l1.06 1.06M2.93 12.07l1.06-1.06M11.01 3.99l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  chevL:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chevR:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  tweaks:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M4 7h6M6 10h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  sun:      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M2.93 11.07l1.06-1.06M10.01 3.99l1.06-1.06" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  moon:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11.5 8.5A5 5 0 0 1 5.5 2.5a5 5 0 1 0 6 6z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
}

const Ico_apps = <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1" y="1" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><rect x="8.5" y="1" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><rect x="1" y="8.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/></svg>

const TABS = [
  { id: 'apps',     icon: Ico_apps,     label: 'Apps'          },
  { id: 'screen',   icon: Ico.screen,   label: 'Pantalla'      },
  { id: 'transfer', icon: Ico.transfer, label: 'Transferencia' },
  { id: 'sunshine', icon: Ico.sunshine, label: 'Streaming'     },
]

// ── Accent colors ─────────────────────────────────────────────────────────────
const ACCENT_DOTS = [
  { key:'amber',  c:'#e8741a' },
  { key:'blue',   c:'#4f6ef7' },
  { key:'violet', c:'#8b5cf6' },
  { key:'green',  c:'#22c55e' },
  { key:'pink',   c:'#ec4899' },
  { key:'yellow', c:'#eab308' },
]

const WP_PRESETS = [
  { id:'none',   label:'Naranja', gradient:'radial-gradient(ellipse at 25% 15%,#2a1200 0%,#1a0a00 50%,#0d0500 100%)' },
  { id:'night',  label:'Noche',   gradient:'radial-gradient(ellipse at 20% 50%,#0a1628 0%,#060d1a 60%,#030810 100%)' },
  { id:'aurora', label:'Aurora',  gradient:'radial-gradient(ellipse at 20% 50%,#0d4f3c 0%,#0a1628 50%,#1a0a2e 100%)' },
  { id:'cosmos', label:'Cosmos',  gradient:'radial-gradient(ellipse at 50% 50%,#1a0d2e 0%,#070410 60%,#000000 100%)' },
]

// ── TweaksPanel ───────────────────────────────────────────────────────────────
function TweaksPanel({ config, setConfig, sidebarSize, setSidebarSize, darkMode, setDarkMode }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const [panelPos, setPanelPos] = useState({ top: 52, right: 12 })

  const ap = config.appearance || {}
  const currentAccent  = ap.accentKey || 'amber'
  const blurLevel      = ap.wallpaperBlur ?? 0
  const dimLevel       = ap.wallpaperDim  ?? 0
  const currentWpPreset = ap.wpPreset || 'none'

  useEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const panelH = 480
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const top = spaceBelow >= panelH ? rect.bottom + 6 : Math.max(8, rect.top - panelH - 6)
    setPanelPos({ top, right: window.innerWidth - rect.right })
  }, [open])

  const applyAndSave = (newAp) => {
    applyAppearance(newAp)
    setConfig(c => {
      const next = { ...c, appearance: newAp }
      window.api?.saveConfig(next)
      return next
    })
  }

  const setAccent = (key) => {
    const preset = ACCENT_DOTS.find(p => p.key === key)
    applyAndSave({ ...ap, accentKey: key, accentColor: preset?.c })
  }

  const setBlur = (v) => {
    document.body.style.setProperty('--wallpaper-blur', `${v}px`)
    applyAndSave({ ...ap, wallpaperBlur: v })
  }

  const setDim = (v) => {
    document.body.style.setProperty('--wallpaper-dim', String(v))
    applyAndSave({ ...ap, wallpaperDim: v })
  }

  const setWallpaperPreset = (wp) => {
    document.documentElement.style.setProperty('--app-bg', wp.gradient)
    document.body.style.setProperty('--wallpaper', 'none')
    applyAndSave({ ...ap, wallpaper: '', wpPreset: wp.id, wpGradient: wp.gradient })
  }

  const pickWallpaper = async () => {
    const r = await window.api?.pickImage?.()
    if (!r) return
    applyAndSave({ ...ap, wallpaper: r, wpPreset: 'custom' })
  }

  const removeWallpaper = () => {
    const wp = WP_PRESETS.find(w => w.id === (ap.wpPreset || 'none')) || WP_PRESETS[0]
    document.documentElement.style.setProperty('--app-bg', wp.gradient)
    applyAndSave({ ...ap, wallpaper: '', wpPreset: wp.id })
  }

  const toggleTheme = () => {
    const next = !darkMode
    setDarkMode(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    applyAndSave({ ...ap, theme: next ? 'dark' : 'light' })
  }

  const glass = { background: 'rgba(10,12,18,0.97)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)' }

  const Row = ({ label, children }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  )

  const PillGroup = ({ options, value, onChange }) => (
    <div style={{ display: 'flex', gap: 5 }}>
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: value === o.v ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
          color: value === o.v ? '#fff' : 'rgba(255,255,255,0.4)',
          border: `0.5px solid ${value === o.v ? 'var(--accent-border)' : 'rgba(255,255,255,0.1)'}`,
          cursor: 'pointer', transition: 'all 0.15s',
        }}>{o.l}</button>
      ))}
    </div>
  )

  const panel = open && ReactDOM.createPortal(
    <>
      <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
      <div style={{
        position: 'fixed', top: panelPos.top, right: panelPos.right,
        width: 272, zIndex: 9999, borderRadius: 16,
        border: '0.5px solid rgba(255,255,255,0.12)',
        padding: '16px 18px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        ...glass,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Tweaks
          {/* Dark/light toggle */}
          <button onClick={toggleTheme} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.07)', border: '0.5px solid rgba(255,255,255,0.12)',
            borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
            color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 600,
          }}>
            {darkMode ? Ico.sun : Ico.moon}
            {darkMode ? 'Claro' : 'Oscuro'}
          </button>
        </div>

        <Row label="Barra lateral">
          <PillGroup options={[{l:'Amplia',v:'full'},{l:'Mini',v:'mini'}]} value={sidebarSize} onChange={setSidebarSize} />
        </Row>

        <Row label="Color de acento">
          <div style={{ display: 'flex', gap: 8 }}>
            {ACCENT_DOTS.map(d => (
              <button key={d.key} onClick={() => setAccent(d.key)} style={{
                width: 26, height: 26, borderRadius: '50%', background: d.c,
                border: 'none', cursor: 'pointer',
                outline: currentAccent === d.key ? `3px solid ${d.c}` : '3px solid transparent',
                outlineOffset: 2,
                transform: currentAccent === d.key ? 'scale(1.2)' : 'scale(1)',
                transition: 'all 0.15s',
              }} />
            ))}
          </div>
        </Row>

        <Row label="Fondo de pantalla">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 8 }}>
            {WP_PRESETS.map(wp => (
              <button key={wp.id} onClick={() => setWallpaperPreset(wp)} style={{
                height: 36, borderRadius: 9, cursor: 'pointer',
                background: wp.gradient,
                border: `1.5px solid ${currentWpPreset === wp.id ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}`,
                fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: 600,
                transition: 'border-color 0.15s',
              }}>{wp.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={pickWallpaper} style={{
              flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 11, fontWeight: 600,
              background: 'rgba(255,255,255,0.07)', border: '0.5px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
            }}>📁 Mi imagen</button>
            {ap.wallpaper && (
              <button onClick={removeWallpaper} style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.2)',
                color: '#ef4444', cursor: 'pointer',
              }}>✕ Quitar</button>
            )}
          </div>
        </Row>

        <Row label={`Blur del fondo (${blurLevel}px)`}>
          <input type="range" min={0} max={30} step={1} value={blurLevel}
            onChange={e => setBlur(Number(e.target.value))}
            style={{ width: '100%' }} />
        </Row>

        <Row label={`Oscurecimiento (${Math.round(dimLevel * 100)}%)`}>
          <input type="range" min={0} max={0.85} step={0.05} value={dimLevel}
            onChange={e => setDim(Number(e.target.value))}
            style={{ width: '100%' }} />
        </Row>

      </div>
    </>,
    document.body
  )

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: open ? 'var(--accent-soft)' : 'var(--bg-elem)',
          border: `0.5px solid ${open ? 'var(--accent-border)' : 'var(--border-lit)'}`,
          borderRadius: 8, padding: '5px 10px',
          color: open ? 'var(--accent)' : 'var(--text-2)',
          fontSize: 12, fontWeight: 600, transition: 'all 0.15s', cursor: 'pointer',
        }}
      >
        {Ico.tweaks} Tweaks
      </button>
      {panel}
    </>
  )
}

// ── Config Screen ─────────────────────────────────────────────────────────────
const PASTE_METHODS = [
  { id: 'syncthing',  label: 'Syncthing',   icon: '📂', desc: 'Carpeta Drop — sincronización automática' },
  { id: 'usb',        label: 'USB / Wi-Fi', icon: '🔌', desc: 'ADB push al almacenamiento de la tablet' },
  { id: 'bluetooth',  label: 'Bluetooth',   icon: '🔵', desc: 'Enviar al dispositivo seleccionado' },
  { id: 'kdeconnect', label: 'KDE Connect', icon: '📶', desc: 'Enviar via KDE Connect (misma red WiFi)' },
]

function ConfigScreen({ config, setConfig }) {
  const [drop,        setDrop]        = useState(config.drop_folder || '~/Drop')
  const [adbIp,       setAdbIp]       = useState(config.adb?.tablet_ip || '')
  const [pasteMethod, setPasteMethod] = useState(config.paste_method || 'syncthing')
  const [btMac,       setBtMac]       = useState(config.bt_mac || '')
  const [btDevices,   setBtDevices]   = useState(null)
  const [btLoading,   setBtLoading]   = useState(false)
  const [kdeDeviceId, setKdeDeviceId] = useState(config.kde_device_id || '')
  const [kdeDevices,  setKdeDevices]  = useState(null)
  const [kdeLoading,  setKdeLoading]  = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [shortcutState, setShortcutState] = useState(null)

  const loadBtDevices = async () => {
    setBtLoading(true)
    const r = await window.api?.btDevices?.()
    setBtDevices(r?.devices || [])
    setBtLoading(false)
  }

  const loadKdeDevices = async () => {
    setKdeLoading(true)
    const r = await window.api?.kdeconnectList?.()
    setKdeDevices(r?.devices || [])
    setKdeLoading(false)
  }

  const handleMethodChange = (id) => {
    setPasteMethod(id)
    if (id === 'bluetooth' && btDevices === null) loadBtDevices()
    if (id === 'kdeconnect' && kdeDevices === null) loadKdeDevices()
  }

  const pickFolder = async () => {
    const r = await window.api?.pickFolder?.()
    if (r) setDrop(r)
  }

  const save = async () => {
    const next = { ...config, drop_folder: drop, adb: { ...config.adb, tablet_ip: adbIp }, paste_method: pasteMethod, bt_mac: btMac, kde_device_id: kdeDeviceId }
    setConfig(next)
    await window.api?.saveConfig(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const glass = { background: 'rgba(14,17,23,0.75)', backdropFilter: 'blur(22px)', border: '0.5px solid var(--border-lit)', borderRadius: 14, padding: '20px 22px' }
  const BT_BLUE = '#3b82f6'

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px', background: 'transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-h)' }}>Configuración</h2>
        <button onClick={save} style={{ background: saved ? 'var(--success)' : 'var(--accent)', border: 'none', borderRadius: 9, padding: '7px 20px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', transition: 'background 0.2s' }}>
          {saved ? '✓ Guardado' : 'Guardar'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={glass}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 14 }}>CONEXIÓN</div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>IP de la tablet</div>
            <input value={adbIp} onChange={e => setAdbIp(e.target.value)} placeholder="192.168.0.xxx"
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border-lit)', borderRadius: 7, padding: '7px 10px', color: 'var(--text-h)', fontSize: 12 }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>Carpeta Drop</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={drop} onChange={e => setDrop(e.target.value)}
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border-lit)', borderRadius: 7, padding: '7px 10px', color: 'var(--text-h)', fontSize: 12 }} />
              <button onClick={pickFolder} style={{ background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)', borderRadius: 7, padding: '7px 10px', cursor: 'pointer', color: 'var(--text-2)', fontSize: 14 }}>📁</button>
            </div>
          </div>
        </div>

        <div style={glass}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 4 }}>CTRL+SHIFT+V — MÉTODO DE ENVÍO</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 12 }}>Cómo se envía imagen o texto del portapapeles a la tablet</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {PASTE_METHODS.map(m => (
              <button key={m.id} onClick={() => handleMethodChange(m.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 9, textAlign: 'left', cursor: 'pointer',
                background: pasteMethod === m.id ? 'var(--accent-soft)' : 'rgba(255,255,255,0.04)',
                border: `0.5px solid ${pasteMethod === m.id ? 'var(--accent-border)' : 'rgba(255,255,255,0.1)'}`,
                transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{m.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: pasteMethod === m.id ? 'var(--accent)' : 'var(--text-h)' }}>{m.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{m.desc}</div>
                </div>
                {pasteMethod === m.id && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
              </button>
            ))}
          </div>

          {/* Selector de dispositivo KDE Connect — solo visible cuando método=kdeconnect */}
          {pasteMethod === 'kdeconnect' && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 9, background: 'rgba(108,99,255,0.07)', border: '0.5px solid rgba(108,99,255,0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.06em' }}>DISPOSITIVO KDE CONNECT</span>
                <button onClick={loadKdeDevices} disabled={kdeLoading} style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', opacity: kdeLoading ? 0.5 : 1 }}>
                  {kdeLoading ? '…' : '⟳ Actualizar'}
                </button>
              </div>

              {kdeDevices === null && !kdeLoading && (
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Cargando dispositivos…</div>
              )}

              {kdeDevices?.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Sin dispositivos KDE Connect emparejados. Abre KDE Connect en la tablet.</div>
              )}

              {kdeDevices?.map(d => (
                <button key={d.id} onClick={() => setKdeDeviceId(d.id)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', marginBottom: 4, borderRadius: 7, textAlign: 'left', cursor: 'pointer',
                  background: kdeDeviceId === d.id ? 'rgba(108,99,255,0.18)' : 'rgba(255,255,255,0.04)',
                  border: `0.5px solid ${kdeDeviceId === d.id ? 'rgba(108,99,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  transition: 'all 0.12s',
                }}>
                  <span style={{ fontSize: 14 }}>{kdeDeviceId === d.id ? '✓' : '○'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: kdeDeviceId === d.id ? 'var(--accent)' : 'var(--text-h)' }}>{d.name}</div>
                    <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.id}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, flexShrink: 0, color: d.reachable ? 'var(--success)' : 'var(--text-3)' }}>
                    {d.reachable ? '● activo' : '○ sin alcance'}
                  </span>
                </button>
              ))}

              {kdeDeviceId && (
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Seleccionado: <span style={{ color: 'var(--accent)' }}>{kdeDevices?.find(d => d.id === kdeDeviceId)?.name || kdeDeviceId.slice(0, 12) + '…'}</span></span>
                  <button onClick={() => setKdeDeviceId('')} style={{ fontSize: 10, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Quitar</button>
                </div>
              )}
            </div>
          )}

          {/* Recargar atajos sin reiniciar la app */}
          <button onClick={async () => {
            const next = { ...config, drop_folder: drop, adb: { ...config.adb, tablet_ip: adbIp }, paste_method: pasteMethod, bt_mac: btMac, kde_device_id: kdeDeviceId }
            setConfig(next)
            await window.api?.saveConfig(next)
            await window.api?.reloadShortcuts?.()
            setSaved(true); setTimeout(() => setSaved(false), 2000)
          }} style={{ marginTop: 12, width: '100%', padding: '7px', borderRadius: 8, border: 'none', background: 'rgba(108,99,255,0.12)', color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}>
            ⌨️ Guardar y aplicar atajo Ctrl+Shift+V ahora
          </button>

          {/* Selector de dispositivo BT — solo visible cuando método=bluetooth */}
          {pasteMethod === 'bluetooth' && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 9, background: 'rgba(59,130,246,0.07)', border: `0.5px solid rgba(59,130,246,0.25)` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: BT_BLUE, letterSpacing: '0.06em' }}>DISPOSITIVO BLUETOOTH</span>
                <button onClick={loadBtDevices} disabled={btLoading} style={{ fontSize: 10, color: BT_BLUE, background: 'none', border: 'none', cursor: 'pointer', opacity: btLoading ? 0.5 : 1 }}>
                  {btLoading ? '…' : '⟳ Actualizar'}
                </button>
              </div>

              {btDevices === null && !btLoading && (
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Cargando dispositivos…</div>
              )}

              {btDevices?.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>No hay dispositivos Bluetooth pareados</div>
              )}

              {btDevices?.map(d => (
                <button key={d.mac} onClick={() => setBtMac(d.mac)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', marginBottom: 4, borderRadius: 7, textAlign: 'left', cursor: 'pointer',
                  background: btMac === d.mac ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)',
                  border: `0.5px solid ${btMac === d.mac ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  transition: 'all 0.12s',
                }}>
                  <span style={{ fontSize: 14 }}>{btMac === d.mac ? '✓' : '○'}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: btMac === d.mac ? BT_BLUE : 'var(--text-h)' }}>{d.name}</div>
                    <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text-3)' }}>{d.mac}</div>
                  </div>
                </button>
              ))}

              {btMac && (
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Seleccionado: <span style={{ fontFamily: 'monospace', color: BT_BLUE }}>{btDevices?.find(d => d.mac === btMac)?.name || btMac}</span></span>
                  <button onClick={() => setBtMac('')} style={{ fontSize: 10, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Quitar</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={glass}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 12 }}>APARIENCIA RÁPIDA</div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
            Usa el botón <strong style={{ color: 'var(--accent)' }}>Tweaks</strong> en la barra superior para cambiar:<br/>
            colores de acento, fondo, blur, oscurecimiento y tema claro/oscuro.
          </p>
        </div>

        <div style={{ ...glass, gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 4 }}>ATAJOS DEL SISTEMA (WAYLAND)</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.6 }}>
            Registra <code style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>Ctrl+U</code> y <code style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>Ctrl+Shift+V</code> como atajos globales de GNOME
            mediante <code style={{ fontFamily: 'monospace' }}>gsettings</code>. Funcionan desde cualquier app sin tocar la ventana.
            Requiere: <code style={{ fontFamily: 'monospace' }}>wl-clipboard</code>, <code style={{ fontFamily: 'monospace' }}>xdotool</code>.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              disabled={shortcutState === 'installing'}
              onClick={async () => {
                setShortcutState('installing')
                const r = await window.api?.installSystemShortcuts?.()
                setShortcutState(r || { ok: false, error: 'Sin respuesta' })
              }}
              style={{
                padding: '8px 18px', borderRadius: 9, fontWeight: 700, fontSize: 12, cursor: 'pointer',
                background: shortcutState?.ok ? 'rgba(34,197,94,0.15)' : 'var(--accent-soft)',
                color: shortcutState?.ok ? '#22c55e' : 'var(--accent)',
                border: `0.5px solid ${shortcutState?.ok ? 'rgba(34,197,94,0.3)' : 'var(--accent-border)'}`,
                transition: 'all 0.15s',
              }}
            >
              {shortcutState === 'installing' ? '⏳ Instalando…'
                : shortcutState?.ok ? '✓ Atajos instalados'
                : '⌨️ Instalar atajos del sistema'}
            </button>

            {shortcutState?.ok && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#22c55e' }}>{shortcutState.ctrlScript}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#22c55e' }}>{shortcutState.pasteScript}</span>
              </div>
            )}

            {shortcutState?.ok === false && (
              <span style={{ fontSize: 11, color: '#ef4444' }}>✗ {shortcutState.error}</span>
            )}
          </div>

          {shortcutState?.missing?.length > 0 && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: '0.5px solid rgba(245,158,11,0.3)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>Dependencias faltantes — instala en terminal:</div>
              {shortcutState.missing.map(dep => (
                <div key={dep} style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 3 }}>
                  sudo dnf install -y {dep.split(' ')[0]}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Nav button ────────────────────────────────────────────────────────────────
function NavBtn({ t, active, collapsed, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 9,
      padding: collapsed ? '10px 0' : '9px 10px',
      justifyContent: collapsed ? 'center' : 'flex-start',
      borderRadius: 10,
      background: active ? 'var(--accent-soft)' : 'transparent',
      border: `0.5px solid ${active ? 'var(--accent-border)' : 'transparent'}`,
      color: active ? 'var(--accent)' : 'var(--text-2)',
      fontSize: 13, fontWeight: active ? 600 : 400,
      width: '100%', whiteSpace: 'nowrap', transition: 'all 0.15s', cursor: 'pointer',
    }}>
      <span style={{ flexShrink: 0 }}>{t.icon}</span>
      {!collapsed && <span>{t.label}</span>}
      {!collapsed && active && <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />}
    </button>
  )
}

// ── Sidebar device widgets (media + notifications) ────────────────────────────
function SidebarDeviceWidgets({ serial }) {
  const [notifs, setNotifs] = useState([])
  const [dismissed, setDismissed] = useState(new Set())

  useEffect(() => {
    if (!serial) return
    const pollNotifs = async () => {
      const r = await window.api?.adbNotifications?.({ serial })
      if (r?.notifications) setNotifs(r.notifications.slice(0, 5))
    }
    pollNotifs()
    const id = setInterval(pollNotifs, 8000)
    return () => clearInterval(id)
  }, [serial])

  const visible = notifs.filter((n, i) => !dismissed.has(i))
  if (visible.length === 0) return null

  const appLabel = (n) => {
    const pkg = n.pkg || ''
    const map = { 'com.whatsapp': 'WhatsApp', 'com.instagram.android': 'Instagram', 'com.google.android.gm': 'Gmail', 'com.google.android.youtube': 'YouTube', 'com.spotify.music': 'Spotify', 'com.telegram.messenger': 'Telegram' }
    return map[pkg] || pkg.split('.').pop()
  }

  return (
    <div style={{ padding: '4px 8px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ height: '0.5px', background: 'var(--border-lit)', marginBottom: 4 }} />
      <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.1em', paddingLeft: 2, marginBottom: 2 }}>NOTIFICACIONES</div>
      {notifs.map((n, i) => dismissed.has(i) ? null : (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '5px 6px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '0.5px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 700, marginBottom: 1 }}>{appLabel(n)}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.3, wordBreak: 'break-word' }}>{n.title || '—'}</div>
            {n.text && <div style={{ fontSize: 9, color: 'var(--text-3)', lineHeight: 1.3, marginTop: 1, wordBreak: 'break-word' }}>{n.text}</div>}
          </div>
          <button onClick={() => setDismissed(s => new Set([...s, i]))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 10, padding: '0 1px', lineHeight: 1, flexShrink: 0, marginTop: 1 }}>✕</button>
        </div>
      ))}
    </div>
  )
}

// ── Light theme CSS vars ──────────────────────────────────────────────────────
const LIGHT_VARS = `
  [data-theme="light"] {
    --bg:           #eef0f6;
    --bg-panel:     #e4e6f0;
    --bg-card:      #d8daea;
    --bg-elem:      #cdd0e2;
    --bg-hover:     #c0c4d8;
    --bg-active:    #b4b8ce;
    --text-h:       #0e1018;
    --text-1:       #1e2236;
    --text-2:       rgba(14,16,24,0.72);
    --text-3:       rgba(14,16,24,0.45);
    --border:       rgba(0,0,0,0.1);
    --border-lit:   rgba(0,0,0,0.18);
    --glass-panel:  rgba(228,230,240,0.92);
    --accent-soft:  color-mix(in srgb, var(--accent) 18%, transparent);
    --accent-border:color-mix(in srgb, var(--accent) 45%, transparent);
    --success-soft: rgba(22,163,74,0.15);
  }
`

// ── Main App ──────────────────────────────────────────────────────────────────
export default function MainApp({ config, setConfig }) {
  const hasWallpaper = !!(config.appearance?.wallpaper)
  const [tab,            setTab]            = useState('apps')
  const [devices,        setDevices]        = useState([])
  const [logs,           setLogs]           = useState([])
  const [collapsed,      setCollapsed]      = useState(false)
  const [sidebarSize,    setSidebarSize]    = useState('full')
  const [darkMode,       setDarkMode]       = useState(() => (config.appearance?.theme || 'dark') === 'dark')
  const [prioritySerial, setPrioritySerial] = useState(() => { try { return localStorage.getItem('adb-priority-serial') || null } catch { return null } })
  const [deviceStats,    setDeviceStats]    = useState(null)

  const handlePriority = (serial) => {
    setPrioritySerial(serial)
    try { if (serial) localStorage.setItem('adb-priority-serial', serial); else localStorage.removeItem('adb-priority-serial') } catch {}
  }

  // Dispositivo activo = el prioritario, o el primero conectado
  const connected = devices.filter(d => d.status === 'device')
  const activeDevice = connected.find(d => d.serial === prioritySerial) || connected[0] || null

  // Apply theme on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [])

  // Poll device quick stats every 12s when there's an active device
  useEffect(() => {
    if (!activeDevice) { setDeviceStats(null); return }
    const poll = async () => {
      const r = await window.api?.adbQuickStats?.({ serial: activeDevice.serial })
      if (r?.ok) setDeviceStats(r)
    }
    poll()
    const id = setInterval(poll, 12000)
    return () => clearInterval(id)
  }, [activeDevice?.serial])

  const addLog = (msg, level = 'info') => {
    const ts = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    setLogs(prev => [...prev.slice(-50), { ts, msg, level }])
  }

  const collapsed_ = sidebarSize === 'mini'
  const sideW = collapsed_ ? 52 : 196

  const panelGlass = {
    background: 'var(--glass-panel)',
    backdropFilter: 'blur(22px)',
    WebkitBackdropFilter: 'blur(22px)',
  }

  const lastLog = logs[logs.length - 1]
  const logColors = { ok: 'var(--success)', error: 'var(--error)', warn: 'var(--warning)', info: 'var(--accent)' }

  return (
    <>
      <style>{`
      :root { --glass-panel: rgba(10,12,18,0.82); }
      ${LIGHT_VARS}
    `}</style>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <div style={{
          width: sideW, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          ...panelGlass,
          borderRight: '0.5px solid var(--border-lit)',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden', zIndex: 10,
        }}>
          <DeviceHeader
            devices={devices} setDevices={setDevices}
            config={config} hasWallpaper={hasWallpaper}
            collapsed={collapsed_}
            prioritySerial={prioritySerial}
            onPriority={handlePriority}
          />

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <nav style={{ padding: '6px 7px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {TABS.map(t => (
                <NavBtn key={t.id} t={t} active={tab === t.id} collapsed={collapsed_} onClick={() => setTab(t.id)} />
              ))}
              <div style={{ height: '0.5px', background: 'var(--border-lit)', margin: '6px 4px' }} />
              <NavBtn t={{ id:'config', icon: Ico.config, label:'Config' }} active={tab==='config'} collapsed={collapsed_} onClick={() => setTab('config')} />
            </nav>

            {/* Widgets del dispositivo en sidebar */}
            {!collapsed_ && activeDevice && <SidebarDeviceWidgets serial={activeDevice.serial} />}
          </div>

          {/* Log */}
          {!collapsed_ && lastLog && (
            <div style={{ padding: '4px 12px', borderTop: '0.5px solid var(--border)', flexShrink: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 1 }}>LOG </span>
              <span style={{ fontSize: 10, color: logColors[lastLog.level] || 'var(--text-2)' }}>
                {lastLog.ts} {lastLog.msg}
              </span>
            </div>
          )}

          {/* Collapse */}
          <button onClick={() => setSidebarSize(s => s === 'full' ? 'mini' : 'full')} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '10px', borderTop: '0.5px solid var(--border)',
            background: 'transparent', color: 'var(--text-3)', width: '100%',
            border: 'none', cursor: 'pointer',
          }}>
            {collapsed_ ? Ico.chevR : Ico.chevL}
          </button>
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Topbar */}
          <div style={{
            height: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
            ...panelGlass, borderBottom: '0.5px solid var(--border-lit)', flexShrink: 0,
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-h)' }}>
              {tab === 'apps' ? 'Apps instaladas' : TABS.find(t => t.id === tab)?.label || 'Config'}
            </span>
            {activeDevice && deviceStats && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginLeft: 8 }}>
                {/* RAM */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-2)' }}>
                  <span style={{ fontSize: 11 }}>💾</span>
                  <span>{deviceStats.ramUsed}MB / {deviceStats.ramTotal}MB</span>
                </div>
                {/* Storage */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-2)' }}>
                  <span style={{ fontSize: 11 }}>📦</span>
                  <span>{deviceStats.storUsed}GB / {deviceStats.storTotal}GB</span>
                </div>
                {/* WiFi */}
                {deviceStats.rssi !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-2)' }}>
                    <span style={{ fontSize: 11 }}>📶</span>
                    <span style={{ color: deviceStats.rssi > -60 ? 'var(--success)' : deviceStats.rssi > -80 ? 'var(--warning)' : 'var(--error)' }}>{deviceStats.rssi} dBm</span>
                  </div>
                )}
                {/* Battery */}
                {deviceStats.battery > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-2)' }}>
                    <span style={{ fontSize: 11 }}>{deviceStats.battery > 80 ? '🔋' : deviceStats.battery > 30 ? '🪫' : '🔴'}</span>
                    <span>{deviceStats.battery}%</span>
                  </div>
                )}
              </div>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => window.api?.openSyncthingWindow?.()} style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                background: 'rgba(20,184,166,0.1)', border: '0.5px solid rgba(20,184,166,0.25)',
                borderRadius: 8, color: '#2dd4bf', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2dd4bf' }} />
                Syncthing :8384
              </button>
              <TweaksPanel
                config={config} setConfig={setConfig}
                sidebarSize={sidebarSize} setSidebarSize={setSidebarSize}
                darkMode={darkMode} setDarkMode={setDarkMode}
              />
            </div>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {tab === 'apps'     && <TabletApps    activeDevice={activeDevice} />}
            {tab === 'screen'   && <ScrcpyPage    devices={devices} activeDevice={activeDevice} config={config} addLog={addLog} hasWallpaper={hasWallpaper} darkMode={darkMode} />}
            {tab === 'transfer' && <TransferPage  devices={devices} activeDevice={activeDevice} config={config} addLog={addLog} hasWallpaper={hasWallpaper} />}
            {tab === 'sunshine' && <SunshinePage  darkMode={darkMode} hasWallpaper={hasWallpaper} />}
            {tab === 'config'   && <ConfigScreen  config={config} setConfig={setConfig} />}
          </div>
        </div>
      </div>
    </>
  )
}