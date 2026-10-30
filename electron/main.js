const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage, Tray, Menu, globalShortcut, shell, Notification, session } = require('electron')
const { spawn, execSync, execFile } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
let Bonjour = null
try { Bonjour = require('bonjour-service').Bonjour } catch {}
let _qrPairSession = null
let webTransfer = null
let webTransferLoadError = null
let webTransferStartPromise = null
let webTransferEventHooked = false


try {
  const candidates = [
    path.join(__dirname, 'webTransferServer.js'),
    path.join(__dirname, '..', 'webTransferServer.js'),
  ]

  console.log('[webTransfer] Buscando servidor en:')
  candidates.forEach(p => console.log(' -', p))

  const found = candidates.find(p => fs.existsSync(p))

  if (!found) {
    throw new Error(
      'No encontré webTransferServer.js ni en electron/ ni en la raíz del proyecto'
    )
  }

  webTransfer = require(found)
  console.log('[webTransfer] Cargado correctamente desde:', found)

  if (
    !webTransfer ||
    typeof webTransfer.start !== 'function' ||
    typeof webTransfer.stop !== 'function' ||
    typeof webTransfer.info !== 'function'
  ) {
    throw new Error('webTransferServer.js no exporta start(), stop() e info()')
  }
} catch (err) {
  webTransferLoadError = err
  console.error('[webTransfer] ERROR cargando módulo:', err)
}

// ─── Fix pantalla en blanco + webviews en AppImage ───────────────────────────
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('disable-gpu-rasterization')
app.commandLine.appendSwitch('disable-gpu-memory-buffer-compositor-resources')
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-dev-shm-usage')
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512')
// Crítico para webviews en AppImage empaquetado
app.commandLine.appendSwitch('disable-site-isolation-trials')
app.commandLine.appendSwitch('disable-web-security')
app.commandLine.appendSwitch('allow-running-insecure-content')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ─── Ruta base del proyecto (donde vive el binario de syncthing) ──────────────
// En dev: carpeta del repo. En producción: recursos empaquetados.
const PROJECT_ROOT = isDev
  ? path.join(__dirname, '..')
  : process.resourcesPath

// Busca el binario de syncthing en este orden:
// 1. Carpeta syncthing-linux-amd64-* dentro del proyecto
// 2. syncthing instalado en el sistema (PATH)
function findSyncthing() {
  // Buscar en la carpeta del proyecto
  try {
    const entries = fs.readdirSync(PROJECT_ROOT)
    for (const entry of entries) {
      if (entry.startsWith('syncthing-linux') && fs.statSync(path.join(PROJECT_ROOT, entry)).isDirectory()) {
        const bin = path.join(PROJECT_ROOT, entry, 'syncthing')
        if (fs.existsSync(bin)) return bin
      }
    }
  } catch {}
  // Fallback: syncthing instalado en el sistema
  try { execSync('which syncthing', { stdio: 'ignore' }); return 'syncthing' } catch {}
  return null
}

let mainWindow
let syncthingWindow = null
let tray = null
let syncProc = null

// ─── Tray ─────────────────────────────────────────────────────────────────────
function createTray() {
  // Ícono 16x16 inline (no depende de archivos externos)
  // Un cuadrado azul simple — reemplázalo con tu propio .png si quieres
  // Usar logo.png del proyecto como ícono del tray
  const iconPath = path.join(__dirname, 'logo.png')
  const iconPathFallback = path.join(__dirname, '..', 'logo.png')
  const resolvedIcon = fs.existsSync(iconPath) ? iconPath : (fs.existsSync(iconPathFallback) ? iconPathFallback : null)
  let icon
  if (resolvedIcon) {
    icon = nativeImage.createFromPath(resolvedIcon).resize({ width: 16, height: 16 })
  } else {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('Sync Tablet')

  const buildMenu = () => Menu.buildFromTemplate([
    {
      label: 'Sync Tablet',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: mainWindow?.isVisible() ? 'Ocultar ventana' : 'Mostrar ventana',
      click: () => toggleWindow()
    },
    {
      label: 'Syncthing UI  →  :8384',
      click: () => shell.openExternal('http://127.0.0.1:8384')
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    },
  ])

  tray.setContextMenu(buildMenu())

  // Clic izquierdo = mostrar/ocultar ventana
  tray.on('click', () => toggleWindow())

  // Actualizar menú cuando cambia el estado de la ventana
  if (mainWindow) {
    mainWindow.on('show', () => tray.setContextMenu(buildMenu()))
    mainWindow.on('hide', () => tray.setContextMenu(buildMenu()))
  }
}

function toggleWindow() {
  if (!mainWindow) return
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
}

function startSyncthing() {
  if (syncProc) return
  const bin = findSyncthing()
  if (!bin) { console.log('Syncthing no encontrado'); return }
  try {
    if (bin !== 'syncthing') fs.chmodSync(bin, 0o755)
  } catch {}
  console.log(`Iniciando syncthing: ${bin}`)
  syncProc = spawn(bin, ['serve', '--no-browser'], {
    detached: true,
    stdio:    'ignore',
    cwd:      PROJECT_ROOT,
  })
  syncProc.unref()
  syncProc.on('error', (e) => { console.log('Syncthing error:', e.message); syncProc = null })
  syncProc.on('exit',  ()  => { syncProc = null })
}

function createWindow() {
  // Resolver ruta del logo para la ventana
  const logoPath = fs.existsSync(path.join(__dirname, 'logo.png'))
    ? path.join(__dirname, 'logo.png')
    : path.join(__dirname, '..', 'logo.png')

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 660,
    minWidth: 780,
    minHeight: 520,
    title: 'Sync Tablet',
    icon: fs.existsSync(logoPath) ? logoPath : undefined,
    backgroundColor: '#f0f4fc',
 webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false,

  // necesario para usar <webview>
  webviewTag: true,

  // necesario para embeber páginas locales / Syncthing / PDF views
  webSecurity: false,
  allowRunningInsecureContent: true,
  plugins: true,
},
    titleBarStyle: 'default',
    show: false
  
  })

if (isDev) {
  mainWindow.loadURL('http://localhost:5173')
} else {
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
}

  // Mostrar ventana cuando el renderer esté listo
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    createTray()
  })

  // Fallback: si ready-to-show no dispara en 8s (pantalla en blanco),
  // mostrar de todas formas para que el usuario no vea nada vacío
  const showFallback = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.warn('ready-to-show no disparó — mostrando ventana de todas formas')
      mainWindow.show()
      if (!tray) createTray()
    }
  }, 8000)

  // Quitar X-Frame-Options de Syncthing — sesión principal Y sesión de webview
  const stripHeaders = (details, callback) => {
    const headers = { ...details.responseHeaders }
    delete headers['x-frame-options']
    delete headers['X-Frame-Options']
    delete headers['content-security-policy']
    delete headers['Content-Security-Policy']
    delete headers['x-content-type-options']
    delete headers['X-Content-Type-Options']
    callback({ responseHeaders: headers })
  }

  // Sesión principal
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    { urls: ['http://127.0.0.1:8384/*'] },
    stripHeaders
  )

  // Sesión de la webview (persist:syncthing) — crítico para AppImage
// Sesión de la webview (persist:syncthing) — crítico para AppImage
const wvSession = session.fromPartition('persist:syncthing', { cache: true })
  wvSession.webRequest.onHeadersReceived(
    { urls: ['http://127.0.0.1:8384/*'] },
    stripHeaders
  )
  // Permitir todos los permisos en la sesión de webview
  wvSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true)
  })

  // Sesión de Sunshine webview (persist:sunshine) — strips CSP + cert errors
  const sunshineSession = session.fromPartition('persist:sunshine', { cache: true })
  sunshineSession.webRequest.onHeadersReceived(
    { urls: ['https://localhost:47990/*', 'https://127.0.0.1:47990/*'] },
    stripHeaders
  )
  sunshineSession.setPermissionRequestHandler((_wc, _perm, callback) => callback(true))
  sunshineSession.setCertificateVerifyProc((request, callback) => {
    if (request.hostname === 'localhost' || request.hostname === '127.0.0.1') {
      callback(0) // OK
    } else {
      callback(-3) // net::ERR_FAILED — use default
    }
  })

  // Handler obligatorio en Electron moderno para permitir webviews en producción
mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
  const allowedPartitions = [
    'persist:syncthing',
    'persist:pdfview',
    'persist:browser',
    'persist:aibrowser',
    'persist:webtransfer',
    'persist:sunshine',
  ]

  if (!allowedPartitions.includes(params.partition)) {
    event.preventDefault()
    return
  }

  webPreferences.nodeIntegration = false
  webPreferences.contextIsolation = false
  webPreferences.sandbox = false
  webPreferences.webSecurity = false
  webPreferences.allowRunningInsecureContent = true
  webPreferences.plugins = true

  delete webPreferences.preload
  delete webPreferences.preloadURL
})

  // Cerrar = minimizar a tray (no salir)
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  // ─── Abrir links externos en el navegador del sistema ────────────────────
  // Evita que target="_blank" abra ventanas de Electron en blanco
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Links internos (localhost, devtools) se abren normal
    if (url.startsWith('http://localhost') || url.startsWith('devtools://')) {
      return { action: 'allow' }
    }
    // Todo lo demás (Google, Outlook, etc.) → navegador del sistema
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // También interceptar navegación directa fuera de la app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isLocal = url.startsWith('http://localhost') ||
                    url.startsWith('file://') ||
                    url.startsWith('devtools://')
    if (!isLocal) {
      event.preventDefault()
      shell.openExternal(url)          
    }
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// BLUETOOTH TRANSFER — Linux / BlueZ / bluetooth-sendto
// ══════════════════════════════════════════════════════════════════════════════

ipcMain.handle('bt:devices', async () => {
  return new Promise((resolve) => {
    execFile('bluetoothctl', ['devices', 'Paired'], (error, stdout, stderr) => {
      if (error) {
        resolve({
          ok: false,
          error: stderr || error.message,
          devices: [],
        })
        return
      }

      const devices = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const match = line.match(/^Device\s+([0-9A-F:]{17})\s+(.+)$/i)
          if (!match) return null
          return {
            mac: match[1],
            name: match[2],
          }
        })
        .filter(Boolean)

      resolve({
        ok: true,
        devices,
      })
    })
  })
})

ipcMain.handle('bt:send', async (_event, { mac, filePath }) => {
  return new Promise((resolve) => {
    if (!filePath || !fs.existsSync(filePath)) {
      resolve({
        ok: false,
        error: 'Archivo no existe',
      })
      return
    }

    const args = mac
      ? [`--device=${mac}`, filePath]
      : [filePath]

    const child = spawn('bluetooth-sendto', args, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stderr = ''
    let stdout = ''

    child.stdout.on('data', data => {
      stdout += data.toString()
    })

    child.stderr.on('data', data => {
      stderr += data.toString()
    })

    child.on('error', err => {
      resolve({
        ok: false,
        error: err.message,
      })
    })

    child.on('close', code => {
      if (code === 0) {
        resolve({
          ok: true,
          out: stdout,
        })
      } else {
        resolve({
          ok: false,
          error: stderr || stdout || `bluetooth-sendto terminó con código ${code}`,
        })
      }
    })
  })
})

app.whenReady()
  .then(async () => {
    await killOldPortOwner(7891)

    createWindow()
    startSyncthing()
    registerShortcuts()
    startHotCornerWatcher()

    // Restaurar credenciales de Sunshine guardadas
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
        if (cfg.sunshine?.username && cfg.sunshine?.password) {
          applySunshineCredentials(cfg.sunshine.username, cfg.sunshine.password)
        }
      }
    } catch {}

    // Carpeta donde aterrizan los archivos que la tablet envía. Fuera de
    // Syncthing (~/Drop) para que NO se sincronicen como "nube".
    const recvFolder = path.join(os.homedir(), 'Pictures', 'SyncTablet')
    try { fs.mkdirSync(recvFolder, { recursive: true }) } catch {}

    const r = await startWebTransferServer({
      port: 7891,
      folder: recvFolder,
    })

    console.log('[webTransfer] Auto-start resultado:', r)
  })
  .catch((err) => {
    console.error('[app.whenReady] ERROR:', err)
  })
  .catch((err) => {
    console.error('[app.whenReady] ERROR:', err)
  })

