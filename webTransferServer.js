/**
 * webTransferServer.js
 * Servidor HTTP + WebSocket para transferencia de archivos por red local.
 * Inspirado en KDE Connect: la tablet abre http://<IP_PC>:7891 en su navegador
 * y puede enviar/recibir archivos sin USB.
 *
 * Endpoints:
 *   GET  /             → UI web embebida (HTML todo-en-uno)
 *   GET  /api/info     → { name, folder, version }
 *   GET  /api/files    → lista archivos en la Drop folder
 *   POST /api/upload   → multipart/form-data, guarda en Drop folder
 *   GET  /api/download/:filename → descarga un archivo
 *   DELETE /api/file/:filename   → elimina un archivo
 *   WS   /             → notificaciones en tiempo real (nuevo archivo, etc.)
 */

'use strict'

const http       = require('http')
const fs         = require('fs')
const fsp        = require('fs').promises
const path       = require('path')
const os         = require('os')
const { WebSocketServer } = require('ws')

// ─── Utilidades ───────────────────────────────────────────────────────────────

function getLocalIP () {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '127.0.0.1'
}

function mime (filename) {
  const ext = path.extname(filename).toLowerCase()
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif',  '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',  '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.txt': 'text/plain', '.md': 'text/markdown',
    '.json': 'application/json',
    '.apk': 'application/vnd.android.package-archive',
  }
  return map[ext] || 'application/octet-stream'
}

function humanSize (bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(2) + ' GB'
}

/** Parsea multipart/form-data de forma básica (sin dependencias externas) */
function parseMultipart (req) {
  return new Promise((resolve, reject) => {
    const ct = req.headers['content-type'] || ''
    const boundaryMatch = ct.match(/boundary=(.+)/)
    if (!boundaryMatch) return reject(new Error('No boundary'))
    const boundary = '--' + boundaryMatch[1]

    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const buf = Buffer.concat(chunks)
      const files = []

      const parts = buf.toString('binary').split(boundary)
      for (const part of parts) {
        if (!part.includes('Content-Disposition')) continue
        const headerEnd = part.indexOf('\r\n\r\n')
        if (headerEnd === -1) continue
        const header = part.slice(0, headerEnd)
        const nameMatch    = header.match(/name="([^"]+)"/)
        const fileMatch    = header.match(/filename="([^"]+)"/)
        if (!fileMatch) continue

        // Extraer bytes del archivo (slice binario)
        const start = headerEnd + 4          // skip \r\n\r\n
        const end   = part.lastIndexOf('\r\n') // trailing \r\n antes del boundary
        const bodyStr = part.slice(start, end)
        const bodyBuf = Buffer.from(bodyStr, 'binary')

        files.push({
          fieldname: nameMatch ? nameMatch[1] : 'file',
          filename:  path.basename(fileMatch[1]),
          data:      bodyBuf,
          mimetype:  mime(fileMatch[1]),
        })
      }
      resolve(files)
    })
    req.on('error', reject)
  })
}

