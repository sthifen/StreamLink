'use strict'

/**
 * webTransferServer.js — TCP "estilo KDE Connect"
 *
 * Protocolo: cada conexión maneja un comando.
 * El cliente envía una línea JSON, el servidor responde.
 *
 * Comandos públicos (sin token):
 *   {"cmd":"info"}
 *   {"cmd":"pair-request","deviceId":"...","name":"Pixel 7"}
 *   {"cmd":"pair-poll","sessionId":"..."}
 *   {"cmd":"pair-cancel","sessionId":"..."}
 *
 * Comandos autenticados (requieren "token"):
 *   {"cmd":"list","token":"..."}
 *   {"cmd":"upload","token":"...","name":"foto.jpg","size":12345,"mime":"image/jpeg"}
 *   {"cmd":"download","token":"...","name":"foto.jpg"}
 *   {"cmd":"thumb","token":"...","name":"foto.jpg"}        // imagen escalada a 512px si sharp está
 *   {"cmd":"notify","token":"...","app":"...","title":"...","text":"...","key":"...","ts":1234,"iconPng":"<b64>"}
 *
 * Discovery: anuncia mDNS service `_synctablet._tcp` con TXT { pcName, version, deviceId }
 */

const net    = require('net')
const dgram  = require('dgram')
const fs     = require('fs')
const path   = require('path')
const os     = require('os')
const crypto = require('crypto')

let sharp = null
try { sharp = require('sharp') } catch {}

let _server     = null
let _udp        = null
let _udpTimer   = null
let _folder     = path.join(os.homedir(), 'Drop')
let _port       = 7891
const DISCOVERY_PORT = 7892
let _eventCb    = null
let _pcDeviceId = null
const _pendingSessions = new Map()  // sessionId -> { code, deviceId, name, ip, status, expiresAt, token }
const _pushQueues    = new Map()    // deviceId -> [{ id, filename, path, ts, owns }]
const PUSH_TTL_MS    = 60 * 60 * 1000   // 1h sin que el cliente lo consuma → se descarta

const CFG_DIR     = path.join(os.homedir(), '.config', 'synctablet')
const DEVICE_FILE = path.join(CFG_DIR, 'device.json')
const PAIRED_FILE = path.join(CFG_DIR, 'paired.json')

const SESSION_TTL_MS = 60_000
const VERSION        = '3.0'

// ─── Persistencia ─────────────────────────────────────────────────────────────

function ensureCfgDir() {
  try { fs.mkdirSync(CFG_DIR, { recursive: true }) } catch {}
}

function loadOrCreatePcDeviceId() {
  ensureCfgDir()
  try {
    const data = JSON.parse(fs.readFileSync(DEVICE_FILE, 'utf8'))
    if (data && data.deviceId) return data.deviceId
  } catch {}
  const id = crypto.randomUUID()
  try { fs.writeFileSync(DEVICE_FILE, JSON.stringify({ deviceId: id }, null, 2)) } catch {}
  return id
}

function loadPaired() {
  try { return JSON.parse(fs.readFileSync(PAIRED_FILE, 'utf8')) || [] }
  catch { return [] }
}

function savePaired(list) {
  ensureCfgDir()
  try { fs.writeFileSync(PAIRED_FILE, JSON.stringify(list, null, 2)) } catch {}
}

function findByToken(token) {
  if (!token) return null
  return loadPaired().find(d => d.token === token) || null
}

function addPaired(device) {
  const list = loadPaired().filter(d => d.deviceId !== device.deviceId)
  list.push(device)
  savePaired(list)
}

function removePaired(deviceId) {
  savePaired(loadPaired().filter(d => d.deviceId !== deviceId))
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function getLocalIP() {
  const ifaces = os.networkInterfaces()
  const candidates = []
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) candidates.push(iface.address)
    }
  }
  return candidates.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.'))
      || candidates[0]
      || '127.0.0.1'
}

function humanSize(bytes) {
  if (bytes < 1024)       return bytes + ' B'
  if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(2) + ' GB'
}

function genCode6() {
  // 6 dígitos, evita ceros a la izquierda para que se vea bien en grande
  return String(Math.floor(100_000 + Math.random() * 900_000))
}

