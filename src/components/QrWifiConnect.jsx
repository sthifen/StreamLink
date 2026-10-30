/**
 * QrWifiConnect.jsx
 * Conectar la tablet por WiFi ADB sin cable
 *
 * Modo QR  — la PC genera un QR, el teléfono lo escanea desde
 *             Opciones de desarrollador → Depuración inalámbrica → Vincular con QR
 * Modo Manual — usuario tipea IP:puerto + código de 6 dígitos
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom'

// ─── QR generator via CDN ────────────────────────────────────────────────────
let QRCodeLib = null
async function loadQRLib() {
  if (QRCodeLib) return QRCodeLib
  if (window.QRCode) { QRCodeLib = window.QRCode; return QRCodeLib }
  return new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
    s.onload  = () => { QRCodeLib = window.QRCode; res(QRCodeLib) }
    s.onerror = () => rej(new Error('No se pudo cargar la librería QR. Necesitás internet.'))
    document.head.appendChild(s)
  })
}

function QRCanvas({ text, size = 200 }) {
  const ref   = useRef(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!ref.current || !text) return
    setErr(null)
    ref.current.innerHTML = ''
    loadQRLib().then(QR => {
      if (!ref.current) return
      ref.current.innerHTML = ''
      try {
        new QR(ref.current, {
          text, width: size, height: size,
          colorDark: '#000000', colorLight: '#ffffff',
          correctLevel: QR.CorrectLevel.M,
        })
      } catch (e) { setErr(e.message) }
    }).catch(e => setErr(e.message))
    return () => { if (ref.current) ref.current.innerHTML = '' }
  }, [text, size])

  if (err) return (
    <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 11, textAlign: 'center', padding: 12 }}>
      ⚠️ {err}
    </div>
  )
  return <div ref={ref} style={{ width: size, height: size, borderRadius: 6, overflow: 'hidden' }} />
}

// ─── Colores ─────────────────────────────────────────────────────────────────
const C = {
  bg: 'rgba(10,12,18,0.98)', card: 'rgba(16,20,30,0.99)',
  border: 'rgba(255,255,255,0.09)', borderL: 'rgba(255,255,255,0.17)',
  accent: '#3b82f6', accentD: 'rgba(59,130,246,0.15)', accentB: 'rgba(59,130,246,0.4)',
  ok: '#22c55e', okD: 'rgba(34,197,94,0.15)', okB: 'rgba(34,197,94,0.35)',
  err: '#ef4444', errD: 'rgba(239,68,68,0.12)',
  warn: '#f59e0b', warnD: 'rgba(245,158,11,0.12)',
  t1: 'rgba(255,255,255,0.92)', t2: 'rgba(255,255,255,0.62)', t3: 'rgba(255,255,255,0.36)',
}

const btnS = (v = 'primary', disabled = false) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  padding: '9px 16px', borderRadius: 10, fontWeight: 700, fontSize: 12,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
  transition: 'all 0.15s', border: 'none',
  ...(v === 'primary' ? { background: C.accent, color: '#fff' }
    : v === 'ghost'   ? { background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, color: C.t2 }
    : v === 'ok'      ? { background: C.okD, border: `0.5px solid ${C.okB}`, color: C.ok }
    : v === 'warn'    ? { background: C.warnD, border: `0.5px solid rgba(245,158,11,0.3)`, color: C.warn }
    : v === 'err'     ? { background: C.errD, border: `0.5px solid rgba(239,68,68,0.3)`, color: C.err }
    : {})
})
const inp = { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, borderRadius: 9, padding: '8px 11px', color: C.t1, fontSize: 13, fontFamily: 'monospace', outline: 'none' }
const lbl = { fontSize: 9, fontWeight: 700, color: C.t3, letterSpacing: '0.1em', marginBottom: 5, display: 'block' }

// ─── Paso a paso Android ─────────────────────────────────────────────────────
function Steps({ items, color = C.accent }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {items.map((text, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: `${color}22`, border: `1px solid ${color}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color, flexShrink: 0, marginTop: 1 }}>{i+1}</span>
          <span style={{ fontSize: 11, color: C.t2, lineHeight: 1.6 }}>{text}</span>
        </div>
      ))}
    </div>
  )
}

// ─── MODO QR ─────────────────────────────────────────────────────────────────
function ModeQR({ onConnected, addLog }) {
  const [qrText,  setQrText]  = useState(null)
  const [status,  setStatus]  = useState('idle') // idle | loading | waiting | done | error
  const [error,   setError]   = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const pollRef  = useRef(null)
  const timerRef = useRef(null)

  const stop = useCallback(() => {
    clearInterval(pollRef.current)
    clearInterval(timerRef.current)
    window.api?.adbQrStop()
  }, [])

  const start = useCallback(async () => {
    stop()
    setError(null); setQrText(null); setElapsed(0); setStatus('loading')

    const r = await window.api?.adbQrStart()
    if (!r?.ok) {
      setError(r?.error || 'Error iniciando sesión QR')
      setStatus('error')
      return
    }

    setQrText(r.qrText)
    setStatus('waiting')
    addLog?.('QR generado, esperando tablet…', 'info')

    // Contador de tiempo
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)

    // Sondear cada 2s
    pollRef.current = setInterval(async () => {
      const p = await window.api?.adbQrPoll()
      if (p?.paired && p.serial) {
        stop()
        setStatus('done')
        addLog?.(`WiFi QR conectado: ${p.serial}`, 'ok')
        onConnected(p.serial)
      }
    }, 2000)
  }, [stop, addLog, onConnected])

  useEffect(() => { start(); return stop }, [])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const timeStr = mins > 0 ? `${mins}:${String(secs).padStart(2,'0')}` : `${secs}s`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>

      {/* Aviso importante */}
      <div style={{ width: '100%', background: C.warnD, border: `0.5px solid rgba(245,158,11,0.35)`, borderRadius: 10, padding: '10px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.warn, marginBottom: 4 }}>⚠️ Este QR es para ADB, no para la web</div>
        <div style={{ fontSize: 10, color: C.t2, lineHeight: 1.6 }}>
          No lo abrás con la cámara normal ni con el navegador. Tiene que escanearse desde <strong style={{ color: C.t1 }}>Opciones de desarrollador → Depuración inalámbrica</strong> de Android.
        </div>
      </div>

      {/* QR */}
      <div style={{ padding: 12, background: '#fff', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', position: 'relative' }}>
        {status === 'loading' && (
          <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>⏳</div>
        )}
        {qrText && status === 'waiting' && <QRCanvas text={qrText} size={200} />}
        {status === 'error' && (
          <div style={{ width: 200, height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 32 }}>⚠️</span>
            <span style={{ fontSize: 10, color: '#ef4444', textAlign: 'center', padding: '0 8px' }}>{error}</span>
          </div>
        )}
      </div>

      {/* Estado */}
      {status === 'waiting' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.accent, animation: 'qrPulse 1.2s ease-in-out infinite' }} />
          <span style={{ fontSize: 11, color: C.t2 }}>Esperando que la tablet escanee… {timeStr}</span>
        </div>
      )}

      {/* Instrucciones */}
      <div style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.t3, letterSpacing: '0.1em', marginBottom: 10 }}>EN LA TABLET (ANDROID 11+)</div>
        <Steps items={[
          'Ajustes → Información del dispositivo → Toca "Número de compilación" 7 veces',
          'Ajustes → Opciones de desarrollador → Depuración inalámbrica → Activar',
          'Toca "Vincular dispositivo con código QR"',
          'Apuntá la cámara al QR de arriba',
        ]} />
      </div>

      {(status === 'error' || status === 'waiting') && (
        <button style={{ ...btnS('ghost'), width: '100%' }} onClick={start}>
          🔄 Regenerar QR
        </button>
      )}
    </div>
  )
}