function registerShortcuts() {
  // Ctrl+Shift+V — enviar imagen o texto del clipboard a la tablet
  globalShortcut.register('CommandOrControl+Shift+V', async () => {
    const cfg    = loadConfigSync()
    // Si hay kde_device_id guardado úsalo aunque paste_method no esté configurado explícitamente
    const method = cfg.paste_method || (cfg.kde_device_id ? 'kdeconnect' : 'syncthing')
    const folder = (cfg.drop_folder || '~/Drop').replace('~', os.homedir())
    const ts     = new Date().toISOString().replace(/[:.]/g,'').slice(0,15)

    const img  = clipboard.readImage()
    const text = clipboard.readText()
    const hasImg  = img && !img.isEmpty()
    const hasText = text && text.trim().length > 0

    if (!hasImg && !hasText) { notify('Clipboard vacío', 'No hay imagen ni texto para enviar'); return }

    // PRIORIDAD: SyncTablet (pareo nativo). Si hay tablets pareadas, usar eso.
    if (webTransfer?.enqueuePushAll && webTransfer?.pairedList) {
      const paired = webTransfer.pairedList()
      if (paired && paired.length > 0) {
        try {
          const ext     = hasImg ? 'png' : 'txt'
          const prefix  = hasImg ? 'captura' : 'nota'
          const tmpFile = path.join(os.tmpdir(), `synctablet-push-${ts}.${ext}`)
          if (hasImg) fs.writeFileSync(tmpFile, img.toPNG())
          else        fs.writeFileSync(tmpFile, text, 'utf8')
          const r = webTransfer.enqueuePushAll(`${prefix}_${ts}.${ext}`, tmpFile, true)
          if (r.ok) {
            notify(`✓ ${hasImg ? 'Imagen' : 'Texto'} en cola`,
                   `Para ${r.count} tablet${r.count === 1 ? '' : 's'} (SyncTablet)`)
            return
          } else {
            notify('✗ SyncTablet', r.error || 'fallo encolando')
            try { fs.unlinkSync(tmpFile) } catch {}
            // continúa al fallback
          }
        } catch (e) {
          notify('SyncTablet error', e.message)
        }
      }
    }

    // kdeconnect: misma lógica que el botón del panel (--share-text para texto, --share para imagen)
    if (method === 'kdeconnect') {
      const targetId = cfg.kde_device_id
      if (!targetId) { notify('KDE Connect', 'Sin dispositivo configurado. Selecciona uno en la pestaña KDE Connect.'); return }
      if (hasText && !hasImg) {
        const r = await runKde(['-d', targetId, '--share-text', text])
        if (r.ok) notify('✓ Texto enviado', 'KDE Connect OK')
        else notify('✗ KDE Connect', (r.out || 'sin respuesta').slice(0, 120))
        return
      }
      const tmpImg = path.join(os.tmpdir(), `captura_${ts}.png`)
      try { fs.writeFileSync(tmpImg, img.toPNG()) } catch (e) { notify('Error', e.message); return }
      const r = await runKde(['-d', targetId, '--share', `file://${tmpImg}`])
      if (r.ok) notify('✓ Imagen enviada', 'KDE Connect OK')
      else { notify('✗ KDE Connect', (r.out || 'sin respuesta').slice(0, 120)); try { fs.unlinkSync(tmpImg) } catch {} }
      return
    }

    const ext      = hasImg ? 'png' : 'txt'
    const prefix   = hasImg ? 'captura' : 'nota'
    const tmpFile  = path.join(os.tmpdir(), `clip_${ts}.${ext}`)
    try {
      if (hasImg) fs.writeFileSync(tmpFile, img.toPNG())
      else        fs.writeFileSync(tmpFile, text, 'utf8')
    } catch (e) { notify('Error', e.message); return }

    if (method === 'usb') {
      const serial = await getFirstAdbDevice()
      if (!serial) { notify('Sin tablet', 'Conectá la tablet por USB o Wi-Fi'); fs.unlinkSync(tmpFile); return }
      const remote = `/sdcard/Download/${prefix}_${ts}.${ext}`
      const r = await runCmd('adb', ['-s', serial, 'push', tmpFile, remote])
      if (r.ok) {
        await runCmd('adb', ['-s', serial, 'shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', `file://${remote}`])
        notify(`✓ ${hasImg ? 'Imagen' : 'Texto'} enviado`, 'Guardado en Descargas de la tablet')
      } else notify('✗ Error ADB', (r.out || '').slice(0, 100))

    } else if (method === 'bluetooth') {
      const mac = await getFirstBtDevice()
      if (!mac) { notify('Sin Bluetooth', 'No hay dispositivos Bluetooth pareados'); fs.unlinkSync(tmpFile); return }
      const r = await runCmd('bluetooth-sendto', [`--device=${mac}`, tmpFile])
      if (r.ok) notify(`✓ ${hasImg ? 'Imagen' : 'Texto'} enviado`, 'Bluetooth OK')
      else notify('✗ Bluetooth error', (r.out || '').slice(0, 100))

    } else {
      // syncthing (default)
      try {
        fs.mkdirSync(folder, { recursive: true })
        const dest = path.join(folder, `${prefix}_${ts}.${ext}`)
        fs.copyFileSync(tmpFile, dest)
        notify(`✓ ${hasImg ? 'Imagen' : 'Texto'} enviado`, `${path.basename(dest)} — Syncthing lo sincroniza`)
      } catch (e) { notify('Error', e.message) }
    }

    try { fs.unlinkSync(tmpFile) } catch {}
  })

  // Ctrl+Shift+S — mostrar/ocultar ventana desde cualquier app
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    toggleWindow()
  })

  // Ctrl+U — toggle Control Total
  globalShortcut.register('Ctrl+U', () => {
    toggleControlMode()
  })
}

ipcMain.handle('reload-shortcuts', () => {
  globalShortcut.unregisterAll()
  registerShortcuts()
  return { ok: true }
})

// ─── Hot corner: esquina inferior-derecha → activar Control Total ─────────────
let _hotCornerTimer = null
function startHotCornerWatcher() {
  const { screen } = require('electron')
  setInterval(() => {
    try {
      const pt = screen.getCursorScreenPoint()
      const d  = screen.getDisplayNearestPoint(pt)
      const inCorner = pt.x >= d.bounds.x + d.bounds.width - 3 &&
                       pt.y >= d.bounds.y + d.bounds.height - 3
      if (inCorner) {
        if (!_hotCornerTimer) {
          _hotCornerTimer = setTimeout(() => {
            _hotCornerTimer = null
            if (!controlActive) toggleControlMode()
          }, 600)
        }
      } else {
        if (_hotCornerTimer) { clearTimeout(_hotCornerTimer); _hotCornerTimer = null }
      }
    } catch {}
  }, 100)
}

// ─── Control Total ────────────────────────────────────────────────────────────
let controlProc   = null
let controlActive = false
let _hoverInterval = null

function _stopHover() {
  if (_hoverInterval) { clearInterval(_hoverInterval); _hoverInterval = null }
}

function _startHover(wid) {
  _stopHover()
  // El loop continuo de windowfocus rompe el UHID mouse de scrcpy 4.x:
  // cada FocusOut+FocusIn resetea el estado del mouse, impidiendo que funcione.
  // Solo se hace el foco inicial en focusWid(); scrcpy mantiene el suyo propio.
}

async function toggleControlMode(opts = {}) {
  const { noAudio = false } = opts

  // ── Desactivar ──────────────────────────────────────────────────────────────
  if (controlActive && controlProc) {
    _stopHover()
    try { controlProc.kill('SIGTERM') } catch {}
    setTimeout(() => { try { controlProc.kill('SIGKILL') } catch {} }, 1000)
    controlProc = null
    controlActive = false
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('control-mode-changed', false)
    notify('🖱️ Control Total', 'Desactivado')
    return
  }

  // ── Detectar tablet ─────────────────────────────────────────────────────────
  let serial = null
  try {
    const devR = await runCmd('adb', ['devices', '-l'])
    if (devR.ok) {
      const lines = devR.out.split('\n').slice(1)
      const usb = lines.find(l => !l.includes(':') && l.includes('device') && !l.includes('offline'))
      const tcp = lines.find(l =>  l.includes(':') && l.includes('device') && !l.includes('offline'))
      const dev = usb || tcp
      if (dev) serial = dev.trim().split(/\s+/)[0]
    }
  } catch {}

  if (!serial) { notify('🖱️ Control Total', 'No hay tablet conectada'); return }

  // ── Detectar versión scrcpy ─────────────────────────────────────────────────
  const v = await getScrcpyVersion()
  const v21 = v.major > 2 || (v.major === 2 && v.minor >= 1)

  // ── Armar args ──────────────────────────────────────────────────────────────
  const TITLE = 'SyncTablet-Control'
  // Centrar la ventana scrcpy en la pantalla para que el mouse vaya al centro
  const { screen: eScreen } = require('electron')
  const { width: sw, height: sh } = eScreen.getPrimaryDisplay().workAreaSize
  const winW = 400, winH = 300
  const winX = Math.floor((sw - winW) / 2)
  const winY = Math.floor((sh - winH) / 2)
  const args = ['-s', serial, '--window-title', TITLE, '--stay-awake', '--mouse=uhid', '--keyboard=uhid', '--always-on-top']
  if (v21) {
    args.push('--no-video')
    if (noAudio) args.push('--no-audio')
    args.push('--window-x', String(winX), '--window-y', String(winY),
              '--window-width', String(winW), '--window-height', String(winH))
  }
  console.log('[control] scrcpy', args.join(' '))

  // ── Lanzar ──────────────────────────────────────────────────────────────────
  try {
    const { spawn: sp } = require('child_process')
    // Forzar X11/XWayland: sin WAYLAND_DISPLAY scrcpy no intenta Wayland → no crash libdecor-gtk
    const scrcpyEnv = { ...process.env, SDL_VIDEODRIVER: 'x11', SDL_VIDEO_MINIMIZE_ON_FOCUS_LOSS: '0' }
    delete scrcpyEnv.WAYLAND_DISPLAY
    controlProc = sp('scrcpy', args, { detached: false, stdio: ['ignore', 'ignore', 'pipe'], env: scrcpyEnv })

    let stderr = ''
    controlProc.stderr?.on('data', d => {
      stderr += d.toString()
      console.log('[scrcpy]', d.toString().trim())
    })

    controlProc.on('exit', code => {
      console.log('[control] exit', code, stderr.slice(-200))
      _stopHover()
      controlProc = null
      controlActive = false
      if (code !== 0 && stderr) {
        const err = stderr.split('\n').find(l => /error/i.test(l)) || stderr.slice(0, 100)
        notify('scrcpy error', err.trim().slice(0, 100))
      }
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('control-mode-changed', false)
    })
    controlProc.on('error', e => {
      notify('Error scrcpy', e.message)
      controlProc = null; controlActive = false
    })

    // Buscar ventana por nombre o por PID del proceso scrcpy
    const findScrcpyWid = async () => {
      const byName = await runCmd('xdotool', ['search', '--name', TITLE])
      const wid = byName.out?.trim().split('\n').find(l => l.trim().length > 0)
      if (wid) return wid
      // Fallback: buscar por PID (--no-video no siempre expone el título a tiempo)
      if (controlProc?.pid) {
        const byPid = await runCmd('xdotool', ['search', '--pid', String(controlProc.pid)])
        return byPid.out?.trim().split('\n').find(l => l.trim().length > 0) || null
      }
      return null
    }

    const focusWid = async (wid) => {
      try {
        const gr = await runCmd('xdotool', ['getwindowgeometry', '--shell', wid])
        const geo = {}
        gr.out?.split('\n').forEach(l => { const m = l.match(/^(\w+)=(\d+)/); if (m) geo[m[1]] = parseInt(m[2]) })
        const cx = String(geo.X !== undefined ? geo.X + Math.floor(geo.WIDTH/2)  : Math.floor(sw/2))
        const cy = String(geo.X !== undefined ? geo.Y + Math.floor(geo.HEIGHT/2) : Math.floor(sh/2))
        await runCmd('xdotool', ['windowfocus', '--sync', wid])
        await runCmd('xdotool', ['mousemove', cx, cy])
        // Click via XTEST para que Mutter transfiera foco real al surface XWayland
        await runCmd('xdotool', ['click', '--clearmodifiers', '1'])
      } catch {}
    }

    // Sondear hasta que aparezca la ventana (200ms intervals)
    let attempts = 0
    const tryFind = async () => {
      if (!controlProc) return
      attempts++
      const wid = await findScrcpyWid()

      if (wid) {
        controlActive = true
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send('control-mode-changed', true)
        await focusWid(wid)
        _startHover(wid)
        notify('🖱️ Control Total activo', 'Ctrl+U para desactivar')
        return
      }

      if (attempts < 30) setTimeout(tryFind, 200)
      else {
        // Timeout — marcar activo e intentar focus por PID una última vez
        controlActive = true
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send('control-mode-changed', true)
        try {
          const lastWid = await findScrcpyWid()
          if (lastWid) { await focusWid(lastWid); _startHover(lastWid) }
        } catch {}
        notify('🖱️ Control Total', 'Activo')
      }
    }
    setTimeout(tryFind, 400)

  } catch (e) {
    notify('Error', e.message)
  }
}

// ─── IPC: Control Total ───────────────────────────────────────────────────────
ipcMain.handle('toggle-control-mode', async (_, opts = {}) => {
  toggleControlMode(opts)          // no await — responde inmediato
  await new Promise(r => setTimeout(r, 120))
  return { active: controlActive }
})

ipcMain.handle('control-mode-status', () => ({ active: controlActive }))

// ─── Helpers para atajos del sistema ─────────────────────────────────────────
async function registerGnomeShortcut(id, name, binding, command) {
  const base   = '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings'
  const spath  = `${base}/${id}/`
  const schema = `org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:${spath}`

  const r = await runCmd('gsettings', ['get', 'org.gnome.settings-daemon.plugins.media-keys', 'custom-keybindings'])
  let paths = []
  const raw = r.out.trim()
  if (raw && raw !== '@as []' && raw !== '[]') {
    const matches = raw.match(/'([^']+)'/g) || []
    paths = matches.map(m => m.slice(1, -1))
  }
  if (!paths.includes(spath)) paths.push(spath)
  const listStr = '[' + paths.map(p => `'${p}'`).join(', ') + ']'
  await runCmd('gsettings', ['set', 'org.gnome.settings-daemon.plugins.media-keys', 'custom-keybindings', listStr])
  await runCmd('gsettings', ['set', schema, 'name',    name])
  await runCmd('gsettings', ['set', schema, 'command', command])
  await runCmd('gsettings', ['set', schema, 'binding', binding])
}

ipcMain.handle('install-control-script', async () => {
  // Alias legacy — redirige al instalador completo
  return ipcMain.emit('install-system-shortcuts')
})

