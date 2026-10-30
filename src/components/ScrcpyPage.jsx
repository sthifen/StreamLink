import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { Play, Pause, Camera, Search, Download, Copy, X } from 'lucide-react'
import { launchScrcpy, toggleControlMode, controlModeStatus, installControlScript } from '../api.js'
import QrWifiConnect from './QrWifiConnect'


function ScreenshotOverlay({ base64, onClose }) {
  const [copied, setCopied] = React.useState(false)
  const download = () => {
    const a = document.createElement('a')
    a.href = `data:image/png;base64,${base64}`
    a.download = `captura-${Date.now()}.png`
    a.click()
  }
  const copy = async () => {
    try {
      const res = await fetch(`data:image/png;base64,${base64}`)
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } catch {
      await navigator.clipboard.writeText(`data:image/png;base64,${base64}`)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return ReactDOM.createPortal(
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(12px)', display:'flex', alignItems:'center', justifyContent:'center', animation:'ssIn 0.2s ease' }}>
      <div onClick={e=>e.stopPropagation()} style={{ display:'flex', flexDirection:'column', gap:12, maxWidth:'85vw', maxHeight:'90vh', animation:'ssUp 0.25s cubic-bezier(0.16,1,0.3,1)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.06)', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:12, padding:'8px 12px', backdropFilter:'blur(20px)' }}>
          <span style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.5)', flex:1 }}>Captura de pantalla</span>
          <button onClick={copy} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:8, border:'none', background: copied?'rgba(34,197,94,0.2)':'rgba(255,255,255,0.08)', color: copied?'#22c55e':'rgba(255,255,255,0.7)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            <Copy size={12}/> {copied?'Copiado':'Copiar'}
          </button>
          <button onClick={download} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:8, border:'none', background:'var(--accent)', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            <Download size={12}/> Guardar
          </button>
          <button onClick={onClose} style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:8, border:'none', background:'rgba(239,68,68,0.15)', color:'#ef4444', cursor:'pointer' }}>
            <X size={13}/>
          </button>
        </div>
        <img src={`data:image/png;base64,${base64}`} alt="Captura" style={{ maxWidth:'85vw', maxHeight:'calc(90vh - 80px)', borderRadius:14, border:'0.5px solid rgba(255,255,255,0.1)', boxShadow:'0 32px 80px rgba(0,0,0,0.6)', objectFit:'contain' }}/>
      </div>
      <style>{`@keyframes ssIn{from{opacity:0}to{opacity:1}} @keyframes ssUp{from{opacity:0;transform:scale(0.94) translateY(12px)}to{opacity:1;transform:none}}`}</style>
    </div>,
    document.body
  )
}

// ── App presets ───────────────────────────────────────────────────────────────
const STATIC_PRESETS = [
  { label: 'YouTube',       pkg: 'com.google.android.youtube'           },
  { label: 'Chrome',        pkg: 'com.android.chrome'                   },
  { label: 'Galería',       pkg: 'com.sec.android.gallery3d'            },
  { label: 'Configuración', pkg: 'com.android.settings'                 },
  { label: 'Calculadora',   pkg: 'com.sec.android.app.popupcalculator'  },
  { label: 'Cámara',        pkg: 'com.sec.android.app.camera'           },
  { label: 'Archivos',      pkg: 'com.sec.android.app.myfiles'          },
  { label: 'Play Store',    pkg: 'com.android.vending'                  },
  { label: 'Spotify',       pkg: 'com.spotify.music'                    },
  { label: 'WhatsApp',      pkg: 'com.whatsapp'                         },
  { label: 'Netflix',       pkg: 'com.netflix.mediaclient'              },
]
const PKG_NAMES = {
  'com.google.android.youtube':'YouTube','com.android.chrome':'Chrome',
  'com.sec.android.gallery3d':'Galería','com.android.settings':'Configuración',
  'com.sec.android.app.popupcalculator':'Calculadora','com.sec.android.app.camera':'Cámara',
  'com.sec.android.app.myfiles':'Archivos','com.android.vending':'Play Store',
  'com.spotify.music':'Spotify','com.whatsapp':'WhatsApp','com.netflix.mediaclient':'Netflix',
  'com.google.android.gm':'Gmail','com.google.android.maps':'Maps',
  'com.samsung.android.app.notes':'Samsung Notes','com.instagram.android':'Instagram',
  'com.twitter.android':'Twitter/X','com.facebook.katana':'Facebook',
  'com.discord':'Discord','com.telegram.messenger':'Telegram',
  'org.mozilla.firefox':'Firefox','org.videolan.vlc':'VLC',
}

