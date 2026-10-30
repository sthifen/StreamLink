import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  adbNotifications, adbMediaInfo, adbMediaCmd,
  adbImportPhotos, adbDeviceStatus,
  gphoto2List, gphoto2Pull,
  kdeconnectList, kdeconnectShare, kdeconnectClipboard,
  openFolder, pickFile,
} from '../api.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const APP_ICONS = {
  'com.whatsapp':'💬','com.telegram.messenger':'✈️','com.instagram.android':'📸',
  'com.google.android.gm':'📧','com.google.android.youtube':'▶️','com.spotify.music':'🎵',
  'com.android.chrome':'🌐','com.twitter.android':'🐦','com.facebook.katana':'👥',
  'com.discord':'🎮','com.netflix.mediaclient':'🎬','com.android.vending':'🏪',
  'com.samsung.android.app.notes':'📝','com.sec.android.app.camera':'📷',
}
const APP_NAMES = {
  'com.whatsapp':'WhatsApp','com.telegram.messenger':'Telegram','com.instagram.android':'Instagram',
  'com.google.android.gm':'Gmail','com.google.android.youtube':'YouTube','com.spotify.music':'Spotify',
  'com.android.chrome':'Chrome','com.twitter.android':'Twitter','com.facebook.katana':'Facebook',
  'com.discord':'Discord','com.netflix.mediaclient':'Netflix','com.android.vending':'Play Store',
}
const appIcon = pkg => APP_ICONS[pkg] || '📱'
const appName = pkg => APP_NAMES[pkg] || (pkg?.split('.').pop() ?? pkg ?? '—')
const relTime = ts => {
  const d = Date.now() - ts
  if (d < 60000) return 'ahora'
  if (d < 3600000) return `${Math.floor(d/60000)}m`
  if (d < 86400000) return `${Math.floor(d/3600000)}h`
  return `${Math.floor(d/86400000)}d`
}
const rssiLabel = r => r >= -50 ? '▂▄▆█' : r >= -60 ? '▂▄▆_' : r >= -70 ? '▂▄__' : '▂___'
const rssiColor = r => r >= -60 ? 'var(--success)' : r >= -70 ? 'var(--warning)' : 'var(--error)'

function Bar({ pct, color = 'var(--accent)', h = 4 }) {
  return (
    <div style={{ width: '100%', height: h, background: 'var(--bg-elem)', borderRadius: h, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: h, transition: 'width 0.4s' }} />
    </div>
  )
}

// ─── Estado del dispositivo ───────────────────────────────────────────────────
function DeviceStatusCard({ serial }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!serial) return
    setLoading(true)
    const r = await adbDeviceStatus({ serial })
    if (r?.ok) setStatus(r)
    setLoading(false)
  }, [serial])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 15000)
    return () => clearInterval(id)
  }, [refresh])

  if (!serial) return null

  const bat = status?.battery
  const mem = status?.memory
  const sto = status?.storage
  const wifi = status?.wifi
  const dev = status?.device

  const batColor = !bat ? 'var(--text-3)'
    : bat.level <= 15 ? 'var(--error)'
    : bat.level <= 30 ? 'var(--warning)'
    : 'var(--success)'

  return (
    <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-lit)', borderRadius: 14, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>📱</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-h)' }}>{dev?.model || 'Tablet'}</div>
            {dev?.android && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Android {dev.android}</div>}
          </div>
        </div>
        <button onClick={refresh} disabled={loading} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, padding: '2px 6px', borderRadius: 6 }}>
          {loading ? '…' : '↻'}
        </button>
      </div>

      <div style={{ height: '0.5px', background: 'var(--border)' }} />

      {!status && !loading && (
        <div style={{ padding: '14px 14px', textAlign: 'center', color: 'var(--text-3)', fontSize: 11 }}>
          <button onClick={refresh} style={{ background: 'var(--bg-elem)', border: 'none', color: 'var(--text-2)', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontSize: 12 }}>Cargar estado</button>
        </div>
      )}

      {status && (
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Batería */}
          {bat && (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13 }}>{bat.charging ? '⚡' : '🔋'}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-h)' }}>Batería</span>
                  {bat.charging && <span style={{ fontSize: 9, color: 'var(--success)', fontWeight: 700, background: 'var(--success-soft)', borderRadius: 4, padding: '1px 5px' }}>CARGANDO</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: batColor }}>{bat.level}%</span>
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{bat.temperature}°C</span>
                </div>
              </div>
              <Bar pct={bat.level} color={batColor} h={5} />
            </div>
          )}

          {/* WiFi */}
          {wifi?.ssid && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13 }}>📶</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-h)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{wifi.ssid}</div>
                {wifi.ip && <div style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'monospace' }}>{wifi.ip}</div>}
              </div>
              {wifi.rssi && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 10, fontFamily: 'monospace', color: rssiColor(wifi.rssi), letterSpacing: '-1px' }}>{rssiLabel(wifi.rssi)}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{wifi.rssi} dBm</div>
                </div>
              )}
            </div>
          )}

          {/* Storage */}
          {sto && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13 }}>💾</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-h)' }}>Almacenamiento</span>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{sto.usedGB} / {sto.totalGB} GB</span>
              </div>
              <Bar pct={sto.pct} color={sto.pct > 85 ? 'var(--error)' : sto.pct > 70 ? 'var(--warning)' : 'var(--accent)'} h={4} />
            </div>
          )}

          {/* RAM */}
          {mem && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13 }}>🧠</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-h)' }}>RAM</span>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-2)' }}>{mem.usedMB} / {mem.totalMB} MB</span>
              </div>
              <Bar pct={mem.pct} color={mem.pct > 85 ? 'var(--error)' : 'var(--accent)'} h={4} />
            </div>
          )}

        </div>
      )}
    </div>
  )
}