ipcMain.handle('install-system-shortcuts', async () => {
  try {
    const binDir    = path.join(os.homedir(), '.local', 'bin')
    const cfgPath   = path.join(app.getPath('userData'), 'config.json')
    fs.mkdirSync(binDir, { recursive: true })

    const hasXdo  = (await runCmd('which', ['xdotool'])).ok
    const hasWlP  = (await runCmd('which', ['wl-paste'])).ok
    const missing = []
    if (!hasWlP) missing.push('wl-clipboard (sudo dnf install wl-clipboard)')
    if (!hasXdo) missing.push('xdotool      (sudo dnf install xdotool)')

    // ── Script 1: toggle Control Total ──────────────────────────────────────
    const ctrlScript = path.join(binDir, 'synctablet-control.sh')
    const focusBlock = hasXdo ? `
(
  # Calcular centro de pantalla para mover el mouse ahí
  read SCR_W SCR_H < <(xdotool getdisplaygeometry 2>/dev/null)
  SCR_CX=$(( \${SCR_W:-1920} / 2 ))
  SCR_CY=$(( \${SCR_H:-1080} / 2 ))

  # Esperar hasta 6s a que aparezca la ventana scrcpy
  for _i in $(seq 30); do
    WID=$(xdotool search --name "$TITLE" 2>/dev/null | head -1)
    [ -n "$WID" ] && break
    sleep 0.2
  done
  [ -z "$WID" ] && exit 0

  # Foco inicial + mouse al centro + click XTEST
  xdotool windowfocus --sync "$WID" 2>/dev/null
  xdotool mousemove "$SCR_CX" "$SCR_CY" 2>/dev/null
  xdotool click --clearmodifiers 1 2>/dev/null

  # Segundo intento 2s después por si Mutter tardó en transferir el foco
  sleep 2
  WID2=$(xdotool search --name "$TITLE" 2>/dev/null | head -1)
  [ -n "$WID2" ] && xdotool windowfocus --sync "$WID2" 2>/dev/null
  [ -n "$WID2" ] && xdotool click --clearmodifiers 1 2>/dev/null
) &` : '# xdotool no disponible — el foco lo da el compositor al abrir la ventana'

    fs.writeFileSync(ctrlScript, `#!/usr/bin/env bash
# SyncTablet — Toggle Control Total (generado automáticamente)
TITLE="SyncTablet-Control"

if pgrep -f "scrcpy.*SyncTablet-Control" > /dev/null 2>&1; then
  pkill -f "scrcpy.*SyncTablet-Control" 2>/dev/null
  notify-send -t 2000 "Control Total" "Desactivado"
  exit 0
fi

SERIAL=$(adb devices 2>/dev/null | awk 'NR>1 && /device$/ && !/offline/{print $1; exit}')
if [ -z "$SERIAL" ]; then
  notify-send -t 3000 "Control Total" "No hay tablet conectada"
  exit 1
fi

# Centrar la ventana scrcpy en la pantalla
read SCR_W SCR_H < <(xdotool getdisplaygeometry 2>/dev/null || echo "1920 1080")
WIN_W=400; WIN_H=300
WIN_X=$(( (SCR_W - WIN_W) / 2 ))
WIN_Y=$(( (SCR_H - WIN_H) / 2 ))

# XWayland: sin WAYLAND_DISPLAY scrcpy usa X11 y no crashea con libdecor-gtk
env -u WAYLAND_DISPLAY SDL_VIDEODRIVER=x11 DISPLAY="\${DISPLAY:-:0}" \\
  scrcpy -s "$SERIAL" --window-title "$TITLE" \\
  --stay-awake --mouse=uhid --keyboard=uhid --no-video --no-audio --always-on-top \\
  --window-x "$WIN_X" --window-y "$WIN_Y" --window-width "$WIN_W" --window-height "$WIN_H" &
SCRCPY_PID=$!
notify-send -t 2000 "Control Total" "Activado — Ctrl+U para desactivar"
${focusBlock}
`, { mode: 0o755 })

    // ── Script 2: pegar clipboard en la tablet ───────────────────────────────
    const pasteScript = path.join(binDir, 'synctablet-paste.sh')
    fs.writeFileSync(pasteScript, `#!/usr/bin/env bash
# SyncTablet — Pegar clipboard a la tablet (generado automáticamente)
CONFIG="${cfgPath}"
METHOD="syncthing"
DROP_FOLDER="$HOME/Drop"
BT_MAC=""

if [ -f "$CONFIG" ] && command -v python3 &>/dev/null; then
  METHOD=$(python3 -c "import json; d=json.load(open('${cfgPath}')); print(d.get('paste_method','syncthing'))" 2>/dev/null || echo "syncthing")
  DROP_FOLDER=$(python3 -c "import json,os; d=json.load(open('${cfgPath}')); print(os.path.expanduser(d.get('drop_folder','~/Drop')))" 2>/dev/null || echo "$HOME/Drop")
  BT_MAC=$(python3 -c "import json; d=json.load(open('${cfgPath}')); print(d.get('bt_mac',''))" 2>/dev/null || echo "")
  KDE_DEVICE=$(python3 -c "import json; d=json.load(open('${cfgPath}')); print(d.get('kde_device_id',''))" 2>/dev/null || echo "")
fi

TS=$(date +%Y%m%dT%H%M%S)
TMP="" PRE="" EXT=""

if wl-paste --type image/png > "/tmp/stab_\${TS}.png" 2>/dev/null && [ -s "/tmp/stab_\${TS}.png" ]; then
  TMP="/tmp/stab_\${TS}.png"; PRE="captura"; EXT="png"
elif TEXT=$(wl-paste --no-newline 2>/dev/null) && [ -n "$TEXT" ]; then
  printf '%s' "$TEXT" > "/tmp/stab_\${TS}.txt"
  TMP="/tmp/stab_\${TS}.txt"; PRE="nota"; EXT="txt"
else
  notify-send -t 2000 "SyncTablet" "Clipboard vacío — no hay imagen ni texto"
  exit 0
fi

case "$METHOD" in
  usb)
    SERIAL=$(adb devices 2>/dev/null | awk 'NR>1 && /device$/ && !/offline/{print $1; exit}')
    if [ -z "$SERIAL" ]; then
      notify-send -t 3000 "Sin tablet" "Conecta la tablet por USB o Wi-Fi"
    else
      REMOTE="/sdcard/Download/\${PRE}_\${TS}.\${EXT}"
      adb -s "$SERIAL" push "$TMP" "$REMOTE" 2>/dev/null && \\
      adb -s "$SERIAL" shell am broadcast \\
        -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \\
        -d "file://\${REMOTE}" 2>/dev/null && \\
      notify-send -t 2000 "✓ Enviado" "Guardado en Descargas de la tablet"
    fi ;;
  bluetooth)
    # Usar el dispositivo configurado; si no hay, tomar el primero pareado
    if [ -z "$BT_MAC" ]; then
      BT_MAC=$(bluetoothctl devices Paired 2>/dev/null | grep -oP '(?<=Device )[0-9A-F:]{17}' | head -1)
    fi
    BT_NAME=$(bluetoothctl info "$BT_MAC" 2>/dev/null | awk '/Name:/{print $2}')
    if [ -z "$BT_MAC" ]; then
      notify-send -t 3000 "Sin Bluetooth" "Configura un dispositivo en SyncTablet → Config"
    else
      bluetooth-sendto --device="$BT_MAC" "$TMP" 2>/dev/null && \\
      notify-send -t 2000 "✓ Enviado" "Bluetooth → \${BT_NAME:-$BT_MAC}"
    fi ;;
  kdeconnect)
    # Si no hay device_id en config, buscar el primero disponible
    if [ -z "$KDE_DEVICE" ]; then
      KDE_DEVICE=$(kdeconnect-cli --list-available --id-only 2>/dev/null | head -1 | tr -d '[:space:]')
    fi
    if [ -z "$KDE_DEVICE" ]; then
      notify-send -t 3000 "KDE Connect" "Sin dispositivos disponibles. Abre KDE Connect en la tablet."
    else
      if kdeconnect-cli -d "$KDE_DEVICE" --share "file://\${TMP}" 2>/dev/null; then
        notify-send -t 2000 "✓ Enviado" "KDE Connect OK"
      else
        notify-send -t 3000 "✗ KDE Connect" "Error al enviar. Comprueba que la tablet esté en la misma red."
      fi
    fi ;;
  *)
    mkdir -p "$DROP_FOLDER"
    cp "$TMP" "$DROP_FOLDER/\${PRE}_\${TS}.\${EXT}" && \\
    notify-send -t 2000 "✓ Enviado" "\${PRE}_\${TS}.\${EXT} — Syncthing lo sincroniza" ;;
esac
rm -f "$TMP"
`, { mode: 0o755 })

    // ── Registrar en GNOME como atajos del sistema ───────────────────────────
    await registerGnomeShortcut('synctablet-ctrl-u', 'SyncTablet Control Total',  '<Control>u',           ctrlScript)
    await registerGnomeShortcut('synctablet-paste',  'SyncTablet Pegar Clipboard', '<Control><Shift>v',    pasteScript)

    return { ok: true, ctrlScript, pasteScript, missing }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})


// Cargar config de forma síncrona (para usar dentro del shortcut)
function loadConfigSync() {
  try {
    if (fs.existsSync(CONFIG_PATH))
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch {}
  return { drop_folder: '~/Drop' }
}

async function getFirstAdbDevice() {
  try {
    const r = await runCmd('adb', ['devices', '-l'])
    if (!r.ok) return null
    const line = r.out.split('\n').slice(1).find(l => l.includes('device') && !l.includes('offline') && l.trim().length > 0)
    return line ? line.trim().split(/\s+/)[0] : null
  } catch { return null }
}

function getFirstBtDevice() {
  return new Promise(resolve => {
    execFile('bluetoothctl', ['devices', 'Paired'], (err, stdout) => {
      if (err) { resolve(null); return }
      const m = stdout.match(/^Device\s+([0-9A-F:]{17})/im)
      resolve(m ? m[1] : null)
    })
  })
}

function notify(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: false }).show()
  }
}


// ─── IPC: Abrir Syncthing en ventana hija (funciona en AppImage) ──────────────
ipcMain.handle('open-syncthing-window', async () => {
  // Si ya está abierta, solo enfocarla
  if (syncthingWindow && !syncthingWindow.isDestroyed()) {
    syncthingWindow.focus()
    return { ok: true }
  }

  syncthingWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    title: 'Syncthing',
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      sandbox: false,
    },
    backgroundColor: '#ffffff',
    show: false,
  })

  // Quitar headers restrictivos para esta ventana también
  syncthingWindow.webContents.session.webRequest.onHeadersReceived(
    { urls: ['http://127.0.0.1:8384/*'] },
    (details, callback) => {
      const headers = { ...details.responseHeaders }
      delete headers['x-frame-options']
      delete headers['X-Frame-Options']
      delete headers['content-security-policy']
      delete headers['Content-Security-Policy']
      callback({ responseHeaders: headers })
    }
  )

  // Links externos desde Syncthing → navegador del sistema
  syncthingWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  syncthingWindow.loadURL('http://127.0.0.1:8384')

  syncthingWindow.once('ready-to-show', () => {
    syncthingWindow.show()
  })

  syncthingWindow.on('closed', () => {
    syncthingWindow = null
  })

  return { ok: true }
})

app.on('before-quit', async () => {
  app.isQuitting = true
  globalShortcut.unregisterAll()

  await cleanupRuntime({
    killCurrentPortOwner: false,
  })
})

process.on('uncaughtException', async (err) => {
  console.error('[fatal] uncaughtException:', err)

  if (err?.code === 'EADDRINUSE') {
    console.error('[webTransfer] Puerto ocupado. No cerraré toda la app.')
    return
  }

  await cleanupRuntime({
    killCurrentPortOwner: false,
  })

  app.exit(1)
})

process.on('unhandledRejection', async (reason) => {
  console.error('[fatal] unhandledRejection:', reason)

  await cleanupRuntime({
    killCurrentPortOwner: false,
  })

  app.exit(1)
})

app.on('window-all-closed', () => {
  // En Linux/Windows no salir al cerrar la última ventana — quedamos en tray
  // Solo salimos si app.isQuitting = true (desde el menú del tray)
  if (process.platform === 'darwin') app.quit()
})


function runDetached(cmd, args = []) {
  try {
    const p = spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
    })

    p.unref()
    return true
  } catch (err) {
    console.error(`[cleanup] Error ejecutando ${cmd}:`, err.message)
    return false
  }
}

function getPidUsingPort(port) {
  try {
    const out = execSync(`ss -ltnp | grep ':${port}' || true`, {
      encoding: 'utf8',
    })

    console.log(`[cleanup] ss puerto ${port}:`)
    console.log(out || `[cleanup] Puerto ${port} libre`)

    const match = out.match(/pid=(\d+)/)

    if (!match) return null

    return Number(match[1])
  } catch (err) {
    console.error('[cleanup] Error revisando puerto:', err.message)
    return null
  }
}

async function cleanupRuntime({ killCurrentPortOwner = false } = {}) {
  console.log('[cleanup] Iniciando limpieza runtime...')

  try {
    await webTransfer?.stop()
    console.log('[cleanup] webTransfer detenido')
  } catch (err) {
    console.error('[cleanup] Error deteniendo webTransfer:', err.message)
  }

  // Mata solo pruebas externas. No mata la AppImage.
  runDetached('pkill', ['-f', 'node index.js'])

  // Revisa puerto 7891.
  const pid = getPidUsingPort(7891)

  if (pid && killCurrentPortOwner && pid !== process.pid) {
    console.log(`[cleanup] Matando PID ${pid} que ocupa 7891`)
    try {
      process.kill(pid, 'SIGKILL')
    } catch (err) {
      console.error('[cleanup] No pude matar PID del puerto:', err.message)
    }
  }

  getPidUsingPort(7891)
}
function getPortOwnerPid(port) {
  try {
    const out = execSync(`ss -ltnp | grep ':${port}' || true`, {
      encoding: 'utf8',
    })

    if (out) {
      console.log(`[port-check] Puerto ${port}:`)
      console.log(out)
    }

    const match = out.match(/pid=(\d+)/)
    return match ? Number(match[1]) : null
  } catch {
    return null
  }
}

async function killOldPortOwner(port) {
  const pid = getPortOwnerPid(port)

  if (!pid) {
    console.log(`[port-check] Puerto ${port} libre`)
    return
  }

  if (pid === process.pid) {
    console.log(`[port-check] Puerto ${port} pertenece a este proceso`)
    return
  }

  console.warn(`[port-check] Matando proceso viejo en puerto ${port}: PID ${pid}`)

  try {
    process.kill(pid, 'SIGTERM')
  } catch {}

  await new Promise(resolve => setTimeout(resolve, 700))

  const stillThere = getPortOwnerPid(port)

  if (stillThere && stillThere !== process.pid) {
    console.warn(`[port-check] Forzando kill -9 a PID ${stillThere}`)

    try {
      process.kill(stillThere, 'SIGKILL')
    } catch {}
  }
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function runCmd(cmd, args = [], spawnOpts = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { shell: false, ...spawnOpts })
    let out = '', err = ''
    proc.stdout.on('data', d => { out += d.toString() })
    proc.stderr.on('data', d => { err += d.toString() })
    proc.on('close', code => resolve({ ok: code === 0, out: (out + err).trim() }))
    proc.on('error', e => resolve({ ok: false, out: e.message }))
  })
}

