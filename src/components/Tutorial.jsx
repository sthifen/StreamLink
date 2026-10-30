import React, { useState, useEffect, useRef } from 'react'
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react'

// ── Definición de todos los tutoriales ───────────────────────────────────────
export const TUTORIALS = {
  screen: [
    {
      title: '▶ Espejo de pantalla',
      description: 'Presiona el botón Play para ver y controlar tu tablet desde el PC en tiempo real. Necesitas la tablet conectada por USB al menos la primera vez.',
      emoji: '🖥️',
      position: 'center',
    },
    {
      title: '📡 Conexión Wi-Fi',
      description: 'Activa "Usar TCP/IP (Wi-Fi)" para conectarte sin cable. Conecta el USB una sola vez para configurarlo — después ya no lo necesitas.',
      emoji: '📡',
      position: 'center',
    },
    {
      title: '🖼️ Enviar imágenes',
      description: 'Copia cualquier imagen y presiona Ctrl+V — se envía directo a tu tablet. También puedes arrastrar archivos desde el explorador de archivos.',
      emoji: '🖼️',
      position: 'center',
    },
    {
      title: '⚡ Atajo global',
      description: 'Desde cualquier app puedes usar Ctrl+Shift+V para enviar una captura de pantalla a la tablet, y Ctrl+Shift+S para mostrar/ocultar Sync Tablet.',
      emoji: '⌨️',
      position: 'center',
    },
  ],
  transfer: [
    {
      title: '📁 Dos modos de transferencia',
      description: 'Tienes dos modos: "Syncthing" sincroniza archivos automáticamente por WiFi. "USB directo" transfiere inmediatamente usando el cable USB.',
      emoji: '🔄',
      position: 'center',
    },
    {
      title: '🖱️ Arrastra y suelta',
      description: 'Arrastra cualquier archivo desde el explorador directamente sobre esta ventana — PDF, fotos, videos, documentos — y se envía solo.',
      emoji: '🖱️',
      position: 'center',
    },
    {
      title: '📋 Pegar imagen',
      description: 'Toma una captura de pantalla (Print Screen), vuelve a la app y presiona Ctrl+V o el botón "Pegar Imagen" — se envía inmediatamente.',
      emoji: '📋',
      position: 'center',
    },
    {
      title: '📲 USB directo',
      description: 'En modo USB puedes ver los archivos que están en tu tablet, descargarlos al PC, o subir archivos. Las fotos y videos aparecen en la galería al instante.',
      emoji: '🔌',
      position: 'center',
    },
  ],
  device: [
    {
      title: '📊 Panel del dispositivo',
      description: 'Aquí ves toda la información de tu tablet en tiempo real: batería, RAM, almacenamiento, WiFi y más. Se actualiza automáticamente cada 5 segundos.',
      emoji: '📊',
      position: 'center',
    },
    {
      title: '🔋 Batería y temperatura',
      description: 'Monitorea el nivel de batería, si está cargando, la temperatura y la salud de la batería. Si supera los 40°C considera desconectarla del cargador.',
      emoji: '🔋',
      position: 'center',
    },
    {
      title: '📸 Captura de pantalla',
      description: 'Toma una captura de la pantalla de tu tablet directamente desde el PC con el botón "Tomar captura". Puedes guardarla en tu computadora.',
      emoji: '📸',
      position: 'center',
    },
    {
      title: '🔄 Auto-actualización',
      description: 'Desactiva "Auto" si quieres ahorrar recursos. Usa el botón "Actualizar" cuando quieras refrescar los datos manualmente.',
      emoji: '🔄',
      position: 'center',
    },
  ],
  todo: [
    {
      title: '✅ Lista de tareas',
      description: 'Aquí puedes anotar todo lo que tienes pendiente. Desliza el panel desde la derecha para abrirlo en cualquier momento desde cualquier pantalla.',
      emoji: '📝',
      position: 'center',
    },
    {
      title: '🎯 Prioridades',
      description: 'Cada tarea tiene una prioridad: Alta (rojo), Media (amarillo) o Baja (azul). Organiza lo más urgente primero para no olvidar nada importante.',
      emoji: '🎯',
      position: 'center',
    },
    {
      title: '✔️ Completar tareas',
      description: 'Toca una tarea para marcarla como completada. Usa los filtros "Activas" y "Completadas" para ver solo lo que necesitas.',
      emoji: '✔️',
      position: 'center',
    },
    {
      title: '🗑️ Limpiar completadas',
      description: 'Usa el botón "Limpiar" para eliminar todas las tareas completadas de una vez. Tus tareas se guardan automáticamente.',
      emoji: '🗑️',
      position: 'center',
    },
  ],
  calendar: [
    {
      title: '📅 Tu calendario personal',
      description: 'Este calendario vive dentro de Sync Tablet y guarda tus eventos localmente. Desliza el panel desde la izquierda para abrirlo en cualquier momento.',
      emoji: '📅',
      position: 'center',
    },
    {
      title: '✨ Agregar con IA',
      description: 'En la pestaña "✨ IA" escribe tus eventos en lenguaje natural: "El viernes tengo cita con el doctor a las 3pm" — la IA los agrega automáticamente.',
      emoji: '🤖',
      position: 'center',
    },
    {
      title: '✏️ Agregar manualmente',
      description: 'En la pestaña "✏️" puedes crear eventos con título, fecha, hora, descripción y color. Perfectos para recordatorios importantes.',
      emoji: '✏️',
      position: 'center',
    },
    {
      title: '🔄 Sincronizar con Google',
      description: 'En la pestaña "🔄 Sync" exporta tus eventos como archivo .ics e impórtalo en Google Calendar, Outlook o Apple Calendar.',
      emoji: '🔄',
      position: 'center',
    },
  ],
}

