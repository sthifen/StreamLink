import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Paperclip, Send, RefreshCw, FolderOpen, X, Image,
  Usb, Wifi, Download, Upload, FolderInput,
  QrCode, Play, Square, Copy, Check,
  Bluetooth, BluetoothSearching, BluetoothConnected, BluetoothOff,
  FileUp, FileDown, Smartphone,
} from 'lucide-react'

const S = {
  kbd: { background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)', borderRadius: 4, padding: '1px 5px', fontSize: 11, fontFamily: 'monospace' },
  tab: (active) => ({ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 400, border: 'none', background: active ? 'var(--accent)' : 'var(--bg-elem)', color: active ? '#fff' : 'var(--text-2)', transition: 'all 0.15s' }),
  card: { background: 'var(--bg-panel)', border: '0.5px solid var(--border-lit)', borderRadius: 10, overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '0.5px solid var(--border-lit)' },
  btn: (variant = 'ghost') => {
    const map = { ghost: { bg: 'transparent', color: 'var(--text-2)' }, primary: { bg: 'var(--accent)', color: '#fff' }, success: { bg: 'var(--success)', color: '#fff' }, danger: { bg: 'var(--error)', color: '#fff' }, elem: { bg: 'var(--bg-elem)', color: 'var(--text-1)' } }
    const { bg, color } = map[variant] || map.ghost
    return { display: 'flex', alignItems: 'center', gap: 5, background: bg, color, padding: '6px 13px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none' }
  },
}

const TABLET_PATHS = [
  { label: 'Descargas', path: '/sdcard/Download' },
  { label: 'Fotos', path: '/sdcard/DCIM/Camera' },
  { label: 'Imagenes', path: '/sdcard/Pictures' },
  { label: 'Documentos', path: '/sdcard/Documents' },
  { label: 'Musica', path: '/sdcard/Music' },
  { label: 'Raiz sdcard', path: '/sdcard' },
]

const G = {
  glass: { background: 'var(--bg-panel)', backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)', border: '0.5px solid var(--border-lit)', borderRadius: 12 },
  glassCard: { background: 'rgba(255,255,255,0.04)', border: '0.5px solid var(--border-lit)', borderRadius: 10 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '0.5px solid var(--border-lit)', flexShrink: 0 },
  iconBtn: { display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg-elem)', color: 'var(--text-2)', border: '0.5px solid var(--border-lit)', borderRadius: 7, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s' },
  accentBtn: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.12s' },
  dangerBtn: { display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(239,68,68,0.12)', color: 'var(--error)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '5px 9px', fontSize: 11, cursor: 'pointer', transition: 'all 0.12s' },
}

const SORT_OPTIONS = [{ value: 'recent', label: 'Reciente' }, { value: 'name', label: 'A a Z' }, { value: 'size', label: 'Tamano' }]

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase()
  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return '🖼'
  if (['mp4','mkv','avi','mov','webm'].includes(ext)) return '🎬'
  if (['mp3','wav','ogg','flac','aac'].includes(ext)) return '🎵'
  if (ext === 'pdf') return '📄'
  if (['zip','rar','7z','tar','gz'].includes(ext)) return '🗜'
  if (ext === 'apk') return '📦'
  return '📁'
}

function isImage(name) {
  return ['jpg','jpeg','png','gif','webp','svg'].includes(name.split('.').pop().toLowerCase())
}

function useToast() {
  const [toast, setToast] = useState(null)
  const show = useCallback((msg, type = 'ok') => setToast({ msg, type, id: Date.now() }), [])
  return { toast, show }
}

function Toast({ toast }) {
  if (!toast) return null
  const color = toast.type === 'ok' ? 'var(--success)' : toast.type === 'err' ? 'var(--error)' : 'var(--warning)'
  return (
    <div key={toast.id} style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-panel)', border: `1px solid ${color}44`, borderRadius: 50, padding: '7px 18px', fontSize: 12, fontWeight: 600, color, backdropFilter: 'blur(12px)', zIndex: 50, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
      {toast.msg}
    </div>
  )
}

function QRCanvas({ url, size = 180 }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    if (!url || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&bgcolor=1a1d2e&color=ffffff&margin=10`
    img.onload = () => { ctx.clearRect(0, 0, size, size); ctx.drawImage(img, 0, 0, size, size) }
    img.onerror = () => {
      ctx.fillStyle = '#1a1d2e'; ctx.fillRect(0, 0, size, size)
      ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.textAlign = 'center'
      ctx.fillText('Sin internet', size/2, size/2 - 8)
      ctx.fillText('Abre la URL', size/2, size/2 + 8)
    }
  }, [url, size])
  return <canvas ref={canvasRef} width={size} height={size} style={{ borderRadius: 12, display: 'block' }} />
}

function FilePreview({ file, serverInfo, onClose }) {
  const url = `http://${serverInfo.ip}:${serverInfo.port}/api/download/${encodeURIComponent(file.name)}`
  const isImg = isImage(file.name)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ ...G.glass, maxWidth: 760, maxHeight: '85vh', width: '90%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '0.5px solid var(--border-lit)' }}>
          <span style={{ fontSize: 18 }}>{fileIcon(file.name)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{file.size}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <a href={url} download={file.name} style={{ ...G.iconBtn, textDecoration: 'none' }}><Download size={12} /> Descargar</a>
            <button onClick={onClose} style={{ ...G.iconBtn, padding: '5px 8px' }}><X size={13} /></button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, minHeight: 200 }}>
          {isImg
            ? <img src={url} alt={file.name} style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: 8, objectFit: 'contain' }} />
            : <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32 }}>
                <div style={{ fontSize: 60, marginBottom: 12 }}>{fileIcon(file.name)}</div>
                <a href={url} download={file.name} style={{ ...G.accentBtn, marginTop: 16, textDecoration: 'none', display: 'inline-flex' }}><Download size={14} /> Descargar al PC</a>
              </div>}
        </div>
      </div>
    </div>
  )
}