function kdeEnv() {
  const uid = process.getuid ? process.getuid() : 1000
  return {
    ...process.env,
    DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS ||
      `unix:path=/run/user/${uid}/bus`,
    DISPLAY: process.env.DISPLAY || ':0',
  }
}
function runKde(args) { return runCmd('kdeconnect-cli', args, { env: kdeEnv() }) }

function which(bin) {
  try {
    execSync(`which ${bin}`, { stdio: 'ignore' })
    return true
  } catch { return false }
}

ipcMain.handle('runtime-cleanup', async () => {
  await cleanupRuntime({
    killCurrentPortOwner: true,
  })

  return {
    ok: true,
  }
})
// ─── IPC: Verificar dependencias ──────────────────────────────────────────────
ipcMain.handle('check-deps', async () => {
  const results = {}
  const tools = ['adb', 'scrcpy', 'syncthing', 'xdotool', 'wl-paste', 'gphoto2', 'kdeconnect-cli']
  for (const t of tools) {
    const found = which(t)
    let version = ''
    if (found) {
      const vArgs = t === 'adb' ? ['version'] : ['--version']
      try { const r = await runCmd(t, vArgs); version = r.out.split('\n')[0].slice(0, 60) } catch {}
    }
    results[t] = { found, version }
  }
  return results
})

// ─── IPC: Estado completo del dispositivo (batería, WiFi, storage, RAM) ───────
function _parseBattery(out) {
  return {
    level:       parseInt(out.match(/level:\s*(\d+)/)?.[1]) || 0,
    charging:    out.match(/status:\s*(\d+)/)?.[1] === '2',
    temperature: ((parseInt(out.match(/temperature:\s*(\d+)/)?.[1]) || 0) / 10).toFixed(1),
    usb:         out.includes('USB powered: true'),
    ac:          out.includes('AC powered: true'),
    health:      { 2:'Buena',3:'Sobrecalentada',4:'Muerta',5:'Sobre voltaje',7:'Fría' }[out.match(/health:\s*(\d+)/)?.[1]] || '—',
  }
}
function _parseMemory(out) {
  const total = parseInt(out.match(/MemTotal:\s+(\d+)/)?.[1]) || 0
  const avail = parseInt(out.match(/MemAvailable:\s+(\d+)/)?.[1]) || 0
  return { totalMB: Math.round(total/1024), usedMB: Math.round((total-avail)/1024), pct: total ? Math.round(((total-avail)/total)*100) : 0 }
}
function _parseStorage(out) {
  const line = out.split('\n').find(l => l.includes('/sdcard') || l.includes('fuse'))
  if (!line) return null
  const p = line.trim().split(/\s+/)
  const total = parseInt(p[1])||0, used = parseInt(p[2])||0, avail = parseInt(p[3])||0
  return { totalGB: (total/1024/1024).toFixed(1), usedGB: (used/1024/1024).toFixed(1), availGB: (avail/1024/1024).toFixed(1), pct: total ? Math.round((used/total)*100) : 0 }
}
function _parseWifi(out) {
  const ssid  = out.match(/SSID:\s*(.+)/)?.[1]?.trim().replace(/^"(.*)"$/, '$1')
  const rssi  = out.match(/RSSI:\s*(-?\d+)/)?.[1]
  const ip    = out.match(/ip_address\s+(\d+\.\d+\.\d+\.\d+)/)?.[1]
  const speed = out.match(/link_speed\s+(\d+)/)?.[1]
  return { ssid: ssid || null, rssi: rssi ? parseInt(rssi) : null, ip: ip || null, speed: speed || null }
}
function _parseProp(out) {
  const get = k => out.match(new RegExp(`\\[${k}\\]:\\s*\\[(.*)\\]`))?.[1]
  return { model: get('ro.product.model')||'—', brand: get('ro.product.brand')||'—', android: get('ro.build.version.release')||'—', sdk: get('ro.build.version.sdk')||'—' }
}

ipcMain.handle('adb-device-status', async (_, { serial }) => {
  const adb = serial ? ['-s', serial] : []
  const [battR, memR, storR, wifiR, propR] = await Promise.all([
    runCmd('adb', [...adb, 'shell', 'dumpsys', 'battery']),
    runCmd('adb', [...adb, 'shell', 'cat', '/proc/meminfo']),
    runCmd('adb', [...adb, 'shell', 'df', '/sdcard']),
    runCmd('adb', [...adb, 'shell', 'dumpsys', 'wifi']),
    runCmd('adb', [...adb, 'shell', 'getprop']),
  ])
  return {
    ok: battR.ok,
    battery: _parseBattery(battR.out),
    memory:  _parseMemory(memR.out),
    storage: _parseStorage(storR.out),
    wifi:    _parseWifi(wifiR.out),
    device:  _parseProp(propR.out),
  }
})

// ─── IPC: KDE Connect ─────────────────────────────────────────────────────────
function _parseKdeDevices(out) {
  return (out || '').split('\n')
    .map(l => l.trim()).filter(Boolean)
    .map(l => {
      const space = l.indexOf(' ')
      if (space === -1) return null
      return { id: l.slice(0, space).trim(), name: l.slice(space + 1).trim() }
    }).filter(Boolean)
}

ipcMain.handle('kdeconnect-list', async () => {
  if (!which('kdeconnect-cli')) return { ok: false, error: 'not_installed' }
  const [allR, availR] = await Promise.all([
    runKde(['--list-devices', '--id-name-only']),
    runKde(['--list-available', '--id-name-only']),
  ])
  const allDevices  = _parseKdeDevices(allR.out)
  const availIds    = new Set(_parseKdeDevices(availR.out).map(d => d.id))
  const devices     = allDevices.map(d => ({ ...d, reachable: availIds.has(d.id) }))
  return { ok: true, devices }
})

ipcMain.handle('kdeconnect-share', async (_, { deviceId, filePath }) => {
  if (!which('kdeconnect-cli')) return { ok: false, error: 'not_installed' }
  const r = await runKde(['-d', deviceId, '--share', `file://${filePath}`])
  return { ok: r.ok, out: r.out }
})

ipcMain.handle('kdeconnect-clipboard', async (_, { deviceId, text }) => {
  if (!which('kdeconnect-cli')) return { ok: false, error: 'not_installed' }
  const r = await runKde(['-d', deviceId, '--share-text', text])
  return { ok: r.ok, out: r.out }
})

ipcMain.handle('kdeconnect-ping', async (_, { deviceId, msg }) => {
  if (!which('kdeconnect-cli')) return { ok: false, error: 'not_installed' }
  const args = ['-d', deviceId]
  if (msg) { args.push('--ping-msg'); args.push(msg) } else { args.push('--ping') }
  const r = await runKde(args)
  return { ok: r.ok, out: r.out }
})

ipcMain.handle('kdeconnect-ring', async (_, { deviceId }) => {
  if (!which('kdeconnect-cli')) return { ok: false, error: 'not_installed' }
  const r = await runKde(['-d', deviceId, '--ring'])
  return { ok: r.ok, out: r.out }
})

ipcMain.handle('kdeconnect-refresh', async () => {
  if (!which('kdeconnect-cli')) return { ok: false, error: 'not_installed' }
  const r = await runKde(['--refresh'])
  return { ok: r.ok }
})

ipcMain.handle('kdeconnect-sms', async (_, { deviceId, number, text }) => {
  if (!which('kdeconnect-cli')) return { ok: false, error: 'not_installed' }
  if (!number || !text) return { ok: false, error: 'missing_params' }
  const r = await runCmd('kdeconnect-cli', ['-d', deviceId, '--send-sms', text, '--destination', number])
  return { ok: r.ok, out: r.out }
})

ipcMain.handle('kdeconnect-open-app', async () => {
  const apps = ['kdeconnect-app', 'kdeconnect-indicator']
  for (const app of apps) {
    if (which(app)) { spawn(app, [], { detached: true, stdio: 'ignore' }).unref(); return { ok: true, app } }
  }
  spawn('xdg-open', ['kdeconnect://'], { detached: true, stdio: 'ignore' }).unref()
  return { ok: true, app: 'xdg-open' }
})

// ─── IPC: ADB ─────────────────────────────────────────────────────────────────
ipcMain.handle('adb-devices', async () => {
  const r = await runCmd('adb', ['devices', '-l'])
  if (!r.ok) return []
  const devices = []
  for (const line of r.out.split('\n').slice(1)) {
    const l = line.trim()
    if (!l) continue
    const parts = l.split(/\s+/)
    if (parts.length >= 2 && ['device','unauthorized','offline'].includes(parts[1])) {
      const serial = parts[0]
      const model  = parts.find(p => p.startsWith('model:'))?.split(':')[1]?.replace(/_/g,' ') || ''
      devices.push({ serial, status: parts[1], model: model || serial })
    }
  }
  return devices
})

ipcMain.handle('adb-tcpip', async (_, port) => {
  return runCmd('adb', ['tcpip', port])
})

ipcMain.handle('adb-connect', async (_, addr) => {
  return runCmd('adb', ['connect', addr])
})

// ─── IPC: adb pair (código manual) ───────────────────────────────────────────
ipcMain.handle('adb-pair', async (_, { addr, code }) => {
  return runCmd('adb', ['pair', addr, code])
})



function parseOpenTcpPorts(nmapOut) {
  return String(nmapOut || '')
    .split('\n')
    .map(line => line.trim())
    .map(line => {
      const m = line.match(/^(\d+)\/tcp\s+open\b/)
      return m ? Number(m[1]) : null
    })
    .filter(Boolean)
}

async function adbDeviceIsReady(serial) {
  const r = await runCmd('adb', ['devices', '-l'])
  const lines = String(r.out || '').split('\n').map(l => l.trim())

  return lines.some(line => {
    return line.startsWith(serial) && /\sdevice\b/.test(line)
  })
}

async function tryAdbConnectTarget(target) {
  await runCmd('adb', ['disconnect', target])

  const r = await runCmd('adb', ['connect', target])
  await new Promise(resolve => setTimeout(resolve, 350))

  const ready = await adbDeviceIsReady(target)

  return {
    ok: ready,
    target,
    out: r.out,
  }
}

ipcMain.handle('adb-wireless-pair-connect', async (_, {
  ip,
  pairPort,
  code,
  scanStart = 30000,
  scanEnd = 50000,
}) => {
  const cleanIp = String(ip || '').trim()
  const cleanPairPort = String(pairPort || '').trim()
  const cleanCode = String(code || '').trim()

  if (!cleanIp || !cleanPairPort || !cleanCode) {
    return {
      ok: false,
      error: 'Faltan IP, puerto de pairing o código',
    }
  }

  const pairAddr = `${cleanIp}:${cleanPairPort}`

  // 1. Emparejar
  const pair = await runCmd('adb', ['pair', pairAddr, cleanCode])

  const paired =
    pair.ok ||
    /Successfully paired|Already paired|already/i.test(pair.out || '')

  if (!paired) {
    return {
      ok: false,
      step: 'pair',
      pairAddr,
      out: pair.out,
      error: pair.out || 'Error ejecutando adb pair',
    }
  }

  // 2. Escanear puertos abiertos en la tablet
  const range = `${Number(scanStart)}-${Number(scanEnd)}`
  const scan = await runCmd('nmap', ['-p', range, '--open', cleanIp])

  if (!scan.ok && !scan.out) {
    return {
      ok: false,
      step: 'scan',
      error: 'No pude ejecutar nmap. Instala nmap o revisa PATH.',
    }
  }

  let ports = parseOpenTcpPorts(scan.out)

  // Excluir puerto de pairing para no intentar conectar ahí
  ports = ports.filter(p => String(p) !== cleanPairPort)

  if (!ports.length) {
    return {
      ok: false,
      step: 'scan',
      pairAddr,
      scanOut: scan.out,
      error: 'No encontré puertos abiertos de conexión ADB',
    }
  }

  // 3. Probar adb connect en cada puerto abierto
  const tried = []

  for (const port of ports) {
    const target = `${cleanIp}:${port}`
    const result = await tryAdbConnectTarget(target)
    tried.push(result)

    if (result.ok) {
      return {
        ok: true,
        serial: target,
        ip: cleanIp,
        port,
        pairAddr,
        tried,
        scanOut: scan.out,
      }
    }
  }

  return {
    ok: false,
    step: 'connect',
    pairAddr,
    ports,
    tried,
    scanOut: scan.out,
    error: 'Encontré puertos abiertos, pero ninguno quedó como device',
  }
})
// ─── IPC: QR pairing via mDNS ────────────────────────────────────────────────
// Genera nombre+password aleatorio, anuncia servicio _adb-tls-pairing._tcp
// via bonjour-service. El teléfono escanea el QR y se conecta solo.
// Devuelve { qrText, name, password, port } para que el frontend dibuje el QR.
ipcMain.handle('adb-qr-start', async () => {
  // Limpiar sesión anterior
  if (_qrPairSession) {
    clearInterval(_qrPairSession.pollInterval)
    _qrPairSession = null
  }

  // Verificar que adb tiene mdns
  const mdnsCheck = await runCmd('adb', ['mdns', 'check'])
  if (!mdnsCheck.ok || mdnsCheck.out?.includes('ERROR') || mdnsCheck.out?.includes('not found')) {
    return { ok: false, error: 'adb mdns no disponible. Necesitás adb 30+ y Android 11+.\n' + (mdnsCheck.out || '') }
  }

  // Generar credenciales — el QR usa el formato que Android espera
  const name     = 'studio-' + crypto.randomBytes(4).toString('hex')
  const password = crypto.randomInt(100000, 999999).toString()
  const port     = Math.floor(Math.random() * 2000) + 37000

  // Este es el QR que Android escanea desde Depuración inalámbrica → Vincular con QR
  const qrText = `WIFI:T:ADB;S:${name};P:${password};;`

  // El daemon adb escucha en ese puerto via mdns automáticamente cuando
  // la tablet escanea el QR. Solo necesitamos anunciar el servicio.
  let announceOk = false
  if (Bonjour) {
    try {
      const bonjour = new Bonjour()
      const service = bonjour.publish({
        name,
        type: 'adb-tls-pairing',
        protocol: 'tcp',
        port,
        txt: {}
      })
      _qrPairSession = { bonjour, service, name, password, port, qrText, paired: false }
      announceOk = true
    } catch (e) {
      console.error('[QR] Bonjour error:', e.message)
    }
  }

  if (!_qrPairSession) {
    _qrPairSession = { name, password, port, qrText, paired: false }
  }

  return { ok: true, qrText, name, password, port, mdnsOut: mdnsCheck.out }
})