// ─── HTML de la UI web (se sirve a la tablet) ─────────────────────────────────
// Todo en una sola cadena para no depender de archivos estáticos.
function buildUI (info) {
  return /* html */`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
<title>Sync Tablet · Transferencia WiFi</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
  :root{
    --bg:#0f121c; --bg2:#181c2a; --bg3:#1e2336;
    --accent:#6c63ff; --accent2:#a78bfa;
    --text:#e8eaf6; --text2:#9095b8; --text3:#5a6080;
    --ok:#22c55e; --err:#ef4444; --warn:#f59e0b;
    --radius:14px; --radius-sm:8px;
  }
  body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,sans-serif;
    min-height:100dvh;display:flex;flex-direction:column;overflow-x:hidden}

  /* ── Header ── */
  header{background:var(--bg2);padding:16px 20px;display:flex;align-items:center;
    gap:12px;border-bottom:1px solid #ffffff10;position:sticky;top:0;z-index:10}
  header .logo{width:32px;height:32px;border-radius:8px;
    background:linear-gradient(135deg,var(--accent),var(--accent2));
    display:flex;align-items:center;justify-content:center;font-size:18px}
  header h1{font-size:17px;font-weight:700;letter-spacing:-.3px}
  header .sub{font-size:12px;color:var(--text2)}
  .status-dot{width:8px;height:8px;border-radius:50%;background:var(--ok);
    margin-left:auto;box-shadow:0 0 6px var(--ok);animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}

  /* ── Tabs ── */
  .tabs{display:flex;gap:6px;padding:16px 16px 0;overflow-x:auto;scrollbar-width:none}
  .tabs::-webkit-scrollbar{display:none}
  .tab{padding:9px 18px;border-radius:50px;border:none;cursor:pointer;
    font-size:13px;font-weight:600;transition:.15s;white-space:nowrap}
  .tab.active{background:var(--accent);color:#fff}
  .tab:not(.active){background:var(--bg3);color:var(--text2)}

  /* ── Main ── */
  main{flex:1;padding:16px;display:flex;flex-direction:column;gap:16px;max-width:600px;margin:0 auto;width:100%}

  /* ── Drop zone ── */
  .dropzone{border:2px dashed #ffffff20;border-radius:var(--radius);
    padding:40px 24px;text-align:center;cursor:pointer;transition:.2s;
    background:var(--bg2)}
  .dropzone.over,.dropzone:hover{border-color:var(--accent);background:#6c63ff12}
  .dropzone .icon{font-size:40px;margin-bottom:12px}
  .dropzone p{font-size:14px;color:var(--text2)}
  .dropzone p strong{color:var(--text)}
  #file-input{display:none}

  /* ── Progreso ── */
  .progress-bar{height:4px;border-radius:2px;background:#ffffff15;overflow:hidden;margin-top:8px}
  .progress-fill{height:100%;border-radius:2px;background:var(--accent);width:0%;transition:width .2s}

  /* ── Lista de archivos ── */
  .files-header{display:flex;align-items:center;justify-content:space-between}
  .files-header h2{font-size:14px;font-weight:700}
  .btn-sm{padding:6px 14px;border-radius:var(--radius-sm);border:none;
    cursor:pointer;font-size:12px;font-weight:600;transition:.15s}
  .btn-refresh{background:var(--bg3);color:var(--text2)}
  .btn-refresh:hover{color:var(--text)}

  .file-list{display:flex;flex-direction:column;gap:8px}
  .file-item{background:var(--bg2);border-radius:var(--radius-sm);
    padding:12px 14px;display:flex;align-items:center;gap:12px;
    border:1px solid #ffffff08;transition:.15s}
  .file-item:hover{border-color:#ffffff18}
  .file-icon{font-size:26px;flex-shrink:0}
  .file-info{flex:1;min-width:0}
  .file-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .file-meta{font-size:11px;color:var(--text2);margin-top:2px}
  .file-actions{display:flex;gap:6px;flex-shrink:0}
  .btn-icon{width:34px;height:34px;border-radius:var(--radius-sm);border:none;
    cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;
    background:var(--bg3);color:var(--text2);transition:.15s}
  .btn-icon:hover{color:var(--text)}
  .btn-icon.danger:hover{background:#ef444422;color:var(--err)}

  .empty{text-align:center;padding:32px;color:var(--text2);font-size:13px}

  /* ── Toast ── */
  .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);
    background:#1e2336ee;border:1px solid #ffffff15;border-radius:50px;
    padding:10px 20px;font-size:13px;font-weight:600;
    backdrop-filter:blur(12px);transition:.3s;opacity:0;white-space:nowrap;z-index:99}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
  .toast.ok{border-color:#22c55e44;color:var(--ok)}
  .toast.err{border-color:#ef444444;color:var(--err)}

  /* ── Info panel ── */
  .info-card{background:var(--bg2);border-radius:var(--radius);padding:16px;
    border:1px solid #ffffff08}
  .info-row{display:flex;justify-content:space-between;align-items:center;
    padding:8px 0;border-bottom:1px solid #ffffff08;font-size:13px}
  .info-row:last-child{border-bottom:none}
  .info-label{color:var(--text2)}
  .info-value{font-weight:600;font-family:monospace;font-size:12px}
</style>
</head>
<body>

<header>
  <div class="logo">📲</div>
  <div>
    <h1>Sync Tablet</h1>
    <div class="sub">Transferencia WiFi · ${info.pcName}</div>
  </div>
  <div class="status-dot" id="ws-dot" title="Conectado"></div>
</header>

<div class="tabs">
  <button class="tab active" onclick="showTab('upload')">⬆ Enviar</button>
  <button class="tab" onclick="showTab('files')">📂 Archivos</button>
  <button class="tab" onclick="showTab('info')">ℹ Info</button>
</div>

<main>

  <!-- ── Tab: Enviar ── -->
  <div id="tab-upload">
    <div class="dropzone" id="dropzone" onclick="document.getElementById('file-input').click()">
      <div class="icon">📤</div>
      <p><strong>Toca para seleccionar archivos</strong></p>
      <p>o arrastra aquí desde el gestor</p>
    </div>
    <input type="file" id="file-input" multiple/>
    <div id="upload-status" style="margin-top:12px;display:none">
      <div style="font-size:13px;color:var(--text2)" id="upload-label">Subiendo...</div>
      <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
    </div>
  </div>

  <!-- ── Tab: Archivos ── -->
  <div id="tab-files" style="display:none">
    <div class="files-header">
      <h2>Drop folder</h2>
      <button class="btn-sm btn-refresh" onclick="loadFiles()">↻ Actualizar</button>
    </div>
    <div class="file-list" id="file-list">
      <div class="empty">Cargando...</div>
    </div>
  </div>

  <!-- ── Tab: Info ── -->
  <div id="tab-info" style="display:none">
    <div class="info-card">
      <div class="info-row">
        <span class="info-label">PC / Host</span>
        <span class="info-value">${info.pcName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">IP local</span>
        <span class="info-value" id="pc-ip">${info.ip}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Puerto</span>
        <span class="info-value">${info.port}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Carpeta Drop</span>
        <span class="info-value">${info.folder}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Versión servidor</span>
        <span class="info-value">${info.version}</span>
      </div>
    </div>
  </div>

</main>

<!-- Toast -->
<div class="toast" id="toast"></div>

<script>
  // ─── WebSocket para notificaciones en tiempo real ─────────────────────────
  let ws
  function connectWS () {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(proto + '://' + location.host)
    ws.onopen = () => {
      document.getElementById('ws-dot').style.background = 'var(--ok)'
      document.getElementById('ws-dot').title = 'Conectado'
    }
    ws.onclose = () => {
      document.getElementById('ws-dot').style.background = 'var(--err)'
      document.getElementById('ws-dot').title = 'Desconectado'
      setTimeout(connectWS, 3000)
    }
    ws.onmessage = e => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'file-added' || msg.type === 'file-deleted') loadFiles()
    }
  }
  connectWS()

  // ─── Tabs ────────────────────────────────────────────────────────────────
  function showTab (name) {
    ;['upload','files','info'].forEach(t => {
      document.getElementById('tab-'+t).style.display = t === name ? 'flex' : 'none'
      if (t === name) document.getElementById('tab-'+t).style.flexDirection = 'column'
    })
    document.querySelectorAll('.tab').forEach((btn, i) => {
      btn.classList.toggle('active', ['upload','files','info'][i] === name)
    })
    if (name === 'files') loadFiles()
  }

  // ─── Toast ───────────────────────────────────────────────────────────────
  let toastTimer
  function toast (msg, type = 'ok') {
    const el = document.getElementById('toast')
    el.textContent = msg
    el.className = 'toast show ' + type
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => el.className = 'toast', 3000)
  }

  // ─── Upload ──────────────────────────────────────────────────────────────
  const dropzone   = document.getElementById('dropzone')
  const fileInput  = document.getElementById('file-input')
  const uploadStatus = document.getElementById('upload-status')
  const uploadLabel  = document.getElementById('upload-label')
  const progressFill = document.getElementById('progress-fill')

  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('over') })
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'))
  dropzone.addEventListener('drop', e => {
    e.preventDefault(); dropzone.classList.remove('over')
    uploadFiles(Array.from(e.dataTransfer.files))
  })
  fileInput.addEventListener('change', () => uploadFiles(Array.from(fileInput.files)))

  async function uploadFiles (files) {
    if (!files.length) return
    uploadStatus.style.display = 'block'
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      uploadLabel.textContent = 'Enviando ' + (i+1) + '/' + files.length + ': ' + file.name
      progressFill.style.width = '0%'
      const fd = new FormData()
      fd.append('file', file)
      try {
        await new Promise((res, rej) => {
          const xhr = new XMLHttpRequest()
          xhr.open('POST', '/api/upload')
          xhr.upload.onprogress = e => {
            if (e.lengthComputable) progressFill.style.width = (e.loaded/e.total*100) + '%'
          }
          xhr.onload = () => xhr.status === 200 ? res() : rej(new Error(xhr.statusText))
          xhr.onerror = () => rej(new Error('Error de red'))
          xhr.send(fd)
        })
        toast('✓ ' + file.name + ' enviado', 'ok')
        progressFill.style.width = '100%'
      } catch (err) {
        toast('✗ ' + file.name + ': ' + err.message, 'err')
      }
    }
    uploadLabel.textContent = 'Listo'
    fileInput.value = ''
    setTimeout(() => uploadStatus.style.display = 'none', 2000)
  }

  // ─── Lista de archivos ───────────────────────────────────────────────────
  const ICONS = {
    image: '🖼', video: '🎬', audio: '🎵', pdf: '📄',
    zip: '🗜', apk: '📦', default: '📁'
  }
  function fileIcon (name) {
    const ext = name.split('.').pop().toLowerCase()
    if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return ICONS.image
    if (['mp4','mkv','avi','mov','webm'].includes(ext)) return ICONS.video
    if (['mp3','wav','ogg','flac','aac'].includes(ext)) return ICONS.audio
    if (ext === 'pdf') return ICONS.pdf
    if (['zip','rar','7z','tar','gz'].includes(ext)) return ICONS.zip
    if (ext === 'apk') return ICONS.apk
    return ICONS.default
  }

  async function loadFiles () {
    const list = document.getElementById('file-list')
    try {
      const res = await fetch('/api/files')
      const { files } = await res.json()
      if (!files.length) {
        list.innerHTML = '<div class="empty">📭 La carpeta Drop está vacía</div>'
        return
      }
      list.innerHTML = files.map(f => \`
        <div class="file-item">
          <span class="file-icon">\${fileIcon(f.name)}</span>
          <div class="file-info">
            <div class="file-name">\${f.name}</div>
            <div class="file-meta">\${f.size} · \${f.date}</div>
          </div>
          <div class="file-actions">
            <a class="btn-icon" href="/api/download/\${encodeURIComponent(f.name)}" download="\${f.name}" title="Descargar">⬇</a>
            <button class="btn-icon danger" onclick="deleteFile('\${f.name.replace(/'/g,\"\\\\'\")}\")" title="Eliminar">🗑</button>
          </div>
        </div>
      \`).join('')
    } catch {
      list.innerHTML = '<div class="empty">⚠ Error al cargar archivos</div>'
    }
  }

  async function deleteFile (name) {
    if (!confirm('¿Eliminar "' + name + '"?')) return
    try {
      await fetch('/api/file/' + encodeURIComponent(name), { method: 'DELETE' })
      toast('🗑 Eliminado: ' + name, 'ok')
      loadFiles()
    } catch {
      toast('Error al eliminar', 'err')
    }
  }

  // Carga inicial
  loadFiles()
</script>
</body>
</html>`
}

