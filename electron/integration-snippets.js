// ═══════════════════════════════════════════════════════════════════════════
// CAMBIOS A APLICAR EN main.js
// ═══════════════════════════════════════════════════════════════════════════
//
// Agregar junto a los otros handlers de adb (cerca de la línea 807 donde
// están adb-connect y adb-tcpip):
//
// ─────────────────────────────────────────────────────────────────────────

ipcMain.handle('adb-pair', async (_, { addr, code }) => {
  // adb pair <ip:port> <code>
  // Funciona en Android 11+ con Wireless Debugging activado.
  // El port y code vienen del QR que genera el teléfono.
  return runCmd('adb', ['pair', addr, code])
})

// ═══════════════════════════════════════════════════════════════════════════
// CAMBIOS A APLICAR EN preload.js
// ═══════════════════════════════════════════════════════════════════════════
//
// Agregar dentro del objeto que se pasa a contextBridge.exposeInMainWorld,
// junto a adbConnect y adbTcpip:
//
// ─────────────────────────────────────────────────────────────────────────

adbPair: (opts) => ipcRenderer.invoke('adb-pair', opts),

// ═══════════════════════════════════════════════════════════════════════════
// CÓMO INTEGRAR QrWifiConnect EN ScrcpyPage.jsx
// ═══════════════════════════════════════════════════════════════════════════
//
// 1. Importar al inicio del archivo:
//
import QrWifiConnect from './QrWifiConnect'
//
// 2. Agregar el estado:
//
const [showQrModal, setShowQrModal] = useState(false)
//
// 3. Donde quieras el botón (por ejemplo en la barra de acciones, junto a "Captura"):
//
<button
  onClick={() => setShowQrModal(true)}
  title="Conectar por Wi-Fi escaneando QR"
  style={{
    padding: '9px 13px', borderRadius: 10,
    border: '0.5px solid rgba(59,130,246,0.3)',
    background: 'rgba(59,130,246,0.1)',
    color: '#3b82f6',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 12, fontWeight: 600,
  }}
>
  📡 Wi-Fi QR
</button>
//
// 4. Renderizar el modal (fuera del return principal, a nivel del componente):
//
{showQrModal && (
  <QrWifiConnect
    onClose={() => setShowQrModal(false)}
    onConnected={(serial) => {
      setShowQrModal(false)
      addLog(`Wi-Fi conectado: ${serial}`, 'ok')
      // El dispositivo aparecerá automáticamente en la próxima
      // actualización de la lista de devices del componente padre.
    }}
    addLog={addLog}
  />
)}
