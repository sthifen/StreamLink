import React, { useState, useEffect, useRef } from 'react'
import { checkDeps, installTerminal, saveConfig, adbDevices, launchScrcpyTcpip, installSystemShortcuts } from '../api.js'
import { CheckCircle, XCircle, Loader, Terminal, Usb, RefreshCw, Keyboard, Smartphone } from 'lucide-react'

// ── QR Generator ──────────────────────────────────────────────────────────────
let QRCodeLib = null
async function loadQRLib() {
  if (QRCodeLib) return QRCodeLib
  if (window.QRCode) { QRCodeLib = window.QRCode; return QRCodeLib }
  return new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
    s.onload  = () => { QRCodeLib = window.QRCode; res(QRCodeLib) }
    s.onerror = () => rej(new Error('No se pudo cargar la librería QR'))
    document.head.appendChild(s)
  })
}

function QRCanvas({ text, size = 160 }) {
  const ref = useRef(null)
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

  if (err) return <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 10, textAlign: 'center', padding: 8 }}>⚠️ {err}</div>
  return <div ref={ref} style={{ width: size, height: size, borderRadius: 6, overflow: 'hidden' }} />
}

const TOOLS = [
  { id: 'adb',           name: 'ADB',          icon: '🔌', required: true,
    install: { Fedora: 'sudo dnf install -y android-tools', Ubuntu: 'sudo apt update && sudo apt install -y adb', Arch: 'sudo pacman -S --noconfirm android-tools' } },
  { id: 'scrcpy',        name: 'scrcpy',        icon: '🖥️', required: true,
    install: { Fedora: 'sudo dnf install -y scrcpy', Ubuntu: 'sudo apt install -y scrcpy', Arch: 'sudo pacman -S --noconfirm scrcpy' } },
  { id: 'xdotool',       name: 'xdotool',       icon: '🎯', required: true,
    install: { Fedora: 'sudo dnf install -y xdotool', Ubuntu: 'sudo apt install -y xdotool', Arch: 'sudo pacman -S --noconfirm xdotool' } },
  { id: 'wl-paste',      name: 'wl-clipboard',  icon: '📋', required: true,
    install: { Fedora: 'sudo dnf install -y wl-clipboard', Ubuntu: 'sudo apt install -y wl-clipboard', Arch: 'sudo pacman -S --noconfirm wl-clipboard' } },
  { id: 'kdeconnect-cli', name: 'KDE Connect',  icon: '📶', required: false,
    install: { Fedora: 'sudo dnf install -y kdeconnectd', Ubuntu: 'sudo apt install -y kdeconnect', Arch: 'sudo pacman -S --noconfirm kdeconnect' } },
]
const DISTROS = ['Ubuntu', 'Fedora', 'Arch']