// ─── Media controls ───────────────────────────────────────────────────────────
function MediaCard({ serial }) {
  const [info, setInfo] = useState(null)

  const refresh = useCallback(async () => {
    const r = await adbMediaInfo({ serial })
    setInfo(r?.hasData ? r : null)
  }, [serial])

  useEffect(() => {
    if (!serial) return
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [refresh])

  const cmd = async c => { await adbMediaCmd({ serial, cmd: c }); setTimeout(refresh, 500) }

  const Btn = ({ action, label, big }) => (
    <button onClick={() => cmd(action)} style={{
      background: big ? 'var(--accent)' : 'var(--bg-elem)',
      border: '0.5px solid var(--border-lit)', borderRadius: big ? 12 : 9,
      cursor: 'pointer', color: big ? '#fff' : 'var(--text-1)',
      padding: big ? '10px 22px' : '7px 14px', fontSize: big ? 20 : 14,
      transition: 'opacity 0.12s',
    }}
    onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >{label}</button>
  )

  if (!serial) return null

  return (
    <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-lit)', borderRadius: 14, padding: '14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 12 }}>REPRODUCCIÓN</div>

      {info ? (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--accent-soft)', border: '0.5px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
            {appIcon(info.pkg)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{info.title || '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{info.artist || appName(info.pkg)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: info.playing ? 'var(--success)' : 'var(--text-3)', animation: info.playing ? 'pulse 2s infinite' : 'none' }} />
              <span style={{ fontSize: 10, color: info.playing ? 'var(--success)' : 'var(--text-3)', fontWeight: 600 }}>{info.playing ? 'Reproduciendo' : 'Pausado'}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
          <Btn action="prev" label="⏮" />
          <Btn action="play_pause" label={info.playing ? '⏸' : '▶'} big />
          <Btn action="next" label="⏭" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <button onClick={() => cmd('vol_down')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 15 }}>🔉</button>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Volumen</span>
          <button onClick={() => cmd('vol_up')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 15 }}>🔊</button>
        </div>
      </>) : (
        <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--text-3)' }}>
          <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.3 }}>🎵</div>
          <div style={{ fontSize: 11 }}>Nada reproduciendo</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
            <button onClick={() => cmd('vol_down')} style={{ background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-2)', padding: '5px 12px', fontSize: 13 }}>🔉</button>
            <button onClick={() => cmd('vol_up')} style={{ background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-2)', padding: '5px 12px', fontSize: 13 }}>🔊</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Importar fotos ───────────────────────────────────────────────────────────
function PhotoImport({ serial }) {
  const [state, setState] = useState('idle')
  const [result, setResult] = useState(null)
  const [knownFiles, setKnownFiles] = useState([])
  const [useGphoto, setUseGphoto] = useState(false)
  const [gphotoFiles, setGphotoFiles] = useState(null)
  const [loadingGphoto, setLoadingGphoto] = useState(false)

  const importAdb = async () => {
    setState('importing')
    const r = await adbImportPhotos({ serial, knownFiles })
    if (r?.ok) { setResult(r); setKnownFiles(p => [...new Set([...p, ...r.imported])]); setState('done') }
    else setState('error')
    setTimeout(() => setState('idle'), 4000)
  }

  const loadGphoto = async () => {
    setLoadingGphoto(true)
    const r = await gphoto2List()
    setGphotoFiles(r?.ok ? r.files : [])
    setLoadingGphoto(false)
  }

  const importGphoto = async () => {
    setState('importing')
    const r = await gphoto2Pull({ fileNums: gphotoFiles.map(f => f.num) })
    setResult({ dest: r?.dest, imported: [], newCount: gphotoFiles.length })
    setState(r?.ok ? 'done' : 'error')
    setTimeout(() => setState('idle'), 4000)
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-lit)', borderRadius: 14, padding: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em' }}>IMPORTAR FOTOS</div>
        <div style={{ display: 'flex', gap: 5 }}>
          <button onClick={() => setUseGphoto(false)} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer', background: !useGphoto ? 'var(--accent)' : 'var(--bg-elem)', color: !useGphoto ? '#fff' : 'var(--text-3)' }}>🔌 USB debug</button>
          <button onClick={() => { setUseGphoto(true); if (!gphotoFiles) loadGphoto() }} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer', background: useGphoto ? 'var(--accent)' : 'var(--bg-elem)', color: useGphoto ? '#fff' : 'var(--text-3)' }}>📷 MTP</button>
        </div>
      </div>

      {!useGphoto && (
        <>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8 }}>
            {knownFiles.length > 0 ? `${knownFiles.length} ya importadas — solo descargará las nuevas` : 'DCIM/Camera → ~/Imágenes/Tablet'}
          </div>
          <button onClick={importAdb} disabled={!serial || state === 'importing'} style={{
            width: '100%', padding: '8px', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 700,
            cursor: serial && state !== 'importing' ? 'pointer' : 'not-allowed',
            background: state === 'done' ? 'var(--success-soft)' : state === 'error' ? 'rgba(239,68,68,0.12)' : serial ? 'var(--accent)' : 'var(--bg-elem)',
            color: state === 'done' ? 'var(--success)' : state === 'error' ? 'var(--error)' : serial ? '#fff' : 'var(--text-3)',
          }}>
            {state === 'importing' ? '⏳ Importando…' : state === 'done' ? `✓ ${result?.imported?.length || 0} fotos nuevas` : state === 'error' ? '✗ Error' : serial ? '⬇ Importar fotos nuevas' : 'Sin tablet conectada'}
          </button>
          {state === 'done' && result?.dest && (
            <button onClick={() => openFolder(result.dest)} style={{ width: '100%', marginTop: 5, padding: '5px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--bg-elem)', color: 'var(--text-2)', fontSize: 11 }}>📁 Abrir carpeta</button>
          )}
        </>
      )}

      {useGphoto && (
        <>
          {loadingGphoto && <div style={{ textAlign: 'center', padding: '10px 0', color: 'var(--text-3)', fontSize: 11 }}>Detectando cámara MTP…</div>}
          {gphotoFiles?.length === 0 && <div style={{ textAlign: 'center', padding: '10px 0', color: 'var(--text-3)', fontSize: 11 }}>No se encontró cámara MTP — activa el modo archivo en la tablet</div>}
          {gphotoFiles?.length > 0 && (
            <button onClick={importGphoto} disabled={state === 'importing'} style={{ width: '100%', padding: '8px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: state === 'done' ? 'var(--success-soft)' : 'var(--accent)', color: state === 'done' ? 'var(--success)' : '#fff' }}>
              {state === 'importing' ? '⏳ Importando…' : state === 'done' ? '✓ Importadas' : `⬇ Importar ${gphotoFiles.length} fotos (MTP)`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ─── KDE Connect ──────────────────────────────────────────────────────────────
function KdeConnectCard({ serial }) {
  const [devices, setDevices] = useState(null)
  const [notInstalled, setNotInstalled] = useState(false)
  const [sharing, setSharing] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    const r = await kdeconnectList()
    if (!r?.ok && r?.error === 'not_installed') { setNotInstalled(true); return }
    setDevices(r?.devices || [])
  }, [])

  useEffect(() => { load() }, [load])

  const flash = (text, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3000) }

  const share = async (deviceId) => {
    const f = await pickFile()
    if (!f) return
    setSharing(deviceId)
    const r = await kdeconnectShare({ deviceId, filePath: f })
    setSharing(null)
    flash(r?.ok ? `✓ Enviado a ${devices.find(d => d.id === deviceId)?.name}` : `✗ Error: ${r?.out || 'desconocido'}`, r?.ok)
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border-lit)', borderRadius: 14, padding: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em' }}>KDE CONNECT</div>
        {!notInstalled && <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12 }}>↻</button>}
      </div>

      {msg && <div style={{ fontSize: 11, padding: '5px 8px', marginBottom: 8, borderRadius: 7, background: msg.ok ? 'var(--success-soft)' : 'rgba(239,68,68,0.1)', color: msg.ok ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>{msg.text}</div>}

      {notInstalled && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>No instalado</div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--accent)', background: 'var(--bg-elem)', borderRadius: 7, padding: '6px 10px', userSelect: 'all' }}>sudo dnf install kdeconnectd</div>
        </div>
      )}

      {devices !== null && !notInstalled && devices.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 11, padding: '6px 0' }}>
          Sin dispositivos emparejados — abre KDE Connect en la tablet
        </div>
      )}

      {devices?.map(d => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '0.5px solid var(--border)' }}>
          <span style={{ fontSize: 18 }}>📱</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-h)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
            <div style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'monospace' }}>{d.id}</div>
          </div>
          <button onClick={() => share(d.id)} disabled={sharing === d.id} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            {sharing === d.id ? '…' : '📤 Enviar'}
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Notificaciones ───────────────────────────────────────────────────────────
function NotificationsFeed({ serial }) {
  const [notifs, setNotifs] = useState([])
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(new Set())

  const refresh = useCallback(async () => {
    if (!serial) return
    setLoading(true)
    const r = await adbNotifications({ serial })
    if (r?.notifications) setNotifs(r.notifications)
    setLoading(false)
  }, [serial])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  const visible = notifs.filter(n => !dismissed.has(`${n.pkg}-${n.when}`))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 8px', flexShrink: 0, borderBottom: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>🔔</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)' }}>Notificaciones</span>
          {visible.length > 0 && (
            <span style={{ fontSize: 10, background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>{visible.length}</span>
          )}
          {loading && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>↻</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={refresh} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11, padding: '2px 6px' }}>Actualizar</button>
          {visible.length > 0 && (
            <button onClick={() => setDismissed(new Set(notifs.map(n => `${n.pkg}-${n.when}`)))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11, padding: '2px 6px' }}>Limpiar</button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {!serial && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 12 }}>
            <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.3 }}>🔔</div>
            Sin tablet conectada
          </div>
        )}

        {serial && visible.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 12 }}>
            <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.3 }}>✓</div>
            Sin notificaciones pendientes
          </div>
        )}

        {visible.map(n => {
          const key = `${n.pkg}-${n.when}`
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 10px', marginBottom: 5, background: 'var(--bg-card)', border: '0.5px solid var(--border-lit)', borderRadius: 12 }}>
              <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>{appIcon(n.pkg)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-h)' }}>{appName(n.pkg)}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{relTime(n.when)}</span>
                </div>
                {n.title && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</div>}
                {n.text  && <div style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.text}</div>}
              </div>
              <button onClick={() => setDismissed(p => new Set([...p, key]))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 14, padding: '0 2px', flexShrink: 0 }}>✕</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── PhonePage ────────────────────────────────────────────────────────────────
export default function PhonePage({ devices, activeDevice }) {
  const connected = activeDevice || devices.find(d => d.status === 'device')
  const serial = connected?.serial

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'transparent' }}>

      {/* Panel izquierdo — estado + media + fotos + kde connect */}
      <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 12, overflowY: 'auto', borderRight: '0.5px solid rgba(255,255,255,0.08)' }}>
        <DeviceStatusCard serial={serial} />
        <MediaCard serial={serial} />
        <PhotoImport serial={serial} />
        <KdeConnectCard serial={serial} />
      </div>

      {/* Panel derecho — notificaciones */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <NotificationsFeed serial={serial} />
      </div>

    </div>
  )
}