// ─── Servidor ─────────────────────────────────────────────────────────────────

class WebTransferServer {
  constructor () {
    this.server  = null
    this.wss     = null
    this.port    = 7891
    this.folder  = path.join(os.homedir(), 'Drop')
    this.running = false
    this._onEvent = null  // callback para notificar al proceso Electron
  }

  onEvent (cb) { this._onEvent = cb }

  _broadcast (msg) {
    if (!this.wss) return
    const data = JSON.stringify(msg)
    this.wss.clients.forEach(client => {
      if (client.readyState === 1 /* OPEN */) client.send(data)
    })
  }

  async _handleRequest (req, res) {
    const url = new URL(req.url, 'http://localhost')
    const pathname = url.pathname

    // CORS permisivo para red local
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    // ── GET / → UI web ─────────────────────────────────────────────────────
    if (pathname === '/' && req.method === 'GET') {
      const info = {
        pcName:  os.hostname(),
        ip:      getLocalIP(),
        port:    this.port,
        folder:  this.folder,
        version: '1.0.0',
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(buildUI(info))
      return
    }

    // ── GET /api/info ───────────────────────────────────────────────────────
    if (pathname === '/api/info' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        pcName: os.hostname(), ip: getLocalIP(),
        port: this.port, folder: this.folder, version: '1.0.0',
      }))
      return
    }

    // ── GET /api/files ──────────────────────────────────────────────────────
    if (pathname === '/api/files' && req.method === 'GET') {
      try {
        await fsp.mkdir(this.folder, { recursive: true })
        const entries = await fsp.readdir(this.folder, { withFileTypes: true })
        const files = []
        for (const e of entries) {
          if (!e.isFile()) continue
          const stat = await fsp.stat(path.join(this.folder, e.name))
          files.push({
            name: e.name,
            size: humanSize(stat.size),
            date: stat.mtime.toLocaleDateString('es', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }),
            bytes: stat.size,
          })
        }
        files.sort((a, b) => b.bytes - a.bytes)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ files }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
      return
    }

    // ── POST /api/upload ────────────────────────────────────────────────────
    if (pathname === '/api/upload' && req.method === 'POST') {
      try {
        await fsp.mkdir(this.folder, { recursive: true })
        const files = await parseMultipart(req)
        if (!files.length) throw new Error('Sin archivos')

        const saved = []
        for (const f of files) {
          // Evitar path traversal
          const safe = path.basename(f.filename).replace(/[<>:"/\\|?*]/g, '_')
          const dest = path.join(this.folder, safe)
          await fsp.writeFile(dest, f.data)
          saved.push(safe)
          this._broadcast({ type: 'file-added', name: safe })
          if (this._onEvent) this._onEvent({ type: 'file-added', name: safe, path: dest })
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, saved }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: err.message }))
      }
      return
    }

    // ── GET /api/download/:filename ─────────────────────────────────────────
    const dlMatch = pathname.match(/^\/api\/download\/(.+)$/)
    if (dlMatch && req.method === 'GET') {
      const filename = decodeURIComponent(dlMatch[1])
      const safe = path.basename(filename)
      const filePath = path.join(this.folder, safe)
      try {
        const stat = await fsp.stat(filePath)
        res.writeHead(200, {
          'Content-Type': mime(safe),
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="${safe}"`,
        })
        fs.createReadStream(filePath).pipe(res)
      } catch {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Archivo no encontrado' }))
      }
      return
    }

    // ── DELETE /api/file/:filename ──────────────────────────────────────────
    const delMatch = pathname.match(/^\/api\/file\/(.+)$/)
    if (delMatch && req.method === 'DELETE') {
      const filename = decodeURIComponent(delMatch[1])
      const safe = path.basename(filename)
      const filePath = path.join(this.folder, safe)
      try {
        await fsp.unlink(filePath)
        this._broadcast({ type: 'file-deleted', name: safe })
        if (this._onEvent) this._onEvent({ type: 'file-deleted', name: safe })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Archivo no encontrado' }))
      }
      return
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  }

  start ({ port = 7891, folder } = {}) {
    return new Promise((resolve, reject) => {
      if (this.running) return resolve(this.info())
      this.port   = port
      this.folder = folder || path.join(os.homedir(), 'Drop')

      this.server = http.createServer((req, res) => {
        this._handleRequest(req, res).catch(err => {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message }))
          }
        })
      })

      // WebSocket comparte el mismo servidor HTTP
      this.wss = new WebSocketServer({ server: this.server, path: '/' })
      this.wss.on('connection', (ws) => {
        ws.on('error', () => {}) // ignorar errores de cliente
      })

      this.server.listen(port, '0.0.0.0', () => {
        this.running = true
        resolve(this.info())
      })

      this.server.on('error', err => {
        if (err.code === 'EADDRINUSE') {
          // Intentar con el siguiente puerto
          this.server.close()
          this.port = port + 1
          this.start({ port: this.port, folder: this.folder }).then(resolve).catch(reject)
        } else {
          reject(err)
        }
      })
    })
  }

  stop () {
    return new Promise((resolve) => {
      if (!this.running) return resolve()
      this.wss?.close()
      this.server?.close(() => {
        this.running = false
        this.server  = null
        this.wss     = null
        resolve()
      })
    })
  }

  info () {
    return {
      running: this.running,
      ip:      getLocalIP(),
      port:    this.port,
      url:     `http://${getLocalIP()}:${this.port}`,
      folder:  this.folder,
    }
  }
}

module.exports = new WebTransferServer()