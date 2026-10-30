import React, { useState, useEffect, useCallback } from 'react'
import { Battery, BatteryCharging, Cpu, HardDrive, Wifi, Smartphone, Camera, RefreshCw, Download, MemoryStick } from 'lucide-react'

// ── Parsers (same logic as original) ──────────────────────────────────────────
function parseBattery(out) {
  const get = (key) => out.match(new RegExp(`${key}:\\\\s*(\\\\S+)`))?.[1]
    || out.match(new RegExp(`${key}:[ \\t]*(\\S+)`))?.[1]
  return {
    level:       parseInt(out.match(/level:\s*(\d+)/)?.[1]) || 0,
    charging:    out.match(/status:\s*(\d+)/)?.[1] === '2',
    temperature: ((parseInt(out.match(/temperature:\s*(\d+)/)?.[1]) || 0) / 10).toFixed(1),
    voltage:     ((parseInt(out.match(/voltage:\s*(\d+)/)?.[1]) || 0) / 1000).toFixed(2),
    usb:         out.includes('USB powered: true'),
    ac:          out.includes('AC powered: true'),
    health:      { 2:'Buena',3:'Sobrecalentada',4:'Muerta',5:'Sobre voltaje',7:'Fría' }[out.match(/health:\s*(\d+)/)?.[1]] || 'Desconocida',
  }
}
function parseMemory(out) {
  const total = parseInt(out.match(/MemTotal:\s+(\d+)/)?.[1]) || 0
  const avail = parseInt(out.match(/MemAvailable:\s+(\d+)/)?.[1]) || 0
  const used  = total - avail
  return { total: (total/1024).toFixed(0), used: (used/1024).toFixed(0), avail: (avail/1024).toFixed(0), pct: total ? Math.round((used/total)*100) : 0 }
}
function parseStorage(out) {
  const line = out.split('\n').find(l => l.includes('/sdcard') || l.includes('fuse'))
  if (!line) return null
  const parts = line.trim().split(/\s+/)
  const total = parseInt(parts[1]) || 0; const used = parseInt(parts[2]) || 0; const avail = parseInt(parts[3]) || 0
  return { total:(total/1024/1024).toFixed(1), used:(used/1024/1024).toFixed(1), avail:(avail/1024/1024).toFixed(1), pct: total ? Math.round((used/total)*100) : 0 }
}
function parseWifi(out) {
  const ssid  = out.match(/SSID:\s*(.+)/)?.[1]?.trim()
  const rssi  = out.match(/RSSI:\s*(-?\d+)/)?.[1]
  const ip    = out.match(/ip_address\s+(\d+\.\d+\.\d+\.\d+)/)?.[1]
  const speed = out.match(/link_speed\s+(\d+)/)?.[1]
  return { ssid, rssi: rssi ? parseInt(rssi) : null, ip, speed }
}
function parsePropDevice(out) {
  const get = (key) => out.match(new RegExp(`\\[${key}\\]:\\s*\\[(.*)\\]`))?.[1]
  return { model: get('ro.product.model')||'—', brand: get('ro.product.brand')||'—', android: get('ro.build.version.release')||'—', sdk: get('ro.build.version.sdk')||'—', cpu: get('ro.product.cpu.abi')||'—' }
}
function rssiToSignal(rssi) {
  if (!rssi) return { label:'—', color:'var(--text-3)', bars:0 }
  if (rssi >= -50) return { label:'Excelente', color:'var(--success)',  bars:4 }
  if (rssi >= -60) return { label:'Buena',     color:'var(--success)',  bars:3 }
  if (rssi >= -70) return { label:'Regular',   color:'var(--warning)',  bars:2 }
  return              { label:'Débil',      color:'var(--error)',    bars:1 }
}

