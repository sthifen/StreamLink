import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'

/**
 * Listener global para solicitudes de pareo desde la app SyncTablet en Android.
 * Muestra un modal con el código de 6 dígitos que el usuario debe verificar
 * que coincide con el de la tablet, y botones Aceptar / Rechazar.
 */
export default function PairDeviceModal() {
  const [req, setReq] = useState(null)   // { sessionId, code, deviceId, name, ip, expiresAt }
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!window.api?.onSyncTabletPairRequest) return
    window.api.onSyncTabletPairRequest((data) => {
      setReq(data)
      setBusy(false)
    })
    if (window.api.onSyncTabletPairCancelled) {
      window.api.onSyncTabletPairCancelled((data) => {
        setReq((cur) => (cur && cur.sessionId === data?.sessionId ? null : cur))
      })
    }
  }, [])

  // Re-render cada segundo para actualizar el countdown
  useEffect(() => {
    if (!req) return
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [req])

  if (!req) return null

  const secondsLeft = Math.max(0, Math.floor((req.expiresAt - Date.now()) / 1000))
  if (secondsLeft <= 0) {
    // Caducó: cerrar
    setTimeout(() => setReq(null), 0)
  }

  const accept = async () => {
    setBusy(true)
    try {
      const r = await window.api?.synctabletPairAccept?.(req.sessionId)
      if (r?.ok) setReq(null)
      else { setBusy(false); alert('Error: ' + (r?.error || 'desconocido')) }
    } catch (e) {
      setBusy(false)
      alert('Error: ' + e.message)
    }
  }

  const reject = async () => {
    setBusy(true)
    try {
      await window.api?.synctabletPairReject?.(req.sessionId)
    } catch {}
    setReq(null)
  }

  // Formatea el código como "123 456"
  const codeFmt = (req.code || '').replace(/(\d{3})(\d{3})/, '$1 $2')

  return ReactDOM.createPortal(
    <div
      onClick={reject}
      style={{
        position: 'fixed', inset: 0, zIndex: 4000,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(440px, 92vw)',
          background: '#10141E',
          border: '1px solid #1E2535',
          borderRadius: 20,
          padding: 28,
          color: '#EAEDF2',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 13, color: '#8A9BB5', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
          Nueva solicitud de pareo
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
          {req.name || 'Dispositivo Android'}
        </div>
        <div style={{ fontSize: 13, color: '#8A9BB5', marginBottom: 24 }}>
          desde {req.ip || 'red local'}
        </div>

        <div style={{ fontSize: 13, color: '#8A9BB5', marginBottom: 10 }}>
          Verifica que este código coincida con el que ves en la tablet:
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: 6,
            textAlign: 'center',
            background: '#0A0C12',
            border: '1px solid #1E2535',
            borderRadius: 14,
            padding: '20px 0',
            margin: '0 0 12px',
            color: '#3B82F6',
          }}
        >
          {codeFmt}
        </div>
        <div style={{ fontSize: 12, color: '#8A9BB5', textAlign: 'center', marginBottom: 22 }}>
          Caduca en {secondsLeft}s
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={reject}
            disabled={busy}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 10, cursor: 'pointer',
              background: 'transparent', border: '1px solid #1E2535',
              color: '#EAEDF2', fontSize: 14, fontWeight: 500,
            }}
          >
            Rechazar
          </button>
          <button
            onClick={accept}
            disabled={busy}
            style={{
              flex: 1, padding: '12px 0', borderRadius: 10, cursor: busy ? 'wait' : 'pointer',
              background: '#3B82F6', border: 'none',
              color: 'white', fontSize: 14, fontWeight: 600,
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Aceptando…' : 'Aceptar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