function cleanupSessions() {
  const now = Date.now()
  for (const [sid, s] of _pendingSessions) {
    if (s.expiresAt < now && s.status === 'pending') {
      s.status = 'expired'
    }
    // borra los terminados después de 120s
    if (s.expiresAt + 120_000 < now) _pendingSessions.delete(sid)
  }
}
setInterval(cleanupSessions, 15_000).unref?.()

// ─── UDP broadcast discovery (estilo KDE Connect) ────────────────────────────

function getBroadcastAddrs() {
  const out = ['255.255.255.255']
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family !== 'IPv4' || iface.internal) continue
      // calcula broadcast a partir de address + netmask
      const a = iface.address.split('.').map(Number)
      const m = iface.netmask.split('.').map(Number)
      const b = a.map((x, i) => (x | (~m[i] & 0xff)) >>> 0)
      out.push(b.join('.'))
    }
  }
  return Array.from(new Set(out))
}

function announcePacket() {
  return Buffer.from(JSON.stringify({
    type:     'synctablet-announce',
    deviceId: _pcDeviceId,
    pcName:   os.hostname(),
    port:     _port,
    version:  VERSION,
  }))
}

function broadcastAnnounce() {
  if (!_udp) return
  const buf = announcePacket()
  for (const addr of getBroadcastAddrs()) {
    try { _udp.send(buf, 0, buf.length, DISCOVERY_PORT, addr) } catch {}
  }
}

function startUdpDiscovery() {
  stopUdpDiscovery()
  try {
    _udp = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    _udp.on('error', e => console.error('[synctablet] UDP error:', e.message))
    _udp.on('message', (msg, rinfo) => {
      // alguien preguntó por nosotros: respondemos inmediato (unicast + broadcast)
      try {
        const obj = JSON.parse(msg.toString('utf8'))
        if (obj && obj.type === 'synctablet-discover') {
          const buf = announcePacket()
          try { _udp.send(buf, 0, buf.length, rinfo.port, rinfo.address) } catch {}
          broadcastAnnounce()
        }
      } catch {}
    })
    _udp.bind(DISCOVERY_PORT, () => {
      try { _udp.setBroadcast(true) } catch {}
      console.log('[synctablet] UDP discovery escuchando en puerto', DISCOVERY_PORT)
      broadcastAnnounce()
    })
    _udpTimer = setInterval(broadcastAnnounce, 2000)
    _udpTimer.unref?.()
  } catch (e) {
    console.error('[synctablet] Error iniciando UDP discovery:', e.message)
  }
}

function stopUdpDiscovery() {
  if (_udpTimer) { clearInterval(_udpTimer); _udpTimer = null }
  try { _udp?.close() } catch {}
  _udp = null
}

// ─── API pública ──────────────────────────────────────────────────────────────

function onEvent(cb) { _eventCb = cb }

function emit(ev) { try { _eventCb && _eventCb(ev) } catch {} }

function info() {
  return {
    running: _server?.listening ?? false,
    port:    _port,
    folder:  _folder,
    ip:      getLocalIP(),
    pcName:  os.hostname(),
    version: VERSION,
    deviceId: _pcDeviceId,
    paired:  loadPaired().map(({ deviceId, name, pairedAt }) => ({ deviceId, name, pairedAt })),
  }
}

function start({ port, folder } = {}) {
  if (port)   _port   = Number(port)
  if (folder) _folder = folder
  if (!_pcDeviceId) _pcDeviceId = loadOrCreatePcDeviceId()

  return new Promise((resolve, reject) => {
    if (_server?.listening) { resolve(info()); return }

    _server = net.createServer(handleConnection)
    _server.on('error', reject)
    _server.listen(_port, '0.0.0.0', () => {
      console.log(`[synctablet] TCP escuchando en ${getLocalIP()}:${_port}`)
      startUdpDiscovery()
      resolve(info())
    })
  })
}

function stop() {
  return new Promise(resolve => {
    stopUdpDiscovery()
    if (_server?.listening) {
      _server.close(() => { _server = null; resolve() })
    } else {
      _server = null
      resolve()
    }
  })
}