export default function SetupScreen({ config, onReady }) {
  const [deps,        setDeps]        = useState(null)
  const [step,        setStep]        = useState('checking')
  const [distro,      setDistro]      = useState('Ubuntu')
  const [installing,  setInstalling]  = useState(false)
  const [installDone, setInstallDone] = useState(false)
  const [scriptState, setScriptState] = useState('idle')
  const [ip,          setIp]          = useState(config.adb?.tablet_ip || '')
  const [usbState,    setUsbState]    = useState('idle')
  const [localIp,     setLocalIp]     = useState(null)
  const [showQr,      setShowQr]      = useState(false)
  const pollRef = useRef(null)

  useEffect(() => { checkDeps().then(d => { setDeps(d || {}); setStep('deps') }) }, [])

  useEffect(() => {
    window.api?.getLocalIp?.().then(r => {
      if (r?.ip) setLocalIp(r.ip)
    }).catch(() => {})
  }, [])

  const recheck = () => {
    setStep('checking'); setDeps(null)
    checkDeps().then(d => { setDeps(d || {}); setStep('deps') })
  }

  const missing    = deps ? TOOLS.filter(t => !deps[t.id]?.found) : TOOLS
  const missingReq = missing.filter(t => t.required !== false)
  const allOk      = missingReq.length === 0

  const installAll = async () => {
    setInstalling(true)
    for (const tool of missing) {
      const cmd = tool.install[distro]
      if (cmd) await installTerminal(cmd)
    }
    setInstalling(false)
    setInstallDone(true)
    setTimeout(recheck, 1200)
  }

  const startUsbConnect = () => {
    setUsbState('connecting')
    pollRef.current = setInterval(async () => {
      const devs = await adbDevices()
      const usb = devs?.find(d => d.status === 'device' && !d.serial?.includes(':'))
      if (usb) {
        clearInterval(pollRef.current)
        setUsbState('connected')
      }
    }, 1500)
  }

  const finish = async () => {
    const cfg = { ...config, adb: { ...config.adb, tablet_ip: ip } }
    await saveConfig(cfg)
    onReady(cfg)
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', overflowY: 'auto',
      background: 'var(--bg)', fontFamily: 'inherit',
      padding: '32px 20px 40px',
    }}>
      <div style={{ width: '100%', maxWidth: 460 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📱</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-h)', marginBottom: 4 }}>Sync Tablet</h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Configuración inicial</p>
        </div>

        {/* QR de enlace con app Android */}
        {localIp && (
          <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-lit)', borderRadius: 16, padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showQr ? 14 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Smartphone size={14} color="var(--accent)" />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-h)' }}>Enlazar app Android</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{localIp}:{7891}</div>
                </div>
              </div>
              <button onClick={() => setShowQr(v => !v)} style={{
                padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                border: '0.5px solid var(--border-lit)', background: showQr ? 'var(--accent)' : 'var(--bg-elem)',
                color: showQr ? '#fff' : 'var(--text-2)', cursor: 'pointer',
              }}>
                {showQr ? 'Ocultar QR' : 'Mostrar QR'}
              </button>
            </div>
            {showQr && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 10, background: '#fff', borderRadius: 12 }}>
                  <QRCanvas text={`http://${localIp}:7891`} size={160} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center' }}>
                  Escanea con la app SyncTablet en tu tablet/teléfono
                </div>
              </div>
            )}
          </div>
        )}

        {/* CHECKING */}
        {step === 'checking' && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-2)' }}>
            <div style={{ width: 26, height: 26, border: '3px solid var(--accent-soft)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 12 }}>Verificando herramientas…</p>
          </div>
        )}

        {/* DEPS CARD */}
        {step === 'deps' && (
          <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-lit)', borderRadius: 16, padding: 20, marginBottom: 14 }}>

            {/* Status row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {allOk
                  ? <><CheckCircle size={15} color="var(--success)" /><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>Todo listo</span></>
                  : <><XCircle size={15} color="var(--error)" /><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)' }}>{missing.length} faltante{missing.length > 1 ? 's' : ''}</span></>
                }
              </div>
              <button onClick={recheck} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 6px' }}>
                <RefreshCw size={11} /> Recomprobar
              </button>
            </div>

            {/* Tools grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: allOk ? 0 : 16 }}>
              {TOOLS.map(t => {
                const found = deps?.[t.id]?.found
                const optional = t.required === false
                return (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                    background: found ? 'var(--success-soft)' : optional ? 'rgba(251,191,36,0.07)' : 'rgba(239,68,68,0.08)',
                    border: `0.5px solid ${found ? 'rgba(34,197,94,0.2)' : optional ? 'rgba(251,191,36,0.25)' : 'rgba(239,68,68,0.2)'}`,
                    borderRadius: 10,
                  }}>
                    <span style={{ fontSize: 16 }}>{t.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-h)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                      {optional && !found && <div style={{ fontSize: 9, color: 'var(--warning)', marginTop: 1 }}>opcional</div>}
                    </div>
                    {found
                      ? <CheckCircle size={13} color="var(--success)" />
                      : optional ? <span style={{ fontSize: 11 }}>⚠️</span> : <XCircle size={13} color="var(--error)" />
                    }
                  </div>
                )
              })}
            </div>

            {/* Install section (only if missing) */}
            {!allOk && (
              <>
                {/* Distro selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', marginRight: 2 }}>Distro</span>
                  {DISTROS.map(d => (
                    <button key={d} onClick={() => setDistro(d)} style={{
                      padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                      background: distro === d ? 'var(--accent)' : 'var(--bg-elem)',
                      color: distro === d ? '#fff' : 'var(--text-2)',
                    }}>{d}</button>
                  ))}
                </div>

                <button onClick={installAll} disabled={installing} style={{
                  width: '100%', padding: '10px', borderRadius: 10,
                  background: installing ? 'var(--bg-elem)' : 'var(--accent)',
                  color: installing ? 'var(--text-3)' : '#fff',
                  fontSize: 13, fontWeight: 700, border: 'none',
                  cursor: installing ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  {installing
                    ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Instalando…</>
                    : installDone
                      ? <><RefreshCw size={13} /> Recomprobando…</>
                      : <><Terminal size={13} /> Instalar en terminal</>
                  }
                </button>
              </>
            )}
          </div>
        )}

        {/* CONNECT + SHORTCUTS CARD (when all deps ok) */}
        {allOk && (
          <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-lit)', borderRadius: 16, padding: 20, marginBottom: 14 }}>

            {/* USB Connect */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-h)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Usb size={13} color="var(--text-2)" /> Conectar tablet por USB
              </div>

              {usbState === 'idle' && (
                <button onClick={startUsbConnect} style={{
                  width: '100%', padding: '9px', borderRadius: 10,
                  background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)',
                  color: 'var(--text-1)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                }}>
                  Detectar tablet
                </button>
              )}

              {usbState === 'connecting' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--bg-elem)', borderRadius: 10, border: '0.5px solid var(--border-lit)' }}>
                  <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} color="var(--accent)" />
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Esperando conexión USB…</span>
                </div>
              )}

              {usbState === 'connected' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--success-soft)', borderRadius: 10, border: '0.5px solid rgba(34,197,94,0.25)' }}>
                  <CheckCircle size={13} color="var(--success)" />
                  <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>Tablet detectada</span>
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{ height: '0.5px', background: 'var(--border)', marginBottom: 14 }} />

            {/* Shortcuts (optional) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-h)', marginBottom: 2 }}>Atajos de teclado</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Ctrl+U · Ctrl+Shift+V</div>
              </div>
              <button
                onClick={async () => {
                  setScriptState('loading')
                  const r = await installSystemShortcuts()
                  setScriptState(r?.ok ? 'ok' : 'error')
                }}
                disabled={scriptState === 'loading' || scriptState === 'ok'}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                  border: 'none', cursor: scriptState === 'ok' ? 'default' : 'pointer',
                  background: scriptState === 'ok' ? 'var(--success-soft)' : scriptState === 'error' ? 'rgba(239,68,68,0.12)' : 'var(--bg-elem)',
                  color: scriptState === 'ok' ? 'var(--success)' : scriptState === 'error' ? 'var(--error)' : 'var(--text-1)',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                {scriptState === 'loading' ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Instalando</>
                 : scriptState === 'ok'    ? <><CheckCircle size={11} /> Listos</>
                 : scriptState === 'error' ? <><XCircle size={11} /> Error</>
                 : <><Keyboard size={11} /> Instalar</>}
              </button>
            </div>
          </div>
        )}

        {/* CONTINUE */}
        {allOk && (
          <button onClick={finish} style={{
            width: '100%', padding: '12px', borderRadius: 12,
            background: 'var(--accent)', color: '#fff',
            fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
          }}>
            Continuar →
          </button>
        )}

      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
