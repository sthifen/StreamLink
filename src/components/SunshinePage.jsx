import React, { useState, useEffect } from 'react'

const IcoPlay    = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 2.5l9 4.5-9 4.5V2.5z" fill="currentColor"/></svg>
const IcoStop    = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2.5" y="2.5" width="9" height="9" rx="1.5" fill="currentColor"/></svg>
const IcoExt     = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 1h3v3M11 1L6 6M5 2H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
const IcoCopy    = () => <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M1 7.5V1h6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
const IcoRefresh = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M11 6.5A4.5 4.5 0 1 1 6.5 2H9M9 2l2 2-2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
const IcoTrash   = () => <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1 2.5h9M3.5 2.5V1h3v1.5M9.5 2.5l-.75 7h-6.5l-.75-7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
const IcoCheck   = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7l3.5 3.5 5.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>

const DP_PORTS    = ['DP-1','DP-2','DP-3','DP-4','HDMI-1','HDMI-2','VGA-1']
const RESOLUTIONS = ['1920x1080','1280x720','1366x768','1024x768','1600x900','2560x1440','800x600']
const REFRESHES   = ['60','30','120','144','75','90']

// ── Step card ─────────────────────────────────────────────────────────────────
function Step({ n, done, active, title, subtitle, children }) {
  return (
    <div style={{
      borderRadius: 14, overflow: 'hidden',
      border: `1px solid ${done ? 'rgba(34,197,94,0.4)' : active ? 'var(--accent-border)' : 'rgba(255,255,255,0.08)'}`,
      background: done ? 'rgba(34,197,94,0.05)' : active ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
      transition: 'all 0.25s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: done ? '#22c55e' : active ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
          color: done || active ? '#fff' : 'var(--text-3)',
          fontSize: done ? 14 : 13, fontWeight: 800,
          transition: 'all 0.25s',
        }}>
          {done ? <IcoCheck /> : n}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: done ? '#22c55e' : active ? 'var(--accent)' : 'var(--text-2)' }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{subtitle}</div>
          )}
        </div>
      </div>
      {/* Body — solo visible si activo o done */}
      {(active || done) && children && (
        <div style={{ padding: '0 14px 14px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Collapsible section ───────────────────────────────────────────────────────
function Collapse({ label, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderRadius: 10,
        background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.09)',
        color: 'var(--text-3)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
      }}>
        {label}
        <span style={{ fontSize: 10, opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SunshinePage() {
  const [running,    setRunning]    = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [ips,        setIps]        = useState([])
  const [videoArgs,  setVideoArgs]  = useState([])
  const [user,       setUser]       = useState('')
  const [pass,       setPass]       = useState('')
  const [credOk,     setCredOk]     = useState(false)
  const [credSaving, setCredSaving] = useState(false)
  const [webviewKey, setWebviewKey] = useState(0)
  const [copied,     setCopied]     = useState(null)
  const [dpPort,     setDpPort]     = useState('DP-3')
  const [resolution, setResolution] = useState('1024x768')
  const [refresh,    setRefresh]    = useState('60')

  const loadStatus = async () => {
    const r = await window.api?.sunshineStatus?.()
    if (r) { setRunning(r.running); setIps(r.ips || []) }
    const k = await window.api?.kernelCmdline?.()
    if (k?.ok) setVideoArgs(k.videoArgs || [])
  }

  useEffect(() => {
    // Cargar credenciales guardadas
    window.api?.sunshineGetCredentials?.().then(c => {
      if (c?.username) { setUser(c.username); setPass(c.password || ''); setCredOk(true) }
    })
    loadStatus()
    const iv = setInterval(loadStatus, 5000)
    return () => clearInterval(iv)
  }, [])

  const start = async () => {
    setLoading(true)
    await window.api?.sunshineStart?.()
    setTimeout(() => { loadStatus(); setLoading(false); setWebviewKey(k => k + 1) }, 2500)
  }

  const stop = async () => {
    setLoading(true)
    await window.api?.sunshineStop?.()
    setTimeout(() => { loadStatus(); setLoading(false) }, 1200)
  }

  const saveCredentials = async () => {
    if (!user || !pass) return
    setCredSaving(true)
    await window.api?.sunshineSetCredentials?.({ username: user, password: pass })
    setCredOk(true)
    setCredSaving(false)
    setWebviewKey(k => k + 1)
  }

  const copyText = (t) => {
    navigator.clipboard.writeText(t)
    setCopied(t); setTimeout(() => setCopied(null), 2000)
  }

  const videoArg = `video=${dpPort}:${resolution}@${refresh}D`
  const nonLoopback = ips.filter(i => i.iface !== 'lo')
  const usbIps      = nonLoopback.filter(i => !i.iface.startsWith('wl'))

  // Derivar qué paso está activo
  // Paso 1 done = running, Paso 2 = siempre informativo, Paso 3 done = credOk
  const step1done = running
  const step2done = credOk          // credenciales guardadas = paso 2 hecho (primer uso ya pasó)
  const step3done = credOk && running

  // Paso activo = el primero incompleto
  const activeStep = !step1done ? 1 : !step2done ? 2 : !step3done ? 3 : 0

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13,
    background: 'rgba(255,255,255,0.07)', border: '0.5px solid var(--border-lit)',
    color: 'var(--text-h)', boxSizing: 'border-box', outline: 'none',
  }

  const sel = {
    background: 'rgba(255,255,255,0.06)', border: '0.5px solid var(--border-lit)',
    borderRadius: 7, padding: '6px 8px', fontSize: 11, color: 'var(--text-h)', width: '100%', cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Panel izquierdo ─────────────────────────────────────────────────── */}
      <div style={{
        width: 320, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
        borderRight: '0.5px solid var(--border-lit)',
        padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10,
        background: 'rgba(10,12,18,0.35)',
      }}>

        {/* PASO 1 — Iniciar */}
        <Step n="1" done={step1done} active={activeStep === 1}
          title="Iniciar Sunshine"
          subtitle={step1done ? 'Corriendo' : 'Presiona el botón'}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={start} disabled={loading || running} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: running ? 'rgba(34,197,94,0.15)' : 'var(--accent)',
              border: 'none', color: '#fff',
              opacity: loading || running ? 0.5 : 1, transition: 'opacity 0.15s',
            }}>
              <IcoPlay /> {loading ? 'Iniciando…' : running ? '✓ Activo' : 'Iniciar'}
            </button>
            {running && (
              <button onClick={stop} disabled={loading} style={{
                width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 10, background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer',
                opacity: loading ? 0.5 : 1,
              }}>
                <IcoStop />
              </button>
            )}
          </div>
        </Step>

        {/* PASO 2 — Crear cuenta (solo primera vez) */}
        <Step n="2" done={step2done} active={activeStep === 2}
          title="Crear usuario y contraseña"
          subtitle="Solo la primera vez"
        >
          <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 10 }}>
            Abre Sunshine en el navegador, crea tu usuario y contraseña. Luego vuelve aquí.
          </div>
          <button
            onClick={() => window.api?.openUrl?.('https://localhost:47990')}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', background: 'var(--accent)', border: 'none', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <IcoExt /> Abrir en navegador
          </button>
        </Step>

        {/* PASO 3 — Ingresar credenciales */}
        <Step n="3" done={step3done} active={activeStep === 3 || (!step2done && step1done) || credOk}
          title="Ingresa tu usuario y contraseña"
          subtitle={credOk ? `Conectado como ${user}` : 'Los que creaste en el paso 2'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text" value={user} onChange={e => setUser(e.target.value)}
              placeholder="Usuario"
              style={inputStyle}
            />
            <input
              type="password" value={pass} onChange={e => setPass(e.target.value)}
              placeholder="Contraseña"
              style={inputStyle}
              onKeyDown={e => e.key === 'Enter' && saveCredentials()}
            />
            <button
              onClick={saveCredentials}
              disabled={!user || !pass || credSaving}
              style={{
                padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: 'none', color: '#fff',
                background: credOk ? '#22c55e' : 'var(--accent)',
                opacity: !user || !pass ? 0.45 : 1,
                transition: 'background 0.2s',
              }}
            >
              {credSaving ? 'Conectando…' : credOk ? '✓ Conectado' : 'Conectar'}
            </button>
          </div>
        </Step>

        {/* ── Secciones avanzadas colapsables ─────────────────────────────── */}
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>

          <Collapse label="📡  IPs para Moonlight">
            {nonLoopback.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '6px 4px' }}>Sin redes detectadas</div>
            ) : (
              [...usbIps, ...nonLoopback.filter(i => i.iface.startsWith('wl'))].map(({ iface, ip }) => {
                const isUsb = usbIps.some(u => u.ip === ip)
                return (
                  <div key={ip} style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                    padding: '7px 10px', borderRadius: 9,
                    background: isUsb ? 'var(--accent-soft)' : 'rgba(255,255,255,0.04)',
                    border: `0.5px solid ${isUsb ? 'var(--accent-border)' : 'rgba(255,255,255,0.07)'}`,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--text-h)' }}>{ip}</div>
                      <div style={{ fontSize: 9, color: isUsb ? 'var(--accent)' : 'var(--text-3)', marginTop: 1 }}>
                        {iface} — {isUsb ? 'USB / Ethernet' : 'Wi-Fi'}
                      </div>
                    </div>
                    <button onClick={() => copyText(ip)} style={{
                      padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                      background: copied === ip ? 'rgba(34,197,94,0.15)' : 'var(--bg-elem)',
                      border: `0.5px solid ${copied === ip ? 'rgba(34,197,94,0.3)' : 'var(--border-lit)'}`,
                      color: copied === ip ? '#22c55e' : 'var(--text-2)',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      {copied === ip ? '✓' : <IcoCopy />}
                    </button>
                  </div>
                )
              })
            )}
            <div style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.6, padding: '4px 2px' }}>
              En Moonlight → <em>Agregar PC manualmente</em> → pega la IP de USB/Ethernet
            </div>
          </Collapse>

          <Collapse label="🖥️  Monitor virtual (kernel)">
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, lineHeight: 1.5 }}>
              Segundo monitor sin pantalla física. Requiere <strong style={{ color: 'var(--text-2)' }}>reiniciar</strong> la PC.
            </div>
            {videoArgs.length > 0 && videoArgs.map(arg => (
              <div key={arg} style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5,
                padding: '5px 9px', borderRadius: 8,
                background: 'rgba(34,197,94,0.07)', border: '0.5px solid rgba(34,197,94,0.2)',
              }}>
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#22c55e', flex: 1 }}>{arg}</span>
                <button onClick={() => window.api?.installTerminal?.(
                  `sudo grubby --update-kernel=ALL --remove-args="${arg}" && echo "Reinicia para aplicar"`
                )} style={{
                  padding: '3px 6px', borderRadius: 5, cursor: 'pointer',
                  background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)',
                  color: '#ef4444', display: 'flex', alignItems: 'center',
                }}>
                  <IcoTrash />
                </button>
              </div>
            ))}
            {videoArgs.length === 0 && (
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8 }}>Sin monitores virtuales activos</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: 3 }}>Puerto</div>
                <select value={dpPort} onChange={e => setDpPort(e.target.value)} style={sel}>
                  {DP_PORTS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: 3 }}>Hz</div>
                <select value={refresh} onChange={e => setRefresh(e.target.value)} style={sel}>
                  {REFRESHES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: 3 }}>Resolución</div>
                <select value={resolution} onChange={e => setResolution(e.target.value)} style={sel}>
                  {RESOLUTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--text-3)', padding: '4px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', marginBottom: 8 }}>
              {videoArg}
            </div>
            <button onClick={() => window.api?.installTerminal?.(
              `sudo grubby --update-kernel=ALL --args="${videoArg}" && echo "Reinicia para aplicar"`
            )} style={{
              width: '100%', padding: '8px 0', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: 'var(--accent-soft)', border: '0.5px solid var(--accent-border)', color: 'var(--accent)',
            }}>
              + Agregar monitor virtual
            </button>
          </Collapse>

          <Collapse label="🌐  GNOME Network Displays (alternativa)">
            <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 10 }}>
              Proyecto oficial GNOME para pantalla en red (Miracast/WFD), sin necesidad de Moonlight.
            </div>
            <button onClick={() => window.api?.openUrl?.('https://gitlab.gnome.org/GNOME/gnome-network-displays')} style={{
              width: '100%', padding: '7px 0', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border-lit)', color: 'var(--text-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <IcoExt /> Ver en GitLab
            </button>
          </Collapse>
        </div>

      </div>

      {/* ── Panel derecho: webview ──────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0a0c12' }}>
        {running ? (
          <>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <webview
                key={webviewKey}
                src="https://localhost:47990"
                partition="persist:sunshine"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                allowpopups="true"
                disablewebsecurity="true"
              />
            </div>
            <div style={{
              flexShrink: 0, height: 32, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
              background: 'rgba(10,12,18,0.9)', borderTop: '0.5px solid var(--border-lit)',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
              <span style={{ fontSize: 10, color: 'var(--text-2)' }}>localhost:47990{credOk ? ` · ${user}` : ''}</span>
              <button onClick={() => setWebviewKey(k => k + 1)} style={{
                marginLeft: 6, padding: '2px 8px', borderRadius: 5, fontSize: 9, fontWeight: 600, cursor: 'pointer',
                background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)', color: 'var(--text-2)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <IcoRefresh /> Recargar
              </button>
              <button onClick={() => window.api?.openUrl?.('https://localhost:47990')} style={{
                marginLeft: 'auto', padding: '2px 10px', borderRadius: 5, fontSize: 9, fontWeight: 600, cursor: 'pointer',
                background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)', color: 'var(--text-2)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <IcoExt /> Abrir en navegador
              </button>
            </div>
          </>
        ) : (
          /* Placeholder cuando Sunshine no corre */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              {[28, 20, 12, 5].map((r, i) => (
                <div key={i} style={{
                  width: r * 2, height: r * 2, borderRadius: '50%',
                  border: `1.5px solid rgba(255,255,255,${0.06 + i * 0.06})`,
                  position: 'absolute',
                }} />
              ))}
              <div style={{ position: 'relative', width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                  <circle cx="30" cy="30" r="24" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5"/>
                  <circle cx="30" cy="30" r="16" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5"/>
                  <circle cx="30" cy="30" r="8"  stroke="rgba(255,255,255,0.18)" strokeWidth="1.5"/>
                  <circle cx="30" cy="30" r="3"  fill="rgba(255,255,255,0.25)"/>
                </svg>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>
                Sigue los pasos de la izquierda
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                La interfaz de Sunshine aparecerá aquí
              </div>
            </div>
            <button onClick={start} disabled={loading} style={{
              padding: '11px 36px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              background: 'var(--accent)', border: 'none', color: '#fff',
              display: 'flex', alignItems: 'center', gap: 9,
              opacity: loading ? 0.6 : 1,
              boxShadow: '0 4px 24px rgba(var(--accent-rgb,232,116,26),0.35)',
            }}>
              <IcoPlay /> {loading ? 'Iniciando…' : 'Iniciar Sunshine'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