// Llamado desde main.js cuando el usuario hace click "Aceptar" en el dialog
function acceptPair(sessionId) {
  const s = _pendingSessions.get(sessionId)
  if (!s) return { ok: false, error: 'sesión desconocida' }
  if (s.status !== 'pending') return { ok: false, error: 'sesión ya resuelta: ' + s.status }
  const token = crypto.randomBytes(32).toString('hex')
  s.token  = token
  s.status = 'accepted'
  s.expiresAt = Date.now() + 60_000  // 1 min para que el cliente haga poll y recoja el token
  addPaired({
    deviceId: s.deviceId,
    name:     s.name,
    token,
    pairedAt: Date.now(),
  })
  return { ok: true, token }
}

function rejectPair(sessionId) {
  const s = _pendingSessions.get(sessionId)
  if (!s) return { ok: false, error: 'sesión desconocida' }
  if (s.status !== 'pending') return { ok: false, error: 'sesión ya resuelta: ' + s.status }
  s.status = 'rejected'
  s.expiresAt = Date.now() + 30_000
  return { ok: true }
}

function pairedList() {
  return loadPaired().map(({ deviceId, name, pairedAt }) => ({ deviceId, name, pairedAt }))
}

function unpair(deviceId) {
  removePaired(deviceId)
  _pushQueues.delete(deviceId)
  return { ok: true }
}

/**
 * Encola un archivo para que la tablet `deviceId` lo recoja por polling.
 * Si `owns` es true, el server borrará `srcPath` después de la entrega exitosa
 * (útil cuando main.js stage-ea un archivo temporal del clipboard).
 */
function enqueuePush(deviceId, filename, srcPath, owns = false) {
  if (!deviceId || !filename || !srcPath) return { ok: false, error: 'argumentos inválidos' }
  if (!fs.existsSync(srcPath)) return { ok: false, error: 'archivo no existe: ' + srcPath }
  const id = crypto.randomUUID()
  if (!_pushQueues.has(deviceId)) _pushQueues.set(deviceId, [])
  _pushQueues.get(deviceId).push({ id, filename, path: srcPath, ts: Date.now(), owns })
  console.log(`[synctablet] Encolado para ${deviceId}: ${filename} (${srcPath})`)
  return { ok: true, id }
}

/** Encola para TODOS los dispositivos pareados. */
function enqueuePushAll(filename, srcPath, owns = false) {
  const devices = loadPaired()
  if (devices.length === 0) return { ok: false, error: 'no hay tablets pareadas' }
  const ids = []
  for (const d of devices) {
    const r = enqueuePush(d.deviceId, filename, srcPath, false)  // owns siempre false en multi-target
    if (r.ok) ids.push({ deviceId: d.deviceId, id: r.id })
  }
  // si owns, borramos cuando todos confirmen — por simplicidad lo dejamos
  // con TTL para que limpie solo
  return { ok: true, ids, count: ids.length }
}

function cleanupPushQueues() {
  const now = Date.now()
  for (const [deviceId, queue] of _pushQueues) {
    const keep = queue.filter(item => {
      if (now - item.ts < PUSH_TTL_MS) return true
      if (item.owns) { try { fs.unlinkSync(item.path) } catch {} }
      return false
    })
    if (keep.length === 0) _pushQueues.delete(deviceId)
    else _pushQueues.set(deviceId, keep)
  }
}
setInterval(cleanupPushQueues, 30 * 1000).unref?.()

// ─── Manejadores de comandos ──────────────────────────────────────────────────

function reply(socket, obj) {
  try { socket.end(JSON.stringify(obj) + '\n') } catch {}
}

function handleInfo(socket) {
  reply(socket, info())
}

function handlePairRequest(socket, cmd, remoteIp) {
  const deviceId = String(cmd.deviceId || '').trim()
  const name     = String(cmd.name || 'Dispositivo').trim().slice(0, 64)
  if (!deviceId) { reply(socket, { error: 'falta deviceId' }); return }

  // Si ya está pareado, reutilizamos (auto-reaccept sin pedir código)
  const existing = loadPaired().find(d => d.deviceId === deviceId)
  if (existing) {
    reply(socket, { sessionId: null, code: null, alreadyPaired: true, token: existing.token, pcName: os.hostname() })
    return
  }

  const sessionId = crypto.randomUUID()
  const code = genCode6()
  const session = {
    sessionId,
    code,
    deviceId,
    name,
    ip:        remoteIp,
    status:    'pending',
    expiresAt: Date.now() + SESSION_TTL_MS,
    token:     null,
  }
  _pendingSessions.set(sessionId, session)
  emit({ type: 'pair-request', sessionId, code, deviceId, name, ip: remoteIp, expiresAt: session.expiresAt })
  reply(socket, { sessionId, code, alreadyPaired: false })
}