export default function DevicePanel({ devices, addLog, hasWallpaper }) {
  const device = devices.find(d => d.status === 'device')
  const serial = device?.serial
  const [data,          setData]          = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [lastUpdate,    setLastUpdate]    = useState(null)
  const [screenshot,    setScreenshot]    = useState(null)
  const [screenshotting,setScreenshotting]= useState(false)
  const [autoRefresh,   setAutoRefresh]   = useState(true)

  const fetchAll = useCallback(async () => {
    if (!serial) return
    setLoading(true)
    try {
      const [battOut, memOut, storOut, wifiOut, propOut, cpuOut, uptimeOut, appsOut] = await Promise.all([
        window.api?.adbShell({ serial, cmd: 'dumpsys battery' }),
        window.api?.adbShell({ serial, cmd: 'cat /proc/meminfo' }),
        window.api?.adbShell({ serial, cmd: 'df /sdcard' }),
        window.api?.adbShell({ serial, cmd: 'dumpsys wifi | grep -E "SSID:|RSSI:|ip_address|link_speed|frequency"' }),
        window.api?.adbShell({ serial, cmd: 'getprop' }),
        window.api?.adbShell({ serial, cmd: 'top -bn1 | head -5' }),
        window.api?.adbShell({ serial, cmd: 'uptime -p' }),
        window.api?.adbShell({ serial, cmd: 'pm list packages -3 | wc -l' }),
      ])
      setData({
        battery: parseBattery(battOut?.out || ''),
        memory:  parseMemory(memOut?.out   || ''),
        storage: parseStorage(storOut?.out || ''),
        wifi:    parseWifi(wifiOut?.out    || ''),
        device:  parsePropDevice(propOut?.out || ''),
        uptime:  (uptimeOut?.out || '').trim().replace('up ', ''),
        apps:    parseInt((appsOut?.out || '0').trim()) || 0,
      })
      setLastUpdate(new Date().toLocaleTimeString('es'))
    } catch(e) { console.error('fetchAll:', e) }
    setLoading(false)
  }, [serial])

  useEffect(() => {
    if (!serial) return
    fetchAll()
    if (!autoRefresh) return
    const id = setInterval(fetchAll, 5000)
    return () => clearInterval(id)
  }, [serial, fetchAll, autoRefresh])

  const takeScreenshot = async () => {
    if (!serial) return
    setScreenshotting(true)
    const r = await window.api?.adbScreenshot({ serial })
    if (r?.ok && r.base64) { setScreenshot(`data:image/png;base64,${r.base64}`); addLog('Captura tomada', 'ok') }
    else addLog('Error en captura', 'error')
    setScreenshotting(false)
  }

  const glass = { background: 'rgba(12,14,20,0.80)', backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)' }

  if (!device) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'var(--text-3)', background: 'transparent' }}>
        <Smartphone size={44} strokeWidth={1} />
        <p style={{ fontSize: 14, fontWeight: 600 }}>Sin dispositivo conectado</p>
        <p style={{ fontSize: 12 }}>Conecta la tablet por USB</p>
      </div>
    )
  }

  const statCards = [
    {
      title: 'BATERÍA', icon: data?.battery?.charging ? <BatteryCharging size={14} color="var(--success)" /> : <Battery size={14} color="var(--accent)" />,
      value: data?.battery ? `${data.battery.level}%` : '—',
      color: !data?.battery ? 'var(--accent)' : data.battery.level > 50 ? 'var(--success)' : data.battery.level > 20 ? 'var(--warning)' : 'var(--error)',
      bar: data?.battery?.level ?? 0,
      barColor: !data?.battery ? 'var(--accent)' : data.battery.level > 50 ? 'var(--success)' : data.battery.level > 20 ? 'var(--warning)' : 'var(--error)',
      rows: data?.battery ? [
        ['Estado',      data.battery.charging ? '⚡ Cargando' : '🔋 Descargando'],
        ['Fuente',      data.battery.ac ? 'AC' : data.battery.usb ? 'USB' : '—'],
        ['Temperatura', `${data.battery.temperature}°C`],
        ['Voltaje',     `${data.battery.voltage}V`],
        ['Salud',       data.battery.health],
      ] : null,
    },
    {
      title: 'MEMORIA RAM', icon: <MemoryStick size={14} color="var(--accent)" />,
      value: data?.memory ? `${data.memory.used} MB` : '—',
      color: 'var(--accent)', bar: data?.memory?.pct ?? 0,
      barColor: !data?.memory ? 'var(--accent)' : data.memory.pct < 60 ? 'var(--success)' : data.memory.pct < 80 ? 'var(--warning)' : 'var(--error)',
      rows: data?.memory ? [
        ['Usada',       `${data.memory.used} MB`],
        ['Disponible',  `${data.memory.avail} MB`],
        ['Total',       `${data.memory.total} MB`],
        ['Uso',         `${data.memory.pct}%`],
      ] : null,
    },
    {
      title: 'ALMACENAMIENTO', icon: <HardDrive size={14} color="var(--accent)" />,
      value: data?.storage ? `${data.storage.avail} GB` : '—',
      color: '#facc15', bar: data?.storage?.pct ?? 0,
      barColor: !data?.storage ? '#facc15' : data.storage.pct < 70 ? 'var(--success)' : data.storage.pct < 90 ? 'var(--warning)' : 'var(--error)',
      rows: data?.storage ? [
        ['Usado',       `${data.storage.used} GB`],
        ['Disponible',  `${data.storage.avail} GB`],
        ['Total',       `${data.storage.total} GB`],
        ['Uso',         `${data.storage.pct}%`],
      ] : null,
    },
    {
      title: 'WI-FI', icon: <Wifi size={14} color="var(--accent)" />,
      value: data?.wifi?.ssid || (data ? 'Sin WiFi' : '—'),
      color: 'var(--success)', bar: data?.wifi?.rssi ? Math.min(100, Math.max(0, (data.wifi.rssi + 100) * 2)) : 0,
      barColor: 'var(--success)',
      rows: data?.wifi?.ssid ? [
        ['RSSI',        `${data.wifi.rssi} dBm`],
        ['IP',          data.wifi.ip || '—'],
        ['Velocidad',   data.wifi.speed ? `${data.wifi.speed} Mbps` : '—'],
        ['Señal',       rssiToSignal(data.wifi.rssi).label],
      ] : null,
    },
  ]

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'transparent', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-h)' }}>
            {data?.device?.brand} {data?.device?.model || device.model}
          </h2>
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
            Android {data?.device?.android || '—'} · SDK {data?.device?.sdk || '—'}
            {lastUpdate && ` · Actualizado ${lastUpdate}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            Auto
          </label>
          <button onClick={fetchAll} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8, background: 'var(--bg-elem)',
            border: '0.5px solid var(--border-lit)', color: 'var(--text-1)', fontSize: 12,
            cursor: loading ? 'wait' : 'pointer',
          }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {statCards.map(c => (
          <div key={c.title} style={{ ...glass, borderRadius: 14, border: '0.5px solid var(--border-lit)', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              {c.icon}
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em' }}>{c.title}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color, marginBottom: 4 }}>{c.value}</div>
            <div style={{ height: 3, borderRadius: 2, background: 'var(--bg-elem)', marginBottom: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(c.bar, 100)}%`, background: c.barColor, borderRadius: 2, transition: 'width 0.4s ease' }} />
            </div>
            {c.rows ? c.rows.map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{l}</span>
                <span style={{ fontSize: 11, color: 'var(--text-1)', fontWeight: 500 }}>{v}</span>
              </div>
            )) : <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{[80, 60, 70, 50].map((w, i) => <div key={i} style={{ height: 9, width: `${w}%`, borderRadius: 3, background: 'var(--bg-elem)', animation: 'pulse 1.5s ease-in-out infinite' }} />)}</div>}
          </div>
        ))}
      </div>

      {/* Screenshot */}
      <div style={{ ...glass, borderRadius: 14, border: '0.5px solid var(--border-lit)', padding: '14px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 12 }}>CAPTURA DE PANTALLA</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: screenshot ? 12 : 0 }}>
          <button onClick={takeScreenshot} disabled={screenshotting} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 9,
            background: screenshotting ? 'var(--bg-elem)' : 'var(--accent)',
            color: screenshotting ? 'var(--text-3)' : '#fff',
            fontSize: 13, fontWeight: 600, cursor: screenshotting ? 'wait' : 'pointer', border: 'none',
          }}>
            {screenshotting ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Capturando…</> : <><Camera size={14} /> Tomar captura</>}
          </button>
          {screenshot && (
            <>
              <button onClick={() => { const a = document.createElement('a'); a.href = screenshot; a.download = `tablet-${Date.now()}.png`; a.click() }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)', color: 'var(--text-1)', fontSize: 13, fontWeight: 600 }}>
                <Download size={14} /> Guardar
              </button>
              <button onClick={() => setScreenshot(null)} style={{ padding: '8px 12px', borderRadius: 9, background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)', color: 'var(--text-2)', fontSize: 13 }}>✕</button>
            </>
          )}
        </div>
        {screenshot && (
          <div style={{ borderRadius: 10, overflow: 'hidden', border: '0.5px solid var(--border-lit)', background: '#000', maxHeight: 400, display: 'flex', justifyContent: 'center' }}>
            <img src={screenshot} alt="Captura tablet" style={{ maxHeight: 400, maxWidth: '100%', objectFit: 'contain' }} />
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