ipcMain.handle('adb-qr-stop', async () => {
  if (_qrPairSession) {
    try { _qrPairSession.service?.stop() } catch {}
    try { _qrPairSession.bonjour?.destroy() } catch {}
    clearInterval(_qrPairSession.pollInterval)
    _qrPairSession = null
  }
  return { ok: true }
})

ipcMain.handle('adb-qr-poll', async () => {
  if (!_qrPairSession) return { ok: false, error: 'Sin sesion activa' }
  if (_qrPairSession.paired) return { paired: true, serial: _qrPairSession.serial }

  const { name, password } = _qrPairSession

  const mdns = await runCmd('adb', ['mdns', 'services'])
  if (!mdns.ok) return { paired: false, error: mdns.out }

  const lines = (mdns.out || '').split('\n').filter(l => l.trim())

  // Paso 1: ejecutar adb pair UNA SOLA VEZ cuando vemos nuestro servicio de pairing
  if (!_qrPairSession.pairAttempted) {
    for (const line of lines) {
      if (line.includes(name) && line.includes('_adb-tls-pairing')) {
        const parts = line.trim().split(/\s+/)
        const addr = parts[parts.length - 1]
        if (addr && addr.includes(':')) {
          console.log('[QR] Ejecutando adb pair', addr)
          _qrPairSession.pairAttempted = true
          const pairResult = await runCmd('adb', ['pair', addr, password])
          console.log('[QR] adb pair result:', pairResult.out, pairResult.err)
          // "Success" o "Successfully paired" = ok aunque venga con error de protocolo
          const pairOk = (pairResult.out || '').includes('Success') ||
                         (pairResult.err || '').includes('Success') ||
                         pairResult.ok
          if (pairOk) {
            _qrPairSession.pairDone = true
            console.log('[QR] Pairing completado, esperando _adb-tls-connect...')
          } else {
            console.log('[QR] Pairing fallo:', pairResult.out, pairResult.err)
          }
        }
        break // solo intentar una vez
      }
    }
  }

  // Paso 2: buscar _adb-tls-connect SOLO si ya hicimos pair exitoso
  // NO intentar conectar al puerto de pairing (_adb-tls-pairing)
  if (_qrPairSession.pairDone) {
    for (const line of lines) {
      if (line.includes('_adb-tls-connect')) {
        const parts = line.trim().split(/\s+/)
        const addr = parts[parts.length - 1]
        if (addr && addr.includes(':') && addr !== _qrPairSession.lastConnectAttempt) {
          _qrPairSession.lastConnectAttempt = addr
          console.log('[QR] Conectando a', addr)
          const cr = await runCmd('adb', ['connect', addr])
          console.log('[QR] adb connect result:', cr.out)
          if ((cr.out || '').includes('connected')) {
            _qrPairSession.paired = true
            _qrPairSession.serial = addr
            try { _qrPairSession.service?.stop() } catch {}
            try { _qrPairSession.bonjour?.destroy() } catch {}
            return { paired: true, serial: addr, out: cr.out }
          }
        }
      }
    }
  }

  // Paso 3: verificar adb devices por si ya apareció sin que lo detectemos
  const devs = await runCmd('adb', ['devices'])
  if (devs.ok && devs.out) {
    for (const line of devs.out.split('\n').slice(1)) {
      if (line.includes('\tdevice')) {
        const serial = line.split('\t')[0].trim()
        if (serial && serial.includes(':') && serial.includes('.')) {
          _qrPairSession.paired = true
          _qrPairSession.serial = serial
          try { _qrPairSession.service?.stop() } catch {}
          try { _qrPairSession.bonjour?.destroy() } catch {}
          return { paired: true, serial, out: devs.out }
        }
      }
    }
  }

  return {
    paired: false,
    pairAttempted: !!_qrPairSession.pairAttempted,
    pairDone: !!_qrPairSession.pairDone,
  }
})


// ─── IPC: scrcpy ──────────────────────────────────────────────────────────────
// ─── Helper: limpiar conexiones TCP/IP offline antes de lanzar scrcpy ──────────
async function cleanOfflineTcpConnections() {
  // Obtener lista de dispositivos
  const r = await runCmd('adb', ['devices', '-l'])
  if (!r.ok) return

  const lines = r.out.split('\n').slice(1)
  for (const line of lines) {
    const l = line.trim()
    if (!l) continue
    // Desconectar solo los TCP/IP que estén offline
    // Un serial TCP/IP contiene ':' (ej: 172.24.65.242:5555)
    const parts = l.split(/\s+/)
    if (parts.length >= 2 && parts[1] === 'offline' && parts[0].includes(':')) {
      console.log(`Desconectando TCP/IP offline: ${parts[0]}`)
      await runCmd('adb', ['disconnect', parts[0]])
    }
  }
}

// ── Detectar versión scrcpy (cached) ────────────────────────────────────────
let _scrcpyVersion = null
async function getScrcpyVersion() {
  if (_scrcpyVersion) return _scrcpyVersion
  try {
    const r = await runCmd('scrcpy', ['--version'])
    const m = (r.out || '').match(/(\d+)\.(\d+)/)
    _scrcpyVersion = m ? { major: parseInt(m[1]), minor: parseInt(m[2]) } : { major: 1, minor: 0 }
  } catch { _scrcpyVersion = { major: 1, minor: 0 } }
  console.log('[scrcpy] version:', _scrcpyVersion)
  return _scrcpyVersion
}


ipcMain.handle('launch-scrcpy', async (_, {
  serial, fullscreen, noClip, windowWidth, windowHeight,
  turnScreenOff, noAudio, audioOnly, stayAwake,
  maxFps, bitrate, startApp, windowTitle, mouseMode, keyboardMode,
}) => {
  await cleanOfflineTcpConnections()
  const v = await getScrcpyVersion()
  const v2  = v.major >= 2
  const v21 = v.major > 2 || (v.major === 2 && v.minor >= 1)
  const v24 = v.major > 2 || (v.major === 2 && v.minor >= 4)
  const args = []

  if (serial) {
    args.push('-s', serial)
  } else {
    const devR = await runCmd('adb', ['devices', '-l'])
    if (devR.ok) {
      const devLines = devR.out.split('\n').slice(1)
      const tcpDev = devLines.find(l => l.includes(':') && l.includes('device') && !l.includes('offline'))
      const usbDev = devLines.find(l => !l.includes(':') && l.includes('device') && !l.includes('offline'))
      if (tcpDev) args.push('-s', tcpDev.trim().split(/\s+/)[0])
      else if (usbDev) args.push('-s', usbDev.trim().split(/\s+/)[0])
    }
  }

  if (fullscreen) args.push('--fullscreen')
  if (audioOnly && v21) args.push('--no-video')
  if (!fullscreen && windowWidth && windowHeight) {
    args.push('--max-size', String(windowHeight), '--window-width', String(windowWidth),
              '--window-height', String(windowHeight), '--window-x', '50', '--window-y', '50')
  }
  if (bitrate) args.push(v2 ? `--video-bit-rate=${bitrate}M` : '--bit-rate', v2 ? undefined : `${bitrate}M`)
  if (maxFps && maxFps !== 60) args.push(v2 ? `--max-fps=${maxFps}` : '--max-fps', v2 ? undefined : String(maxFps))
if (noAudio) args.push(v21 ? '--no-audio' : '--no-playback-audio')
  if (noClip && v2) args.push('--no-clipboard-autosync')
  if (turnScreenOff) args.push('--turn-screen-off')
  if (stayAwake) args.push('--stay-awake')
  if (mouseMode && v21) args.push(`--mouse=${mouseMode}`)
  if (keyboardMode && v21) args.push(`--keyboard=${keyboardMode}`)
  if (startApp && startApp.trim()) {
    if (v24) args.push(`--start-app=${startApp.trim()}`)
    else { try { await runCmd('adb', ['-s', serial||'', 'shell', 'monkey', '-p', startApp.trim(), '-c', 'android.intent.category.LAUNCHER', '1']) } catch {} }
  }
  if (windowTitle) args.push(`--window-title=${windowTitle}`)
  const finalArgs = args.filter(Boolean)
  console.log(`[scrcpy v${v.major}.${v.minor}]`, finalArgs.join(' '))

  return new Promise((resolve) => {
    const _scrcpyEnv = { ...process.env, SDL_VIDEODRIVER: 'x11', SDL_VIDEO_MINIMIZE_ON_FOCUS_LOSS: '0' }
    delete _scrcpyEnv.WAYLAND_DISPLAY
    const proc = spawn('scrcpy', finalArgs, { detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: _scrcpyEnv })
    let errOut = ''
    proc.stderr?.on('data', d => { errOut += d.toString() })
    const timer = setTimeout(() => { proc.unref(); resolve({ ok: true, args: finalArgs, version: `${v.major}.${v.minor}` }) }, 1500)
    proc.on('exit', code => {
      clearTimeout(timer)
      if (code !== 0 && code !== null) resolve({ ok: false, out: errOut || `exit ${code}`, args: finalArgs })
      else resolve({ ok: true, args: finalArgs, version: `${v.major}.${v.minor}` })
    })
    proc.on('error', e => { clearTimeout(timer); resolve({ ok: false, out: e.message, args: finalArgs }) })
  })
})

// ─── IPC: scrcpy --tcpip directo (Setup) ─────────────────────────────────────
ipcMain.handle('launch-scrcpy-tcpip', async () => {
  // Limpiar conexiones offline también aquí
  await cleanOfflineTcpConnections()
  try {
    const proc = spawn('scrcpy', ['--tcpip'], { detached: true, stdio: 'ignore' })
    proc.unref()
    return { ok: true }
  } catch (e) {
    return { ok: false, out: e.message }
  }
})

// ─── IPC: Desconectar dispositivo TCP/IP específico ───────────────────────────
ipcMain.handle('adb-disconnect', async (_, serial) => {
  if (serial) return runCmd('adb', ['disconnect', serial])
  return runCmd('adb', ['disconnect'])
})

// ─── IPC: Syncthing ───────────────────────────────────────────────────────────
ipcMain.handle('start-syncthing', async () => {
  if (syncProc) return { ok: true, out: 'ya corriendo' }
  startSyncthing()
  return { ok: !!findSyncthing(), bin: findSyncthing() || 'no encontrado' }
})

ipcMain.handle('syncthing-status', async () => {
  return { running: syncProc !== null }
})

// Lee la API key directamente del config.xml de Syncthing

// Proxy para llamadas a la API de Syncthing (evita CORS)

// ─── IPC: Clipboard image ─────────────────────────────────────────────────────
ipcMain.handle('paste-image', async (_, folder) => {
  try {
    // Intentar imagen del clipboard
    const img = clipboard.readImage()
    if (!img || img.isEmpty()) {
      // Intentar texto (para pegar texto normal)
      const text = clipboard.readText()
      return { ok: false, type: 'none', text: text || '' }
    }

    // Guardar como PNG en /tmp
    const ts   = new Date().toISOString().replace(/[:.]/g,'').slice(0,15)
    const tmp  = path.join(os.tmpdir(), `captura_${ts}.png`)
    const png  = img.toPNG()
    fs.writeFileSync(tmp, png)

    // Copiar directamente a Drop si se da carpeta
    if (folder) {
      const dir  = folder.replace('~', os.homedir())
      const dest = path.join(dir, `captura_${ts}.png`)
      fs.mkdirSync(dir, { recursive: true })
      fs.copyFileSync(tmp, dest)
      return { ok: true, type: 'image', filename: `captura_${ts}.png`, tmpPath: tmp }
    }
    return { ok: true, type: 'image', filename: `captura_${ts}.png`, tmpPath: tmp }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ─── IPC: Drop folder ─────────────────────────────────────────────────────────
ipcMain.handle('list-drop', async (_, folder) => {
  const dir = folder.replace('~', os.homedir())
  try {
    const files = fs.readdirSync(dir)
      .map(n => {
        const fp  = path.join(dir, n)
        const st  = fs.statSync(fp)
        return st.isFile() ? { name: n, size: st.size, mtime: st.mtimeMs } : null
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 30)
    return { ok: true, files }
  } catch (e) {
    return { ok: false, files: [], error: e.message }
  }
})

ipcMain.handle('copy-to-drop', async (_, { src, folder }) => {
  const dir  = folder.replace('~', os.homedir())
  const dest = path.join(dir, path.basename(src))
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.copyFileSync(src, dest)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})


ipcMain.handle('open-folder', async (_, folder) => {
  const dir = folder.replace('~', os.homedir())
  spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref()
  return { ok: true }
})

ipcMain.handle('open-url', async (_, url) => {
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
  return { ok: true }
})

// ─── IPC: Seleccionar archivo ─────────────────────────────────────────────────
ipcMain.handle('pick-file', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecciona archivo para Drop',
    properties: ['openFile']
  })
  return r.canceled ? null : r.filePaths[0]
})

ipcMain.handle('pick-image', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecciona imagen de fondo',
    properties: ['openFile'],
    filters: [{ name: 'Imágenes', extensions: ['jpg','jpeg','png','gif','webp','bmp'] }]
  })
  if (r.canceled || !r.filePaths[0]) return null
  const filePath = r.filePaths[0]
  const ext = path.extname(filePath).toLowerCase().replace('.', '')
  const mimeMap = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp', bmp:'image/bmp' }
  const mime = mimeMap[ext] || 'image/jpeg'
  const data = fs.readFileSync(filePath)
  return `data:${mime};base64,${data.toString('base64')}`
})
// ─── IPC: Config ──────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')