// ── Chip toggle ───────────────────────────────────────────────────────────────
function Chip({ label, active, onClick, color }) {
  const accent = color || 'var(--accent)'
  return (
    <button onClick={onClick} style={{
      padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 600,
      background: active ? `${accent}22` : 'rgba(255,255,255,0.04)',
      color: active ? accent : 'var(--text-3)',
      border: `0.5px solid ${active ? `${accent}66` : 'rgba(255,255,255,0.08)'}`,
      cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
    }}>{label}</button>
  )
}

// ── AppSelector ───────────────────────────────────────────────────────────────
function AppSelector({ startApp, setStartApp, connected, serial }) {
  const [search, setSearch]       = useState('')
  const [open, setOpen]           = useState(false)
  const [apps, setApps]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const wrapRef = useRef(null)
  const [dropPos, setDropPos]     = useState({ top: 0, left: 0, width: 0 })

  const load = async () => {
    if (apps || loading || !connected) return
    setLoading(true)
    try {
      const r = await window.api?.adbShell({ serial, cmd: 'pm list packages -3' })
      if (r?.out) {
        const list = r.out.split('\n').filter(l => l.startsWith('package:')).map(l => {
          const pkg = l.replace('package:', '').trim()
          return { pkg, label: PKG_NAMES[pkg] || pkg.split('.').pop() }
        }).sort((a, b) => (PKG_NAMES[a.pkg] ? -1 : 1) || a.label.localeCompare(b.label))
        setApps(list)
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    if (!open || !wrapRef.current) return
    const r = wrapRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom - 8
    const top = spaceBelow >= 240 ? r.bottom + 4 : r.top - 244
    setDropPos({ top, left: r.left, width: r.width })
    load()
  }, [open])

  const pool = apps || STATIC_PRESETS
  const filtered = search ? pool.filter(a =>
    a.label.toLowerCase().includes(search.toLowerCase()) ||
    a.pkg.toLowerCase().includes(search.toLowerCase())
  ) : pool.slice(0, 50)

  const label = PKG_NAMES[startApp] || (apps?.find(a => a.pkg === startApp)?.label) || (startApp ? startApp.split('.').pop() : '')

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>ABRIR APP AL CONECTAR</div>
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <input
          value={startApp}
          onChange={e => { setStartApp(e.target.value); setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={connected ? 'Buscar app instalada…' : 'com.example.app'}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.05)', borderRadius: 8,
            border: `0.5px solid ${startApp ? 'var(--accent-border)' : 'rgba(255,255,255,0.1)'}`,
            padding: '6px 30px 6px 10px', color: 'var(--text-h)', fontSize: 11, fontFamily: 'monospace',
          }}
        />
        <Search size={11} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
      </div>
      {startApp && <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <button onClick={() => setStartApp('')} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 11 }}>✕</button>
      </div>}
      {open && ReactDOM.createPortal(<>
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
        <div style={{
          position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width,
          maxHeight: 240, zIndex: 9999, overflow: 'hidden', display: 'flex', flexDirection: 'column',
          background: 'rgba(14,17,23,0.98)', backdropFilter: 'blur(20px)',
          border: '0.5px solid var(--border-lit)', borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}>
          <div style={{ padding: '6px 10px', borderBottom: '0.5px solid var(--border)', fontSize: 10, color: 'var(--text-3)', flexShrink: 0, display: 'flex', justifyContent: 'space-between' }}>
            <span>{loading ? 'Cargando…' : apps ? `${filtered.length} apps` : 'Apps frecuentes'}</span>
            {!apps && connected && !loading && <button onClick={e => { e.stopPropagation(); load() }} style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>🔄 Cargar desde tablet</button>}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.map(a => (
              <button key={a.pkg} onClick={() => { setStartApp(a.pkg); setSearch(''); setOpen(false) }}
                style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1, padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '0.5px solid var(--border)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-h)' }}>{a.label}</span>
                <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'monospace' }}>{a.pkg}</span>
              </button>
            ))}
          </div>
          <button onClick={() => { setStartApp(''); setOpen(false) }} style={{ padding: '7px 10px', background: 'none', border: 'none', borderTop: '0.5px solid var(--border)', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)', textAlign: 'left' }}>✕ Sin app específica</button>
        </div>
      </>, document.body)}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ScrcpyPage({ devices, activeDevice, config, addLog, darkMode = true }) {
  const [running,       setRunning]       = useState(false)
  const [screenshot,    setScreenshot]    = useState(null)
  const [capturing,     setCapturing]     = useState(false)
  const [status,        setStatus]        = useState('')
  const [statusOk,      setStatusOk]      = useState(true)
  const [sending,       setSending]       = useState(false)
  const [dragging,      setDragging]      = useState(false)
  const [launchMode,    setLaunchMode]    = useState('mirror')

  // Opciones espejo
  const [fullscreen,    setFullscreen]    = useState(false)
  const [turnScreenOff, setTurnScreenOff] = useState(false)
  const [stayAwake,     setStayAwake]     = useState(false)
  const [bitrate,       setBitrate]       = useState(8)
  const [maxFps,        setMaxFps]        = useState(60)
  const [noClip,        setNoClip]        = useState(false)
  const [mouseMode,     setMouseMode]     = useState('uhid')
  const [keyboardMode,  setKeyboardMode]  = useState('uhid')
  const [startApp,      setStartApp]      = useState('')

  // Audio — disponible en todos los modos excepto 'audio' (que es solo audio)
  const [noAudio,       setNoAudio]       = useState(false)

  const [scriptInstalled, setScriptInstalled] = useState(false)
  const [installing,      setInstalling]      = useState(false)
  const [showQrModal,     setShowQrModal]     = useState(false)

  const INPUT_MODES = [
    { id: 'uhid', label: 'Preciso',   icon: '🎯', hint: 'recomendado' },
    { id: 'sdk',  label: 'Estándar',  icon: '⚡', hint: null },
    { id: 'aoa',  label: 'USB físico',icon: '🔌', hint: null },
  ]
  const inputMode = mouseMode === keyboardMode ? mouseMode : 'uhid'
  const setInputMode = (m) => { setMouseMode(m); setKeyboardMode(m) }

  // Cargar configuraciones guardadas al montar
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('scrcpy-config') || '{}')
      if (saved.launchMode)    setLaunchMode(saved.launchMode)
      if (saved.bitrate)       setBitrate(saved.bitrate)
      if (saved.maxFps)        setMaxFps(saved.maxFps)
      if (saved.mouseMode)     setMouseMode(saved.mouseMode)
      if (saved.keyboardMode)  setKeyboardMode(saved.keyboardMode)
      if (saved.fullscreen   !== undefined) setFullscreen(saved.fullscreen)
      if (saved.turnScreenOff !== undefined) setTurnScreenOff(saved.turnScreenOff)
      if (saved.stayAwake    !== undefined) setStayAwake(saved.stayAwake)
      if (saved.noAudio      !== undefined) setNoAudio(saved.noAudio)
      if (saved.noClip       !== undefined) setNoClip(saved.noClip)
      if (saved.startApp)      setStartApp(saved.startApp)
    } catch {}
  }, [])

  // Guardar configuraciones cuando cambian
  useEffect(() => {
    try {
      localStorage.setItem('scrcpy-config', JSON.stringify({
        launchMode, bitrate, maxFps, mouseMode, keyboardMode,
        fullscreen, turnScreenOff, stayAwake, noAudio, noClip, startApp,
      }))
    } catch {}
  }, [launchMode, bitrate, maxFps, mouseMode, keyboardMode, fullscreen, turnScreenOff, stayAwake, noAudio, noClip, startApp])

  // Usar el dispositivo activo (prioritario) si está disponible
  const connected  = activeDevice || devices.find(d => d.status === 'device')
  const usbDevice  = devices.find(d => d.status === 'device' && !d.serial?.includes(':'))
  const folder     = config.drop_folder || '~/Drop'

  const setMsg = (msg, ok = true) => { setStatus(msg); setStatusOk(ok) }

  // Sync con atajo global
  useEffect(() => {
    controlModeStatus().then(r => { if (r?.active) { setLaunchMode('control'); setRunning(true) } })
    window.api?.onControlModeChanged?.(active => {
      setRunning(active)
      if (!active) setMsg('')
    })
  }, [])

  // Ctrl+V global → enviar a tablet
  useEffect(() => {
    const handler = async (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'v') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      const r = await window.api?.pasteImage(null)
      if (!r?.ok || r.type !== 'image') return
      setSending(true)
      setMsg(`Enviando ${r.filename}…`, true)
      if (usbDevice) {
        const res = await window.api.adbPushSingle({ serial: usbDevice.serial, localPath: r.tmpPath, remotePath: `/sdcard/Download/${r.filename}` })
        setMsg(res?.ok ? `✓ ${r.filename} en tablet` : '✗ Error', res?.ok)
        if (res?.ok) addLog(`✓ ${r.filename} → tablet`, 'ok')
      } else {
        const res = await window.api?.copyToDrop({ src: r.tmpPath, folder })
        setMsg(res?.ok ? '✓ En Drop' : '✗ Error', res?.ok)
      }
      setSending(false)
      setTimeout(() => setMsg(''), 3000)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [folder, usbDevice])

  // Drag & drop
  const handleDrop = async (e) => {
    e.preventDefault(); setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (!files.length) return
    setSending(true)
    for (const f of files) {
      if (!f.path) continue
      setMsg(`Enviando ${f.name}…`, true)
      if (usbDevice) await window.api?.adbPushSingle({ serial: usbDevice.serial, localPath: f.path, remotePath: `/sdcard/Download/${f.name}` })
      else await window.api?.copyToDrop({ src: f.path, folder })
    }
    setSending(false)
    setTimeout(() => setMsg(''), 3000)
  }

  const launch = async () => {
    if (!connected) return
    setRunning(true)
    setMsg('Iniciando…', true)

    if (launchMode === 'control') {
      const r = await toggleControlMode({ noAudio })
      if (r?.active !== undefined) {
        setRunning(r.active)
        setMsg(r.active ? '🖱️ Control activo — Ctrl+U para desactivar' : 'Control desactivado', r.active)
        addLog(r.active ? 'Control Total activado' : 'Control Total desactivado', r.active ? 'ok' : 'info')
      }
      return
    }

    const opts = {
      serial: connected.serial,
      fullscreen,
      noClip,
      bitrate,
      maxFps: maxFps !== 60 ? maxFps : undefined,
      turnScreenOff,
      stayAwake,
      noAudio,
      audioOnly: launchMode === 'audio',
      mouseMode: mouseMode !== 'sdk' ? mouseMode : undefined,
      keyboardMode: keyboardMode !== 'sdk' ? keyboardMode : undefined,
      startApp: startApp.trim() || undefined,
    }
    const r = await launchScrcpy(opts)
    if (r?.ok) {
      setMsg(`● Corriendo${r.version ? ` · scrcpy v${r.version}` : ''}`, true)
      addLog('scrcpy iniciado', 'ok')
    } else {
      setMsg(`✗ ${r?.out?.split('\n')[0] || 'error'}`, false)
      if (r?.args) addLog(`scrcpy ${r.args.join(' ')}`, 'error')
      setRunning(false)
    }
  }

  const stop = () => {
    if (launchMode === 'control') toggleControlMode()
    setRunning(false)
    setMsg('')
  }

  const takeScreenshot = async () => {
    if (!connected || capturing) return
    setCapturing(true)
    const r = await window.api?.adbScreenshot({ serial: connected.serial })
    if (r?.ok && r.base64) {
      setScreenshot(r.base64)
      addLog('Captura tomada', 'ok')
    }
    setCapturing(false)
  }

  const handleInstallScript = async () => {
    setInstalling(true)
    const r = await installControlScript()
    if (r?.ok) { setScriptInstalled(true); setMsg(`✓ Script: ${r.script}`, true) }
    else setMsg(`✗ ${r?.error}`, false)
    setInstalling(false)
  }

  const g = { background: 'rgba(12,14,20,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }
  const card = { ...g, borderRadius: 12, border: '0.5px solid var(--border-lit)', padding: 14 }
  const isControl = launchMode === 'control'
  const purple = '#a78bfa'

const overlayBg    = darkMode ? 'rgba(0,0,0,0.60)'       : 'rgba(255,255,255,0.88)'
const barBg        = darkMode ? 'rgba(0,0,0,0.50)'       : 'rgba(220,224,238,0.92)'
const bottomBg     = darkMode ? 'rgba(0,0,0,0.65)'       : 'rgba(210,214,230,0.96)'
const badgeBorder  = darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)'
const modeActiveBg = darkMode ? 'rgba(0,0,0,0.60)'       : 'rgba(255,255,255,0.90)'
const modeInactBg  = darkMode ? 'rgba(0,0,0,0.30)'       : 'rgba(200,204,220,0.60)'
const modeInactTxt = darkMode ? 'rgba(255,255,255,0.50)' : 'var(--text-3)'
const statusTxt    = darkMode ? 'rgba(255,255,255,0.80)' : 'var(--text-1)'
const statusSubTxt = darkMode ? 'rgba(255,255,255,0.40)' : 'var(--text-3)'
const badgeTitle   = darkMode ? '#fff'                   : 'var(--text-h)'
const badgeBody    = darkMode ? 'rgba(255,255,255,0.65)' : 'var(--text-2)'
const captureBg    = darkMode ? 'rgba(0,0,0,0.50)'       : 'rgba(220,224,238,0.90)'
const captureBorder= darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
const captureColor = darkMode ? 'rgba(255,255,255,0.80)' : 'var(--text-1)'

  return (
    <div onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={e => { e.preventDefault(); setDragging(false) }} onDrop={handleDrop}
      style={{ height: '100%', display: 'flex', overflow: 'hidden', background: 'transparent', position: 'relative', outline: dragging ? '2px dashed var(--accent)' : 'none' }}>

      {screenshot && <ScreenshotOverlay base64={screenshot} onClose={() => setScreenshot(null)} />}
      {showQrModal && <QrWifiConnect onClose={() => setShowQrModal(false)} onConnected={(serial) => { setShowQrModal(false); addLog(`Wi-Fi conectado: ${serial}`, 'ok') }} addLog={addLog} usbDevice={usbDevice} />}

      {dragging && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ ...g, borderRadius: 16, padding: '20px 36px', border: '1.5px solid var(--accent-border)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>{usbDevice ? '📲' : '📂'}</div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{usbDevice ? 'Enviar a tablet' : 'Enviar a Drop'}</p>
          </div>
        </div>
      )}

      {/* ══ PANEL IZQUIERDO: estado + botón ══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '0.5px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>

        {/* Selector de modo */}
        <div style={{ display: 'flex', padding: '12px 12px 0', gap: 6, flexShrink: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
          {[
            { id: 'mirror',  label: '🖥️ Espejo',       desc: 'Ver pantalla' },
            { id: 'control', label: '🖱️ Control total', desc: 'Mouse + teclado' },
            { id: 'audio',   label: '🎵 Solo audio',    desc: 'Escuchar tablet' },
          ].map(m => (
            <button key={m.id} onClick={() => { if (!running) setLaunchMode(m.id) }} title={m.desc} style={{
              flex: 1, padding: '8px 4px', borderRadius: 9, cursor: running ? 'default' : 'pointer',
              background: launchMode === m.id ? (m.id==='control' ? 'rgba(139,92,246,0.35)' : 'rgba(0,0,0,0.6)') : 'rgba(0,0,0,0.3)',
              border: `1px solid ${launchMode === m.id ? (m.id==='control' ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.2)') : 'rgba(255,255,255,0.08)'}`,
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              opacity: running && launchMode !== m.id ? 0.35 : 1, transition: 'all 0.15s',
            }}>
              <div style={{ fontSize: 13 }}>{m.label.split(' ')[0]}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: launchMode === m.id ? (m.id === 'control' ? purple : 'var(--accent)') : 'var(--text-3)', marginTop: 1 }}>{m.label.slice(2)}</div>
            </button>
          ))}
        </div>

        {/* Info de estado */}
        <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? (running ? '#22c55e' : '#6b7280') : '#ef4444', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
            {connected ? (connected.model || connected.serial) : 'Sin dispositivo'}
            {connected && <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>{usbDevice ? 'USB' : 'Wi-Fi'}</span>}
          </span>
          {status && <span style={{ fontSize: 11, color: statusOk ? '#22c55e' : '#ef4444', marginLeft: 4 }}>{status}</span>}
          {sending && <span style={{ fontSize: 10, color: '#f59e0b', animation: 'pulse 1s infinite' }}>Enviando…</span>}
        </div>

        {/* Área central — transparente, badge */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {running ? (
            // Estado activo — info compacta
            <div style={{ textAlign:'center', padding:'24px 32px', borderRadius:18, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', border:'1px solid rgba(255,255,255,0.15)', boxShadow:'0 8px 40px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: 36, marginBottom: 10, animation: 'pulse 2s infinite' }}>
                {launchMode === 'control' ? '🖱️' : launchMode === 'audio' ? '🎵' : '🖥️'}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: launchMode === 'control' ? purple : 'var(--accent)', marginBottom: 4 }}>
                {launchMode === 'control' ? 'Control activo' : launchMode === 'audio' ? 'Reproduciendo audio' : 'Espejo activo'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                {launchMode === 'control' && 'El mouse y teclado controlan la tablet'}
                {launchMode === 'mirror' && `${bitrate} Mbps · ${maxFps} fps${noAudio ? ' · sin audio' : ''}`}
                {launchMode === 'audio' && 'Audio de la tablet en el PC'}
              </div>
              {startApp && running && <div style={{ fontSize: 10, color: purple, marginTop: 4 }}>App: {PKG_NAMES[startApp] || startApp.split('.').pop()}</div>}
            </div>
          ) : (
            <div style={{ textAlign:'center', padding:'24px 32px', borderRadius:18, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', border:'1px solid rgba(255,255,255,0.15)', boxShadow:'0 8px 40px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.8 }}>
                {launchMode === 'control' ? '🖱️' : launchMode === 'audio' ? '🎵' : '🖥️'}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
                {launchMode === 'control' && 'Control total'}
                {launchMode === 'mirror' && 'Espejo'}
                {launchMode === 'audio' && 'Solo audio'}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                {launchMode === 'control' && 'Ctrl+U'}
                {launchMode === 'mirror' && `${bitrate} Mbps · ${maxFps} fps`}
                {launchMode === 'audio' && '— sin video —'}
              </div>
            </div>
          )}
        </div>

        {/* Barra de acciones */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '0.5px solid rgba(255,255,255,0.1)', alignItems: 'center', flexShrink: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
          <button onClick={running ? stop : launch} disabled={!connected}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '9px 0', borderRadius: 10, fontWeight: 700, fontSize: 13,
              background: running ? 'rgba(239,68,68,0.15)' : connected ? (isControl ? 'rgba(139,92,246,0.25)' : 'var(--accent)') : 'var(--bg-elem)',
              color: running ? '#ef4444' : connected ? (isControl ? purple : '#fff') : 'var(--text-3)',
              border: running ? '0.5px solid rgba(239,68,68,0.4)' : isControl ? '0.5px solid rgba(139,92,246,0.4)' : 'none',
              cursor: connected ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
            }}>
            {running ? <><Pause size={13}/> Detener</> : <><Play size={13}/> {launchMode === 'control' ? 'Activar control' : launchMode === 'audio' ? 'Iniciar audio' : 'Iniciar espejo'}</>}
          </button>
          <button onClick={takeScreenshot} disabled={!connected || capturing} title="Captura de pantalla"
            style={{ padding: '9px 13px', borderRadius: 10, border: '0.5px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)', color: connected ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)', cursor: connected ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600 }}>
            <Camera size={13} style={{ animation: capturing ? 'pulse 1s infinite' : 'none' }}/> {capturing ? '…' : 'Captura'}
          </button>
          <button onClick={() => setShowQrModal(true)} title="Conectar Wi-Fi via QR" style={{ padding: '9px 13px', borderRadius: 10, border: '0.5px solid rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.10)', color: '#3b82f6', cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: 14 }}>
            📡
          </button>
        </div>
      </div>

      {/* ══ PANEL DERECHO: opciones ══ */}
      <div style={{ width: 272, flexShrink: 0, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* ── MODO CONTROL TOTAL ── */}
        {launchMode === 'control' && (<>
          <div style={{ ...card, borderColor: 'rgba(139,92,246,0.3)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: purple, letterSpacing: '0.08em', marginBottom: 10 }}>ENTRADA</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {INPUT_MODES.map(m => (
                <button key={m.id} onClick={() => setInputMode(m.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                  background: inputMode === m.id ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                  border: `0.5px solid ${inputMode === m.id ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
                }}>
                  <span style={{ fontSize: 16 }}>{m.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: inputMode === m.id ? purple : 'var(--text-1)', flex: 1 }}>{m.label}</span>
                  {m.hint && <span style={{ fontSize: 9, color: purple, background: 'rgba(139,92,246,0.15)', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>{m.hint}</span>}
                </button>
              ))}
            </div>
          </div>

          <div style={{ ...card, borderColor: 'rgba(139,92,246,0.3)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: purple, letterSpacing: '0.08em', marginBottom: 10 }}>AUDIO</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Chip label="🔊 Activado" active={!noAudio} onClick={() => setNoAudio(false)} color={purple} />
              <Chip label="🔇 Silencio" active={noAudio} onClick={() => setNoAudio(true)} color={purple} />
            </div>
          </div>

          <div style={{ ...card, borderColor: 'rgba(139,92,246,0.3)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: purple, letterSpacing: '0.08em', marginBottom: 8 }}>ATAJOS</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 0', background: 'rgba(139,92,246,0.08)', borderRadius: 8, border: '0.5px solid rgba(139,92,246,0.2)' }}>
                <span style={{ fontFamily: 'monospace', color: purple, fontSize: 11, fontWeight: 700 }}>Ctrl+U</span>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 0', background: 'rgba(139,92,246,0.08)', borderRadius: 8, border: '0.5px solid rgba(139,92,246,0.2)' }}>
                <span style={{ color: purple, fontSize: 13 }}>↘ 0.6s</span>
              </div>
            </div>
            <button onClick={handleInstallScript} disabled={installing || scriptInstalled} style={{
              width: '100%', padding: '7px 0', borderRadius: 8, fontWeight: 700, fontSize: 11,
              background: scriptInstalled ? 'rgba(34,197,94,0.12)' : 'rgba(139,92,246,0.15)',
              color: scriptInstalled ? 'var(--success)' : purple,
              border: `0.5px solid ${scriptInstalled ? 'rgba(34,197,94,0.3)' : 'rgba(139,92,246,0.3)'}`,
              cursor: scriptInstalled ? 'default' : 'pointer',
            }}>
              {installing ? '⏳ Instalando…' : scriptInstalled ? '✓ Script instalado' : '📥 Instalar script'}
            </button>
          </div>

          <div style={{ ...card }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>COMANDO</div>
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: purple, background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '7px 9px', lineHeight: 1.7, wordBreak: 'break-all', userSelect: 'all' }}>
              scrcpy --no-video {noAudio ? '--no-audio ' : ''}--mouse={mouseMode} --keyboard={keyboardMode} --stay-awake
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 5 }}>
              Entrada: {INPUT_MODES.find(m => m.id === inputMode)?.icon} {INPUT_MODES.find(m => m.id === inputMode)?.label}
            </div>
          </div>
        </>)}

        {/* ── MODO ESPEJO ── */}
        {launchMode === 'mirror' && (<>
          <div style={card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 10 }}>VIDEO</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              <Chip label="Pantalla completa" active={fullscreen} onClick={() => setFullscreen(v => !v)} />
              <Chip label="📴 Apagar tablet" active={turnScreenOff} onClick={() => setTurnScreenOff(v => !v)} />
              <Chip label="⚡ Mantener encendida" active={stayAwake} onClick={() => setStayAwake(v => !v)} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Calidad</span>
                <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>{bitrate} Mbps</span>
              </div>
              <input type="range" min={1} max={20} step={1} value={bitrate} onChange={e => setBitrate(Number(e.target.value))} style={{ width: '100%' }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 5 }}>FPS</div>
              <div style={{ display: 'flex', gap: 5 }}>
                {[15,30,60].map(f => (
                  <button key={f} onClick={() => setMaxFps(f)} style={{ flex:1, padding:'4px 0', borderRadius:7, fontSize:11, fontWeight:600, background:maxFps===f?'var(--accent-soft)':'rgba(255,255,255,0.04)', color:maxFps===f?'var(--accent)':'var(--text-3)', border:`0.5px solid ${maxFps===f?'var(--accent-border)':'rgba(255,255,255,0.08)'}`, cursor:'pointer' }}>{f}</button>
                ))}
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 10 }}>AUDIO</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Chip label="🔊 Con audio" active={!noAudio} onClick={() => setNoAudio(false)} />
              <Chip label="🔇 Sin audio" active={noAudio} onClick={() => setNoAudio(true)} />
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 10 }}>ENTRADA</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {INPUT_MODES.map(m => (
                <button key={m.id} onClick={() => setInputMode(m.id)} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '7px 4px', borderRadius: 9, cursor: 'pointer',
                  background: inputMode === m.id ? 'var(--accent-soft)' : 'rgba(255,255,255,0.04)',
                  border: `0.5px solid ${inputMode === m.id ? 'var(--accent-border)' : 'rgba(255,255,255,0.08)'}`,
                }}>
                  <span style={{ fontSize: 15 }}>{m.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: inputMode === m.id ? 'var(--accent)' : 'var(--text-3)' }}>{m.label}</span>
                </button>
              ))}
            </div>
            <Chip label="📋 Sin portapapeles" active={noClip} onClick={() => setNoClip(v => !v)} />
          </div>

          <AppSelector startApp={startApp} setStartApp={setStartApp} connected={!!connected} serial={connected?.serial} />
        </>)}

        {/* ── MODO SOLO AUDIO ── */}
        {launchMode === 'audio' && (
          <div style={card}>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🎵</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-h)' }}>Solo audio · sin video</div>
            </div>
          </div>
        )}

        {/* Atajos siempre visibles */}
        <div style={card}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 8 }}>ATAJOS</div>
          {[
            ['Ctrl+V', 'Pegar imagen → tablet'],
            ['Drop', 'Arrastrar archivo'],
          ].map(([k, l]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{l}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 10, background: 'rgba(255,255,255,0.07)', border: '0.5px solid var(--border-lit)', borderRadius: 5, padding: '2px 7px', color: 'var(--text-1)' }}>{k}</span>
            </div>
          ))}
        </div>

      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  )
}