// ── Hook para manejar estado del tutorial ─────────────────────────────────────
// Usa window.api.saveConfig/loadConfig para persistir en AppImage (no localStorage)
export function useTutorial(key) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Intentar leer desde config guardado
    const check = async () => {
      try {
        // Primero intentar window.api (Electron)
        if (window.api?.loadConfig) {
          const cfg = await window.api.loadConfig()
          const done = cfg?.tutorialsDone?.[key]
          if (!done) setTimeout(() => setShow(true), 800)
        } else {
          // Fallback browser
          const done = localStorage.getItem(`tutorial_done_${key}`)
          if (!done) setTimeout(() => setShow(true), 800)
        }
      } catch {
        setTimeout(() => setShow(true), 800)
      }
    }
    check()
  }, [key])

  const dismiss = async (forever) => {
    setShow(false)
    if (!forever) return
    try {
      if (window.api?.loadConfig) {
        const cfg = await window.api.loadConfig()
        const updated = {
          ...cfg,
          tutorialsDone: { ...(cfg.tutorialsDone || {}), [key]: true }
        }
        await window.api.saveConfig(updated)
      } else {
        localStorage.setItem(`tutorial_done_${key}`, '1')
      }
    } catch(e) {
      console.warn('No se pudo guardar estado tutorial:', e)
    }
  }

  const reset = async () => {
    try {
      if (window.api?.loadConfig) {
        const cfg = await window.api.loadConfig()
        const updated = {
          ...cfg,
          tutorialsDone: { ...(cfg.tutorialsDone || {}), [key]: false }
        }
        await window.api.saveConfig(updated)
      } else {
        localStorage.removeItem(`tutorial_done_${key}`)
      }
    } catch {}
    setShow(true)
  }

  return { show, dismiss, reset }
}

