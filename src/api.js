// src/api.js — Wrapper seguro para window.api
// Espera hasta que Electron inyecte el preload antes de hacer cualquier llamada.

const TIMEOUT = 6000 // ms máximo de espera

function waitForApi() {
  return new Promise((resolve) => {
    if (window.api) return resolve(window.api)
    const start = Date.now()
    const id = setInterval(() => {
      if (window.api) { clearInterval(id); resolve(window.api) }
      else if (Date.now() - start > TIMEOUT) { clearInterval(id); resolve(null) }
    }, 40)
  })
}

async function call(method, ...args) {
  const api = await waitForApi()
  if (!api || typeof api[method] !== 'function') {
    console.warn(`[api] ${method} no disponible`)
    return null
  }
  try {
    return await api[method](...args)
  } catch (err) {
    console.error(`[api] ${method} falló:`, err)
    return null
  }
}

// Exporta cada método del preload como función segura
export const loadConfig      = ()       => call('loadConfig')
export const saveConfig      = (cfg)    => call('saveConfig', cfg)
export const checkDeps       = ()       => call('checkDeps')
export const adbDevices      = ()       => call('adbDevices')
export const adbTcpip        = (port)   => call('adbTcpip', port)
export const adbConnect      = (addr)   => call('adbConnect', addr)
export const launchScrcpy    = (opts)   => call('launchScrcpy', opts)
export const launchScrcpyTcpip = ()     => call('launchScrcpyTcpip')
export const startSyncthing  = ()       => call('startSyncthing')
export const syncthingStatus = ()       => call('syncthingStatus')
export const listDrop        = (folder) => call('listDrop', folder)
export const copyToDrop      = (opts)   => call('copyToDrop', opts)
export const writeTextDrop   = (opts)   => call('writeTextDrop', opts)
export const openFolder      = (folder) => call('openFolder', folder)
export const openUrl         = (url)    => call('openUrl', url)
export const pasteImage      = (folder) => call('pasteImage', folder)
export const pickFile        = ()       => call('pickFile')
export const pickImage       = ()       => call('pickImage')
export const installTerminal = (cmd)    => call('installTerminal', cmd)
export const syncthingGetApikey = ()    => call('syncthingGetApikey')
export const syncthingApi    = (opts)   => call('syncthingApi', opts)
export const readClipboardText = ()     => call('readClipboardText')
export const openSyncthingWindow = ()    => call('openSyncthingWindow')
export const adbDisconnect       = (s)     => call('adbDisconnect', s)
export const toggleControlMode    = ()  => call('toggleControlMode')
export const controlModeStatus    = ()  => call('controlModeStatus')
export const installControlScript   = ()  => call('installControlScript')
export const installSystemShortcuts = ()  => call('installSystemShortcuts')

// ── Phone / Samsung Flow features ────────────────────────────────────────────
export const adbNotifications   = (opts) => call('adbNotifications', opts)
export const adbMediaInfo       = (opts) => call('adbMediaInfo', opts)
export const adbMediaCmd        = (opts) => call('adbMediaCmd', opts)
export const adbImportPhotos    = (opts) => call('adbImportPhotos', opts)
export const adbDeviceStatus    = (opts) => call('adbDeviceStatus', opts)
export const gphoto2List        = ()     => call('gphoto2List')
export const gphoto2Pull        = (opts) => call('gphoto2Pull', opts)
export const kdeconnectList      = ()     => call('kdeconnectList')
export const kdeconnectShare     = (opts) => call('kdeconnectShare', opts)
export const kdeconnectClipboard = (opts) => call('kdeconnectClipboard', opts)
export const kdeconnectPing      = (opts) => call('kdeconnectPing', opts)
export const kdeconnectRing      = (opts) => call('kdeconnectRing', opts)
export const kdeconnectRefresh   = ()     => call('kdeconnectRefresh')

// ── WiFi Transfer ─────────────────────────────────────────────────────────────
export const webtransferStart = (opts) => call('webtransferStart', opts)
export const webtransferStop  = ()     => call('webtransferStop')
export const webtransferInfo  = ()     => call('webtransferInfo')