const DEFAULT_CONFIG = {
  adb:          { tablet_ip: '192.168.0.189', port: '5555' },
  syncthing:    { api_key: '', api_url: 'http://127.0.0.1:8384', folder_id: 'drop', device_id: '' },
  drop_folder:  '~/Drop',
  poll_interval: 2500,
  paste_method: 'syncthing',
  bt_mac: '',
  kde_device_id: '',
}

ipcMain.handle('load-config', async () => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const c = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
      return { ...DEFAULT_CONFIG, ...c }
    }
  } catch {}
  return DEFAULT_CONFIG
})

ipcMain.handle('save-config', async (_, cfg) => {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})
// ─── IPC: Web Transfer WiFi ───────────────────────────────────────────────────
// ─── IPC: Web Transfer WiFi ───────────────────────────────────────────────────

async function startWebTransferServer(opts = {}) {
  if (!webTransfer) {
    const msg = webTransferLoadError
      ? webTransferLoadError.message
      : 'webTransferServer.js no está cargado'

    console.error('[webTransfer] No disponible:', msg)

    return {
      ok: false,
      error: msg,
    }
  }

  try {
    const currentInfo = webTransfer.info?.()

    if (currentInfo?.running) {
      console.log('[webTransfer] Ya estaba corriendo:', currentInfo)

      return {
        ok: true,
        ...currentInfo,
      }
    }
  } catch {}

  if (webTransferStartPromise) {
    console.log('[webTransfer] Inicio ya en progreso, esperando...')

    try {
      const info = await webTransferStartPromise
      return {
        ok: true,
        ...info,
      }
    } catch (err) {
      return {
        ok: false,
        error: err?.stack || err?.message || String(err),
      }
    }
  }

  const port = Number(opts.port || 7891)

  const safeFolder = opts.folder
    ? String(opts.folder).replace('~', os.homedir())
    : path.join(os.homedir(), 'Drop')

  console.log('[webTransfer] Intentando iniciar servidor...')
  console.log('[webTransfer] Puerto:', port)
  console.log('[webTransfer] Carpeta:', safeFolder)

  try {
    fs.mkdirSync(safeFolder, { recursive: true })

    if (!webTransferEventHooked) {
      webTransferEventHooked = true

      webTransfer.onEvent((ev) => {
        if (ev?.type === 'file-added') {
          try {
            const fileName = ev.name
            const filePath = ev.path || path.join(safeFolder, fileName)

            if (
              fileName &&
              /\.(png|jpe?g|webp|gif|bmp)$/i.test(fileName) &&
              fs.existsSync(filePath)
            ) {
              const img = nativeImage.createFromPath(filePath)

              if (!img.isEmpty()) {
                clipboard.writeImage(img)
                console.log('[webTransfer] Imagen copiada al portapapeles:', fileName)
              }
            }
          } catch (copyErr) {
            console.error('[webTransfer] Error copiando imagen al clipboard:', copyErr)
          }
        }

        if (ev?.type === 'pair-request') {
          BrowserWindow.getAllWindows().forEach((w) => {
            if (!w.isDestroyed()) w.webContents.send('synctablet:pair-request', ev)
          })
        }

        if (ev?.type === 'pair-cancelled') {
          BrowserWindow.getAllWindows().forEach((w) => {
            if (!w.isDestroyed()) w.webContents.send('synctablet:pair-cancelled', ev)
          })
        }

        if (ev?.type === 'notification') {
          try {
            const body = ev.text || ''
            const title = `${ev.fromName || 'Android'} · ${ev.app || ''}`.trim()
            let iconPath = null
            if (ev.iconPng) {
              try {
                const tmp = path.join(os.tmpdir(), `synctablet-notif-${Date.now()}.png`)
                fs.writeFileSync(tmp, Buffer.from(ev.iconPng, 'base64'))
                iconPath = tmp
              } catch {}
            }
            const n = new Notification({
              title: ev.title || title,
              body: ev.title ? `${ev.app || ''}: ${body}` : body,
              icon: iconPath || undefined,
              silent: false,
            })
            n.show()
          } catch (e) {
            console.error('[synctablet] Error mostrando notificación:', e.message)
          }
          BrowserWindow.getAllWindows().forEach((w) => {
            if (!w.isDestroyed()) w.webContents.send('synctablet:notification', ev)
          })
        }

        BrowserWindow.getAllWindows().forEach((w) => {
          if (!w.isDestroyed()) {
            w.webContents.send('webtransfer:event', ev)
          }
        })
      })
    }

    webTransferStartPromise = webTransfer.start({
      port,
      folder: safeFolder,
    })

    const info = await webTransferStartPromise

    console.log('[webTransfer] Servidor iniciado:', info)

    return {
      ok: true,
      ...info,
    }
  } catch (err) {
    console.error('[webTransfer] ERROR iniciando servidor:', err)

    if (err?.code === 'EADDRINUSE') {
      return {
        ok: false,
        error: `El puerto ${port} ya está ocupado. Cierra node index.js, otra instancia de Electron, o cambia de puerto.`,
      }
    }

    return {
      ok: false,
      error: err?.stack || err?.message || String(err),
    }
  } finally {
    webTransferStartPromise = null
  }
}


async function stopWebTransferServer() {
  if (!webTransfer) {
    return {
      ok: false,
      error: webTransferLoadError?.message || 'webTransferServer.js no está cargado',
    }
  }

  try {
    if (webTransferStartPromise) {
      try {
        await webTransferStartPromise
      } catch {}
      webTransferStartPromise = null
    }

    await webTransfer.stop()

    console.log('[webTransfer] Servidor detenido')

    return { ok: true }
  } catch (err) {
    console.error('[webTransfer] ERROR deteniendo servidor:', err)

    return {
      ok: false,
      error: err?.stack || err?.message || String(err),
    }
  }
}




function getWebTransferInfo() {
  if (!webTransfer) {
    return {
      ok: false,
      error: webTransferLoadError?.message || 'webTransferServer.js no está cargado',
    }
  }

  try {
    return {
      ok: true,
      ...webTransfer.info(),
    }
  } catch (err) {
    return {
      ok: false,
      error: err?.stack || err?.message || String(err),
    }
  }
}

ipcMain.handle('webtransferStart', async (_, opts = {}) => {
  return startWebTransferServer(opts)
})

ipcMain.handle('webtransferStop', async () => {
  return stopWebTransferServer()
})

ipcMain.handle('webtransferInfo', () => {
  return getWebTransferInfo()
})

ipcMain.handle('webtransfer:start', async (_, opts = {}) => {
  return startWebTransferServer(opts)
})

ipcMain.handle('webtransfer:stop', async () => {
  return stopWebTransferServer()
})

ipcMain.handle('webtransfer:info', () => {
  return getWebTransferInfo()
})

// ─── IPC: SyncTablet pairing (estilo KDE Connect) ────────────────────────────
ipcMain.handle('synctablet-pair-accept', async (_, sessionId) => {
  if (!webTransfer?.acceptPair) return { ok: false, error: 'server no cargado' }
  return webTransfer.acceptPair(sessionId)
})

ipcMain.handle('synctablet-pair-reject', async (_, sessionId) => {
  if (!webTransfer?.rejectPair) return { ok: false, error: 'server no cargado' }
  return webTransfer.rejectPair(sessionId)
})

ipcMain.handle('synctablet-paired-list', async () => {
  if (!webTransfer?.pairedList) return []
  return webTransfer.pairedList()
})

ipcMain.handle('synctablet-unpair', async (_, deviceId) => {
  if (!webTransfer?.unpair) return { ok: false, error: 'server no cargado' }
  return webTransfer.unpair(deviceId)
})

// Push de archivo del PC a las tablets pareadas
ipcMain.handle('synctablet-push-file', async (_, { filePath, filename, deviceId } = {}) => {
  if (!webTransfer?.enqueuePush) return { ok: false, error: 'server no cargado' }
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'archivo no existe' }
  const name = filename || path.basename(filePath)
  if (deviceId) return webTransfer.enqueuePush(deviceId, name, filePath, false)
  return webTransfer.enqueuePushAll(name, filePath, false)
})

// Push de imagen del clipboard a tablets pareadas (usado por Ctrl+Shift+V)
ipcMain.handle('synctablet-push-clipboard', async () => {
  if (!webTransfer?.enqueuePushAll) return { ok: false, error: 'server no cargado' }
  const img = clipboard.readImage()
  if (img.isEmpty()) {
    const text = clipboard.readText()
    if (!text) return { ok: false, error: 'clipboard vacío' }
    // staging texto como .txt
    const tmp = path.join(os.tmpdir(), `synctablet-push-${Date.now()}.txt`)
    fs.writeFileSync(tmp, text, 'utf8')
    return webTransfer.enqueuePushAll(path.basename(tmp), tmp, true)
  }
  const tmp = path.join(os.tmpdir(), `synctablet-push-${Date.now()}.png`)
  fs.writeFileSync(tmp, img.toPNG())
  return webTransfer.enqueuePushAll(`clipboard_${Date.now()}.png`, tmp, true)
})

// ══════════════════════════════════════════════════════════════════════════════
// IPC: TRANSFERENCIA USB  — pega este bloque al FINAL de main.js,
//       justo antes de la última línea (o al final del archivo)
// ══════════════════════════════════════════════════════════════════════════════

// ─── Elegir carpeta destino (para recibir archivos desde la tablet) ────────────
// ══════════════════════════════════════════════════════════════════════════════
// IPC: TRANSFERENCIA USB  — pega este bloque al FINAL de main.js,
//       justo antes de la última línea (o al final del archivo)
// ══════════════════════════════════════════════════════════════════════════════

// ─── Elegir carpeta destino (para recibir archivos desde la tablet) ────────────
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecciona carpeta destino',
    properties: ['openDirectory', 'createDirectory'],
  })
  return r.canceled ? null : r.filePaths[0]
})

// ─── Listar archivos en una ruta de la TABLET vía ADB ─────────────────────────
ipcMain.handle('adb-ls', async (_, { serial, remotePath }) => {
  // adb shell ls -la <path>  — devuelve líneas con nombre, tamaño, fecha
  const args = serial
    ? ['-s', serial, 'shell', 'ls', '-la', remotePath]
    : ['shell', 'ls', '-la', remotePath]

  const r = await runCmd('adb', args)
  if (!r.ok && !r.out) return { ok: false, files: [], error: r.out }

  // Parsear salida de ls -la
  const files = []
  for (const line of r.out.split('\n')) {
    const l = line.trim()
    if (!l || l.startsWith('total') || l.startsWith('d')) continue   // saltar dirs y totals
    // formato: -rw-rw---- 1 root sdcard_rw 1234567 2024-01-15 10:30 nombre.jpg
    const parts = l.split(/\s+/)
    if (parts.length < 8) continue
    const perms = parts[0]
    if (perms.startsWith('d')) continue  // saltar directorios
    const size  = parseInt(parts[4]) || 0
    const name  = parts.slice(7).join(' ')
    if (!name || name === '.' || name === '..') continue
    files.push({ name, size, path: `${remotePath}/${name}` })
  }
  return { ok: true, files }
})

// ─── Pull: copiar archivo de la tablet al PC ────────────────────────────────
ipcMain.handle('adb-pull', async (_, { serial, remotePath, localDir }) => {
  const dir = localDir.replace('~', os.homedir())
  fs.mkdirSync(dir, { recursive: true })

  const args = serial
    ? ['-s', serial, 'pull', remotePath, dir]
    : ['pull', remotePath, dir]

  const r = await runCmd('adb', args)
  return { ok: r.ok || r.out.includes('pulled'), out: r.out }
})

// ─── Push: copiar archivo del PC a la tablet ────────────────────────────────
// ─── Dispara el Media Scanner de Android para que apps como galería,
//     WhatsApp, etc. vean el archivo inmediatamente sin reiniciar ─────────────
async function mediaScan(serial, remotePath) {
  const baseArgs = serial ? ['-s', serial] : []
  const absPath = remotePath.startsWith('/') ? remotePath : '/' + remotePath

  // Argumentos separados — spawn NO acepta strings con espacios como un solo arg
  await runCmd('adb', [
    ...baseArgs,
    'shell', 'am', 'broadcast',
    '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
    '-d', `file://${absPath}`,
  ])
}

// ─── Push single — push + media scan con spawn async ────────────────────────
ipcMain.handle('adb-push-single', async (_, { serial, localPath, remotePath }) => {
  const absPath = remotePath.startsWith('/') ? remotePath : '/' + remotePath
  const baseArgs = serial ? ['-s', serial] : []

  // 1. Push del archivo
  const pushArgs = [...baseArgs, 'push', localPath, remotePath]
  const pushR = await runCmd('adb', pushArgs)
  const ok = pushR.ok || pushR.out.includes('pushed')
  console.log(`adb push result: ok=${ok} out=${pushR.out}`)

  // 2. Media scan — encodear espacios en la URL para que Android lo acepte
  const encodedPath = absPath.split('/').map(p => encodeURIComponent(p)).join('/')
  const fileUrl = `file://${encodedPath}`
  console.log(`mediaScan URL: ${fileUrl}`)

  const scanArgs = [
    ...baseArgs,
    'shell', 'am', 'broadcast',
    '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
    '-d', fileUrl,
  ]
  const scanR = await runCmd('adb', scanArgs)
  console.log(`mediaScan result: ${scanR.out}`)

  return { ok, out: pushR.out }
})

ipcMain.handle('adb-push', async (_, { serial, localPath, remotePath }) => {
  const args = serial
    ? ['-s', serial, 'push', localPath, remotePath]
    : ['push', localPath, remotePath]

  const r = await runCmd('adb', args)
  const ok = r.ok || r.out.includes('pushed')

  // Siempre notificar al Media Scanner — aunque ok sea false el archivo
  // puede haberse enviado igualmente (adb a veces retorna código != 0)
  await mediaScan(serial, remotePath)

  return { ok, out: r.out }
})