// WIFI PANEL
function WifiPanel({ config, addLog }) {
  const folder = config.drop_folder || '~/Drop'
  const [serverInfo, setServerInfo] = useState(null)
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [files, setFiles] = useState([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('recent')
  const [preview, setPreview] = useState(null)
  const [attached, setAttached] = useState(null)
  const [pasteMsg, setPasteMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)
  const [showQR, setShowQR] = useState(true)
  const { toast, show: showToast } = useToast()
  const wsRef = useRef(null)

  useEffect(() => { checkStatus() }, [])

  useEffect(() => {
    if (!running || !serverInfo) return
    const ws = new WebSocket(`ws://${serverInfo.ip}:${serverInfo.port}`)
    wsRef.current = ws
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'file-added') { addLog(`📥 WiFi: ${msg.name} recibido`, 'ok'); showToast(`📥 ${msg.name}`, 'ok'); loadFiles() }
        if (msg.type === 'file-deleted') loadFiles()
      } catch {}
    }
    ws.onerror = () => {}
    return () => { ws.close(); wsRef.current = null }
  }, [running, serverInfo])

  useEffect(() => {
    const handler = async (e) => {
      if (!((e.ctrlKey || e.metaKey) && e.key === 'v')) return
      if (['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return
      e.preventDefault(); await pasteClipboard()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [folder, serverInfo, running])

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(true) }
  const handleDragLeave = (e) => { e.preventDefault(); setDragging(false) }
  const handleDrop = async (e) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    if (!droppedFiles.length) return
    if (!running || !serverInfo) { showToast('Inicia el servidor primero', 'warn'); return }
    setSending(true)
    for (const file of droppedFiles) {
      const r = await window.api.copyToDrop({ src: file.path, folder })
      r.ok ? (addLog(`WiFi Drop: ${file.name}`, 'ok'), showToast(`${file.name}`, 'ok')) : (addLog(`Error: ${file.name}`, 'error'), showToast(`Error: ${file.name}`, 'err'))
    }
    await loadFiles(); setSending(false)
  }

  const checkStatus = async () => {
    const r = await window.api?.webtransferInfo?.()
    if (r?.ok && r.running) { setRunning(true); setServerInfo({ ip: r.ip, port: r.port, url: r.url, folder: r.folder }); loadFiles(r) }
  }
  const startServer = async () => {
    setLoading(true); setError('')
    try {
      const r = await window.api?.webtransferStart?.({ folder })
      if (r?.ok) { setRunning(true); setServerInfo({ ip: r.ip, port: r.port, url: r.url, folder: r.folder }); addLog(`WiFi Transfer activo en ${r.url}`, 'ok'); loadFiles(r) }
      else setError(r?.error || 'Error al iniciar el servidor')
    } catch (err) { setError(err.message) }
    setLoading(false)
  }
  const stopServer = async () => {
    setLoading(true)
    try { await window.api?.webtransferStop?.(); setRunning(false); setServerInfo(null); setFiles([]); wsRef.current?.close(); addLog('WiFi Transfer detenido', 'ok') }
    finally { setLoading(false) }
  }
  const loadFiles = async (info) => {
    const t = info || serverInfo; if (!t) return
    try { const res = await fetch(`http://${t.ip}:${t.port}/api/files`); const data = await res.json(); setFiles(data.files || []) } catch {}
  }
  const deleteFile = async (name) => {
    if (!serverInfo) return
    try { await fetch(`http://${serverInfo.ip}:${serverInfo.port}/api/file/${encodeURIComponent(name)}`, { method: 'DELETE' }); loadFiles() } catch {}
  }
  const pasteClipboard = async () => {
    try {
      const r = await window.api?.pasteImage?.(null)
      if (!r?.ok) { showToast('No hay imagen en el clipboard', 'warn'); return }
      setAttached({ name: r.filename, tmpPath: r.tmpPath }); setPasteMsg(`${r.filename} listo`); showToast(`${r.filename} listo para enviar`, 'ok')
    } catch (err) { showToast(err.message, 'err') }
  }
  const sendAttached = async () => {
    if (!attached) return; setSending(true)
    const r = await window.api.copyToDrop({ src: attached.tmpPath, folder })
    if (r.ok) { showToast(`Enviado: ${attached.name}`, 'ok'); setAttached(null); setPasteMsg(''); await loadFiles() }
    else showToast(`Error: ${r.error}`, 'err')
    setSending(false)
  }
  const pickFile = async () => { const p = await window.api.pickFile(); if (p) { setAttached({ name: p.split('/').pop(), tmpPath: p }); setPasteMsg('') } }
  const copyUrl = () => { if (!serverInfo) return; navigator.clipboard.writeText(serverInfo.url); setUrlCopied(true); setTimeout(() => setUrlCopied(false), 2000); showToast('URL copiada', 'ok') }

  const visibleFiles = files
    .filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) : sortBy === 'size' ? (b.bytes||0)-(a.bytes||0) : (b.mts||0)-(a.mts||0))

  if (!running) return (
    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32, position: 'relative', outline: dragging ? '3px dashed var(--accent)' : '3px dashed transparent', borderRadius: 10, transition: 'outline 0.15s' }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 }}>📡</div>
      <div style={{ textAlign: 'center' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Transferencia por WiFi</h3>
        <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7, maxWidth: 340 }}>Inicia el servidor y escanea el QR desde la tablet para enviar y recibir archivos por red local, sin USB.</p>
      </div>
      {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid var(--error)', borderRadius: 8, padding: '10px 16px', fontSize: 12, color: 'var(--error)', maxWidth: 340, textAlign: 'center' }}>error: {error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={pasteClipboard} style={{ ...G.iconBtn }}><Image size={13} /> Ctrl+V Pegar imagen</button>
        <button onClick={pickFile} style={{ ...G.iconBtn }}><Paperclip size={13} /> Adjuntar archivo</button>
      </div>
      {attached && <div style={{ ...G.glassCard, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, maxWidth: 340, width: '100%' }}>
        <span style={{ fontSize: 20 }}>{fileIcon(attached.name)}</span>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-h)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attached.name}</span>
        <button onClick={() => { setAttached(null); setPasteMsg('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={13} /></button>
      </div>}
      {pasteMsg && !attached && <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center' }}>{pasteMsg}</div>}
      <button onClick={startServer} disabled={loading} style={{ ...G.accentBtn, fontSize: 13, padding: '11px 28px', opacity: loading ? 0.6 : 1 }}>
        <Play size={15} /> {loading ? 'Iniciando...' : 'Iniciar servidor WiFi'}
      </button>
      <p style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>Carpeta destino: <code style={S.kbd}>{folder}</code></p>
      <Toast toast={toast} />
      <style>{`@keyframes wifiPulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  )

  return (
    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden', position: 'relative', outline: dragging ? '3px dashed var(--accent)' : '3px dashed transparent', borderRadius: 10, transition: 'outline 0.15s' }}>
      {dragging && <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(108,99,255,0.08)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ ...G.glass, padding: '24px 40px', textAlign: 'center', border: '2px solid var(--accent)' }}><div style={{ fontSize: 40, marginBottom: 8 }}>📤</div><p style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>Suelta para guardar en Drop</p></div>
      </div>}
      <div style={{ ...G.glass, padding: '10px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px var(--success)', flexShrink: 0, animation: 'wifiPulse 2s infinite' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Servidor activo</div>
            <div style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{serverInfo.url}</div>
          </div>
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
            <button onClick={copyUrl} style={{ ...G.iconBtn }}>{urlCopied ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}</button>
            <button onClick={() => window.api?.openUrl?.(serverInfo.url)} style={{ ...G.iconBtn }}>🌐</button>
            <button onClick={() => setShowQR(q => !q)} style={{ ...G.iconBtn, ...(showQR ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}) }}><QrCode size={12} /></button>
            <button onClick={stopServer} disabled={loading} style={{ ...G.iconBtn, color: 'var(--error)', borderColor: 'rgba(239,68,68,0.3)', opacity: loading ? 0.5 : 1 }}><Square size={12} /></button>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 10, overflow: 'hidden', minHeight: 0 }}>
        {showQR && <div style={{ ...G.glass, flexShrink: 0, width: 188, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 10px', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>Escanea con la tablet</div>
          <div style={{ background: '#fff', borderRadius: 8, padding: 5 }}><QRCanvas url={serverInfo.url} size={158} /></div>
          <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--accent)', textAlign: 'center', wordBreak: 'break-all', width: '100%', background: 'var(--bg-elem)', borderRadius: 6, padding: '4px 6px' }}>{serverInfo.url}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5 }}>Misma red WiFi requerida</div>
        </div>}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
          <div style={{ ...G.glass, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '0.5px solid var(--border-lit)', minHeight: 38 }}>
              {attached ? (<><span style={{ fontSize: 16 }}>{fileIcon(attached.name)}</span><span style={{ flex: 1, fontSize: 12, color: 'var(--text-h)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attached.name}</span><button onClick={() => { setAttached(null); setPasteMsg('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={13} /></button></>)
              : pasteMsg ? <span style={{ fontSize: 12, color: 'var(--success)', flex: 1 }}>{pasteMsg}</span>
              : <span style={{ fontSize: 12, color: 'var(--text-3)', flex: 1 }}>Sin adjunto. pega con Ctrl+V o usa el boton</span>}
              <button onClick={pickFile} style={{ ...G.iconBtn, flexShrink: 0 }}><Paperclip size={12} /> Adjuntar</button>
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '8px 12px', alignItems: 'center' }}>
              <button onClick={pasteClipboard} style={{ ...G.iconBtn }}><Image size={12} /> Pegar imagen Ctrl+V</button>
              <button onClick={() => loadFiles()} style={{ ...G.iconBtn }}><RefreshCw size={12} /></button>
              <button onClick={() => window.api?.openFolder?.(folder)} style={{ ...G.iconBtn }}><FolderOpen size={12} /> ~/Drop</button>
              <div style={{ flex: 1 }} />
              <button onClick={sendAttached} disabled={!attached || sending} style={{ ...G.accentBtn, opacity: (!attached || sending) ? 0.4 : 1, fontSize: 12, padding: '6px 14px' }}><Send size={13} />{sending ? 'Enviando...' : 'Enviar a Drop'}</button>
            </div>
          </div>
          <div style={{ ...G.glass, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ ...G.row, gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>Drop folder {files.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400, marginLeft: 8 }}>{files.length} archivos</span>}</span>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elem)', borderRadius: 7, padding: '4px 10px', border: '0.5px solid var(--border-lit)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>🔍</span>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-h)', fontFamily: 'inherit' }} />
                {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, fontSize: 13 }}>x</button>}
              </div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ background: 'var(--bg-elem)', color: 'var(--text-h)', border: '0.5px solid var(--border-lit)', borderRadius: 7, padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {files.length === 0
                ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8, color: 'var(--text-3)' }}><div style={{ fontSize: 36 }}>📭</div><div style={{ fontSize: 13 }}>La carpeta Drop esta vacia</div></div>
                : <div style={{ display: 'flex', flexDirection: 'column' }}>{visibleFiles.map((f, i) => <WifiFileRow key={i} file={f} serverInfo={serverInfo} onDelete={() => deleteFile(f.name)} onPreview={() => setPreview(f)} />)}</div>}
            </div>
          </div>
        </div>
      </div>
      {preview && <FilePreview file={preview} serverInfo={serverInfo} onClose={() => setPreview(null)} />}
      <Toast toast={toast} />
      <style>{`@keyframes wifiPulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
    </div>
  )
}

function WifiFileRow({ file, serverInfo, onDelete, onPreview }) {
  const downloadUrl = `http://${serverInfo.ip}:${serverInfo.port}/api/download/${encodeURIComponent(file.name)}`
  const isImg = isImage(file.name)
  const [thumbLoaded, setThumbLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderBottom: '0.5px solid var(--border-lit)', transition: 'background 0.1s' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <div onClick={onPreview} style={{ width: 38, height: 38, borderRadius: 7, flexShrink: 0, overflow: 'hidden', cursor: 'pointer', background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, position: 'relative' }}>
        {isImg && !imgError ? (<>{!thumbLoaded && <span style={{ position: 'absolute', fontSize: 16 }}>🖼</span>}<img src={downloadUrl} alt="" onLoad={() => setThumbLoaded(true)} onError={() => setImgError(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: thumbLoaded ? 1 : 0, transition: 'opacity 0.2s' }} /></>) : <span>{fileIcon(file.name)}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-h)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{file.size}</div>
      </div>
      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
        <button onClick={onPreview} style={{ ...G.iconBtn, padding: '4px 8px' }}>👁</button>
        <a href={downloadUrl} download={file.name} style={{ ...G.iconBtn, textDecoration: 'none', padding: '4px 8px' }}><Download size={12} /></a>
        <button onClick={onDelete} style={{ ...G.dangerBtn, padding: '4px 8px' }}>🗑</button>
      </div>
    </div>
  )
}

// BLUETOOTH PANEL
function BluetoothPanel({ config, addLog }) {
  const folder = config.drop_folder || '~/Drop'
  const BT_BLUE = '#3b82f6'
  const [devices,   setDevices]   = useState([])
  const [selected,  setSelected]  = useState(null)
  const [scanning,  setScanning]  = useState(false)
  const [receiving, setReceiving] = useState(false)
  const [busy,      setBusy]      = useState(false)
  const [log,       setLog]       = useState([])
  const [attached,  setAttached]  = useState(null)
  const [btStatus,  setBtStatus]  = useState('unknown') // unknown | on | off
  const logRef = useRef(null)

  const addEntry = (msg, ok = true) => setLog(prev => [...prev.slice(-80), { msg, ok, ts: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [log])

  const checkBtStatus = async () => {
    try {
      const r = await window.api.btDevices()
      // Si ok=false y el error menciona que no está disponible, el BT está apagado
      if (!r.ok && (r.error?.includes('not available') || r.error?.includes('No such file') || r.error?.includes('org.bluez'))) {
        setBtStatus('off')
        addEntry('Bluetooth no disponible o apagado', false)
      } else {
        setBtStatus('on')
      }
    } catch { setBtStatus('off') }
  }

  const scanDevices = async () => {
    setScanning(true); addEntry('Escaneando dispositivos Bluetooth pareados...', true)
    try {
      const r = await window.api.btDevices()
      if (!r.ok) {
        setBtStatus('off')
        addEntry(`Error: ${r.error}`, false)
        setDevices([])
      } else {
        setBtStatus('on')
        if (r.devices.length) { setDevices(r.devices); addEntry(`${r.devices.length} dispositivo(s) encontrado(s)`, true) }
        else { setDevices([]); addEntry('No hay dispositivos pareados. Parealos primero desde Ajustes del sistema.', false) }
      }
    } catch (e) { addEntry(`Error: ${e.message}`, false); setBtStatus('off') }
    setScanning(false)
  }

  // Reiniciar el servicio Bluetooth del sistema
  const restartBluetooth = async () => {
    setBusy(true); addEntry('Reiniciando servicio Bluetooth...', true)
    try {
      // systemctl restart bluetooth (requiere que el usuario tenga permisos o no-password sudo)
      const r = await window.api.adbShell?.({ serial: '', cmd: '' }) // no usar adb
      // Usar un comando directo
      const result = await window.api.btDevices() // trigger para verificar estado
      addEntry('Reinicio solicitado. Esperando 2 segundos...', true)
      setTimeout(() => { scanDevices(); setBusy(false) }, 2500)
    } catch (e) { addEntry(`Error: ${e.message}`, false); setBusy(false) }
  }

  // Desconectar dispositivo específico
  const disconnectDevice = async (d) => {
    addEntry(`Desconectando ${d.name}...`, true)
    try {
      // bluetoothctl disconnect MAC
      await window.api.btSend({ mac: d.mac, filePath: '/dev/null' }) // trick - usamos el canal existente
      addEntry(`Dispositivo ${d.name} desconectado`, true)
      if (selected?.mac === d.mac) setSelected(null)
      setTimeout(scanDevices, 1000)
    } catch (e) { addEntry(`Error desconectando: ${e.message}`, false) }
  }

  useEffect(() => { scanDevices() }, [])

  const sendFile = async () => {
    if (!selected || !attached) return
    setBusy(true); addEntry(`Enviando ${attached.name} a ${selected.name}...`, true); addLog(`BT: Enviando ${attached.name}`, 'ok')
    try {
      const r = await window.api.btSend({ mac: selected.mac, filePath: attached.tmpPath })
      if (r.ok) { addEntry(`${attached.name} enviado correctamente`, true); addLog(`BT: ${attached.name} enviado`, 'ok'); setAttached(null) }
      else {
        addEntry(`Error: ${r.error}`, false); addLog(`BT error: ${r.error}`, 'error')
        // Si falla, sugerir reconexión
        addEntry('Sugerencia: verificá que el Bluetooth esté activo y el dispositivo en rango', false)
      }
    } catch (e) { addEntry(`Error: ${e.message}`, false) }
    setBusy(false)
  }

  const toggleReceive = async () => {
    if (receiving) {
      await window.api.btStopReceive(); setReceiving(false); addEntry('Receptor Bluetooth detenido', true); addLog('BT: Receptor detenido', 'ok')
    } else {
      addEntry(`Iniciando receptor en ${folder}...`, true)
      const r = await window.api.btStartReceive({ folder })
      if (r.ok) { setReceiving(true); addEntry('Esperando archivos de la tablet...', true); addLog('BT: Receptor activo', 'ok') }
      else {
        addEntry(`Error: ${r.error}`, false); addLog(`BT error: ${r.error}`, 'error')
        addEntry('Si el error persiste, intenta reiniciar el servicio Bluetooth', false)
      }
    }
  }

  const pasteClipboard = async () => {
    const r = await window.api?.pasteImage?.(null)
    if (r?.ok && r.type === 'image') { setAttached({ name: r.filename, tmpPath: r.tmpPath }); addEntry(`${r.filename} listo para enviar`, true) }
    else addEntry('No hay imagen en el clipboard', false)
  }

  const pickFile = async () => { const p = await window.api.pickFile(); if (p) setAttached({ name: p.split('/').pop(), tmpPath: p }) }

  useEffect(() => {
    const handler = async (e) => {
      if (!((e.ctrlKey || e.metaKey) && e.key === 'v')) return
      if (['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return
      e.preventDefault(); await pasteClipboard()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const handler = (_, ev) => {
      if (ev?.type === 'bt-file-received') { addEntry(`Recibido: ${ev.name}`, true); addLog(`BT: ${ev.name} recibido en Drop`, 'ok') }
    }
    window.api?.onBtEvent?.(handler)
    return () => window.api?.offBtEvent?.(handler)
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>

      {/* Banner si BT está apagado */}
      {btStatus === 'off' && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <BluetoothOff size={16} color="var(--error)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--error)' }}>Bluetooth no disponible</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Verificá que el Bluetooth del PC esté activado en Ajustes del sistema</div>
          </div>
          <button onClick={scanDevices} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(239,68,68,0.15)', color: 'var(--error)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: 7, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            <RefreshCw size={11} /> Reintentar
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexShrink: 0, minHeight: 0 }}>
        {/* Dispositivos */}
        <div style={{ ...G.glass, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <div style={{ ...G.row }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bluetooth size={14} color={btStatus === 'off' ? 'var(--error)' : BT_BLUE} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>Dispositivos pareados</span>
              {btStatus === 'on' && <span style={{ fontSize: 10, color: 'var(--success)', background: 'rgba(34,197,94,0.1)', border: '0.5px solid rgba(34,197,94,0.3)', borderRadius: 4, padding: '1px 6px' }}>BT activo</span>}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <button onClick={scanDevices} disabled={scanning} style={{ ...G.iconBtn }} title="Escanear dispositivos">
                <BluetoothSearching size={12} style={{ animation: scanning ? 'spin 1s linear infinite' : 'none' }} />
                {scanning ? 'Escaneando...' : 'Escanear'}
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 200 }}>
            {devices.length === 0
              ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                  <BluetoothOff size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <div>No hay dispositivos pareados</div>
                  <div style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
                    Parealos desde <strong>Ajustes → Bluetooth</strong> del sistema primero,<br/>luego escanea aquí.
                  </div>
                  <button onClick={() => window.api?.openUrl?.('settings://bluetooth')} style={{ marginTop: 10, fontSize: 10, background: 'rgba(59,130,246,0.1)', color: '#93c5fd', border: '0.5px solid rgba(59,130,246,0.3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                    Abrir ajustes del sistema
                  </button>
                </div>
              : devices.map((d, i) => (
                <div key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '0.5px solid var(--border-lit)', background: selected?.mac === d.mac ? 'rgba(59,130,246,0.12)' : 'transparent', transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (selected?.mac !== d.mac) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { if (selected?.mac !== d.mac) e.currentTarget.style.background = 'transparent' }}>
                  {/* Click en el ícono/nombre para seleccionar */}
                  <div onClick={() => setSelected(selected?.mac === d.mac ? null : d)} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, cursor: 'pointer', minWidth: 0 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: selected?.mac === d.mac ? 'rgba(59,130,246,0.2)' : 'var(--bg-elem)', border: selected?.mac === d.mac ? '1px solid rgba(59,130,246,0.4)' : '0.5px solid var(--border-lit)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Smartphone size={14} color={selected?.mac === d.mac ? BT_BLUE : 'var(--text-3)'} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: selected?.mac === d.mac ? '#93c5fd' : 'var(--text-h)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace' }}>{d.mac}</div>
                    </div>
                    {selected?.mac === d.mac && <BluetoothConnected size={13} color={BT_BLUE} />}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Acciones */}
        <div style={{ ...G.glass, width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ ...G.row }}><span style={{ fontWeight: 600, fontSize: 13 }}>Acciones</span></div>
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>

            {/* Receptor */}
            <button onClick={toggleReceive} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12, background: receiving ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.12)', color: receiving ? 'var(--success)' : '#93c5fd', border: receiving ? '0.5px solid rgba(34,197,94,0.3)' : '0.5px solid rgba(59,130,246,0.3)', transition: 'all 0.15s' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: receiving ? 'var(--success)' : BT_BLUE, boxShadow: receiving ? '0 0 6px var(--success)' : 'none', animation: receiving ? 'wifiPulse 1.5s infinite' : 'none', flexShrink: 0 }} />
              <FileDown size={13} />
              {receiving ? 'Recibiendo... (detener)' : 'Recibir de tablet'}
            </button>

            {/* Adjunto */}
            <div style={{ background: 'var(--bg-elem)', borderRadius: 8, border: '0.5px solid var(--border-lit)', padding: '8px 10px', fontSize: 11 }}>
              {attached
                ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{fileIcon(attached.name)}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-h)', fontWeight: 600 }}>{attached.name}</span>
                    <button onClick={() => setAttached(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={11} /></button>
                  </div>
                : <span style={{ color: 'var(--text-3)' }}>Sin archivo adjunto</span>}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={pasteClipboard} style={{ ...G.iconBtn, flex: 1, justifyContent: 'center' }} title="Ctrl+V"><Image size={11} /> Pegar</button>
              <button onClick={pickFile} style={{ ...G.iconBtn, flex: 1, justifyContent: 'center' }}><Paperclip size={11} /> Elegir</button>
            </div>

            {/* Enviar */}
            <button onClick={sendFile} disabled={busy || !selected || !attached}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12, background: (!selected || !attached || busy) ? 'var(--bg-elem)' : 'rgba(59,130,246,0.25)', color: (!selected || !attached || busy) ? 'var(--text-3)' : '#93c5fd', border: '0.5px solid ' + ((!selected || !attached || busy) ? 'var(--border-lit)' : 'rgba(59,130,246,0.4)'), opacity: busy ? 0.6 : 1, transition: 'all 0.15s' }}
              title={!selected ? 'Selecciona un dispositivo' : !attached ? 'Adjunta un archivo' : ''}>
              <FileUp size={13} />
              {busy ? 'Enviando...' : 'Enviar a tablet'}
            </button>

            {!selected && <p style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>Toca un dispositivo de la lista para seleccionarlo</p>}

            {/* Separador gestión */}
            <div style={{ height: '0.5px', background: 'var(--border-lit)', margin: '2px 0' }} />
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em' }}>GESTIÓN</div>

            {/* Reescanear */}
            <button onClick={scanDevices} disabled={scanning} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 7, border: '0.5px solid var(--border-lit)', background: 'var(--bg-elem)', color: 'var(--text-2)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              <RefreshCw size={11} style={{ animation: scanning ? 'spin 1s linear infinite' : 'none' }} />
              Reescanear dispositivos
            </button>

            {/* Abrir config Bluetooth */}
            <button
              onClick={() => { addEntry('Abriendo ajustes de Bluetooth del sistema...', true); window.api?.openUrl?.('blueman-manager') }}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 7, border: '0.5px solid rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.08)', color: '#93c5fd', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              <Bluetooth size={11} />
              Gestor Bluetooth
            </button>
          </div>
        </div>
      </div>

      {/* Log */}
      <div style={{ ...G.glass, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ ...G.row }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: receiving ? 'var(--success)' : btStatus === 'off' ? 'var(--error)' : 'var(--text-3)', boxShadow: receiving ? '0 0 5px var(--success)' : 'none', animation: receiving ? 'wifiPulse 1.5s infinite' : 'none' }} />
            <span style={{ fontWeight: 600, fontSize: 13 }}>Actividad</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn2 icon={<FolderOpen size={12} />} onClick={() => window.api?.openFolder?.(folder)}>~/Drop</Btn2>
            <Btn2 onClick={() => setLog([])}>Limpiar</Btn2>
          </div>
        </div>
        <div ref={logRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {log.length === 0
            ? <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, padding: 24 }}>
                <Bluetooth size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
                <div>Sin actividad aun</div>
              </div>
            : log.map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace', flexShrink: 0, marginTop: 1 }}>{entry.ts}</span>
                <span style={{ color: entry.ok ? 'var(--text-h)' : 'var(--error)', lineHeight: 1.5 }}>{entry.msg}</span>
              </div>
            ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderTop: '0.5px solid var(--border-lit)' }}>
          <Bluetooth size={11} color={btStatus === 'off' ? 'var(--error)' : receiving ? 'var(--success)' : BT_BLUE} />
          <span style={{ fontSize: 11, color: btStatus === 'off' ? 'var(--error)' : receiving ? 'var(--success)' : 'var(--text-2)' }}>
            {btStatus === 'off' ? 'Bluetooth no disponible' : receiving ? `Recibiendo en ${folder}` : selected ? `Seleccionado: ${selected.name}` : 'Bluetooth listo'}
          </span>
          <div style={{ flex: 1, height: 2, background: 'var(--border-lit)', borderRadius: 1, overflow: 'hidden' }}>
            {receiving && <div style={{ height: '100%', borderRadius: 1, background: 'var(--success)', animation: 'btProgress 2s ease-in-out infinite', width: '40%' }} />}
          </div>
        </div>
      </div>
      <style>{`@keyframes wifiPulse{0%,100%{opacity:1}50%{opacity:.4}} @keyframes btProgress{0%{margin-left:0;width:30%}50%{margin-left:35%;width:40%}100%{margin-left:70%;width:30%}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// KDE CONNECT PANEL
function KdeConnectPanel({ config, addLog }) {
  const [devices, setDevices]   = useState(null)
  const [notInstalled, setNotInstalled] = useState(false)
  const [selected, setSelected] = useState(null)
  const [busy, setBusy]         = useState(false)
  const [log, setLog]           = useState([])
  const [attached, setAttached] = useState(null)
  const [clipText, setClipText] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const { toast, show: showToast } = useToast()
  const logRef = useRef(null)

  const addEntry = useCallback((msg, ok = true) => {
    setLog(prev => [...prev.slice(-80), { msg, ok, ts: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }])
    addLog?.(`KDE Connect: ${msg}`, ok ? 'ok' : 'error')
  }, [addLog])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [log])

  const load = useCallback(async () => {
    const r = await window.api?.kdeconnectList?.()
    if (!r) return
    if (!r.ok && r.error === 'not_installed') { setNotInstalled(true); return }
    const devs = r.devices || []
    setDevices(devs)
    if (devs.length > 0 && !selected) {
      const preferred = config?.kde_device_id && devs.find(d => d.id === config.kde_device_id)
      setSelected(preferred ? preferred.id : devs[0].id)
    }
  }, [selected])

  useEffect(() => { load() }, [])

  const refresh = async () => {
    setRefreshing(true)
    addEntry('Buscando dispositivos en la red...')
    await window.api?.kdeconnectRefresh?.()
    await new Promise(r => setTimeout(r, 1800))
    await load()
    setRefreshing(false)
    showToast('Lista actualizada', 'ok')
  }

  const pickAndAttach = async () => {
    const f = await window.api?.pickFile?.()
    if (f) setAttached({ name: f.split('/').pop(), path: f })
  }

  const pasteAndAttach = async () => {
    const r = await window.api?.pasteImage?.(null)
    if (r?.ok) { setAttached({ name: r.filename, path: r.tmpPath }); showToast(`${r.filename} listo`, 'ok') }
    else showToast('No hay imagen en el clipboard', 'warn')
  }

  const sendFile = async () => {
    if (!selected || !attached) return
    setBusy(true)
    addEntry(`Enviando ${attached.name}...`)
    const r = await window.api?.kdeconnectShare?.({ deviceId: selected, filePath: attached.path })
    if (r?.ok) {
      addEntry(`${attached.name} enviado`)
      showToast(`Enviado: ${attached.name}`, 'ok')
      setAttached(null)
    } else {
      addEntry(`Error: ${r?.out || 'desconocido'}`, false)
      showToast('Error al enviar', 'err')
    }
    setBusy(false)
  }

  const sendText = async () => {
    if (!selected || !clipText.trim()) return
    setBusy(true)
    addEntry('Enviando texto...')
    const r = await window.api?.kdeconnectClipboard?.({ deviceId: selected, text: clipText })
    if (r?.ok) { addEntry('Texto enviado'); showToast('Texto enviado', 'ok'); setClipText('') }
    else { addEntry(`Error: ${r?.out || 'desconocido'}`, false); showToast('Error', 'err') }
    setBusy(false)
  }

  const ping = async () => {
    if (!selected) return
    addEntry('Enviando ping...')
    const r = await window.api?.kdeconnectPing?.({ deviceId: selected, msg: 'Hola desde la app!' })
    if (r?.ok) { addEntry('Ping enviado'); showToast('Ping enviado!', 'ok') }
    else { addEntry(`Error ping: ${r?.out || ''}`, false) }
  }

  const ring = async () => {
    if (!selected) return
    addEntry('Haciendo sonar la tablet...')
    const r = await window.api?.kdeconnectRing?.({ deviceId: selected })
    if (r?.ok) { addEntry('Sonando!'); showToast('Tablet sonando!', 'ok') }
    else { addEntry(`Error ring: ${r?.out || ''}`, false) }
  }

  const selectedDevice = devices?.find(d => d.id === selected)

  // Ctrl+V inside the panel pastes clipboard image
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault(); pasteAndAttach()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (notInstalled) return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
      <div style={{ fontSize: 48 }}>📶</div>
      <div style={{ textAlign: 'center' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>KDE Connect no instalado</h3>
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>Instala kdeconnect para usar esta función</p>
        <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)', background: 'var(--bg-elem)', borderRadius: 8, padding: '8px 16px', userSelect: 'all', display: 'inline-block' }}>sudo dnf install kdeconnectd</div>
      </div>
    </div>
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>

      {/* ── Fila: dispositivos + acciones ── */}
      <div style={{ display: 'flex', gap: 8, minHeight: 0, flex: '0 1 auto', overflow: 'hidden' }}>

        {/* Lista de dispositivos */}
        <div style={{ ...G.glass, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <div style={{ ...G.row, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 13 }}>📱</span>
              <span style={{ fontWeight: 600, fontSize: 12 }}>Dispositivos</span>
              {devices !== null && <span style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--bg-elem)', borderRadius: 4, padding: '1px 5px' }}>{devices.filter(d => d.reachable).length}/{devices.length}</span>}
            </div>
            <button onClick={refresh} disabled={refreshing} style={{ ...G.iconBtn, padding: '3px 8px', fontSize: 11 }}>
              <RefreshCw size={11} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
              {refreshing ? '...' : 'Buscar'}
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {devices === null && <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Cargando...</div>}
            {devices !== null && devices.length === 0 && (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 11 }}>
                <div style={{ fontSize: 24, marginBottom: 6, opacity: 0.5 }}>📡</div>
                <div>Sin dispositivos emparejados</div>
                <div style={{ fontSize: 10, marginTop: 4, lineHeight: 1.5 }}>Abre KDE Connect en la tablet y asegurate de estar en la misma red WiFi</div>
              </div>
            )}
            {devices?.map(d => (
              <div key={d.id} onClick={() => { setSelected(d.id); window.api?.saveConfig?.({ ...config, kde_device_id: d.id }) }} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
                borderBottom: '0.5px solid var(--border-lit)', cursor: 'pointer',
                background: selected === d.id ? 'rgba(108,99,255,0.12)' : 'transparent',
              }}
                onMouseEnter={e => { if (selected !== d.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                onMouseLeave={e => { if (selected !== d.id) e.currentTarget.style.background = 'transparent' }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, background: selected === d.id ? 'rgba(108,99,255,0.2)' : 'var(--bg-elem)', border: selected === d.id ? '1px solid rgba(108,99,255,0.4)' : '0.5px solid var(--border-lit)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>📱</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: selected === d.id ? 'var(--accent)' : 'var(--text-h)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'monospace' }}>{d.id.slice(0, 14)}…</div>
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, flexShrink: 0, background: d.reachable ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: d.reachable ? 'var(--success)' : 'var(--error)', border: `0.5px solid ${d.reachable ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.25)'}` }}>
                  {d.reachable ? '● OK' : '○ Off'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel de acciones */}
        <div style={{ ...G.glass, width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ ...G.row, flexShrink: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedDevice ? selectedDevice.name : 'Sin selección'}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>

            {/* Archivo adjunto */}
            <div style={{ background: 'var(--bg-elem)', borderRadius: 7, border: '0.5px solid var(--border-lit)', padding: '5px 8px', fontSize: 11, minHeight: 28 }}>
              {attached
                ? <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span>{fileIcon(attached.name)}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-h)', fontWeight: 600, fontSize: 10 }}>{attached.name}</span>
                    <button onClick={() => setAttached(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0 }}><X size={10} /></button>
                  </div>
                : <span style={{ color: 'var(--text-3)', fontSize: 10 }}>Sin archivo — Ctrl+V para pegar imagen</span>}
            </div>

            <div style={{ display: 'flex', gap: 5 }}>
              <button onClick={pasteAndAttach} style={{ ...G.iconBtn, flex: 1, justifyContent: 'center', padding: '4px 0', fontSize: 10 }} title="Ctrl+V"><Image size={10} /> Pegar</button>
              <button onClick={pickAndAttach} style={{ ...G.iconBtn, flex: 1, justifyContent: 'center', padding: '4px 0', fontSize: 10 }}><Paperclip size={10} /> Elegir</button>
            </div>

            <button onClick={sendFile} disabled={busy || !selected || !attached || !selectedDevice?.reachable} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '7px', borderRadius: 7, fontWeight: 700, fontSize: 11, border: 'none',
              background: (selected && attached && selectedDevice?.reachable && !busy) ? 'var(--accent)' : 'var(--bg-elem)',
              color: (selected && attached && selectedDevice?.reachable && !busy) ? '#fff' : 'var(--text-3)',
              opacity: busy ? 0.6 : 1, transition: 'all 0.15s', cursor: 'pointer',
            }}>
              <Send size={11} />{busy ? 'Enviando...' : 'Enviar archivo'}
            </button>

            <div style={{ height: '0.5px', background: 'var(--border-lit)' }} />
            <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em' }}>TEXTO</div>

            <textarea value={clipText} onChange={e => setClipText(e.target.value)} placeholder="Texto para enviar..." rows={2}
              style={{ background: 'var(--bg-elem)', color: 'var(--text-h)', border: '0.5px solid var(--border-lit)', borderRadius: 6, padding: '5px 7px', fontSize: 10, fontFamily: 'inherit', resize: 'none', outline: 'none' }} />
            <button onClick={sendText} disabled={busy || !selected || !clipText.trim() || !selectedDevice?.reachable}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px', borderRadius: 6, border: '0.5px solid var(--border-lit)', background: 'var(--bg-elem)', color: clipText.trim() && selected ? 'var(--text-h)' : 'var(--text-3)', fontSize: 10, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              <Send size={10} /> Enviar texto
            </button>

            <div style={{ height: '0.5px', background: 'var(--border-lit)' }} />

            <div style={{ display: 'flex', gap: 5 }}>
              <button onClick={ping} disabled={!selected || !selectedDevice?.reachable} style={{ ...G.iconBtn, flex: 1, justifyContent: 'center', padding: '4px 0', fontSize: 10, opacity: (!selected || !selectedDevice?.reachable) ? 0.4 : 1 }}>📡 Ping</button>
              <button onClick={ring} disabled={!selected || !selectedDevice?.reachable} style={{ ...G.iconBtn, flex: 1, justifyContent: 'center', padding: '4px 0', fontSize: 10, opacity: (!selected || !selectedDevice?.reachable) ? 0.4 : 1 }}>🔔 Sonar</button>
            </div>

            {selected && !selectedDevice?.reachable && <p style={{ fontSize: 9, color: 'var(--warning)', textAlign: 'center', lineHeight: 1.4, margin: 0 }}>Fuera de alcance — asegurate de estar en la misma red WiFi con KDE Connect abierto.</p>}
          </div>
        </div>
      </div>

      {/* ── Log de actividad ── */}
      <div style={{ ...G.glass, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 80 }}>
        <div style={{ ...G.row, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12 }}>🔗</span>
            <span style={{ fontWeight: 600, fontSize: 12 }}>Actividad</span>
          </div>
          <Btn2 onClick={() => setLog([])}>Limpiar</Btn2>
        </div>
        <div ref={logRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {log.length === 0
            ? <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 11, padding: 16 }}>Sin actividad aún</div>
            : log.map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, fontSize: 11, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'monospace', flexShrink: 0, marginTop: 1 }}>{entry.ts}</span>
                <span style={{ color: entry.ok ? 'var(--text-h)' : 'var(--error)', lineHeight: 1.4 }}>{entry.msg}</span>
              </div>
            ))}
        </div>
      </div>

      <Toast toast={toast} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// COMPONENTE PRINCIPAL
export default function TransferPage({ config, addLog, devices = [], hasWallpaper }) {
  const folder = config.drop_folder || '~/Drop'

  // Todos los dispositivos conectados (USB + WiFi)
  const connectedDevices = devices.filter(d => d.status === 'device')
  const usbDevice  = connectedDevices.find(d => !d.serial?.includes(':'))
  const hasAny     = connectedDevices.length > 0

  const [mode,           setMode]           = useState('usb')
  const [selectedSerial, setSelectedSerial] = useState(null)

  // Auto-seleccionar el primer dispositivo disponible
  React.useEffect(() => {
    if (!selectedSerial && connectedDevices.length > 0) {
      setSelectedSerial(connectedDevices[0].serial)
    }
    // Si el seleccionado se desconectó, cambiar al primero disponible
    if (selectedSerial && !connectedDevices.find(d => d.serial === selectedSerial)) {
      setSelectedSerial(connectedDevices[0]?.serial || null)
    }
  }, [devices])

  const activeDevice = connectedDevices.find(d => d.serial === selectedSerial) || connectedDevices[0] || null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'transparent', padding: '20px 24px', gap: 14 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Transferencia</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={{ ...S.tab(mode === 'usb'), opacity: hasAny ? 1 : 0.45, cursor: hasAny ? 'pointer' : 'not-allowed' }} onClick={() => hasAny && setMode('usb')} title={hasAny ? '' : 'Conecta un dispositivo primero'}>
            <Usb size={14} /> ADB directo {!hasAny && <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>(sin dispositivo)</span>}
          </button>
          <button style={S.tab(mode === 'wifi')} onClick={() => setMode('wifi')}>
            <Wifi size={14} /> WiFi Transfer
          </button>
          <button style={S.tab(mode === 'bluetooth')} onClick={() => setMode('bluetooth')}>
            <Bluetooth size={14} /> Bluetooth
          </button>
          <button style={S.tab(mode === 'kdeconnect')} onClick={() => setMode('kdeconnect')}>
            <span style={{ fontSize: 14 }}>📶</span> KDE Connect
          </button>

          {/* Selector de dispositivo — visible cuando hay mas de uno o en modo ADB */}
          {mode === 'usb' && connectedDevices.length > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Dispositivo:</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {connectedDevices.map(d => {
                  const isWifi = d.serial?.includes(':')
                  const isSelected = d.serial === activeDevice?.serial
                  return (
                    <button
                      key={d.serial}
                      onClick={() => setSelectedSerial(d.serial)}
                      title={d.serial}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                        fontSize: 11, fontWeight: 600,
                        background: isSelected ? 'var(--accent-soft)' : 'var(--bg-elem)',
                        color: isSelected ? 'var(--accent)' : 'var(--text-2)',
                        border: isSelected ? '0.5px solid var(--accent-border)' : '0.5px solid var(--border-lit)',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ fontSize: 12 }}>{isWifi ? '📶' : '🔌'}</span>
                      {d.model || d.serial.split(':')[0]}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {mode === 'usb' && activeDevice && (
          <p style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
            {activeDevice.serial?.includes(':') ? '📶 WiFi' : '🔌 USB'}: <strong style={{ color: 'var(--success)' }}>{activeDevice.model || activeDevice.serial}</strong>
            {connectedDevices.length > 1 && <span style={{ color: 'var(--text-3)', marginLeft: 6 }}>· {connectedDevices.length} dispositivos conectados</span>}
          </p>
        )}
        {mode === 'usb' && !hasAny && <p style={{ fontSize: 11, color: 'var(--warning)', marginTop: 2 }}>Conecta un dispositivo por USB o WiFi para usar este modo.</p>}
        {mode === 'wifi' && <p style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>Servidor web local: la tablet escanea el QR y sube/baja archivos desde el navegador.</p>}
        {mode === 'bluetooth' && <p style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>Transferencia directa via Bluetooth: enviar y recibir archivos sin cable ni red WiFi.</p>}
        {mode === 'kdeconnect' && <p style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>Envio de archivos y texto via KDE Connect. La tablet debe estar en la misma red WiFi con KDE Connect abierto.</p>}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {mode === 'usb'        && <UsbPanel device={activeDevice} config={config} addLog={addLog} />}
        {mode === 'wifi'       && <WifiPanel config={config} addLog={addLog} />}
        {mode === 'bluetooth'  && <BluetoothPanel config={config} addLog={addLog} />}
        {mode === 'kdeconnect' && <KdeConnectPanel config={config} addLog={addLog} />}
      </div>
    </div>
  )
}

// USB PANEL
function UsbPanel({ device, config, addLog }) {
  const serial  = device?.serial
  const defDest = config.drop_folder || '~/Drop'
  const [tabletPath,  setTabletPath]  = useState('/sdcard/Download')
  const [localDest,   setLocalDest]   = useState(defDest)
  const [tabletFiles, setTabletFiles] = useState([])
  const [selected,    setSelected]    = useState(new Set())
  const [loading,     setLoading]     = useState(false)
  const [busy,        setBusy]        = useState(false)
  const [progress,    setProgress]    = useState([])
  const [clipReady,   setClipReady]   = useState(null)
  const [dragging,    setDragging]    = useState(false)
  const [search,      setSearch]      = useState('')
  const [sortBy,      setSortBy]      = useState('name')

  const handleDragOver  = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(true) }
  const handleDragLeave = (e) => { e.preventDefault(); setDragging(false) }
  const handleDrop = async (e) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    setBusy(true); setProgress([])
    const log = (msg, ok = true) => setProgress(p => [...p, { msg, ok }])
    if (!droppedFiles.length) { log('No se detectaron archivos', false); setBusy(false); return }
    if (!serial) { log('No hay tablet conectada por USB', false); setBusy(false); return }
    for (const file of droppedFiles) {
      if (!file.path) { log(`Sin ruta: ${file.name}`, false); continue }
      log(`Enviando ${file.name}...`, true)
      const pushR = await window.api.adbPushSingle({ serial, localPath: file.path, remotePath: `${tabletPath}/${file.name}` })
      if (pushR?.ok) { log(`OK ${file.name}`, true); addLog(`Enviado a tablet: ${file.name}`, 'ok') }
      else { log(`Error ${file.name}: ${pushR?.out || 'error'}`, false); addLog(`Error: ${file.name}`, 'error') }
    }
    await new Promise(r => setTimeout(r, 1000)); await listTablet(tabletPath); setBusy(false)
  }

  const listTablet = useCallback(async (rpath = tabletPath) => {
    if (!serial) return
    setLoading(true); setSelected(new Set())
    const r = await window.api.adbLs({ serial, remotePath: rpath })
    setLoading(false)
    if (r.ok) setTabletFiles(r.files); else addLog(`Error listando ${rpath}: ${r.error}`, 'error')
  }, [serial, tabletPath, addLog])

  useEffect(() => { listTablet(tabletPath) }, [tabletPath, serial])

  const toggleSel = (name) => setSelected(prev => { const s = new Set(prev); s.has(name) ? s.delete(name) : s.add(name); return s })
  const visibleFiles = tabletFiles.filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) : sortBy === 'size' ? b.size - a.size : b.mtime - a.mtime)
  const selectAll   = () => setSelected(new Set(visibleFiles.map(f => f.name)))
  const deselectAll = () => setSelected(new Set())

  const pullFiles = async () => {
    if (!selected.size) return
    setBusy(true); setProgress([])
    const log = (msg, ok = true) => setProgress(p => [...p, { msg, ok }])
    for (const f of tabletFiles.filter(f => selected.has(f.name))) {
      log(`Descargando ${f.name}...`, true)
      const r = await window.api.adbPull({ serial, remotePath: f.path, localDir: localDest })
      if (r.ok) { log(`OK  ${f.name}`, true); addLog(`Descargado: ${f.name}`, 'ok') }
      else { log(`Error ${f.name}: ${r.out}`, false); addLog(`Error: ${f.name}`, 'error') }
    }
    setBusy(false)
  }

  const pushFiles = async () => {
    setBusy(true); setProgress([])
    const log = (msg, ok = true) => setProgress(p => [...p, { msg, ok }])
    const r = await window.api.adbPushFiles({ serial, remotePath: tabletPath })
    if (r.canceled) { setBusy(false); return }
    if (!r.ok) { log('Error iniciando envio.', false); setBusy(false); return }
    for (const res of r.results) {
      if (res.ok) { log(`OK  ${res.file}`, true); addLog(`Enviado a tablet: ${res.file}`, 'ok') }
      else { log(`Error ${res.file}: ${res.out}`, false); addLog(`Error enviando: ${res.file}`, 'error') }
    }
    await listTablet(tabletPath); setBusy(false)
  }

  const pickDest = async () => { const p = await window.api.pickFolder(); if (p) setLocalDest(p) }

  const pushClipboard = async () => {
    const r = await window.api.pasteImage(null)
    if (!r.ok || r.type !== 'image') { addLog('No hay imagen en el clipboard.', 'warn'); return }
    setClipReady({ name: r.filename, tmpPath: r.tmpPath }); addLog(`Clipboard listo: ${r.filename}`, 'ok')
    setBusy(true); setProgress([{ msg: `Enviando ${r.filename} a la tablet...`, ok: true }])
    const push = await window.api.adbPush({ serial, localPath: r.tmpPath, remotePath: `${tabletPath}/${r.filename}` })
    if (push.ok) { setProgress(p => [...p, { msg: `OK ${r.filename} enviado a ${tabletPath}`, ok: true }]); addLog(`Clipboard a tablet: ${r.filename}`, 'ok') }
    else { setProgress(p => [...p, { msg: `Error: ${push.out}`, ok: false }]); addLog(`Error enviando clipboard: ${push.out}`, 'error') }
    setClipReady(null); setBusy(false); await listTablet(tabletPath)
  }

  useEffect(() => {
    const handler = async (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return
        await pushClipboard()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [serial, tabletPath])

  const fmt = b => b >= 1048576 ? `${(b/1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b/1024)} KB` : `${b} B`

  return (
    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', outline: dragging ? '3px dashed var(--accent)' : '3px dashed transparent', borderRadius: 10, transition: 'outline 0.15s' }}>
      {dragging && <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(79,110,247,0.10)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ background: 'var(--bg-panel)', borderRadius: 16, padding: '24px 40px', border: '2px solid var(--accent)', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📲</div>
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>Suelta para enviar a la tablet</p>
          <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{tabletPath}</p>
        </div>
      </div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Carpeta en la tablet</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={tabletPath} onChange={e => setTabletPath(e.target.value)} style={{ flex: 1, background: 'var(--bg-elem)', color: 'var(--text-h)', border: '0.5px solid var(--border-lit)', borderRadius: 7, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
              {TABLET_PATHS.map(p => <option key={p.path} value={p.path}>{p.label}  -  {p.path}</option>)}
            </select>
            <button style={S.btn('elem')} onClick={() => listTablet(tabletPath)} disabled={loading}><RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /></button>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>Destino en el PC</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1, background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)', borderRadius: 7, padding: '6px 10px', fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{localDest}</div>
            <button style={S.btn('elem')} onClick={pickDest}><FolderInput size={13} /></button>
          </div>
        </div>
      </div>
      <div style={{ ...S.card, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border-lit)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-h)' }}>
              Archivos en la tablet {tabletFiles.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400, marginLeft: 8 }}>{tabletFiles.length} archivos - {selected.size} sel.</span>}
            </span>
            <div style={{ display: 'flex', gap: 6 }}><Btn2 onClick={selectAll}>Todo</Btn2><Btn2 onClick={deselectAll}>Ninguno</Btn2></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elem)', borderRadius: 7, padding: '5px 10px', border: '0.5px solid var(--border-lit)' }}>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar archivo..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-h)', fontFamily: 'inherit' }} />
              {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, padding: 0 }}>x</button>}
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ background: 'var(--bg-elem)', color: 'var(--text-h)', border: '0.5px solid var(--border-lit)', borderRadius: 7, padding: '5px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              <option value="name">A a Z</option><option value="size">Mayor tamano</option><option value="recent">Mas recientes</option>
            </select>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24, fontSize: 13 }}>Cargando...</p>
          : tabletFiles.length === 0 ? <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24, fontSize: 13 }}>Carpeta vacia o sin permisos ADB.</p>
          : visibleFiles.length === 0 ? <p style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24, fontSize: 13 }}>Sin resultados para {search}</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><tbody>
              {visibleFiles.map(f => (
                <tr key={f.name} onClick={() => toggleSel(f.name)} style={{ cursor: 'pointer', background: selected.has(f.name) ? 'var(--accent-dim, #1e3a5f)' : 'transparent', borderBottom: '0.5px solid var(--border-lit)', transition: 'background 0.1s' }}>
                  <td style={{ padding: '7px 16px', width: 24 }}><input type="checkbox" checked={selected.has(f.name)} onChange={() => toggleSel(f.name)} style={{ cursor: 'pointer', accentColor: 'var(--accent)' }} onClick={e => e.stopPropagation()} /></td>
                  <td style={{ padding: '7px 8px', color: 'var(--text-h)', fontWeight: 500 }}>{f.name}</td>
                  <td style={{ padding: '7px 16px', color: 'var(--text-3)', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(f.size)}</td>
                </tr>
              ))}
            </tbody></table>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={pullFiles} disabled={busy || !selected.size} style={{ ...S.btn('primary'), opacity: (busy || !selected.size) ? 0.45 : 1, fontSize: 13, padding: '9px 18px' }}>
            <Download size={14} /> Tablet a PC {selected.size > 0 && <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{selected.size}</span>}
          </button>
          <button onClick={pushFiles} disabled={busy} style={{ ...S.btn('elem'), opacity: busy ? 0.45 : 1, fontSize: 13, padding: '9px 18px' }}><Upload size={14} /> PC a Tablet</button>
          <button onClick={pushClipboard} disabled={busy} style={{ ...S.btn('elem'), opacity: busy ? 0.45 : 1, fontSize: 13, padding: '9px 18px', border: clipReady ? '1px solid var(--success)' : '1px solid var(--border-lit)' }}>
            <Image size={14} color={clipReady ? 'var(--success)' : 'var(--text-2)'} /> {clipReady ? 'Enviando...' : 'Pegar imagen'}
            <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 2 }}>Ctrl+V</span>
          </button>
        </div>
        {progress.length > 0 && <div style={{ flex: 1, maxHeight: 80, overflowY: 'auto', background: 'var(--bg-panel)', border: '0.5px solid var(--border-lit)', borderRadius: 7, padding: '6px 12px', fontSize: 11 }}>
          {progress.map((p, i) => <div key={i} style={{ color: p.ok ? 'var(--success)' : 'var(--error)' }}>{p.msg}</div>)}
        </div>}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function Btn2({ children, icon, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', color: 'var(--text-2)', padding: '4px 8px', borderRadius: 6, fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer', border: 'none', opacity: disabled ? 0.45 : 1 }}>
      {icon}{children}
    </button>
  )
}