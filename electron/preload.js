const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  btDevices: () => ipcRenderer.invoke('bt:devices'),
btSend: (args) => ipcRenderer.invoke('bt:send', args),
btStartReceive: (args) => ipcRenderer.invoke('bt:start-receive', args),
btStopReceive: () => ipcRenderer.invoke('bt:stop-receive'),
  checkDeps:       ()        => ipcRenderer.invoke('check-deps'),
  adbDevices:      ()        => ipcRenderer.invoke('adb-devices'),
  adbTcpip:        (port)    => ipcRenderer.invoke('adb-tcpip', port),
  adbConnect:      (addr)    => ipcRenderer.invoke('adb-connect', addr),
  adbPair:         (opts)    => ipcRenderer.invoke('adb-pair', opts),
  adbQrStart:      ()        => ipcRenderer.invoke('adb-qr-start'),
  adbQrStop:       ()        => ipcRenderer.invoke('adb-qr-stop'),
  adbQrPoll:       ()        => ipcRenderer.invoke('adb-qr-poll'),
  launchScrcpy:    (opts)    => ipcRenderer.invoke('launch-scrcpy', opts),
  startSyncthing:  (bin)     => ipcRenderer.invoke('start-syncthing', bin),
  syncthingStatus: ()        => ipcRenderer.invoke('syncthing-status'),
  listDrop:        (folder)  => ipcRenderer.invoke('list-drop', folder),
  copyToDrop:      (opts)    => ipcRenderer.invoke('copy-to-drop', opts),
    openFolder:      (folder)  => ipcRenderer.invoke('open-folder', folder),
  openUrl:         (url)     => ipcRenderer.invoke('open-url', url),
  pasteImage:      (folder)   => ipcRenderer.invoke('paste-image', folder),
  pickFile:        ()        => ipcRenderer.invoke('pick-file'),
      launchScrcpyTcpip: ()     => ipcRenderer.invoke('launch-scrcpy-tcpip'),
  loadConfig:      ()        => ipcRenderer.invoke('load-config'),
  saveConfig:      (cfg)     => ipcRenderer.invoke('save-config', cfg),
  installTerminal: (cmd)     => ipcRenderer.invoke('install-terminal', cmd),
    adbShell:           (opts)   => ipcRenderer.invoke('adb-shell', opts),
              adbScreenshot:      (opts)   => ipcRenderer.invoke('adb-screenshot', opts),
  adbPushSingle:      (opts)   => ipcRenderer.invoke('adb-push-single', opts),
  adbDisconnect:   (serial)  => ipcRenderer.invoke('adb-disconnect', serial),
  pickImage:       ()        => ipcRenderer.invoke('pick-image'),

  pickFolder:    ()       => ipcRenderer.invoke('pick-folder'),
  adbLs:         (opts)   => ipcRenderer.invoke('adb-ls',        opts),
  adbPull:       (opts)   => ipcRenderer.invoke('adb-pull',      opts),
  adbPush:       (opts)   => ipcRenderer.invoke('adb-push',      opts),
  adbPushFiles:  (opts)   => ipcRenderer.invoke('adb-push-files', opts),
adbWirelessPairConnect: (opts) => ipcRenderer.invoke('adb-wireless-pair-connect', opts),
runtimeCleanup: () => ipcRenderer.invoke('runtime-cleanup'),
  pasteImage: (folder) => ipcRenderer.invoke('paste-image', folder),
pasteimage: (folder) => ipcRenderer.invoke('paste-image', folder),
  toggleControlMode:    ()       => ipcRenderer.invoke('toggle-control-mode'),
  controlModeStatus:    ()       => ipcRenderer.invoke('control-mode-status'),
  installControlScript:   ()      => ipcRenderer.invoke('install-control-script'),
  installSystemShortcuts: ()      => ipcRenderer.invoke('install-system-shortcuts'),
  onControlModeChanged: (cb)     => ipcRenderer.on('control-mode-changed', (_, v) => cb(v)),
webTransferStart: (opts) => ipcRenderer.invoke('webtransferStart', opts),
webTransferStop: () => ipcRenderer.invoke('webtransferStop'),
webTransferInfo: () => ipcRenderer.invoke('webtransferInfo'),

webtransferStart: (opts) => ipcRenderer.invoke('webtransferStart', opts),
webtransferStop: () => ipcRenderer.invoke('webtransferStop'),
webtransferInfo: () => ipcRenderer.invoke('webtransferInfo'),

