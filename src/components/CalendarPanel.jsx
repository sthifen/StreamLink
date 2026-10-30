import React, { useState, useEffect, useRef } from 'react'
import Tutorial, { useTutorial, TUTORIALS } from './Tutorial.jsx'
import { loadConfig, saveConfig, openUrl } from '../api.js'
import { ChevronLeft, ChevronRight, Sparkles, X, Loader, CalendarDays, Trash2, Clock, Send, Download, Upload, FileUp } from 'lucide-react'

const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const EVENT_COLORS = [
  '#6b8aff','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#06b6d4'
]

// ── Llamada a OpenRouter ──────────────────────────────────────────────────────
async function parseEventsWithAI(text, config, today) {
  const prompt = `Hoy es ${today}. Extrae TODOS los eventos/citas/recordatorios del siguiente texto.
Devuelve SOLO un array JSON válido, sin markdown, sin explicaciones, sin texto extra.
Formato exacto:
[{"titulo":"...","fecha":"YYYY-MM-DD","hora":"HH:MM o null","descripcion":"..."}]

Si no hay eventos, devuelve: []

Texto: "${text}"`

  const parseResponse = (raw) => {
    const clean = raw.replace(/\`\`\`json|\`\`\`/g, '').trim()
    return JSON.parse(clean)
  }

  // ── Intentar Groq primero ──────────────────────────────────────────────────
  if (config?.groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.groqKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 500,
        })
      })
      if (res.ok) {
        const data = await res.json()
        const raw = data.choices?.[0]?.message?.content || '[]'
        return parseResponse(raw)
      }
    } catch(e) {
      console.warn('Groq calendar falló:', e.message)
    }
  }

  // ── Respaldo: Gemini ───────────────────────────────────────────────────────
  if (config?.geminiKey) {
    try {
      const MODELS = ['gemini-1.5-flash', 'gemini-1.5-flash-8b']
      for (const model of MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiKey}`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
          })
        })
        if (res.ok) {
          const data = await res.json()
          const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
          return parseResponse(raw)
        }
      }
    } catch(e) {
      console.warn('Gemini calendar falló:', e.message)
    }
  }

  // ── Respaldo: OpenRouter ───────────────────────────────────────────────────
  if (config?.openrouterKey) {
    const MODELS = ['openrouter/free', 'meta-llama/llama-3.3-70b-instruct:free', 'mistralai/mistral-small-3.1-24b-instruct:free']
    let lastErr = ''
    for (const model of MODELS) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.openrouterKey}`,
            'HTTP-Referer': 'https://synctablet.app',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 500,
          })
        })
        if (res.status === 429 || res.status === 404) { lastErr = `${model} ${res.status}`; continue }
        if (!res.ok) { lastErr = `${model} ${res.status}`; continue }
        const data = await res.json()
        const raw = data.choices?.[0]?.message?.content || '[]'
        return parseResponse(raw)
      } catch(e) { lastErr = e.message; continue }
    }
    throw new Error(`OpenRouter: ${lastErr}`)
  }

  throw new Error('No hay API key configurada. Agrega Groq, Gemini u OpenRouter en Configuración.')
}


// ── ICS Export ───────────────────────────────────────────────────────────────
function toICSDate(fecha, hora) {
  const d = new Date(fecha + 'T' + (hora || '00:00') + ':00')
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
}

function exportICS(events) {
  if (!events.length) return
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sync Tablet//CalendarPanel//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  events.forEach(ev => {
    const dtstart = toICSDate(ev.fecha, ev.hora)
    const dtend   = toICSDate(ev.fecha, ev.hora) // mismo tiempo, evento simple
    const uid     = `${ev.id || Date.now()}@synctablet`
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTART:${dtstart}`)
    lines.push(`DTEND:${dtend}`)
    lines.push(`SUMMARY:${ev.titulo.replace(/,/g, '\,')}`)
    if (ev.descripcion && ev.descripcion !== ev.titulo) {
      lines.push(`DESCRIPTION:${ev.descripcion.replace(/,/g, '\,').replace(/\n/g, '\n')}`)
    }
    lines.push('END:VEVENT')
  })
  lines.push('END:VCALENDAR')

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `sync-tablet-${new Date().toISOString().slice(0,10)}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

function parseICS(text) {
  const events = []
  const blocks = text.split('BEGIN:VEVENT')
  blocks.slice(1).forEach(block => {
    const get = (key) => {
      const m = block.match(new RegExp(key + ':([^\r\n]+)'))
      return m ? m[1].trim() : ''
    }
    const dtstart = get('DTSTART')
    if (!dtstart) return

    // Parsear fecha YYYYMMDD o YYYYMMDDTHHmmss
    const year  = dtstart.slice(0,4)
    const month = dtstart.slice(4,6)
    const day   = dtstart.slice(6,8)
    const fecha = `${year}-${month}-${day}`
    let hora = null
    if (dtstart.includes('T')) {
      const h = dtstart.slice(9,11)
      const m = dtstart.slice(11,13)
      if (h && m) hora = `${h}:${m}`
    }

    const titulo = get('SUMMARY').replace(/\\,/g, ',') || 'Sin título'
    const descripcion = get('DESCRIPTION').replace(/\\,/g, ',').replace(/\\n/g, ' ') || titulo

    events.push({ titulo, fecha, hora, descripcion })
  })
  return events
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function CalendarPanel({ hasWallpaper, config, setConfig }) {
  const today     = new Date()
  const [open,    setOpen]    = useState(false)
  const [year,    setYear]    = useState(today.getFullYear())
  const [month,   setMonth]   = useState(today.getMonth())
  const [events,  setEvents]  = useState([])
  const [loaded,  setLoaded]  = useState(false)
  const [selected, setSelected] = useState(null) // fecha seleccionada YYYY-MM-DD
  const [view,    setView]    = useState('calendar') // calendar | manual | ai | sync
  const [aiText,  setAiText]  = useState('')
  const [aiState, setAiState] = useState('idle') // idle | loading | done | error
  const [aiMsg,   setAiMsg]   = useState('')
  const [lastAdded, setLastAdded] = useState([])
  const textRef = useRef(null)
  const tutorial = useTutorial('calendar')

  // Cargar eventos desde config
  useEffect(() => {
    loadConfig().then(cfg => {
      setEvents(cfg.calendarEvents || [])
      setLoaded(true)
    })
  }, [])

  // Guardar eventos
  useEffect(() => {
    if (!loaded) return
    loadConfig().then(cfg => {
      saveConfig({ ...cfg, calendarEvents: events })
    })
  }, [events, loaded])

  useEffect(() => {
    if (open && view === 'ai') setTimeout(() => textRef.current?.focus(), 350)
  }, [open, view])

  // ── Helpers de calendario ─────────────────────────────────────────────────
  const daysInMonth  = new Date(year, month + 1, 0).getDate()
  const firstDayWeek = new Date(year, month, 1).getDay()
  const todayStr     = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  const eventsForDate = (dateStr) => events.filter(e => e.fecha === dateStr)

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y-1) } else setMonth(m => m-1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y+1) } else setMonth(m => m+1) }

  // ── Parsear con IA ────────────────────────────────────────────────────────
  const handleAI = async () => {
    const text = aiText.trim()
    if (!text) return
    const hasKey = config?.groqKey || config?.geminiKey || config?.openrouterKey
    if (!hasKey) {
      setAiState('error')
      setAiMsg('⚠ Agrega tu API key en Configuración. Recomendado: Groq (console.groq.com)')
      return
    }

    setAiState('loading')
    setAiMsg('')

    try {
      const parsed = await parseEventsWithAI(text, config, todayStr)
      if (!parsed.length) {
        setAiState('error')
        setAiMsg('No encontré eventos en el texto. Intenta ser más específico.')
        return
      }

      // Agregar color automático y id
      const newEvents = parsed.map((e, i) => ({
        ...e,
        id: Date.now() + i,
        color: EVENT_COLORS[(events.length + i) % EVENT_COLORS.length],
      }))

      setEvents(prev => [...prev, ...newEvents])
      setLastAdded(newEvents)
      setAiState('done')
      setAiMsg(`✓ ${newEvents.length} evento${newEvents.length > 1 ? 's' : ''} agregado${newEvents.length > 1 ? 's' : ''}`)
      setAiText('')

      // Ir al mes del primer evento
      if (newEvents[0]?.fecha) {
        const d = new Date(newEvents[0].fecha + 'T12:00:00')
        setMonth(d.getMonth())
        setYear(d.getFullYear())
      }

      setTimeout(() => { setAiState('idle'); setAiMsg(''); setLastAdded([]) }, 4000)
    } catch (e) {
      setAiState('error')
      setAiMsg(`Error: ${e.message}`)
    }
  }

  const removeEvent = (id) => setEvents(p => p.filter(e => e.id !== id))

  const selectedEvents = selected ? eventsForDate(selected) : []

  const glassStyle = { background: 'rgba(12,14,20,0.82)', backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)' }

  // Contar eventos del mes actual
  const monthStr   = `${year}-${String(month+1).padStart(2,'0')}`
  const monthCount = events.filter(e => e.fecha?.startsWith(monthStr)).length

  return (
    <>
      {/* ── Botón lengüeta izquierda ── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Calendario"
        style={{
          position: 'fixed',
          right: open ? 340 : 0,
          left: 'auto',
          top: '55%',
          transform: 'translateY(-50%) translateY(50px)',
          zIndex: 150,
          width: 28, height: 72,
          borderRadius: '10px 0 0 10px',
          background: open ? 'var(--accent)' : (hasWallpaper ? 'rgba(79,110,247,0.85)' : 'var(--accent)'),
          backdropFilter: 'blur(8px)',
          border: 'none', cursor: 'pointer',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 3,
          transition: 'right 0.38s cubic-bezier(0.4,0,0.2,1), background 0.2s',
          boxShadow: '3px 0 16px rgba(79,110,247,0.3)',
        }}
      >
        <CalendarDays size={13} color="#fff" />
        {monthCount > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 800, color: '#fff',
            background: 'rgba(255,255,255,0.25)',
            borderRadius: 6, padding: '1px 4px', lineHeight: 1.4,
          }}>{monthCount}</span>
        )}
      </button>

      {/* ── Panel lateral izquierdo ── */}
      <div style={{
        position: 'fixed',
top: 0,
right: 0,
left: 'auto',
bottom: 0,
        width: 340, zIndex: 140,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.38s cubic-bezier(0.4,0,0.2,1)',
        borderLeft: '1px solid var(--border)',
borderRight: 'none',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        ...glassStyle,
      }}>

        {/* Header */}
        <div style={{ padding: '16px 16px 10px', borderBottom: '0.5px solid var(--border-lit)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-h)', letterSpacing: -0.3 }}>
                Calendario
              </h2>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                {events.length} evento{events.length !== 1 ? 's' : ''} guardado{events.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => tutorial.reset()} title="Ver tutorial" style={{
                background: 'var(--bg-elem)', border: 'none', borderRadius: 8,
                width: 28, height: 28, cursor: 'pointer', color: 'var(--text-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
              }}>?</button>
              <button onClick={() => setOpen(false)} style={{
                background: 'var(--bg-elem)', border: 'none', borderRadius: 8,
                padding: 6, cursor: 'pointer', color: 'var(--text-2)',
                display: 'flex', alignItems: 'center',
              }}><X size={14} /></button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 3 }}>
            {[
              { id: 'calendar', label: '📅' },
              { id: 'manual',   label: '✏️' },
              { id: 'ai',       label: '✨ IA' },
              { id: 'sync',     label: '🔄 Sync' },
            ].map(t => (
              <button key={t.id} onClick={() => setView(t.id)} style={{
                flex: 1, padding: '7px 3px', borderRadius: 8, border: 'none',
                fontSize: 11, fontWeight: view === t.id ? 700 : 400,
                background: view === t.id ? 'var(--accent)' : 'var(--bg-elem)',
                color: view === t.id ? '#fff' : 'var(--text-2)',
                cursor: 'pointer', transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* ── Vista Calendario ── */}
        {view === 'calendar' && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Navegación mes */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px 8px',
            }}>
              <button onClick={prevMonth} style={{ background: 'var(--bg-elem)', border: 'none', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: 'var(--text-1)' }}>
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-h)' }}>
                {MONTHS[month]} {year}
              </span>
              <button onClick={nextMonth} style={{ background: 'var(--bg-elem)', border: 'none', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: 'var(--text-1)' }}>
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Grid días de la semana */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 10px', gap: 1 }}>
              {DAYS.map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', padding: '4px 0', letterSpacing: 0.3 }}>{d}</div>
              ))}
            </div>

            {/* Grid días */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 10px 10px', gap: 2 }}>
              {/* Espacios vacíos al inicio */}
              {Array.from({ length: firstDayWeek }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {/* Días del mes */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day     = i + 1
                const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                const isToday = dateStr === todayStr
                const isSel   = dateStr === selected
                const dayEvs  = eventsForDate(dateStr)
                const hasEvs  = dayEvs.length > 0

                return (
                  <button
                    key={day}
                    onClick={() => setSelected(isSel ? null : dateStr)}
                    style={{
                      position: 'relative',
                      aspectRatio: '1',
                      borderRadius: 8,
                      border: 'none',
                      background: isSel ? 'var(--accent)'
                        : isToday ? 'var(--accent-soft)'
                        : hasEvs ? 'var(--bg-hover)'
                        : 'transparent',
                      color: isSel ? '#fff' : isToday ? 'var(--accent)' : 'var(--text-h)',
                      fontWeight: isToday || isSel ? 700 : 400,
                      fontSize: 13,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      outline: isToday && !isSel ? '1.5px solid var(--accent)' : 'none',
                    }}
                  >
                    {day}
                    {/* Dots de eventos */}
                    {hasEvs && (
                      <div style={{ display: 'flex', gap: 2, position: 'absolute', bottom: 3 }}>
                        {dayEvs.slice(0, 3).map((ev, idx) => (
                          <div key={idx} style={{
                            width: 4, height: 4, borderRadius: '50%',
                            background: isSel ? 'rgba(255,255,255,0.8)' : ev.color || 'var(--accent)',
                          }} />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Eventos del día seleccionado */}
            {selected && (
              <div style={{ borderTop: '0.5px solid var(--border-lit)', padding: '12px 14px', flex: 1 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, marginBottom: 8 }}>
                  {new Date(selected + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
                </p>
                {selectedEvents.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>Sin eventos este día</p>
                ) : (
                  selectedEvents.map(ev => (
                    <EventCard key={ev.id} ev={ev} onRemove={() => removeEvent(ev.id)} />
                  ))
                )}
              </div>
            )}

            {/* Próximos eventos si no hay día seleccionado */}
            {!selected && (
              <div style={{ borderTop: '0.5px solid var(--border-lit)', padding: '12px 14px', flex: 1 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, marginBottom: 8 }}>
                  PRÓXIMOS EVENTOS
                </p>
                {events
                  .filter(e => e.fecha >= todayStr)
                  .sort((a, b) => a.fecha.localeCompare(b.fecha))
                  .slice(0, 5)
                  .map(ev => (
                    <EventCard key={ev.id} ev={ev} onRemove={() => removeEvent(ev.id)} showDate />
                  ))
                }
                {events.filter(e => e.fecha >= todayStr).length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 0', opacity: 0.5 }}>
                    <span style={{ fontSize: 28 }}>📭</span>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>Sin eventos próximos</p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Usa ✨ Agregar con IA</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Vista Manual ── */}
        {view === 'manual' && (
          <ManualEventForm
            onAdd={(ev) => {
              setEvents(prev => [...prev, { ...ev, id: Date.now(), color: EVENT_COLORS[events.length % EVENT_COLORS.length] }])
              setView('calendar')
              // Ir al mes del evento
              const d = new Date(ev.fecha + 'T12:00:00')
              setMonth(d.getMonth())
              setYear(d.getFullYear())
            }}
            hasWallpaper={hasWallpaper}
          />
        )}

        {/* ── Vista IA ── */}
        {view === 'ai' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px' }}>
            <div style={{
              padding: '10px 12px', borderRadius: 10, marginBottom: 14,
              background: 'rgba(79,110,247,0.08)', border: '1px solid rgba(79,110,247,0.2)',
            }}>
              <p style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.6 }}>
                <strong>✨ IA con OpenRouter</strong><br />
                Escribe tus eventos en lenguaje natural y la IA los pondrá en el calendario automáticamente.
              </p>
            </div>

            {/* Ejemplo */}
            <div style={{
              padding: '8px 12px', borderRadius: 8, marginBottom: 12,
              background: 'var(--bg-elem)', border: '1px dashed var(--border-lit)',
            }}>
              <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4, fontWeight: 700, letterSpacing: 0.3 }}>EJEMPLO:</p>
              <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, fontStyle: 'italic' }}>
                "El jueves 19 de abril tengo que limpiar el panel y el 30 de abril reunión con el jefe a las 2 de la tarde"
              </p>
            </div>

            {/* Campo de texto */}
            <textarea
              ref={textRef}
              value={aiText}
              onChange={e => setAiText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && e.ctrlKey && handleAI()}
              placeholder="Escribe tus eventos aquí…"
              rows={5}
              style={{
                flex: 1, resize: 'none',
                background: 'var(--bg-elem)', color: 'var(--text-h)',
                border: '1.5px solid var(--border-lit)', borderRadius: 10,
                padding: '12px', fontSize: 13, lineHeight: 1.6,
                outline: 'none', fontFamily: 'inherit',
                marginBottom: 10,
                minHeight: 120,
              }}
            />

            {/* Mensaje de estado */}
            {aiMsg && (
              <div style={{
                padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: 12,
                background: aiState === 'done' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${aiState === 'done' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                color: aiState === 'done' ? 'var(--success)' : 'var(--error)',
              }}>
                {aiMsg}
              </div>
            )}

            {/* Eventos recién agregados */}
            {lastAdded.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {lastAdded.map(ev => (
                  <div key={ev.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 8, marginBottom: 4,
                    background: 'var(--bg-elem)',
                    animation: 'slideInLeft 0.3s ease',
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ev.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-h)', flex: 1 }}>{ev.titulo}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                      {ev.fecha} {ev.hora || ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Botón enviar */}
            <button
              onClick={handleAI}
              disabled={aiState === 'loading' || !aiText.trim()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px', borderRadius: 10, border: 'none',
                background: aiState === 'loading' || !aiText.trim() ? 'var(--bg-elem)' : 'var(--accent)',
                color: aiState === 'loading' || !aiText.trim() ? 'var(--text-3)' : '#fff',
                fontSize: 13, fontWeight: 700, cursor: aiState === 'loading' || !aiText.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {aiState === 'loading'
                ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Procesando…</>
                : <><Sparkles size={15} /> Agregar al calendario</>
              }
            </button>

            <p style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center', marginTop: 8 }}>
              Ctrl+Enter para enviar · Usa OpenRouter gratis
            </p>

            {/* Config API key */}
            {!config?.groqKey && !config?.geminiKey && !config?.openrouterKey && (
              <div style={{
                marginTop: 12, padding: '10px 12px', borderRadius: 10,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              }}>
                <p style={{ fontSize: 11, color: '#f59e0b', lineHeight: 1.5 }}>
                  ⚠ Agrega una API key en Configuración.<br />
                  <strong>Recomendado: Groq (gratis y rápido)</strong><br />
                  console.groq.com → API Keys
                </p>
              </div>
            )}
          </div>
        )}
        {/* ── Vista Sync ICS ── */}
        {view === 'sync' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
              Exporta e importa en formato <strong>.ics</strong> — compatible con Google Calendar, Outlook, Apple Calendar y más.
            </p>

            {/* Exportar */}
            <div style={{ borderRadius: 12, border: '0.5px solid var(--border-lit)', background: 'var(--bg-card)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border-lit)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(79,110,247,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Download size={14} color="var(--accent)" />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)' }}>Exportar eventos</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{events.length} evento{events.length !== 1 ? 's' : ''} guardado{events.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => exportICS(events)} disabled={events.length === 0} style={{
                  padding: '10px', borderRadius: 8, border: 'none',
                  background: events.length ? 'var(--accent)' : 'var(--bg-elem)',
                  color: events.length ? '#fff' : 'var(--text-3)',
                  fontSize: 13, fontWeight: 700, cursor: events.length ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: events.length ? 1 : 0.6,
                }}>
                  <Download size={14} /> Descargar .ics
                </button>
                <p style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, letterSpacing: 0.3 }}>ABRIR EN:</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <a href="https://calendar.google.com/calendar/r/settings/import" target="_blank" rel="noreferrer" style={{
                    flex: 1, padding: '8px 6px', borderRadius: 8, textDecoration: 'none',
                    background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    fontSize: 11, color: 'var(--text-1)', fontWeight: 600,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Google Cal ↗
                  </a>
                  <a href="https://outlook.live.com/calendar/0/addevent" target="_blank" rel="noreferrer" style={{
                    flex: 1, padding: '8px 6px', borderRadius: 8, textDecoration: 'none',
                    background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    fontSize: 11, color: 'var(--text-1)', fontWeight: 600,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#0078d4"><path d="M7 2v20l15-4V6L7 2z"/></svg>
                    Outlook ↗
                  </a>
                </div>
              </div>
            </div>

            {/* Importar */}
            <div style={{ borderRadius: 12, border: '0.5px solid var(--border-lit)', background: 'var(--bg-card)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border-lit)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Upload size={14} color="var(--success)" />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)' }}>Importar eventos</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Desde Google Calendar, Outlook, Apple…</p>
                </div>
              </div>
              <div style={{ padding: '12px 14px' }}>
                <label style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px', borderRadius: 8, cursor: 'pointer',
                  background: 'rgba(16,185,129,0.08)', border: '1.5px dashed rgba(16,185,129,0.4)',
                  color: 'var(--success)', fontSize: 13, fontWeight: 700,
                }}>
                  <Upload size={14} /> Seleccionar .ics
                  <input type="file" accept=".ics,text/calendar" style={{ display: 'none' }} onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = (ev) => {
                      const parsed = parseICS(ev.target.result)
                      if (!parsed.length) { alert('No se encontraron eventos'); return }
                      const newEvs = parsed.map((ev, i) => ({ ...ev, id: Date.now() + i, color: EVENT_COLORS[(events.length + i) % EVENT_COLORS.length] }))
                      setEvents(prev => {
                        const existing = new Set(prev.map(e => e.titulo + e.fecha))
                        return [...prev, ...newEvs.filter(e => !existing.has(e.titulo + e.fecha))]
                      })
                      if (parsed[0]?.fecha) { const d = new Date(parsed[0].fecha + 'T12:00:00'); setMonth(d.getMonth()); setYear(d.getFullYear()) }
                      setView('calendar')
                      alert(`✓ ${parsed.length} evento(s) importado(s)`)
                    }
                    reader.readAsText(file); e.target.value = ''
                  }} />
                </label>
              </div>
            </div>

            {/* Compatible con */}
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-elem)' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, marginBottom: 6 }}>COMPATIBLE CON</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {['Google Calendar','Outlook','Apple Calendar','Thunderbird','Proton Calendar','Fantastical'].map(app => (
                  <span key={app} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--bg-card)', color: 'var(--text-2)', border: '0.5px solid var(--border-lit)' }}>{app}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tutorial calendario */}
      {tutorial.show && open && (
        <Tutorial
          steps={TUTORIALS.calendar}
          onDone={(f) => tutorial.dismiss(f)}
          accentColor="#6b8aff"
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideInLeft { from { opacity:0; transform:translateX(-8px); } to { opacity:1; transform:none; } }
        @keyframes fadeInModal { from { opacity:0; } to { opacity:1; } }
        @keyframes slideUpModal { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
      `}</style>
    </>
  )
}