// ─── Push múltiples archivos (selección con diálogo) ─────────────────────────
ipcMain.handle('adb-push-files', async (_, { serial, remotePath }) => {
  const sel = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecciona archivos para enviar a la tablet',
    properties: ['openFile', 'multiSelections'],
  })
  if (sel.canceled || !sel.filePaths.length) return { ok: false, canceled: true }

  const results = []
  for (const localFile of sel.filePaths) {
    const args = serial
      ? ['-s', serial, 'push', localFile, remotePath]
      : ['push', localFile, remotePath]
    const r = await runCmd('adb', args)
    const ok = r.ok || r.out.includes('pushed')

    // Media scan por cada archivo empujado
    if (ok) {
      const dest = `${remotePath}/${path.basename(localFile)}`
      await mediaScan(serial, dest)
    }

    results.push({ file: path.basename(localFile), ok, out: r.out })
  }
  return { ok: true, results }
})

// ─── IPC: Shell genérico para DevicePanel ─────────────────────────────────────
ipcMain.handle('adb-shell', async (_, { serial, cmd }) => {
  const args = serial
    ? ['-s', serial, 'shell', cmd]
    : ['shell', cmd]
  const r = await runCmd('adb', args)
  return { ok: r.ok, out: r.out }
})

// ─── IPC: Screenshot de la tablet ─────────────────────────────────────────────
ipcMain.handle('adb-screenshot', async (_, { serial }) => {
  const tmp = path.join(os.tmpdir(), `tablet-screenshot-${Date.now()}.png`)
  const baseArgs = serial ? ['-s', serial] : []

  // 1. Capturar en la tablet
  const capR = await runCmd('adb', [...baseArgs, 'shell', 'screencap', '-p', '/sdcard/screenshot_tmp.png'])

  // 2. Bajar al PC
  const pullR = await runCmd('adb', [...baseArgs, 'pull', '/sdcard/screenshot_tmp.png', tmp])
  if (!pullR.ok && !pullR.out.includes('pulled')) return { ok: false }

  // 3. Leer como base64
  try {
    const data = fs.readFileSync(tmp)
    const base64 = data.toString('base64')
    fs.unlinkSync(tmp)
    // Borrar temp de la tablet
    runCmd('adb', [...baseArgs, 'shell', 'rm', '/sdcard/screenshot_tmp.png']).catch(() => {})
    return { ok: true, base64 }
  } catch(e) {
    return { ok: false, error: e.message }
  }
})


// ─── IPC: PDF Export ──────────────────────────────────────────────────────────

// ─── IPC: Open PDF ────────────────────────────────────────────────────────────

// ─── IPC: Open file with system default app ───────────────────────────────────

// ─── IPC: Read file as base64 ─────────────────────────────────────────────────


// ─── IPC: Serve PDF via local HTTP ───────────────────────────────────────────



// ─── IPC: Close PDF server when tab closed ───────────────────────────────────

// ─── IPC: Install via terminal ────────────────────────────────────────────────
ipcMain.handle('install-terminal', async (_, cmd) => {
  const { spawn: sp } = require('child_process')
  const candidates = [
    { bin: 'gnome-terminal', args: ['--', 'bash', '-c', `${cmd}; echo; echo '--- Presiona Enter para cerrar ---'; read`] },
    { bin: 'xterm',          args: ['-e', `bash -c '${cmd.replace(/'/g, "'\\''")}; echo; echo Presiona Enter; read'`] },
    { bin: 'konsole',        args: ['--noclose', '-e', 'bash', '-c', `${cmd}; read`] },
    { bin: 'xfce4-terminal', args: ['-x', 'bash', '-c', `${cmd}; read`] },
  ]
  for (const { bin, args } of candidates) {
    if (which(bin)) {
      const proc = sp(bin, args, { detached: true, stdio: 'ignore' })
      proc.unref()
      return { ok: true }
    }
  }
  return { ok: false, error: 'No se encontró un emulador de terminal (gnome-terminal, xterm, konsole)' }
})

// ─── IPC: Sunshine streaming ───────────────────────────────────────────────────
ipcMain.handle('sunshine:status', async () => {
  // flatpak ps lista las apps flatpak corriendo actualmente
  const fps = await runCmd('flatpak', ['ps', '--columns=application'])
  const isRunning = (fps.out || '').includes('dev.lizardbyte.app.Sunshine')
    || (await runCmd('systemctl', ['--user', 'is-active', 'sunshine-flatpak.service'])).out?.trim() === 'active'

  const ipR = await runCmd('ip', ['-4', 'addr'])
  const ips = []
  let currentIface = ''
  for (const line of (ipR.out || '').split('\n')) {
    const ifaceMatch = line.match(/^\d+:\s+(\S+):/)
    if (ifaceMatch) { currentIface = ifaceMatch[1]; continue }
    const ipMatch = line.match(/inet\s+([\d.]+)\/\d+/)
    if (ipMatch && currentIface !== 'lo') ips.push({ iface: currentIface, ip: ipMatch[1] })
  }
  return { running: isRunning, ips }
})

ipcMain.handle('sunshine:start', async () => {
  // Try user systemd service first
  const svcR = await runCmd('systemctl', ['--user', 'start', 'sunshine-flatpak.service'])
  if (svcR.ok) return { ok: true, method: 'systemctl' }

  // Fallback: flatpak run directly
  try {
    const proc = spawn('flatpak', ['run', 'dev.lizardbyte.app.Sunshine'], {
      detached: true, stdio: 'ignore',
    })
    proc.unref()
    return { ok: true, method: 'flatpak', pid: proc.pid }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('sunshine:stop', async () => {
  // flatpak kill es la forma correcta de parar una app flatpak
  await runCmd('flatpak', ['kill', 'dev.lizardbyte.app.Sunshine'])
  // También intentar el servicio systemd por si acaso
  await runCmd('systemctl', ['--user', 'stop', 'sunshine-flatpak.service'])
  return { ok: true }
})

// ─── IPC: Sunshine credentials — inyecta Authorization header en la sesión ──────
function applySunshineCredentials(username, password) {
  const sunshineSession = session.fromPartition('persist:sunshine', { cache: true })
  if (!username || !password) return
  const encoded = Buffer.from(`${username}:${password}`).toString('base64')
  // onBeforeSendHeaders solo admite un listener activo — se reemplaza cada vez
  sunshineSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://localhost:47990/*', 'https://127.0.0.1:47990/*'] },
    (details, callback) => {
      details.requestHeaders['Authorization'] = `Basic ${encoded}`
      callback({ requestHeaders: details.requestHeaders })
    }
  )
}

ipcMain.handle('sunshine:set-credentials', async (_, { username, password }) => {
  applySunshineCredentials(username, password)
  // Guardar en config
  try {
    let cfg = {}
    if (fs.existsSync(CONFIG_PATH)) cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    cfg.sunshine = { ...(cfg.sunshine || {}), username, password }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8')
  } catch {}
  return { ok: true }
})

ipcMain.handle('sunshine:get-credentials', async () => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
      return cfg.sunshine || {}
    }
  } catch {}
  return {}
})

// ─── IPC: Notificaciones de la tablet ────────────────────────────────────────
function parseNotifications(out) {
  const notifs = []
  const lines = out.split('\n')
  let cur = null
  for (const line of lines) {
    if (line.includes('NotificationRecord(')) {
      if (cur && (cur.title || cur.text)) notifs.push(cur)
      const pkg = line.match(/pkg=([^\s,)]+)/)?.[1] || ''
      cur = { pkg, title: '', text: '', when: Date.now() }
    }
    if (!cur) continue
    // Format: android.title=String (text) or android.title=SpannableString (text)
    const t = line.match(/android\.title=(?:Spannable)?String\s*\(([^)]+)\)/)?.[1]
    const b = line.match(/android\.text=(?:Spannable)?String\s*\(([^)]+)\)/)?.[1]
    const w = line.match(/when=(\d{10,})/)?.[1]
    if (t && t !== 'null') cur.title = t.trim()
    if (b && b !== 'null') cur.text  = b.trim()
    if (w) cur.when = parseInt(w)
  }
  if (cur && (cur.title || cur.text)) notifs.push(cur)
  const SKIP = ['android', 'com.android.systemui', 'com.android.phone', 'com.android.server']
  return notifs
    .filter(n => n.pkg && !SKIP.some(s => n.pkg.startsWith(s)))
    .sort((a, b) => b.when - a.when)
    .slice(0, 25)
}

ipcMain.handle('adb-notifications', async (_, { serial }) => {
  const args = serial ? ['-s', serial, 'shell', 'dumpsys', 'notification', '--noredact'] : ['shell', 'dumpsys', 'notification', '--noredact']
  const r = await runCmd('adb', args)
  return { ok: r.ok, notifications: parseNotifications(r.out) }
})

// ─── IPC: Info de reproducción (media session) ────────────────────────────────
function parseMediaSession(out) {
  let title = null, artist = null, album = null

  // Samsung/Android format: "metadata: size=N, description=TITLE, ARTIST, ALBUM"
  // Find the line with active metadata (has description, after a state=PLAYING block)
  const metaLines = [...out.matchAll(/metadata: size=(\d+), description=([^\n]+)/g)]
  for (const m of metaLines) {
    if (parseInt(m[1]) > 0 && m[2].trim() !== 'null') {
      const parts = m[2].split(',').map(p => p.trim()).filter(Boolean)
      title  = parts[0] || null
      artist = parts[1] || null
      album  = parts[2] || null
      break
    }
  }

  // Fallback: explicit title= artist= format (other Android versions)
  if (!title) {
    title  = out.match(/\btitle=([^\n,}\]]+)/)?.[1]?.trim().replace(/^null$/, '') || null
    artist = out.match(/\bartist=([^\n,}\]]+)/)?.[1]?.trim().replace(/^null$/, '') || null
    album  = out.match(/\balbum=([^\n,}\]]+)/)?.[1]?.trim().replace(/^null$/, '') || null
  }

  const pkg = out.match(/package=([^\n\s,)]+)/)?.[1] || null
  // state=PLAYING(3) or state=3
  const playing = /state=(?:PLAYING\(3\)|PlaybackState \{state=PLAYING\(3\))/.test(out) ||
                  /state=(\d)/.exec(out)?.[1] === '3'

  return { title, artist, album, pkg, playing, hasData: !!(title || artist) }
}

ipcMain.handle('adb-media-info', async (_, { serial }) => {
  const args = serial ? ['-s', serial, 'shell', 'dumpsys', 'media_session'] : ['shell', 'dumpsys', 'media_session']
  const r = await runCmd('adb', args)
  return { ok: r.ok, ...parseMediaSession(r.out) }
})

// ─── IPC: Comandos de media (play/pause, siguiente, anterior, volumen) ────────
const MEDIA_KEYS = {
  play_pause: 'KEYCODE_MEDIA_PLAY_PAUSE',
  next:       'KEYCODE_MEDIA_NEXT',
  prev:       'KEYCODE_MEDIA_PREVIOUS',
  vol_up:     'KEYCODE_VOLUME_UP',
  vol_down:   'KEYCODE_VOLUME_DOWN',
  stop:       'KEYCODE_MEDIA_STOP',
}

ipcMain.handle('adb-media-cmd', async (_, { serial, cmd }) => {
  const key = MEDIA_KEYS[cmd]
  if (!key) return { ok: false, error: 'Comando desconocido' }
  const args = serial ? ['-s', serial, 'shell', 'input', 'keyevent', key] : ['shell', 'input', 'keyevent', key]
  const r = await runCmd('adb', args)
  return { ok: r.ok }
})

// ─── IPC: Quick device stats (RAM, Storage, WiFi, Battery) ───────────────────
ipcMain.handle('adb-quick-stats', async (_, { serial }) => {
  if (!serial) return { ok: false }
  try {
    const [memR, dfR, wifiR, batR] = await Promise.all([
      runCmd('adb', ['-s', serial, 'shell', 'cat /proc/meminfo']),
      runCmd('adb', ['-s', serial, 'shell', 'df /sdcard']),
      runCmd('adb', ['-s', serial, 'shell', "dumpsys wifi | grep 'RSSI:' | head -1"]),
      runCmd('adb', ['-s', serial, 'shell', 'dumpsys battery | grep -E "level:|status:"']),
    ])
    // Parse RAM
    const memLines = (memR.out || '').split('\n')
    const memTotal = parseInt(memLines.find(l=>l.startsWith('MemTotal'))?.match(/\d+/)?.[0]||0)
    const memAvail = parseInt(memLines.find(l=>l.startsWith('MemAvailable'))?.match(/\d+/)?.[0]||0)
    const ramUsed = Math.round((memTotal - memAvail) / 1024)
    const ramTotal = Math.round(memTotal / 1024)
    // Parse storage
    const dfLine = (dfR.out || '').split('\n').filter(l=>l.includes('/sdcard')||l.includes('emulated')).pop() || ''
    const dfParts = dfLine.trim().split(/\s+/)
    let storUsed = 0, storTotal = 0
    if (dfParts.length >= 4) {
      const parseSize = s => { const n=parseFloat(s); return s.endsWith('G')?n*1024:s.endsWith('M')?n:n/1024 }
      storTotal = Math.round(parseSize(dfParts[1]))
      storUsed  = Math.round(parseSize(dfParts[2]))
    }
    // Parse WiFi RSSI
    const rssiMatch = (wifiR.out||'').match(/RSSI:\s*(-?\d+)/)
    const rssi = rssiMatch ? parseInt(rssiMatch[1]) : null
    // Parse battery
    const batLevel = parseInt((batR.out||'').match(/level:\s*(\d+)/)?.[1]||0)
    return { ok: true, ramUsed, ramTotal, storUsed, storTotal, rssi, battery: batLevel }
  } catch (e) { return { ok: false, error: e.message } }
})

// ─── IPC: Importar fotos desde DCIM ──────────────────────────────────────────
ipcMain.handle('adb-import-photos', async (_, { serial, localDir, knownFiles = [] }) => {
  const adb  = serial ? ['-s', serial] : []
  const dest = localDir || path.join(os.homedir(), 'Imágenes', 'Tablet')

  try { fs.mkdirSync(dest, { recursive: true }) } catch {}

  // Listar archivos en DCIM/Camera
  const lsR = await runCmd('adb', [...adb, 'shell', 'ls', '/sdcard/DCIM/Camera/'])
  const all  = lsR.out.split('\n').map(f => f.trim()).filter(f => /\.(jpg|jpeg|png|mp4|heic|webp)$/i.test(f))
  const newFiles = all.filter(f => !knownFiles.includes(f))

  const imported = []
  for (const file of newFiles.slice(0, 100)) {
    const r = await runCmd('adb', [...adb, 'pull', `/sdcard/DCIM/Camera/${file}`, path.join(dest, file)])
    if (r.ok || r.out.includes('pulled')) imported.push(file)
  }

  return { ok: true, imported, total: all.length, newCount: newFiles.length, dest }
})