function handlePairPoll(socket, cmd) {
  const s = _pendingSessions.get(String(cmd.sessionId || ''))
  if (!s) { reply(socket, { status: 'expired' }); return }
  if (s.status === 'pending' && Date.now() > s.expiresAt) s.status = 'expired'
  if (s.status === 'accepted') {
    reply(socket, { status: 'accepted', token: s.token, pcName: os.hostname(), pcDeviceId: _pcDeviceId })
  } else {
    reply(socket, { status: s.status })
  }
}

function handlePairCancel(socket, cmd) {
  const s = _pendingSessions.get(String(cmd.sessionId || ''))
  if (s && s.status === 'pending') {
    s.status = 'cancelled'
    s.expiresAt = Date.now() + 30_000
    emit({ type: 'pair-cancelled', sessionId: s.sessionId })
  }
  reply(socket, { ok: true })
}

function checkAuth(socket, cmd) {
  const d = findByToken(cmd.token)
  if (!d) { reply(socket, { error: 'unauthorized' }); return null }
  return d
}

function handleList(socket, cmd) {
  if (!checkAuth(socket, cmd)) return
  try {
    const entries = fs.readdirSync(_folder).filter(n => !n.startsWith('.'))
    const files = entries.map(name => {
      const fp = path.join(_folder, name)
      try {
        const st = fs.statSync(fp)
        if (!st.isFile()) return null
        const isImg = /\.(png|jpe?g|webp|gif|bmp)$/i.test(name)
        return {
          name,
          size:  humanSize(st.size),
          bytes: st.size,
          date:  st.mtime.toLocaleDateString('es', {
            day: '2-digit', month: 'short',
            hour: '2-digit', minute: '2-digit',
          }),
          mtime: st.mtimeMs,
          isImage: isImg,
        }
      } catch { return null }
    }).filter(Boolean).sort((a, b) => b.mtime - a.mtime)

    socket.write(JSON.stringify({ count: files.length }) + '\n')
    for (const f of files) socket.write(JSON.stringify(f) + '\n')
    socket.end()
  } catch (e) {
    reply(socket, { error: e.message })
  }
}

function handleDownload(socket, cmd) {
  if (!checkAuth(socket, cmd)) return
  const safe = path.basename(String(cmd.name || ''))
  const fp   = path.join(_folder, safe)
  try {
    const data = fs.readFileSync(fp)
    socket.write(JSON.stringify({ size: data.length }) + '\n')
    socket.write(data)
    socket.end()
  } catch (e) {
    reply(socket, { error: e.message })
  }
}

async function handleThumb(socket, cmd) {
  if (!checkAuth(socket, cmd)) return
  const safe = path.basename(String(cmd.name || ''))
  const fp   = path.join(_folder, safe)
  try {
    let data
    if (sharp) {
      data = await sharp(fp).rotate().resize({ width: 512, height: 512, fit: 'inside' }).jpeg({ quality: 78 }).toBuffer()
    } else {
      // Fallback: archivo crudo, Glide reescala en cliente
      data = fs.readFileSync(fp)
    }
    socket.write(JSON.stringify({ size: data.length }) + '\n')
    socket.write(data)
    socket.end()
  } catch (e) {
    reply(socket, { error: e.message })
  }
}

function handlePollPushes(socket, cmd) {
  const d = checkAuth(socket, cmd)
  if (!d) return
  const q = _pushQueues.get(d.deviceId) || []
  reply(socket, { items: q.map(({ id, filename, ts }) => ({ id, filename, ts })) })
}

function handlePushDownload(socket, cmd) {
  const d = checkAuth(socket, cmd)
  if (!d) return
  const q = _pushQueues.get(d.deviceId) || []
  const item = q.find(x => x.id === cmd.id)
  if (!item) { reply(socket, { error: 'not found' }); return }
  try {
    const data = fs.readFileSync(item.path)
    socket.write(JSON.stringify({ size: data.length, filename: item.filename }) + '\n')
    socket.write(data)
    socket.end()
  } catch (e) {
    reply(socket, { error: e.message })
  }
}