function EventCard({ ev, onRemove, showDate }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        padding: '8px 10px', borderRadius: 9, marginBottom: 6,
        background: hovered ? 'var(--bg-hover)' : 'var(--bg-card)',
        border: '0.5px solid var(--border-lit)',
        borderLeft: `3px solid ${ev.color || 'var(--accent)'}`,
        transition: 'background 0.15s',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)', lineHeight: 1.3 }}>
          {ev.titulo}
        </p>
        {ev.descripcion && ev.descripcion !== ev.titulo && (
          <p style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.4 }}>
            {ev.descripcion}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          {showDate && (
            <span style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <CalendarDays size={10} />
              {new Date(ev.fecha + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {ev.hora && (
            <span style={{ fontSize: 10, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Clock size={10} /> {ev.hora}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onRemove}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 3, borderRadius: 5, color: 'var(--text-3)',
          opacity: hovered ? 1 : 0, transition: 'opacity 0.15s, color 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

// ── Formulario manual ─────────────────────────────────────────────────────────
function ManualEventForm({ onAdd, hasWallpaper }) {
  const today = new Date().toISOString().split('T')[0]
  const [titulo,  setTitulo]  = useState('')
  const [fecha,   setFecha]   = useState(today)
  const [hora,    setHora]    = useState('')
  const [desc,    setDesc]    = useState('')
  const [color,   setColor]   = useState(EVENT_COLORS[0])
  const [error,   setError]   = useState('')

  const handleSubmit = () => {
    if (!titulo.trim()) { setError('El título es obligatorio'); return }
    if (!fecha)         { setError('La fecha es obligatoria'); return }
    setError('')
    onAdd({ titulo: titulo.trim(), fecha, hora: hora || null, descripcion: desc.trim() || titulo.trim(), color })
  }

  const inputStyle = {
    width: '100%', background: 'var(--bg-elem)', color: 'var(--text-h)',
    border: '1.5px solid var(--border-lit)', borderRadius: 8,
    padding: '9px 12px', fontSize: 13, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

      {/* Título */}
      <div style={{ marginBottom: 12 }}>
        <label style={S.label}>TÍTULO *</label>
        <input
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Ej: Reunión con el jefe"
          autoFocus
          style={inputStyle}
        />
      </div>

      {/* Fecha y Hora en fila */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>FECHA *</label>
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            style={{
              ...inputStyle,
              colorScheme: 'dark',
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>HORA (opcional)</label>
          <input
            type="time"
            value={hora}
            onChange={e => setHora(e.target.value)}
            style={{
              ...inputStyle,
              colorScheme: 'dark',
            }}
          />
        </div>
      </div>

      {/* Descripción */}
      <div style={{ marginBottom: 12 }}>
        <label style={S.label}>DESCRIPCIÓN (opcional)</label>
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="Detalles del evento…"
          rows={3}
          style={{
            ...inputStyle,
            resize: 'none', lineHeight: 1.5,
          }}
        />
      </div>

      {/* Color */}
      <div style={{ marginBottom: 16 }}>
        <label style={S.label}>COLOR</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {EVENT_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 24, height: 24, borderRadius: '50%',
                background: c, border: 'none', cursor: 'pointer',
                outline: color === c ? `3px solid ${c}` : '3px solid transparent',
                outlineOffset: 2,
                transform: color === c ? 'scale(1.2)' : 'scale(1)',
                transition: 'all 0.15s',
              }}
            />
          ))}
        </div>
      </div>

      {/* Preview del evento */}
      {titulo && fecha && (
        <div style={{
          padding: '10px 12px', borderRadius: 10, marginBottom: 14,
          background: 'var(--bg-elem)',
          borderLeft: `3px solid ${color}`,
          animation: 'slideInLeft 0.2s ease',
        }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-h)' }}>{titulo}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              📅 {new Date(fecha + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            {hora && <span style={{ fontSize: 11, color: color }}>🕐 {hora}</span>}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p style={{
          fontSize: 12, color: 'var(--error)', marginBottom: 10,
          padding: '6px 10px', borderRadius: 7,
          background: 'rgba(239,68,68,0.08)',
        }}>⚠ {error}</p>
      )}

      {/* Botón agregar */}
      <button
        onClick={handleSubmit}
        disabled={!titulo.trim() || !fecha}
        style={{
          width: '100%', padding: '12px', borderRadius: 10, border: 'none',
          background: titulo.trim() && fecha ? color : 'var(--bg-elem)',
          color: titulo.trim() && fecha ? '#fff' : 'var(--text-3)',
          fontSize: 13, fontWeight: 700, cursor: titulo.trim() && fecha ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <CalendarDays size={15} /> Agregar al calendario
      </button>
    </div>
  )
}

const S = {
  label: {
    display: 'block', fontSize: 10, fontWeight: 700,
    color: 'var(--text-3)', letterSpacing: 0.5, marginBottom: 5,
  }
}

// ── Vista Sync ICS ────────────────────────────────────────────────────────────
function SyncICSView({ events, onExport, onImport, eventColors, eventsLength }) {
  const [importMsg,   setImportMsg]   = useState('')
  const [importState, setImportState] = useState('idle')


  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const parsed = parseICS(ev.target.result)
      if (!parsed.length) {
        setImportState('error')
        setImportMsg('No se encontraron eventos en el archivo .ics')
        return
      }
      const newEvents = parsed.map((ev, i) => ({
        ...ev,
        id: Date.now() + i,
        color: eventColors[(eventsLength + i) % eventColors.length],
      }))
      onImport(newEvents)
      setImportState('ok')
      setImportMsg(`✓ ${parsed.length} evento${parsed.length > 1 ? 's' : ''} importado${parsed.length > 1 ? 's' : ''} correctamente`)
      setTimeout(() => { setImportState('idle'); setImportMsg('') }, 3000)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Título */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-h)', marginBottom: 4 }}>
          Sincronizar calendario
        </h3>
        <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
          Exporta e importa eventos en formato .ics — compatible con Google Calendar, Outlook, Apple Calendar y más.
        </p>
      </div>

      {/* Exportar */}
      <div style={{
        borderRadius: 12, border: '0.5px solid var(--border-lit)',
        background: 'var(--bg-card)', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--border-lit)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: 'rgba(79,110,247,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Download size={15} color="var(--accent)" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)' }}>Exportar eventos</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {events.length} evento{events.length !== 1 ? 's' : ''} guardado{events.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 6 }}>
            Descarga todos tus eventos como archivo <strong>.ics</strong> para importarlos en cualquier app de calendario.
          </p>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <button
            onClick={onExport}
            disabled={events.length === 0}
            style={{
              width: '100%', padding: '10px', borderRadius: 8, border: 'none',
              background: events.length ? 'var(--accent)' : 'var(--bg-elem)',
              color: events.length ? '#fff' : 'var(--text-3)',
              fontSize: 13, fontWeight: 700,
              cursor: events.length ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: events.length ? 1 : 0.6,
              transition: 'all 0.15s',
            }}
          >
            <Download size={14} /> Exportar .ics
          </button>
          {/* Links directos — siempre visibles */}
          <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 10, marginBottom: 4, fontWeight: 600, letterSpacing: 0.3 }}>IMPORTAR EN:</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <a href="https://calendar.google.com/calendar/r/settings/import" target="_blank" rel="noreferrer"
              style={{
                flex: 1, padding: '7px', borderRadius: 7, textDecoration: 'none',
                background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                fontSize: 11, color: 'var(--text-2)', fontWeight: 600,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-elem)'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google Cal ↗
            </a>
            <a href="https://outlook.live.com/calendar/0/addevent" target="_blank" rel="noreferrer"
              style={{
                flex: 1, padding: '7px', borderRadius: 7, textDecoration: 'none',
                background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                fontSize: 11, color: 'var(--text-2)', fontWeight: 600,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-elem)'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#0078d4"><path d="M7 2v20l15-4V6L7 2z"/></svg>
              Outlook ↗
            </a>
          </div>
        </div>
      </div>

      {/* Importar */}
      <div style={{
        borderRadius: 12, border: '0.5px solid var(--border-lit)',
        background: 'var(--bg-card)', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--border-lit)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: 'rgba(16,185,129,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Upload size={15} color="var(--success)" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)' }}>Importar eventos</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Desde Google Calendar, Outlook, Apple Calendar…</p>
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 6 }}>
            Selecciona un archivo <strong>.ics</strong> para agregar sus eventos al calendario. Los duplicados se omiten automáticamente.
          </p>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(16,185,129,0.1)', border: '1.5px dashed rgba(16,185,129,0.4)',
            color: 'var(--success)', fontSize: 13, fontWeight: 700,
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.18)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.1)' }}
          >
            <Upload size={14} /> Seleccionar archivo .ics
            <input type="file" accept=".ics,text/calendar" style={{ display: 'none' }} onChange={handleImport} />
          </label>

          {/* Mensaje estado importación */}
          {importMsg && (
            <div style={{
              marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: 12,
              background: importState === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${importState === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: importState === 'ok' ? 'var(--success)' : 'var(--error)',
              animation: 'slideInLeft 0.2s ease',
            }}>
              {importMsg}
            </div>
          )}
        </div>
      </div>

      {/* Info formatos */}
      <div style={{
        padding: '10px 12px', borderRadius: 10,
        background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)',
      }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, marginBottom: 6 }}>
          COMPATIBLE CON
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['Google Calendar','Outlook','Apple Calendar','Thunderbird','Proton Calendar','Any.do','Fantastical'].map(app => (
            <span key={app} style={{
              fontSize: 10, padding: '3px 8px', borderRadius: 10,
              background: 'var(--bg-card)', color: 'var(--text-2)',
              border: '0.5px solid var(--border-lit)',
            }}>{app}</span>
          ))}
        </div>
      </div>
    </div>
  )
}