// ── Componente Tutorial ───────────────────────────────────────────────────────
export default function Tutorial({ steps, onDone, accentColor = 'var(--accent)' }) {
  const [step, setStep] = useState(0)
  const [animDir, setAnimDir] = useState(1) // 1 = adelante, -1 = atrás
  const [animating, setAnimating] = useState(false)
  const [skipForever, setSkipForever] = useState(true)
  const total = steps.length
  const current = steps[step]

  const goTo = (next) => {
    if (animating) return
    setAnimDir(next > step ? 1 : -1)
    setAnimating(true)
    setTimeout(() => {
      setStep(next)
      setAnimating(false)
    }, 200)
  }

  const next = () => step < total - 1 ? goTo(step + 1) : onDone(skipForever)
  const prev = () => step > 0 && goTo(step - 1)

  return (
    <>
      {/* Backdrop oscuro */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        animation: 'tutFadeIn 0.3s ease',
      }} onClick={() => onDone(skipForever)} />

      {/* Card del tutorial */}
      <div style={{
        position: 'fixed', zIndex: 1000,
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 420, maxWidth: 'calc(100vw - 40px)',
        background: 'var(--bg-panel)',
        borderRadius: 20,
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        animation: 'tutSlideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)',
      }}>

        {/* Barra de progreso arriba */}
        <div style={{ height: 3, background: 'var(--bg-elem)', position: 'relative' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, height: '100%',
            width: `${((step + 1) / total) * 100}%`,
            background: accentColor,
            borderRadius: 2,
            transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>

        {/* Header con botón cerrar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={14} color={accentColor} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5 }}>
              GUÍA RÁPIDA · {step + 1} de {total}
            </span>
          </div>
          <button onClick={() => onDone(skipForever)} style={{
            background: 'var(--bg-elem)', border: 'none', borderRadius: 8,
            width: 28, height: 28, cursor: 'pointer', color: 'var(--text-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Contenido animado */}
        <div style={{
          padding: '24px 28px',
          animation: animating
            ? (animDir > 0 ? 'tutSlideLeft 0.2s ease' : 'tutSlideRight 0.2s ease')
            : 'none',
        }}>
          {/* Emoji grande */}
          <div style={{
            fontSize: 52, textAlign: 'center', marginBottom: 20,
            filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))',
            lineHeight: 1,
          }}>
            {current.emoji}
          </div>

          <h2 style={{
            fontSize: 18, fontWeight: 800, color: 'var(--text-h)',
            marginBottom: 12, textAlign: 'center', lineHeight: 1.3,
          }}>
            {current.title}
          </h2>

          <p style={{
            fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7,
            textAlign: 'center',
          }}>
            {current.description}
          </p>
        </div>

        {/* Dots de progreso */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 6,
          paddingBottom: 8,
        }}>
          {steps.map((_, i) => (
            <button key={i} onClick={() => goTo(i)} style={{
              width: i === step ? 20 : 7, height: 7,
              borderRadius: 4, border: 'none', cursor: 'pointer',
              background: i === step ? accentColor : 'var(--bg-elem)',
              transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
              padding: 0,
            }} />
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px 20px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {/* Botones nav */}
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button onClick={prev} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 16px', borderRadius: 10, border: 'none',
                background: 'var(--bg-elem)', color: 'var(--text-1)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                <ChevronLeft size={15} /> Atrás
              </button>
            )}
            <button onClick={next} style={{
              flex: 1, display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 6,
              padding: '10px 16px', borderRadius: 10, border: 'none',
              background: accentColor, color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}>
              {step < total - 1
                ? <> Siguiente <ChevronRight size={15} /></>
                : '¡Entendido! 🎉'
              }
            </button>
          </div>

          {/* No volver a mostrar */}
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, cursor: 'pointer', fontSize: 11, color: 'var(--text-3)',
          }}>
            <input
              type="checkbox"
              checked={skipForever}
              onChange={e => setSkipForever(e.target.checked)}
              style={{ accentColor, cursor: 'pointer' }}
            />
            No volver a mostrar este tutorial
          </label>
        </div>
      </div>

      <style>{`
        @keyframes tutFadeIn   { from { opacity:0 } to { opacity:1 } }
        @keyframes tutSlideUp  { from { opacity:0; transform:translate(-50%,-46%) scale(0.95) } to { opacity:1; transform:translate(-50%,-50%) scale(1) } }
        @keyframes tutSlideLeft  { from { opacity:1; transform:translateX(0) } to { opacity:0; transform:translateX(-24px) } }
        @keyframes tutSlideRight { from { opacity:1; transform:translateX(0) } to { opacity:0; transform:translateX(24px) } }
      `}</style>
    </>
  )
}