function handleConfirmPush(socket, cmd) {
  const d = checkAuth(socket, cmd)
  if (!d) return
  const q = _pushQueues.get(d.deviceId) || []
  const idx = q.findIndex(x => x.id === cmd.id)
  if (idx >= 0) {
    const item = q[idx]
    q.splice(idx, 1)
    if (item.owns) { try { fs.unlinkSync(item.path) } catch {} }
    console.log(`[synctablet] Tablet ${d.deviceId} confirmó: ${item.filename}`)
  }
  reply(socket, { ok: true })
}

function handleNotify(socket, cmd) {
  const device = checkAuth(socket, cmd)
  if (!device) return
  emit({
    type:    'notification',
    app:     String(cmd.app   || '').slice(0, 64),
    title:   String(cmd.title || '').slice(0, 200),
    text:    String(cmd.text  || '').slice(0, 1000),
    key:     String(cmd.key   || ''),
    ts:      Number(cmd.ts) || Date.now(),
    iconPng: typeof cmd.iconPng === 'string' ? cmd.iconPng : null,
    fromDeviceId: device.deviceId,
    fromName:     device.name,
  })
  reply(socket, { ok: true })
}

function finishUpload(socket, cmd, data) {
  if (!checkAuth(socket, cmd)) return
  const safe = path.basename(String(cmd.name || 'archivo'))
  const fp   = path.join(_folder, safe)
  try {
    fs.writeFileSync(fp, data)
    reply(socket, { ok: true })
    console.log(`[synctablet] Recibido: ${safe} (${humanSize(data.length)})`)
    emit({ type: 'file-added', name: safe, path: fp })
  } catch (e) {
    reply(socket, { ok: false, error: e.message })
  }
}

// ─── Conexión TCP ─────────────────────────────────────────────────────────────

function handleConnection(socket) {
  const remoteIp = (socket.remoteAddress || '').replace(/^::ffff:/, '')
  let buf        = Buffer.alloc(0)
  let state      = 'header'
  let uploadCmd  = null
  let uploadBufs = []
  let uploadGot  = 0

  function process() {
    if (state === 'header') {
      const nl = buf.indexOf(10) // '\n'
      if (nl === -1) return

      const line = buf.slice(0, nl).toString('utf8').trim()
      buf = buf.slice(nl + 1)

      let cmd
      try { cmd = JSON.parse(line) } catch {
        reply(socket, { error: 'parse error' })
        return
      }

      switch (cmd.cmd) {
        case 'info':         handleInfo(socket); break
        case 'pair-request': handlePairRequest(socket, cmd, remoteIp); break
        case 'pair-poll':    handlePairPoll(socket, cmd); break
        case 'pair-cancel':  handlePairCancel(socket, cmd); break
        case 'list':         handleList(socket, cmd); break
        case 'download':     handleDownload(socket, cmd); break
        case 'thumb':        handleThumb(socket, cmd); break
        case 'notify':       handleNotify(socket, cmd); break
        case 'poll-pushes':  handlePollPushes(socket, cmd); break
        case 'push-download':handlePushDownload(socket, cmd); break
        case 'confirm-push': handleConfirmPush(socket, cmd); break
        case 'upload':
          if (!checkAuth(socket, cmd)) return
          uploadCmd  = cmd
          uploadBufs = []
          uploadGot  = 0
          state      = 'data'
          if (buf.length > 0) process()
          break
        default:
          reply(socket, { error: 'unknown command' })
      }
    } else if (state === 'data') {
      const need = uploadCmd.size - uploadGot
      const take = Math.min(buf.length, need)
      uploadBufs.push(buf.slice(0, take))
      uploadGot += take
      buf = buf.slice(take)

      if (uploadGot >= uploadCmd.size) {
        state = 'header'
        finishUpload(socket, uploadCmd, Buffer.concat(uploadBufs))
      }
    }
  }

  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk])
    process()
  })
  socket.on('error', () => {})
  // Timeout amplio: subidas grandes pueden tardar en Wi-Fi lento
  socket.setTimeout(300_000, () => socket.destroy())
}

module.exports = {
  start,
  stop,
  info,
  onEvent,
  // Pairing control desde main.js
  acceptPair,
  rejectPair,
  pairedList,
  unpair,
  // Push de archivos al móvil
  enqueuePush,
  enqueuePushAll,
}