// ─── IPC: gphoto2 — listar archivos (MTP, sin USB debug) ─────────────────────
ipcMain.handle('gphoto2-list', async () => {
  if (!which('gphoto2')) return { ok: false, error: 'gphoto2 no instalado' }
  const r = await runCmd('gphoto2', ['--list-files'])
  if (!r.ok) return { ok: false, error: r.out }
  const files = []
  for (const line of r.out.split('\n')) {
    const m = line.match(/#(\d+)\s+(.+?)\s+\d+\s+KB/)
    if (m) files.push({ num: parseInt(m[1]), name: m[2].trim() })
  }
  return { ok: true, files }
})

ipcMain.handle('gphoto2-pull', async (_, { fileNums, localDir }) => {
  if (!which('gphoto2')) return { ok: false, error: 'gphoto2 no instalado' }
  const dest = localDir || path.join(os.homedir(), 'Imágenes', 'Tablet')
  try { fs.mkdirSync(dest, { recursive: true }) } catch {}
  const numStr = fileNums.join(',')
  const r = await runCmd('gphoto2', [`--get-file=${numStr}`, `--folder=/`, '--filename', path.join(dest, '%f')])
  return { ok: r.ok, out: r.out, dest }
})

// ─── IPC: Kernel cmdline (monitores virtuales) ─────────────────────────────────
ipcMain.handle('kernel:cmdline', async () => {
  try {
    const content = fs.readFileSync('/proc/cmdline', 'utf8').trim()
    const videoArgs = content.match(/video=\S+/g) || []
    return { ok: true, cmdline: content, videoArgs }
  } catch (e) {
    return { ok: false, error: e.message, videoArgs: [] }
  }
})

// ─── App grid: lista de apps instaladas ──────────────────────────────────────
const KNOWN_APP_NAMES = {
  'com.whatsapp': 'WhatsApp', 'com.whatsapp.w4b': 'WhatsApp Business',
  'com.google.android.youtube': 'YouTube', 'com.google.android.gm': 'Gmail',
  'com.google.android.maps': 'Google Maps', 'com.google.android.apps.docs': 'Google Drive',
  'com.google.android.apps.photos': 'Google Photos', 'com.google.android.keep': 'Keep Notes',
  'org.mozilla.firefox': 'Firefox', 'com.brave.browser': 'Brave',
  'com.android.chrome': 'Chrome', 'com.discord': 'Discord',
  'com.instagram.android': 'Instagram', 'com.twitter.android': 'X',
  'com.facebook.katana': 'Facebook', 'com.spotify.music': 'Spotify',
  'com.netflix.mediaclient': 'Netflix', 'com.telegram.messenger': 'Telegram',
  'com.reddit.frontpage': 'Reddit', 'tv.twitch.android.app': 'Twitch',
  'com.samsung.android.calendar': 'Calendar', 'com.samsung.android.calculator': 'Calculator',
  'com.samsung.android.contacts': 'Contacts', 'com.samsung.android.messaging': 'Messages',
  'com.samsung.android.camera': 'Camera', 'com.samsung.android.gallery3d': 'Gallery',
  'com.samsung.android.app.notes': 'Samsung Notes', 'com.samsung.android.bixby.agent': 'Bixby',
  'com.android.vending': 'Play Store', 'com.microsoft.office.word': 'Word',
  'com.microsoft.office.excel': 'Excel', 'com.microsoft.office.powerpoint': 'PowerPoint',
  'com.microsoft.teams': 'Teams', 'com.adobe.reader': 'Adobe Acrobat',
  'com.anthropic.claude': 'Claude', 'com.openai.chatgpt': 'ChatGPT',
  'org.videolan.vlc': 'VLC', 'com.termux': 'Termux',
  'org.fdroid.fdroid': 'F-Droid', 'com.cloudflare.onedotone': '1.1.1.1',
  'com.duolingo': 'Duolingo', 'com.clash.royale': 'Clash Royale',
  'com.google.android.apps.translate': 'Translate',
}
function formatTabletAppName(pkg) {
  if (KNOWN_APP_NAMES[pkg]) return KNOWN_APP_NAMES[pkg]
  const last = pkg.split('.').pop()
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()
}

ipcMain.handle('adb-list-apps', async (_, { serial }) => {
  const args = serial ? ['-s', serial] : []
  const r = await runCmd('adb', [...args, 'shell', 'pm list packages -3'])
  if (!r.ok) return { ok: false, apps: [] }
  const apps = r.out.trim().split('\n')
    .map(l => l.replace('package:', '').trim()).filter(Boolean)
    .sort((a, b) => formatTabletAppName(a).localeCompare(formatTabletAppName(b)))
    .map(pkg => ({ packageName: pkg, appName: formatTabletAppName(pkg) }))
  return { ok: true, apps }
})

// ─── App grid: extracción de íconos (híbrido on-device + aapt2) ───────────────
const _iconCache = new Map()
const AAPT2_PATH = '/home/steven/Android/Sdk/build-tools/36.1.0/aapt2'

// Detect image mime type from binary header — returns null for non-image data
function detectImageMime(buf) {
  if (buf.length < 12) return null
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png'
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpeg'
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp'
  return null  // Android binary XML, GIF, or other non-image format
}

// Stream binary data from device without toString() corruption
function adbExecBuf(adbArgs, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const chunks = []
    const proc = spawn('adb', adbArgs, { stdio: ['ignore', 'pipe', 'ignore'] })
    proc.stdout.on('data', d => chunks.push(d))
    proc.on('close', () => resolve(Buffer.concat(chunks)))
    proc.on('error', () => resolve(Buffer.alloc(0)))
    setTimeout(() => { try { proc.kill() } catch {} resolve(Buffer.concat(chunks)) }, timeoutMs)
  })
}

// Phase 1: on-device unzip — works for ~70% of apps with standard mipmap layout
async function _iconPhase1(adbArgs, pkg) {
  const script = [
    `apk=$(pm path ${pkg} 2>/dev/null | head -1 | tr -d '\\r\\n' | sed 's/^package://')`,
    `[ -z "$apk" ] && exit 1`,
    // Priority 1: exact canonical launcher filename, highest density first (sort -r: xxx>xx>x>hdpi)
    `icon=$(unzip -l "$apk" 2>/dev/null | grep -E 'mipmap' | grep -iE '/(ic_launcher|ic_logo_square|ic_logo|app_icon)\\.(png|webp)$' | grep -E '(xxx|xx|x)hdpi' | awk '{print $NF}' | sort -r | head -1)`,
    // Priority 2: same exact names at any density, highest first
    `[ -z "$icon" ] && icon=$(unzip -l "$apk" 2>/dev/null | grep -E 'mipmap' | grep -iE '/(ic_launcher|ic_logo_square|ic_logo|app_icon)\\.(png|webp)$' | awk '{print $NF}' | sort -r | head -1)`,
    // Fallback: largest mipmap file by byte size (usually highest density)
    `[ -z "$icon" ] && icon=$(unzip -l "$apk" 2>/dev/null | grep -E 'mipmap' | grep -E '\\.(png|webp)' | grep -Ev 'xml|foreground|background|round' | awk '{print $1"\\t"$NF}' | sort -rn | head -1 | cut -f2)`,
    `[ -z "$icon" ] && exit 1`,
    `ext=$(echo "$icon" | rev | cut -d. -f1 | rev)`,
    `echo "EXT:$ext"`,
    `unzip -p "$apk" "$icon" | base64`,
  ].join('; ')

  const r = await Promise.race([
    runCmd('adb', [...adbArgs, 'shell', script]),
    new Promise(res => setTimeout(() => res({ ok: false, out: '' }), 13000)),
  ])
  if (!r.ok) return null

  const lines = r.out.split('\n')
  const extLine = lines.find(l => l.startsWith('EXT:'))
  if (!extLine) return null
  const ext = extLine.replace('EXT:', '').trim()
  const b64 = lines.filter(l => !l.startsWith('EXT:')).join('').replace(/\s/g, '')
  if (!b64 || b64.length < 200) return null
  return `data:image/${ext === 'webp' ? 'webp' : 'png'};base64,${b64}`
}

// Phase 2: aapt2 mini-APK — resolves obfuscated resources (WhatsApp, F-Droid…)
async function _iconPhase2(adbArgs, pkg) {
  if (!fs.existsSync(AAPT2_PATH)) return null

  const pathR = await Promise.race([
    runCmd('adb', [...adbArgs, 'shell', `pm path ${pkg} 2>/dev/null | head -1 | tr -d '\\r\\n' | sed 's/^package://'`]),
    new Promise(res => setTimeout(() => res({ ok: false, out: '' }), 6000)),
  ])
  if (!pathR.ok || !pathR.out.trim()) return null
  const apkPath = pathR.out.trim()

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-'))
  try {
    // Stream only the two files needed for resource name resolution
    const [manifest, resources] = await Promise.all([
      adbExecBuf([...adbArgs, 'exec-out', `unzip -p ${apkPath} AndroidManifest.xml`], 12000),
      adbExecBuf([...adbArgs, 'exec-out', `unzip -p ${apkPath} resources.arsc`], 25000),
    ])
    if (manifest.length < 50 || resources.length < 50) return null

    fs.writeFileSync(path.join(tmpDir, 'AndroidManifest.xml'), manifest)
    fs.writeFileSync(path.join(tmpDir, 'resources.arsc'), resources)

    const miniApk = path.join(tmpDir, 'mini.apk')
    const zipR = await runCmd('zip', [miniApk, 'AndroidManifest.xml', 'resources.arsc'], { cwd: tmpDir })
    if (!zipR.ok && !fs.existsSync(miniApk)) return null

    const dumpR = await Promise.race([
      runCmd(AAPT2_PATH, ['dump', 'resources', miniApk]),
      new Promise(res => setTimeout(() => res({ ok: false, out: '' }), 18000)),
    ])

    // Parse aapt2 output — find mipmap/icon entry, prefer xxhdpi file path
    // Example lines:
    //   resource 0x7f0c0000 com.whatsapp:mipmap/icon
    //     (xxhdpi) (file) res/js0.webp density=480
    const iconNameRx = /mipmap\/(?:ic_launcher|icon|app_icon|ic_logo)\b/i
    let xxhdpiPath = null, fallbackPath = null, inIcon = false

    for (const ln of dumpR.out.split('\n')) {
      if (/resource\s+0x/.test(ln)) {
        if (inIcon && xxhdpiPath) break
        inIcon = iconNameRx.test(ln)
        continue
      }
      if (!inIcon) continue
      const m = ln.match(/\(file\)\s+(res\/\S+)/)
      if (!m) continue
      const filePath = m[1]
      if (filePath.endsWith('.xml')) continue  // skip adaptive icon XML refs
      if (/xxhdpi/i.test(ln)) { xxhdpiPath = filePath; break }
      if (/xhdpi|hdpi/i.test(ln)) fallbackPath = filePath  // keep last (highest density seen)
      else if (!fallbackPath) fallbackPath = filePath
    }

    const iconFilePath = xxhdpiPath || fallbackPath
    if (!iconFilePath) return null

    const iconBuf = await adbExecBuf([...adbArgs, 'exec-out', `unzip -p ${apkPath} '${iconFilePath}'`], 12000)
    if (iconBuf.length < 200) return null

    const mime = detectImageMime(iconBuf)
    if (!mime) return null  // binary XML or non-image data
    return `data:image/${mime};base64,${iconBuf.toString('base64')}`
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
}

ipcMain.handle('adb-get-icon', async (_, { serial, pkg }) => {
  const key = `${serial}:${pkg}`
  if (_iconCache.has(key)) return { ok: true, data: _iconCache.get(key) }

  const cacheDir = path.join(os.tmpdir(), 'synctablet-icons')
  try { fs.mkdirSync(cacheDir, { recursive: true }) } catch {}
  const cachePath = path.join(cacheDir, `${(serial||'usb').replace(/[:.]/g,'_')}_${pkg}.b64`)
  if (fs.existsSync(cachePath)) {
    const data = fs.readFileSync(cachePath, 'utf8')
    _iconCache.set(key, data)
    return { ok: true, data }
  }

  const adbArgs = serial ? ['-s', serial] : []

  let data = await _iconPhase1(adbArgs, pkg)
  if (!data) data = await _iconPhase2(adbArgs, pkg)
  if (!data) return { ok: false }

  _iconCache.set(key, data)
  try { fs.writeFileSync(cachePath, data, 'utf8') } catch {}
  return { ok: true, data }
})

// ─── App grid: lanzar app en ventana virtual (scrcpy --new-display) ───────────
ipcMain.handle('adb-launch-app-window', async (_, { serial, pkg, appName }) => {
  const scrcpyArgs = []
  if (serial) scrcpyArgs.push('-s', serial)
  scrcpyArgs.push('--new-display', `--start-app=+${pkg}`)
  if (appName) scrcpyArgs.push(`--window-title=${appName}`)
  const proc = spawn('scrcpy', scrcpyArgs, { detached: true, stdio: 'ignore' })
  proc.unref()
  return { ok: true }
})

// ─── IPC: IP local del PC (para mostrar QR en la app Android) ─────────────────
ipcMain.handle('get-local-ip', () => {
  const ifaces = os.networkInterfaces()
  const candidates = []
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push(iface.address)
      }
    }
  }
  // Prefer 192.168.x.x (local WiFi) over others
  const wifi = candidates.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.'))
  return { ip: wifi || candidates[0] || '127.0.0.1' }
})

// Confiar en certificados auto-firmados de localhost (Sunshine usa HTTPS)
app.on('certificate-error', (event, _wc, url, _error, _cert, callback) => {
  if (url.startsWith('https://localhost') || url.startsWith('https://127.0.0.1')) {
    event.preventDefault()
    callback(true)
  } else {
    callback(false)
  }
})