// ─── MODO MANUAL ─────────────────────────────────────────────────────────────
function ModeManual({ onConnected, addLog }) {
  const [ip,       setIp]       = useState('')
  const [pairPort, setPairPort] = useState('')
  const [code,     setCode]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [status,   setStatus]   = useState(null)

  const valid = ip.trim() && pairPort.trim() && code.trim().length >= 4

  const connect = async () => {
    if (!valid || loading) return
    setLoading(true); setStatus({ ok: null, msg: `Emparejando ${ip.trim()}:${pairPort.trim()}…` })

    const r = await window.api?.adbWirelessPairConnect({
      ip: ip.trim(), pairPort: pairPort.trim(), code: code.trim(),
    })

    if (!r?.ok) {
      setStatus({ ok: false, msg: r?.error || r?.out || 'No se pudo conectar' })
      setLoading(false); return
    }

    setStatus({ ok: true, msg: `✓ Conectado: ${r.serial}` })
    addLog?.(`WiFi ADB conectado: ${r.serial}`, 'ok')
    setLoading(false)
    setTimeout(() => onConnected(r.serial), 500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Instrucciones */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.t3, letterSpacing: '0.1em', marginBottom: 10 }}>EN LA TABLET (ANDROID 11+)</div>
        <Steps items={[
          'Ajustes → Opciones de desarrollador → Depuración inalámbrica → Activar',
          'Toca "Vincular dispositivo con código de vinculación"',
          'Anotá la IP, el puerto y el código de 6 dígitos que aparecen',
        ]} />
      </div>

      <div>
        <label style={lbl}>IP DEL DISPOSITIVO</label>
        <input style={inp} value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.1.100" />
      </div>

      <div>
        <label style={lbl}>PUERTO DE VINCULACIÓN (el que muestra la tablet)</label>
        <input style={inp} value={pairPort} onChange={e => setPairPort(e.target.value)} placeholder="43811" />
      </div>

      <div>
        <label style={lbl}>CÓDIGO DE 6 DÍGITOS</label>
        <input
          style={{ ...inp, letterSpacing: '0.3em', fontSize: 22, textAlign: 'center', padding: '10px' }}
          value={code} onChange={e => setCode(e.target.value.replace(/\D/g,'').slice(0,8))}
          placeholder="123456" maxLength={8}
        />
      </div>

      {status && (
        <div style={{ fontSize: 11, padding: '8px 12px', borderRadius: 8, fontFamily: 'monospace',
          color: status.ok === true ? C.ok : status.ok === false ? C.err : C.warn,
          background: status.ok === true ? C.okD : status.ok === false ? C.errD : C.warnD,
          border: `0.5px solid ${status.ok === true ? C.okB : status.ok === false ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
          {status.msg}
        </div>
      )}

      <button style={{ ...btnS('primary', !valid || loading), width: '100%' }}
        disabled={!valid || loading} onClick={connect}>
        {loading ? '⏳ Conectando…' : '🔗 Vincular y conectar'}
      </button>
    </div>
  )
}


// ─── MODO USB→WIFI (para Samsung S8+ y Android < 11) ────────────────────────
function ModeUsbWifi({ onConnected, addLog, usbDevice }) {
  const [step,    setStep]    = useState('idle') // idle | tcpip | connecting | done | error
  const [ip,      setIp]      = useState('')
  const [port,    setPort]    = useState('5555')
  const [msg,     setMsg]     = useState(null)
  const [loading, setLoading] = useState(false)

  // Auto-detectar IP del dispositivo USB
  const detectIp = async () => {
    if (!usbDevice?.serial) return
    try {
      const r = await window.api.adbShell({ serial: usbDevice.serial, cmd: "ip route get 1 | awk '{print $7}' | head -1" })
      const detected = (r?.out || '').trim()
      if (detected && /^\d+\.\d+/.test(detected)) setIp(detected)
    } catch {}
  }

  const runTcpip = async () => {
    if (!usbDevice?.serial) {
      setMsg({ ok: false, text: 'Conectá la tablet por USB primero' }); return
    }
    setLoading(true); setStep('tcpip')
    setMsg({ ok: null, text: `Configurando ADB TCP/IP en puerto ${port}…` })
    try {
      const r = await window.api.adbTcpip(parseInt(port))
      if (r?.ok || (r?.out || '').includes('restarting')) {
        setMsg({ ok: null, text: 'TCP/IP activado. Detectando IP de la tablet…' })
        await detectIp()
        setStep('connecting')
        setMsg({ ok: true, text: `Listo. Ahora podés desconectar el USB y conectar por WiFi.` })
      } else {
        setMsg({ ok: false, text: r?.out || 'Error al configurar TCP/IP' })
        setStep('error')
      }
    } catch (e) { setMsg({ ok: false, text: e.message }); setStep('error') }
    setLoading(false)
  }

  const connectWifi = async () => {
    const addr = `${ip.trim()}:${port.trim()}`
    setLoading(true)
    setMsg({ ok: null, text: `Conectando a ${addr}…` })
    try {
      const r = await window.api.adbConnect(addr)
      if ((r?.out || '').includes('connected') || r?.ok) {
        setStep('done')
        setMsg({ ok: true, text: `✓ Conectado: ${addr}` })
        addLog?.(`USB→WiFi conectado: ${addr}`, 'ok')
        setTimeout(() => onConnected(addr), 800)
      } else {
        setMsg({ ok: false, text: r?.out || 'No se pudo conectar. Verificá que estén en la misma red WiFi.' })
        setStep('error')
      }
    } catch (e) { setMsg({ ok: false, text: e.message }); setStep('error') }
    setLoading(false)
  }

  const hasUsb = !!usbDevice?.serial

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Info Samsung S8+ */}
      <div style={{ background: 'rgba(139,92,246,0.08)', border: '0.5px solid rgba(139,92,246,0.3)', borderRadius: 10, padding: '10px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', marginBottom: 4 }}>📱 Para Samsung S8+ y Android anterior a 11</div>
        <div style={{ fontSize: 10, color: C.t2, lineHeight: 1.6 }}>
          Este método activa ADB por WiFi usando el cable USB una sola vez. Después podés conectar sin cable.
        </div>
      </div>

      {/* Estado USB */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: hasUsb ? C.okD : C.errD, border: `0.5px solid ${hasUsb ? C.okB : 'rgba(239,68,68,0.3)'}` }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: hasUsb ? C.ok : C.err, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: hasUsb ? C.ok : C.err }}>
            {hasUsb ? `Tablet conectada: ${usbDevice.model || usbDevice.serial}` : 'Sin tablet USB detectada'}
          </div>
          <div style={{ fontSize: 10, color: C.t2 }}>
            {hasUsb ? 'Lista para configurar WiFi' : 'Conectá la tablet por USB y habilitá la depuración USB'}
          </div>
        </div>
      </div>

      {/* Paso 1: Puerto y activar TCP/IP */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.t3, letterSpacing: '0.1em', marginBottom: 10 }}>PASO 1 — ACTIVAR ADB POR WIFI (CON USB)</div>
        <Steps items={[
          'Conectá la tablet por USB',
          'Aceptá "Permitir depuración USB" si aparece en la tablet',
          'Presioná el botón de abajo',
        ]} color="#a78bfa" />
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>PUERTO</label>
            <input style={inp} value={port} onChange={e => setPort(e.target.value.replace(/\D/g,''))} placeholder="5555" />
          </div>
          <button
            onClick={runTcpip}
            disabled={!hasUsb || loading || step === 'connecting' || step === 'done'}
            style={{ ...btnS('primary', !hasUsb || loading || step === 'connecting' || step === 'done'), marginTop: 14, flexShrink: 0 }}
          >
            {loading && step === 'tcpip' ? '⏳ Activando…' : step === 'connecting' || step === 'done' ? '✓ Activado' : '⚡ Activar TCP/IP'}
          </button>
        </div>
      </div>

      {/* Paso 2: Conectar por IP */}
      {(step === 'connecting' || step === 'done' || step === 'error') && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.t3, letterSpacing: '0.1em', marginBottom: 10 }}>PASO 2 — CONECTAR POR WIFI</div>
          <Steps items={[
            'Podés desconectar el cable USB ahora',
            'Verificá que la tablet esté en la misma red WiFi que el PC',
            'Presioná Conectar',
          ]} color={C.accent} />
          <div style={{ marginTop: 12 }}>
            <label style={lbl}>IP DE LA TABLET</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inp, flex: 1 }} value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.0.x" />
              <button onClick={detectIp} style={{ ...btnS('ghost'), flexShrink: 0, padding: '8px 12px', fontSize: 11 }} title="Detectar IP automáticamente">🔍</button>
            </div>
          </div>
          <button
            onClick={connectWifi}
            disabled={!ip.trim() || loading || step === 'done'}
            style={{ ...btnS('primary', !ip.trim() || loading || step === 'done'), width: '100%', marginTop: 10 }}
          >
            {loading && step !== 'tcpip' ? '⏳ Conectando…' : step === 'done' ? '✓ Conectado' : '🔗 Conectar por WiFi'}
          </button>
        </div>
      )}

      {/* Mensaje de estado */}
      {msg && (
        <div style={{ fontSize: 11, padding: '8px 12px', borderRadius: 8, fontFamily: 'monospace',
          color: msg.ok === true ? C.ok : msg.ok === false ? C.err : C.warn,
          background: msg.ok === true ? C.okD : msg.ok === false ? C.errD : C.warnD,
          border: `0.5px solid ${msg.ok === true ? C.okB : msg.ok === false ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
          {msg.text}
        </div>
      )}

      {step === 'error' && (
        <button style={{ ...btnS('ghost'), width: '100%' }} onClick={() => { setStep('idle'); setMsg(null) }}>
          🔄 Reintentar
        </button>
      )}
    </div>
  )
}

// ─── Modal principal ──────────────────────────────────────────────────────────
export default function QrWifiConnect({ onClose, onConnected, addLog, usbDevice }) {
  const [mode, setMode] = useState('qr')
  const [done, setDone] = useState(false)
  const [doneSerial, setDoneSerial] = useState('')

  const handleConnected = useCallback((serial) => {
    setDoneSerial(serial); setDone(true); onConnected?.(serial)
  }, [onConnected])

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return ReactDOM.createPortal(
    <>
      <style>{`
        @keyframes qrFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes qrUp     { from{opacity:0;transform:translateY(16px) scale(0.96)} to{opacity:1;transform:none} }
        @keyframes qrPulse  { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>

      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(0,0,0,0.82)', backdropFilter:'blur(18px)', display:'flex', alignItems:'center', justifyContent:'center', animation:'qrFadeIn 0.18s ease' }}>
        <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `0.5px solid ${C.borderL}`, borderRadius: 20, width: 440, maxWidth: '96vw', maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 40px 100px rgba(0,0,0,0.75)', animation: 'qrUp 0.26s cubic-bezier(0.16,1,0.3,1)' }}>

          {/* Header */}
          <div style={{ padding: '16px 18px 12px', borderBottom: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: C.accentD, border: `0.5px solid ${C.accentB}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>📡</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>
                {done ? '¡Conectado por WiFi!' : 'Conectar tablet por WiFi'}
              </div>
              <div style={{ fontSize: 10, color: C.t3 }}>Android 11+ · USB→WiFi para S8+ y anteriores</div>
            </div>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: C.errD, color: C.err, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✕</button>
          </div>

          {/* Tabs */}
          {!done && (
            <div style={{ display: 'flex', borderBottom: `0.5px solid ${C.border}`, flexShrink: 0 }}>
              {[['qr', '📷 QR'], ['manual', '✏️ Manual'], ['usb', '🔌 USB→WiFi']].map(([id, label]) => (
                <button key={id} onClick={() => setMode(id)} style={{ flex: 1, padding: '10px 0', fontSize: 11, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', color: mode === id ? C.accent : C.t3, borderBottom: `2px solid ${mode === id ? C.accent : 'transparent'}`, transition: 'all 0.15s' }}>{label}</button>
              ))}
            </div>
          )}

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
            {done ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>📡</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.ok, marginBottom: 6 }}>¡Conectado!</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: C.t2, marginBottom: 20 }}>{doneSerial}</div>
                <button style={{ ...btnS('ok'), width: '100%' }} onClick={onClose}>✓ Cerrar</button>
              </div>
            ) : mode === 'qr' ? (
              <ModeQR onConnected={handleConnected} addLog={addLog} />
            ) : mode === 'manual' ? (
              <ModeManual onConnected={handleConnected} addLog={addLog} />
            ) : (
              <ModeUsbWifi onConnected={handleConnected} addLog={addLog} usbDevice={usbDevice} />
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}