onWebTransferEvent: (callback) => {
  ipcRenderer.removeAllListeners('webtransfer:event')
  ipcRenderer.on('webtransfer:event', (_event, data) => callback(data))
},

// Quick device stats
adbQuickStats: (opts) => ipcRenderer.invoke('adb-quick-stats', opts),

// Samsung Flow features
adbNotifications: (opts)  => ipcRenderer.invoke('adb-notifications', opts),
adbMediaInfo:     (opts)  => ipcRenderer.invoke('adb-media-info', opts),
adbMediaCmd:      (opts)  => ipcRenderer.invoke('adb-media-cmd', opts),
adbImportPhotos:  (opts)  => ipcRenderer.invoke('adb-import-photos', opts),
adbDeviceStatus:  (opts)  => ipcRenderer.invoke('adb-device-status', opts),
gphoto2List:      ()      => ipcRenderer.invoke('gphoto2-list'),
gphoto2Pull:      (opts)  => ipcRenderer.invoke('gphoto2-pull', opts),
kdeconnectList:      ()      => ipcRenderer.invoke('kdeconnect-list'),
kdeconnectShare:     (opts)  => ipcRenderer.invoke('kdeconnect-share', opts),
kdeconnectClipboard: (opts)  => ipcRenderer.invoke('kdeconnect-clipboard', opts),
kdeconnectPing:      (opts)  => ipcRenderer.invoke('kdeconnect-ping', opts),
kdeconnectRing:      (opts)  => ipcRenderer.invoke('kdeconnect-ring', opts),
kdeconnectRefresh:   ()      => ipcRenderer.invoke('kdeconnect-refresh'),
kdeconnectSms:       (opts)  => ipcRenderer.invoke('kdeconnect-sms', opts),
kdeconnectOpenApp:   ()      => ipcRenderer.invoke('kdeconnect-open-app'),

// App grid
adbListApps:        (opts) => ipcRenderer.invoke('adb-list-apps', opts),
adbGetIcon:         (opts) => ipcRenderer.invoke('adb-get-icon', opts),
adbLaunchAppWindow: (opts) => ipcRenderer.invoke('adb-launch-app-window', opts),

// Sunshine
sunshineStatus:        ()     => ipcRenderer.invoke('sunshine:status'),
sunshineStart:         ()     => ipcRenderer.invoke('sunshine:start'),
sunshineStop:          ()     => ipcRenderer.invoke('sunshine:stop'),
sunshineSetCredentials:(opts) => ipcRenderer.invoke('sunshine:set-credentials', opts),
sunshineGetCredentials:()     => ipcRenderer.invoke('sunshine:get-credentials'),

// Kernel cmdline (monitores virtuales)
kernelCmdline:  ()    => ipcRenderer.invoke('kernel:cmdline'),
reloadShortcuts: ()   => ipcRenderer.invoke('reload-shortcuts'),

// IP local para mostrar QR de enlace con la app Android
getLocalIp: () => ipcRenderer.invoke('get-local-ip'),

// ─── SyncTablet pairing (estilo KDE Connect) ─────────────────────────────────
synctabletPairAccept: (sessionId) => ipcRenderer.invoke('synctablet-pair-accept', sessionId),
synctabletPairReject: (sessionId) => ipcRenderer.invoke('synctablet-pair-reject', sessionId),
synctabletPairedList: ()          => ipcRenderer.invoke('synctablet-paired-list'),
synctabletUnpair:     (deviceId)  => ipcRenderer.invoke('synctablet-unpair', deviceId),
synctabletPushFile:   (opts)      => ipcRenderer.invoke('synctablet-push-file', opts),
synctabletPushClipboard: ()       => ipcRenderer.invoke('synctablet-push-clipboard'),
onSyncTabletPairRequest: (cb) => {
  ipcRenderer.removeAllListeners('synctablet:pair-request')
  ipcRenderer.on('synctablet:pair-request', (_e, data) => cb(data))
},
onSyncTabletPairCancelled: (cb) => {
  ipcRenderer.removeAllListeners('synctablet:pair-cancelled')
  ipcRenderer.on('synctablet:pair-cancelled', (_e, data) => cb(data))
},
onSyncTabletNotification: (cb) => {
  ipcRenderer.removeAllListeners('synctablet:notification')
  ipcRenderer.on('synctablet:notification', (_e, data) => cb(data))
},
})