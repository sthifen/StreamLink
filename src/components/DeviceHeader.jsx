import React, { useEffect, useState, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { adbDevices, adbMediaInfo, adbMediaCmd } from '../api.js'

const RECENT_KEY   = 'adb-recent-wifi'
const PRIORITY_KEY = 'adb-priority-serial'

function getRecent()   { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] } }
function getPriority() { try { return localStorage.getItem(PRIORITY_KEY) || null } catch { return null } }
function setPriority(serial) { try { if (serial) localStorage.setItem(PRIORITY_KEY, serial); else localStorage.removeItem(PRIORITY_KEY) } catch {} }
function saveRecent(serial, model) {
  try {
    const prev = getRecent().filter(r => r.serial !== serial)
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ serial, model, ts: Date.now() }, ...prev].slice(0, 8)))
  } catch {}
}

// ─── Panel flotante ────────────────────────────────────────────────────────────
function DevicePanel({ devices, prioritySerial, onPriority, onClose, onRefresh, anchorRef }) {
  const [recent,        setRecent]        = useState(getRecent)
  const [connecting,    setConnecting]    = useState(null)
  const [disconnecting, setDisconnecting] = useState(null)
  const [msg,           setMsg]           = useState(null)
  const [pos,           setPos]           = useState({ top: 0, left: 0 })
  const [quickMode,     setQuickMode]     = useState(null) // null|'ip'|'usb'|'manual'
  const panelRef = useRef(null)

  useEffect(() => {
    if (!anchorRef.current) return
    const r = anchorRef.current.getBoundingClientRect()
    const panelW = 300
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8)) })
  }, [])

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const flash = (text, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3000) }

  const disconnect = async (serial) => {
    setDisconnecting(serial)
    try {
      await window.api.adbDisconnect(serial)
      flash('Desconectado: ' + serial, true)
      if (prioritySerial === serial) { onPriority(null) }
      setTimeout(onRefresh, 600)
    } catch (e) { flash('Error: ' + e.message, false) }
    setDisconnecting(null)
  }

  const connect = async (serial) => {
    setConnecting(serial)
    try {
      const r = await window.api.adbConnect(serial)
      if (r?.out?.includes('connected') || r?.ok) {
        flash('Conectado: ' + serial, true)
        saveRecent(serial, serial)
        setRecent(getRecent())
        setTimeout(onRefresh, 600)
      } else { flash(r?.out || 'No se pudo conectar', false) }
    } catch (e) { flash('Error: ' + e.message, false) }
    setConnecting(null)
  }

  const connected  = devices.filter(d => d.status === 'device')
  const unauth     = devices.filter(d => d.status === 'unauthorized')
  const connSet    = new Set(connected.map(d => d.serial))
  const recentOff  = getRecent().filter(r => !connSet.has(r.serial))

  const glass = {
    position: 'fixed', top: pos.top, left: pos.left, width: 300, zIndex: 9999,
    background: 'rgba(10,12,18,0.97)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)',
    border: '0.5px solid rgba(255,255,255,0.13)', borderRadius: 14,
    boxShadow: '0 24px 64px rgba(0,0,0,0.7)', overflow: 'hidden',
  }
  const secLbl = { fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '10px 14px 5px' }
  const iBtn = (color = 'rgba(255,255,255,0.5)') => ({ background: 'none', border: 'none', cursor: 'pointer', color, padding: '3px 6px', borderRadius: 6, fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 })
  const rowBg = (active) => ({ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 14px', background: active ? 'rgba(34,197,94,0.08)' : 'transparent', borderBottom: '0.5px solid rgba(255,255,255,0.06)', transition: 'background 0.12s' })

  return ReactDOM.createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
      <div ref={panelRef} style={glass}>

        {/* Header */}
        <div style={{ padding: '12px 14px 8px', borderBottom: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>Dispositivos ADB</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onRefresh} style={{ ...iBtn('var(--accent)'), fontSize: 13 }} title="Refrescar">↻</button>
            <button onClick={onClose}  style={{ ...iBtn('#ef4444'), fontSize: 14 }}>✕</button>
          </div>
        </div>

        {/* Flash */}
        {msg && <div style={{ padding: '7px 14px', fontSize: 11, fontWeight: 600, color: msg.ok ? 'var(--success)' : '#ef4444', background: msg.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>{msg.text}</div>}

        {/* Conectados */}
        {connected.length > 0 && <>
          <div style={{ ...secLbl, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 14 }}>
            <span>Conectados</span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>⭐ = prioridad (Pantalla + Transferencia)</span>
          </div>
          {connected.map(d => {
            const isWifi = /^\d/.test(d.serial)
            const isPriority = prioritySerial === d.serial || (!prioritySerial && d === connected[0])
            const isDc = disconnecting === d.serial
            return (
              <div key={d.serial}
                style={rowBg(true)}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.13)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.08)'}
              >
                {/* Estrella de prioridad */}
                <button
                  onClick={() => onPriority(isPriority ? null : d.serial)}
                  title={isPriority ? 'Es el dispositivo prioritario — clic para quitar prioridad' : 'Hacer prioritario'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '0 2px', flexShrink: 0, opacity: isPriority ? 1 : 0.25, transition: 'opacity 0.15s', filter: isPriority ? 'drop-shadow(0 0 4px gold)' : 'none' }}
                >⭐</button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isPriority ? '#fbbf24' : 'var(--success)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {isPriority ? '⭐ ' : ''}{d.model || d.serial}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
                    {isWifi ? '📶' : '🔌'} {d.serial}
                  </div>
                </div>

                {isWifi && (
                  <button onClick={() => disconnect(d.serial)} disabled={isDc}
                    style={{ ...iBtn('#ef4444'), opacity: isDc ? 0.5 : 1, border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '4px 8px', background: 'rgba(239,68,68,0.08)', flexShrink: 0 }}>
                    {isDc ? '…' : '⏏'}
                  </button>
                )}
              </div>
            )
          })}
        </>}

        {/* Sin autorizar */}
        {unauth.length > 0 && <>
          <div style={secLbl}>Sin autorizar</div>
          {unauth.map(d => (
            <div key={d.serial} style={{ ...rowBg(false), background: 'rgba(245,158,11,0.06)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning)' }}>Tablet detectada</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Acepta la autorización ADB en la tablet</div>
              </div>
            </div>
          ))}
        </>}

        {/* Sin dispositivos */}
        {connected.length === 0 && unauth.length === 0 && (
          <div style={{ padding: '16px 14px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Sin dispositivos conectados</div>
        )}

        {/* Recientes offline */}
        {recentOff.length > 0 && <>
          <div style={{ ...secLbl, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 14 }}>
            <span>Recientes (WiFi)</span>
            <button onClick={() => { localStorage.removeItem(RECENT_KEY); setRecent([]) }} style={{ ...iBtn('rgba(255,255,255,0.25)'), fontSize: 10 }}>Limpiar</button>
          </div>
          {recentOff.map(r => {
            const isConn = connecting === r.serial
            return (
              <div key={r.serial} style={rowBg(false)}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.model || r.serial}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>📶 {r.serial}</div>
                </div>
                <button onClick={() => connect(r.serial)} disabled={isConn}
                  style={{ ...iBtn('var(--accent)'), opacity: isConn ? 0.5 : 1, border: '0.5px solid rgba(79,110,247,0.3)', borderRadius: 6, padding: '4px 8px', background: 'var(--accent-soft)', flexShrink: 0 }}>
                  {isConn ? '…' : '🔗 Conectar'}
                </button>
              </div>
            )
          })}
        </>}

        {/* QuickConnect expandible */}
        <QuickConnect
          devices={devices}
          mode={quickMode} setMode={setQuickMode}
          onConnect={(serial, model) => { saveRecent(serial, model); setRecent(getRecent()); onRefresh(); flash('Conectado: ' + serial, true) }}
          flash={flash}
        />
      </div>
    </>,
    document.body
  )
}

// ─── QuickConnect con todos los modos ─────────────────────────────────────────
function QuickConnect({ devices, mode, setMode, onConnect, flash }) {
  const [addr,    setAddr]    = useState('')
  const [port,    setPort]    = useState('5555')
  const [pairPort,setPairPort]= useState('')
  const [code,    setCode]    = useState('')
  const [loading, setLoading] = useState(false)
  const [usbStep, setUsbStep] = useState('idle')
  const [status,  setStatus]  = useState(null)

  const usbDevice = devices?.find(d => d.status === 'device' && !d.serial?.includes(':'))

  const inp = { background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 7, padding: '6px 9px', color: '#fff', fontSize: 12, fontFamily: 'monospace', outline: 'none' }
  const sBtn = (bg, color, disabled = false) => ({ padding: '6px 11px', borderRadius: 7, border: 'none', background: disabled ? 'rgba(255,255,255,0.05)' : bg, color: disabled ? 'rgba(255,255,255,0.25)' : color, fontSize: 11, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', transition: 'all 0.12s' })
  const cancel = () => { setMode(null); setUsbStep('idle'); setStatus(null); setAddr(''); setCode(''); setPairPort('') }

  const connectIp = async () => {
    if (!addr.trim() || loading) return
    setLoading(true)
    const full = addr.trim().includes(':') ? addr.trim() : addr.trim() + ':5555'
    const r = await window.api.adbConnect(full)
    if (r?.out?.includes('connected') || r?.ok) { onConnect(full, full); cancel() }
    else flash(r?.out || 'No se pudo conectar', false)
    setLoading(false)
  }

  const connectManual = async () => {
    if (!addr.trim() || !pairPort.trim() || code.trim().length < 4 || loading) return
    setLoading(true)
    setStatus({ ok: null, text: 'Emparejando...' })
    const r = await window.api?.adbWirelessPairConnect({ ip: addr.trim(), pairPort: pairPort.trim(), code: code.trim() })
    if (!r?.ok) { setStatus({ ok: false, text: r?.error || r?.out || 'No se pudo conectar' }); setLoading(false); return }
    setStatus({ ok: true, text: 'Conectado: ' + r.serial })
    onConnect(r.serial, r.serial)
    setTimeout(cancel, 800)
    setLoading(false)
  }

  const runTcpip = async () => {
    if (!usbDevice || loading) return
    setLoading(true); setUsbStep('tcpip')
    const r = await window.api.adbTcpip(parseInt(port))
    if (r?.ok || (r?.out || '').includes('restarting')) {
      try {
        const ip = await window.api.adbShell({ serial: usbDevice.serial, cmd: "ip route get 1 | awk '{print $7}' | head -1" })
        const det = (ip?.out || '').trim()
        if (det && /^\d+\.\d+/.test(det)) setAddr(det)
      } catch {}
      setUsbStep('connecting')
      flash('TCP/IP activado. Podés desconectar el USB.', true)
    } else { flash(r?.out || 'Error TCP/IP', false); setUsbStep('idle') }
    setLoading(false)
  }

  const connectUsb = async () => {
    if (!addr.trim() || loading) return
    setLoading(true)
    const full = addr.trim() + ':' + port
    const r = await window.api.adbConnect(full)
    if (r?.out?.includes('connected') || r?.ok) { onConnect(full, full); cancel() }
    else flash(r?.out || 'No se pudo conectar', false)
    setLoading(false)
  }

  return (
    <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.08)', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>

      {/* Botones de modo */}
      {!mode && (
        <div style={{ display: 'flex', gap: 5 }}>
          {[
            { id: 'ip',     label: '+ IP directa',  bg: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.45)', border: '0.5px dashed rgba(255,255,255,0.15)' },
            { id: 'manual', label: '✏️ Código',      bg: 'rgba(59,130,246,0.07)',  color: '#93c5fd',               border: '0.5px dashed rgba(59,130,246,0.3)'   },
            { id: 'usb',    label: '🔌 USB→WiFi',   bg: 'rgba(139,92,246,0.07)', color: '#a78bfa',               border: '0.5px dashed rgba(139,92,246,0.3)'   },
          ].map(b => (
            <button key={b.id} onClick={() => setMode(b.id)}
              style={{ flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 10, fontWeight: 700, cursor: 'pointer', background: b.bg, color: b.color, border: b.border, transition: 'all 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              {b.label}
            </button>
          ))}
        </div>
      )}

      {/* Modo IP directa */}
      {mode === 'ip' && (
        <>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em' }}>IP DIRECTA (ANDROID CON ADB TCP ACTIVO)</div>
          <div style={{ display: 'flex', gap: 5 }}>
            <input autoFocus value={addr} onChange={e => setAddr(e.target.value)} onKeyDown={e => e.key === 'Enter' && connectIp()} placeholder="192.168.0.x:5555" style={{ ...inp, flex: 1 }} />
            <button onClick={connectIp} disabled={!addr.trim() || loading} style={sBtn('var(--accent)', '#fff', !addr.trim() || loading)}>{loading ? '…' : '→'}</button>
            <button onClick={cancel} style={sBtn('rgba(255,255,255,0.07)', 'rgba(255,255,255,0.4)')}>✕</button>
          </div>
        </>
      )}

      {/* Modo Manual (código de vinculación) */}
      {mode === 'manual' && (
        <>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#93c5fd', letterSpacing: '0.1em' }}>CÓDIGO MANUAL — ANDROID 11+ · DEPURACIÓN INALÁMBRICA</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
            Ajustes → Opciones de desarrollador → Depuración inalámbrica → <strong style={{ color: 'rgba(255,255,255,0.6)' }}>Vincular con código</strong>
          </div>
          <input value={addr} onChange={e => setAddr(e.target.value)} placeholder="IP  (192.168.0.x)" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 5 }}>
            <input value={pairPort} onChange={e => setPairPort(e.target.value)} placeholder="Puerto (43811)" style={{ ...inp, flex: 1 }} />
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g,'').slice(0,8))} placeholder="Código" style={{ ...inp, flex: 1, letterSpacing: '0.15em', textAlign: 'center' }} maxLength={8} />
          </div>
          {status && <div style={{ fontSize: 10, padding: '5px 9px', borderRadius: 6, fontFamily: 'monospace', color: status.ok === true ? '#22c55e' : status.ok === false ? '#ef4444' : '#f59e0b', background: status.ok === true ? 'rgba(34,197,94,0.08)' : status.ok === false ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)' }}>{status.text}</div>}
          <div style={{ display: 'flex', gap: 5 }}>
            <button onClick={connectManual} disabled={!addr.trim() || !pairPort.trim() || code.trim().length < 4 || loading} style={{ ...sBtn('rgba(59,130,246,0.2)', '#93c5fd', !addr.trim() || !pairPort.trim() || code.trim().length < 4 || loading), flex: 1 }}>
              {loading ? '⏳ Conectando…' : '🔗 Vincular y conectar'}
            </button>
            <button onClick={cancel} style={sBtn('rgba(255,255,255,0.07)', 'rgba(255,255,255,0.4)')}>✕</button>
          </div>
        </>
      )}

      {/* Modo USB→WiFi */}
      {mode === 'usb' && (
        <>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.1em' }}>USB→WIFI — SAMSUNG S8+ Y ANDROID ANTERIOR A 11</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 7, background: usbDevice ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: '0.5px solid ' + (usbDevice ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)') }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: usbDevice ? 'var(--success)' : '#ef4444', flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: usbDevice ? 'var(--success)' : '#ef4444' }}>
              {usbDevice ? '🔌 USB: ' + (usbDevice.model || usbDevice.serial) : 'Sin tablet USB conectada'}
            </span>
          </div>

          {usbStep === 'idle' && (
            <>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Conecta el cable USB, luego activa TCP/IP:</div>
              <div style={{ display: 'flex', gap: 5 }}>
                <input value={port} onChange={e => setPort(e.target.value.replace(/\D/g,''))} placeholder="Puerto (5555)" style={{ ...inp, width: 100, flexShrink: 0 }} />
                <button onClick={runTcpip} disabled={!usbDevice || loading} style={{ ...sBtn('rgba(139,92,246,0.2)', '#a78bfa', !usbDevice || loading), flex: 1 }}>
                  {loading ? '…' : '⚡ Activar TCP/IP'}
                </button>
                <button onClick={cancel} style={sBtn('rgba(255,255,255,0.07)', 'rgba(255,255,255,0.4)')}>✕</button>
              </div>
            </>
          )}

          {usbStep === 'connecting' && (
            <>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>TCP/IP activo. Podés desconectar el cable. Ingresá la IP:</div>
              <div style={{ display: 'flex', gap: 5 }}>
                <input value={addr} onChange={e => setAddr(e.target.value)} placeholder="192.168.0.x" style={{ ...inp, flex: 1 }} />
                <button onClick={connectUsb} disabled={!addr.trim() || loading} style={sBtn('var(--accent)', '#fff', !addr.trim() || loading)}>{loading ? '…' : '→'}</button>
                <button onClick={cancel} style={sBtn('rgba(255,255,255,0.07)', 'rgba(255,255,255,0.4)')}>✕</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ─── Mini widget "ahora suena" ────────────────────────────────────────────────
function MediaMini({ serial }) {
  const [info, setInfo] = useState(null)

  useEffect(() => {
    if (!serial) return
    const poll = async () => {
      const r = await adbMediaInfo({ serial })
      setInfo(r?.hasData ? r : null)
    }
    poll()
    const id = setInterval(poll, 4000)
    return () => clearInterval(id)
  }, [serial])

  if (!info) return null

  const cmd = (c) => adbMediaCmd({ serial, cmd: c })

  return (
    <div style={{ marginTop: 8, padding: '7px 10px', background: 'var(--bg-elem)', border: '0.5px solid var(--border)', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-h)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {info.title || '—'}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {info.artist || ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {['prev','play_pause','next'].map((c, i) => (
          <button key={c} onClick={() => cmd(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 12, padding: '2px 4px', borderRadius: 5, lineHeight: 1 }}>
            {['⏮', info.playing ? '⏸' : '▶', '⏭'][i]}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── DeviceHeader ─────────────────────────────────────────────────────────────
export default function DeviceHeader({ devices, setDevices, config, hasWallpaper, collapsed, prioritySerial, onPriority }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)
  const interval  = config.poll_interval || 2500

  const poll = useCallback(() => adbDevices().then(d => {
    setDevices(d)
    d.filter(x => x.status === 'device' && /^\d/.test(x.serial)).forEach(x => saveRecent(x.serial, x.model))
  }), [setDevices])

  useEffect(() => { poll(); const id = setInterval(poll, interval); return () => clearInterval(id) }, [interval, poll])

  const connected = devices.filter(d => d.status === 'device')
  const unauth    = devices.find(d => d.status === 'unauthorized')

  // El dispositivo que muestra el pill es el prioritario, o el primero
  const primary = connected.find(d => d.serial === prioritySerial) || connected[0]
  const isWifi  = primary && /^\d/.test(primary.serial)
  const name    = primary ? (primary.model || primary.serial) : unauth ? 'Tablet detectada' : 'Sin dispositivo'
  const sub     = primary
    ? (connected.length > 1 ? `${isWifi ? 'WiFi' : 'USB'} · ${connected.length} dispositivos` : `${isWifi ? 'WiFi' : 'USB'} conectado`)
    : unauth ? 'Acepta autorización ADB' : 'Conecta por USB'
  const dotColor = primary ? 'var(--success)' : unauth ? 'var(--warning)' : 'var(--text-3)'
  const isConn   = !!primary

  if (collapsed) return (
    <div style={{ padding: '12px 0 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📱</div>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor }} />
      {connected.length > 1 && <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 4, padding: '1px 5px' }}>{connected.length}</div>}
      <div style={{ height: 0.5, background: 'var(--border-lit)', width: '80%' }} />
    </div>
  )

  return (
    <div style={{ padding: '14px 12px 10px', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
      {/* App header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>📱</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)', lineHeight: 1.2 }}>Sync Tablet</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>samsung SM-P613</div>
        </div>
      </div>

      {/* Pill clickeable */}
      <div ref={anchorRef} onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 7, background: isConn ? 'var(--success-soft)' : 'var(--bg-elem)', border: '0.5px solid ' + (isConn ? 'rgba(34,197,94,0.25)' : 'var(--border)'), borderRadius: 8, padding: '5px 10px', cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        title="Gestionar dispositivos">
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: isConn ? 'var(--success)' : 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {prioritySerial && primary ? '⭐ ' : ''}{name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{sub}</div>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>▾</span>
      </div>

      {open && (
        <DevicePanel
          devices={devices}
          prioritySerial={prioritySerial || connected[0]?.serial}
          onPriority={onPriority}
          onClose={() => setOpen(false)}
          onRefresh={poll}
          anchorRef={anchorRef}
        />
      )}

      <MediaMini serial={primary?.serial} />
    </div>
  )
}