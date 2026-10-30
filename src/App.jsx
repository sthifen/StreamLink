import React, { useState, useEffect } from 'react'
import SetupScreen from './pages/SetupScreen.jsx'
import MainApp     from './pages/MainApp.jsx'
import PairDeviceModal from './components/PairDeviceModal.jsx'
import { loadConfig } from './api.js'

const DEFAULT_CONFIG = {
  adb:         { tablet_ip: '192.168.0.189', port: '5555' },
  syncthing:   { api_key: '', api_url: 'http://127.0.0.1:8384', folder_id: 'drop', device_id: '' },
  drop_folder: '~/Drop',
  poll_interval: 2500,
  appearance:  { accentKey: 'amber', accentColor: '#e8741a' }
}

export default function App() {
  const [ready,  setReady]  = useState(false)
  const [config, setConfig] = useState(null)

  useEffect(() => {
    loadConfig().then(cfg => setConfig(cfg || DEFAULT_CONFIG))
  }, [])

  useEffect(() => {
    if (!config) return
    applyAppearance(config.appearance || {})
  }, [config])

  if (!config) {
    return (
      <>
        <PairDeviceModal />
        <div style={{
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          height:'100vh', background:'#0d0500', color:'rgba(240,236,228,0.5)',
          fontFamily:'sans-serif', gap:'16px',
        }}>
          <div style={{ width:36,height:36,border:'3px solid rgba(232,116,26,0.2)',borderTop:'3px solid #e8741a',borderRadius:'50%',animation:'spin 1s linear infinite' }} />
          <span style={{ fontSize:13 }}>Cargando Sync Tablet…</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </>
    )
  }

  if (!ready) {
    return (
      <>
        <PairDeviceModal />
        <SetupScreen config={config} onReady={(cfg) => { setConfig(cfg); setReady(true) }} />
      </>
    )
  }

  return (
    <>
      <PairDeviceModal />
      <MainApp config={config} setConfig={setConfig} />
    </>
  )
}

export function applyAppearance(ap = {}) {
  const accentKey = ap.accentKey || 'amber'
  // Set data-accent — CSS [data-accent="..."] rules handle everything
  document.documentElement.setAttribute('data-accent', accentKey)

  // Override --accent if a custom hex was stored
  if (ap.accentColor) {
    document.documentElement.style.setProperty('--accent', ap.accentColor)
  }

  // Restore wallpaper preset gradient if set
  if (ap.wpGradient && !ap.wallpaper) {
    document.documentElement.style.setProperty('--app-bg', ap.wpGradient)
  } else if (!ap.wpGradient) {
    document.documentElement.style.removeProperty('--app-bg')
  }

  // Wallpaper (body::before)
  if (ap.wallpaper) {
    document.body.style.setProperty('--wallpaper', `url("${ap.wallpaper}")`)
  } else {
    document.body.style.setProperty('--wallpaper', 'none')
  }
  document.body.style.setProperty('--wallpaper-blur', `${ap.wallpaperBlur ?? 0}px`)
  document.body.style.setProperty('--wallpaper-dim',  String(ap.wallpaperDim ?? 0))

  // Font scale
  document.documentElement.style.fontSize = `${14 * (ap.fontScale ?? 1)}px`
}
