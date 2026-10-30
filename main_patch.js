// ════════════════════════════════════════════════════════════════════════════
// PATCH PARA electron/main.js
// ────────────────────────────────────────────────────────────────────────────
// INSTRUCCIONES:
//   1. Copia webTransferServer.js a la carpeta electron/ de tu proyecto.
//   2. Agrega las líneas de abajo a tu electron/main.js existente.
//   3. En el bloque de `contextBridge.exposeInMainWorld` del preload.js,
//      agrega los tres métodos: webtransferStart, webtransferStop, webtransferInfo
// ════════════════════════════════════════════════════════════════════════════

// ── 1. Al inicio del archivo, junto a los demás requires: ────────────────────
const webTransfer = require('./webTransferServer')

// ── 2. IPC handlers (agregar donde están los demás ipcMain.handle) ────────────

// Iniciar servidor de transferencia WiFi
ipcMain.handle('webtransferStart', async (event, { port, folder } = {}) => {
  try {
    const info = await webTransfer.start({ port: port || 7891, folder })
    // Notificar al renderer cuando llegue un archivo nuevo
    webTransfer.onEvent((ev) => {
      const wins = BrowserWindow.getAllWindows()
      wins.forEach(w => w.webContents.send('webtransfer:event', ev))
    })
    return { ok: true, ...info }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// Detener servidor
ipcMain.handle('webtransferStop', async () => {
  try {
    await webTransfer.stop()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// Estado actual del servidor
ipcMain.handle('webtransferInfo', () => {
  return { ok: true, ...webTransfer.info() }
})

// Detener limpiamente al cerrar la app
app.on('before-quit', () => webTransfer.stop())


// ── 3. En tu preload.js, dentro de contextBridge.exposeInMainWorld: ───────────
//
//   webtransferStart: (opts) => ipcRenderer.invoke('webtransferStart', opts),
//   webtransferStop:  ()     => ipcRenderer.invoke('webtransferStop'),
//   webtransferInfo:  ()     => ipcRenderer.invoke('webtransferInfo'),
//
// ════════════════════════════════════════════════════════════════════════════