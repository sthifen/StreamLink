import React, { useState, useEffect, useRef, useCallback } from 'react'

import {
  Plus, Folder, FileText, Trash2, Edit3, Save, X,
  ChevronRight, ChevronLeft, Image, Table, List,
  Bold, Italic, Heading1, Heading2, AlignLeft,
  Sparkles, Loader, Download, Upload, RefreshCw,
  Circle, Square, ArrowRight, Pen, Eraser, Minus,
  FolderOpen, Star, Palette, MoreHorizontal, Search, Camera,
  Timer, Layers, BookOpen, Calculator, Smartphone
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const genId = () => Math.random().toString(36).slice(2, 10)

// ── KaTeX loader (para fórmulas LaTeX) ───────────────────────────────────────
let katexLoaded = false
function loadKaTeX() {
  if (katexLoaded || document.getElementById('katex-css')) return Promise.resolve()
  return new Promise(resolve => {
    const css  = document.createElement('link')
    css.id     = 'katex-css'
    css.rel    = 'stylesheet'
    css.href   = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css'
    document.head.appendChild(css)

    const script  = document.createElement('script')
    script.src    = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js'
    script.onload = () => { katexLoaded = true; resolve() }
    document.head.appendChild(script)
  })
}

function renderLatex(tex, display = false) {
  try {
    return window.katex?.renderToString(tex, { displayMode: display, throwOnError: false }) || tex
  } catch { return tex }
}
const now    = () => new Date().toISOString()
const fmtDate = (iso) => new Date(iso).toLocaleDateString('es', {
  day: 'numeric', month: 'short', year: 'numeric'
})

const COVER_COLORS = [
  '#4f6ef7','#10b981','#f59e0b','#ef4444',
  '#8b5cf6','#ec4899','#06b6d4','#84cc16',
]

const TABLET_PATH = '/sdcard/SyncTabletNotas'
const LOCAL_KEY   = 'synctablet_notes'

// ── Persistencia local ────────────────────────────────────────────────────────
function loadNotes() {
  // Intentar leer de localStorage (fallback)
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { folders: [], notes: [] }
}

function saveNotes(data) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)) } catch {}
  if (window.api?.loadConfig) {
    window.api.loadConfig().then(cfg => {
      window.api.saveConfig({ ...cfg, notesData: data })
    }).catch(() => {})
  }
}

// ── WebviewPDF — carga PDF via servidor HTTP local ────────────────────────────
function WebviewPDF({ pdf }) {
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!pdf?.path) return
    setLoading(true)
    setError(null)
    setUrl(null)
    window.api.servePdf?.(pdf.path).then(r => {
      if (r?.ok) setUrl(r.url)
      else setError('No se pudo servir el PDF')
      setLoading(false)
    }).catch(e => { setError(e.message); setLoading(false) })
  }, [pdf?.path])

  if (!pdf?.path) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 13 }}>
      Sin documento cargado
    </div>
  )

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', gap: 10 }}>
      <div style={{ width: 18, height: 18, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}/>
      Cargando PDF...
    </div>
  )

  if (error) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 }}>
      <span style={{ fontSize: 32 }}>📄</span>
      <p style={{ color: '#f88', fontSize: 12 }}>{error}</p>
      <button onClick={() => window.api?.openPath?.(pdf.path)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
        Abrir externamente
      </button>
    </div>
  )

  return (
    <webview
      src={url}
      partition="persist:browser"
      style={{ flex: 1, width: '100%', minHeight: 0 }}
    />
  )
}


// ── Resizable Panel ───────────────────────────────────────────────────────────
function ResizablePanel({ children, defaultWidth, minWidth, maxWidth }) {
  const outerRef = useRef(null)
  useEffect(() => { if (outerRef.current) outerRef.current.style.width = defaultWidth + 'px' }, [])

  return (
    <div ref={outerRef} style={{
      flexShrink: 0, display: 'flex', minHeight: 0,
      position: 'relative', minWidth, maxWidth,
    }}>
      <div
        onPointerDown={e => {
          if (e.button !== 0) return
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          const el = outerRef.current
          const startX = e.clientX
          const startW = el.offsetWidth
          let raf = null
          e.currentTarget.onpointermove = (ev) => {
            if (raf) return
            raf = requestAnimationFrame(() => {
              raf = null
              const newW = Math.min(maxWidth, Math.max(minWidth, startW + (startX - ev.clientX)))
              el.style.width = newW + 'px'
            })
          }
          e.currentTarget.onpointerup = (ev) => {
            if (raf) cancelAnimationFrame(raf)
            e.currentTarget.onpointermove = null
            e.currentTarget.onpointerup = null
            e.currentTarget.releasePointerCapture(ev.pointerId)
          }
        }}
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 6,
          cursor: 'ew-resize', zIndex: 20, background: 'var(--border)',
          transition: 'background 0.15s', touchAction: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--border)' }}
      />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minWidth: 0, paddingLeft: 6 }}>
        {children}
      </div>
    </div>
  )
}


// ── IA: contexto de nota ──────────────────────────────────────────────────────
async function askAI(noteContent, question, apiKey) {
  // Modelos gratuitos verificados en OpenRouter (Abril 2026)
  const MODELS = [
    'openrouter/free',                              // Router automático — siempre funciona
    'meta-llama/llama-3.3-70b-instruct:free',       // Llama 3.3 70B — muy bueno
    'mistralai/mistral-small-3.1-24b-instruct:free',// Mistral Small — sólido
    'qwen/qwen3-8b:free',                           // Qwen3 — rápido
  ]

  const prompt = `Eres un asistente de notas inteligente.
El usuario está escribiendo esta nota:
---
${noteContent.slice(0, 1500)}
---
${question ? `Pregunta: ${question}` : 'Sugiere cómo continuar, corrige errores o agrega información relevante. Sé breve y útil.'}
Responde en español, máximo 3 párrafos.`

  let lastError = null
  for (const model of MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://synctablet.app',
          'X-Title': 'Sync Tablet Notes',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 600,
        })
      })

      if (res.status === 429 || res.status === 503) {
        lastError = `${model} → rate limit`
        continue  // Probar siguiente modelo
      }
      if (!res.ok) throw new Error(`Error ${res.status}`)

      const data = await res.json()
      const text = data.choices?.[0]?.message?.content || ''
      if (!text) continue
      return text
    } catch(e) {
      lastError = e.message
      continue
    }
  }
  throw new Error(`Todos los modelos fallaron. Último error: ${lastError}`)
}

// ── IA con imagen (análisis visual de captura de tablet) ──────────────────────
async function askAIVision(imageBase64, question, apiKey) {
  // Modelos con soporte de visión
  const VISION_MODELS = [
    'openrouter/free',
    'meta-llama/llama-3.2-11b-vision-instruct:free',
    'google/gemma-3-12b-it:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
  ]

  const prompt = question ||
    'Analiza esta captura de pantalla de una tablet Android. Describe detalladamente qué ves: apps abiertas, contenido visible, texto, notificaciones, estado del sistema. Responde en español.'

  let lastError = null
  for (const model of VISION_MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://synctablet.app',
          'X-Title': 'Sync Tablet Notes',
        },
        body: JSON.stringify({
          model,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageBase64 } },
              { type: 'text', text: prompt }
            ]
          }],
          max_tokens: 800,
        })
      })
      if (res.status === 429 || res.status === 503) { lastError = `${model} → rate limit`; continue }
      if (!res.ok) { lastError = `${model} → ${res.status}`; continue }
      const data = await res.json()
      const text = data.choices?.[0]?.message?.content || ''
      if (!text) continue
      return text
    } catch(e) { lastError = e.message; continue }
  }
  throw new Error(`Sin respuesta de visión: ${lastError}`)
}

// ════════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════════
export default function NotesPanel({ config, hasWallpaper, devices }) {
  const [data,       setData]       = useState(() => ({ folders: [], notes: [] }))
  const [dataLoaded, setDataLoaded] = useState(false)
  const [modal,      setModal]      = useState(null)
  const [pdfViewer,  setPdfViewer]  = useState(null)   // { base64, name, path }
  const [showPomodoro, setShowPomodoro] = useState(false)
  const [flashcards, setFlashcards] = useState(null)   // array de cards // { type, value, onOk, onCancel, title }
  const [view,       setView]       = useState('home')   // home | folder | note | draw
  const [activeNote, setActiveNote] = useState(null)
  const [activeFolder, setActiveFolder] = useState(null)
  const [search,     setSearch]     = useState('')
  const [syncing,    setSyncing]    = useState(false)
  const [syncMsg,    setSyncMsg]    = useState('')

  const usbDevice = devices?.find(d => d.status === 'device' && !d.serial?.includes(':'))

  // Cargar notas al montar
  useEffect(() => {
    const load = async () => {
      try {
        if (window.api?.loadConfig) {
          const cfg = await window.api.loadConfig()
          if (cfg?.notesData?.notes) {
            setData(cfg.notesData)
            setDataLoaded(true)
            return
          }
        }
      } catch {}
      // Fallback localStorage
      setData(loadNotes())
      setDataLoaded(true)
    }
    load()
  }, [])

  // Guardar cada vez que cambia data (solo después de cargar)
  useEffect(() => {
    if (!dataLoaded) return
    saveNotes(data)
  }, [data, dataLoaded])

  // ── CRUD Folders ─────────────────────────────────────────────────────────
  const createFolder = () => {
    setModal({
      type: 'input', title: '📁 Nueva carpeta', placeholder: 'Nombre de la carpeta',
      value: '',
      onOk: (name) => {
        if (!name?.trim()) return
        const folder = {
          id: genId(), name: name.trim(),
          color: COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)],
          cover: null, createdAt: now(),
        }
        setData(d => ({ ...d, folders: [...d.folders, folder] }))
      }
    })
  }

  const deleteFolder = (id) => {
    setModal({
      type: 'confirm', title: '¿Eliminar carpeta y todas sus notas?',
      onOk: () => {
        setData(d => ({
          folders: d.folders.filter(f => f.id !== id),
          notes:   d.notes.filter(n => n.folderId !== id),
        }))
        if (activeFolder?.id === id) { setView('home'); setActiveFolder(null) }
      }
    })
  }

  const renameFolder = (id) => {
    const folder = data.folders.find(f => f.id === id)
    setModal({
      type: 'input', title: '✏️ Renombrar carpeta', placeholder: 'Nuevo nombre',
      value: folder?.name || '',
      onOk: (name) => {
        if (!name?.trim()) return
        setData(d => ({
          ...d,
          folders: d.folders.map(f => f.id === id ? { ...f, name: name.trim() } : f)
        }))
      }
    })
  }

  // ── CRUD Notes ────────────────────────────────────────────────────────────
  const createNote = (folderId = null) => {
    const note = {
      id: genId(), folderId,
      title: 'Nueva nota',
      content: '',
      blocks: [{ id: genId(), type: 'text', content: '' }],
      cover: COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)],
      emoji: '📝',
      createdAt: now(), updatedAt: now(),
    }
    setData(d => ({ ...d, notes: [...d.notes, note] }))
    setActiveNote(note)
    setView('note')
  }

  const updateNote = (id, changes) => {
    setData(d => ({
      ...d,
      notes: d.notes.map(n => n.id === id
        ? { ...n, ...changes, updatedAt: now() }
        : n
      )
    }))
    if (activeNote?.id === id) setActiveNote(n => ({ ...n, ...changes }))
  }

  const deleteNote = (id) => {
    setModal({
      type: 'confirm', title: '¿Eliminar esta nota?',
      onOk: () => {
        setData(d => ({ ...d, notes: d.notes.filter(n => n.id !== id) }))
        if (activeNote?.id === id) { setView(activeFolder ? 'folder' : 'home'); setActiveNote(null) }
      }
    })
  }

  // ── Sync USB ──────────────────────────────────────────────────────────────
  const syncToTablet = async () => {
    if (!usbDevice) { setSyncMsg('Sin tablet USB'); return }
    setSyncing(true); setSyncMsg('Sincronizando...')
    try {
      const serial = usbDevice.serial
      // Crear carpeta en tablet
      await window.api.adbShell({ serial, cmd: `mkdir -p ${TABLET_PATH}` })
      // Guardar cada nota como archivo JSON
      for (const note of data.notes) {
        const content = JSON.stringify(note, null, 2)
        const tmpPath = `/tmp/note_${note.id}.json`
        // Escribir tmp en PC
        await window.api.writeTextDrop({
          text: content,
          folder: '/tmp',
        })
        // Push a tablet
        await window.api.adbPushSingle({
          serial,
          localPath: tmpPath,
          remotePath: `${TABLET_PATH}/note_${note.id}.json`,
        })
      }
      setSyncMsg(`✓ ${data.notes.length} nota(s) sincronizadas`)
    } catch(e) {
      setSyncMsg(`✗ Error: ${e.message}`)
    }
    setSyncing(false)
    setTimeout(() => setSyncMsg(''), 3000)
  }

  const syncFromTablet = async () => {
    if (!usbDevice) { setSyncMsg('Sin tablet USB'); return }
    setSyncing(true); setSyncMsg('Descargando notas...')
    try {
      const serial = usbDevice.serial
      // Listar archivos en tablet
      const lsR = await window.api.adbShell({ serial, cmd: `ls ${TABLET_PATH}/*.json 2>/dev/null` })
      const files = (lsR?.out || '').split('\n').filter(f => f.endsWith('.json'))

      let imported = 0
      for (const file of files) {
        // Pull archivo
        const r = await window.api.adbPull({
          serial,
          remotePath: file,
          localDir: '/tmp/synctablet_notes',
        })
        if (r?.ok) imported++
      }
      setSyncMsg(`✓ ${imported} nota(s) importadas`)
    } catch(e) {
      setSyncMsg(`✗ Error: ${e.message}`)
    }
    setSyncing(false)
    setTimeout(() => setSyncMsg(''), 3000)
  }

  // ── Filtrado ──────────────────────────────────────────────────────────────
  const visibleNotes = (folderId) => {
    const base = data.notes.filter(n =>
      folderId === undefined ? true : n.folderId === folderId
    )
    if (!search) return base
    return base.filter(n =>
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content?.toLowerCase().includes(search.toLowerCase())
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const bg = hasWallpaper ? 'rgba(10,12,18,0.75)' : 'var(--bg)'

  // Show loading state until data is loaded
  if (!dataLoaded) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg }}>
        <div style={{ textAlign: 'center', color: 'var(--text-3)' }}>
          <div style={{ width: 32, height: 32, border: '3px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13 }}>Cargando notas…</p>
        </div>
        <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .notes-btn { transition: background 0.15s ease, transform 0.12s ease, opacity 0.15s ease; }
        .notes-btn:hover { transform: scale(1.03); }
        .notes-btn:active { transform: scale(0.97); }

        /* Scrollbar suave y delgada */
        .notes-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .notes-scroll::-webkit-scrollbar-track { background: transparent; }
        .notes-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
        .notes-scroll::-webkit-scrollbar-thumb:hover { background: var(--text-3); }

        /* Scroll suave global en notas */
        * { scroll-behavior: smooth; }
      `}</style>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', background: bg, overflow: 'hidden', minHeight: 0 }}>

      {/* ── Sidebar ── */}
      <Sidebar
        data={data}
        view={view} setView={setView}
        activeFolder={activeFolder} setActiveFolder={setActiveFolder}
        activeNote={activeNote} setActiveNote={setActiveNote}
        createFolder={createFolder}
        createNote={createNote}
        onDeleteFolder={deleteFolder}
        onRenameFolder={renameFolder}
        search={search} setSearch={setSearch}
        syncing={syncing} syncMsg={syncMsg}
        syncToTablet={syncToTablet}
        syncFromTablet={syncFromTablet}
        usbDevice={usbDevice}
        hasWallpaper={hasWallpaper}
        setModal={setModal}
        setShowPomodoro={setShowPomodoro}
      />

      {/* ── Contenido ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0, position: 'relative' }}>
        {/* AI Browser panel integrado a la izquierda */}
        {/* Main content area */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {view === 'home' && (
          <HomeView
            data={data}
            notes={visibleNotes(undefined)}
            onOpenFolder={(f) => { setActiveFolder(f); setView('folder') }}
            onOpenNote={(n) => { setActiveNote(n); setView('note') }}
            onCreateNote={() => createNote(null)}
            onCreateFolder={createFolder}
            onDeleteNote={deleteNote}
            hasWallpaper={hasWallpaper}
          />
        )}
        {view === 'folder' && activeFolder && (
          <FolderView
            folder={activeFolder}
            notes={visibleNotes(activeFolder.id)}
            onOpenNote={(n) => { setActiveNote(n); setView('note') }}
            onCreateNote={() => createNote(activeFolder.id)}
            onDeleteNote={deleteNote}
            onUpdateFolder={(changes) => {
              setData(d => ({ ...d, folders: d.folders.map(f => f.id === activeFolder.id ? { ...f, ...changes } : f) }))
              setActiveFolder(f => ({ ...f, ...changes }))
            }}
            hasWallpaper={hasWallpaper}
          />
        )}
        {view === 'note' && activeNote && (
          <NoteEditor
            note={activeNote}
            onUpdate={(changes) => updateNote(activeNote.id, changes)}
            onDelete={() => deleteNote(activeNote.id)}
            config={config}
            hasWallpaper={hasWallpaper}
            setModal={setModal}
            setPdfViewer={setPdfViewer}
            onShowFlashcards={setFlashcards}
            allNotes={activeFolder
              ? data.notes.filter(n => n.folderId === activeFolder.id)
              : data.notes.filter(n => !n.folderId)}
            allFolders={data.folders}
            onNavigate={(n) => { setActiveNote(n) }}
            onMoveToFolder={(folderId) => {
              updateNote(activeNote.id, { folderId })
              setActiveNote(n => ({ ...n, folderId }))
            }}
          />
        )}
        </div>{/* end main content inner */}

        {/* PDF Split Viewer */}
        {pdfViewer && (
          <ResizablePanel defaultWidth={460} minWidth={280} maxWidth={860}>
          <PDFSplitViewer
            pdf={pdfViewer}
            onClose={() => setPdfViewer(null)}
            onAddToNote={(text) => {
              if (activeNote && view === 'note') {
                const noteId = activeNote.id
                setData(d => ({
                  ...d,
                  notes: d.notes.map(n => n.id === noteId ? {
                    ...n,
                    blocks: [...(n.blocks || []), { id: genId(), type: 'ai', content: '📄 Desde PDF:\n' + text }],
                    updatedAt: now()
                  } : n)
                }))
              }
            }}
          />
          </ResizablePanel>
        )}
      </div>

      {/* Modal global */}
      {modal && <Modal modal={modal} onClose={() => setModal(null)} />}

      {/* Flashcards overlay */}
      {flashcards && (
        <FlashcardsViewer cards={flashcards} onClose={() => setFlashcards(null)} />
      )}

      {/* Pomodoro flotante */}
      {showPomodoro && (
        <PomodoroTimer onClose={() => setShowPomodoro(false)} />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// SIDEBAR
// ════════════════════════════════════════════════════════════════════════════════
function Sidebar({ data, view, setView, activeFolder, setActiveFolder, activeNote, setActiveNote,
  createFolder, createNote, onDeleteFolder, onRenameFolder,
  search, setSearch, syncing, syncMsg, syncToTablet, syncFromTablet, usbDevice, hasWallpaper, setModal, setShowPomodoro }) {

  const glass = { background: 'rgba(12,14,20,0.80)', backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)' }

  return (
    <div style={{
      width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column',
      borderRight: '0.5px solid var(--border-lit)', ...glass,
    }}>
      {/* Header */}
      <div style={{ padding: '16px 14px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-h)' }}>📓 Notas</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <IconBtn title="Nueva carpeta" onClick={createFolder}><Folder size={13}/></IconBtn>
            <IconBtn title="Nueva nota" onClick={() => createNote(null)}><Plus size={13}/></IconBtn>
            <IconBtn title="Abrir asistentes IA" onClick={() => setShowAIBrowser(s => !s)}>
              <span style={{ fontSize: 11 }}>✨</span>
            </IconBtn>
          </div>
        </div>
        {/* Búsqueda */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-elem)', borderRadius: 7,
          padding: '5px 8px', border: '0.5px solid var(--border-lit)',
        }}>
          <Search size={11} color="var(--text-3)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 11, color: 'var(--text-h)', fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
        {/* Inicio */}
        <SideItem
          icon={<AlignLeft size={13}/>}
          label="Inicio"
          active={view === 'home'}
          onClick={() => { setView('home'); setActiveFolder(null); setActiveNote(null) }}
        />

        {/* Carpetas */}
        {data.folders.map(f => (
          <SideItem
            key={f.id}
            icon={<div style={{ width: 10, height: 10, borderRadius: 3, background: f.color }} />}
            label={f.name}
            active={activeFolder?.id === f.id}
            onClick={() => { setActiveFolder(f); setView('folder'); setActiveNote(null) }}
            onRename={() => onRenameFolder(f.id)}
            onDelete={() => onDeleteFolder(f.id)}
          />
        ))}

        {/* Notas sin carpeta */}
        {data.notes.filter(n => !n.folderId).length > 0 && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, padding: '0 6px', marginBottom: 4 }}>
              SIN CARPETA
            </p>
            {data.notes.filter(n => !n.folderId).map(n => (
              <SideItem
                key={n.id}
                icon={<span style={{ fontSize: 10 }}>{n.emoji || '📝'}</span>}
                label={n.title}
                active={activeNote?.id === n.id}
                onClick={() => { setActiveNote(n); setView('note') }}
                onDelete={() => deleteNote(n.id)}
              />
            ))}
          </div>
        )}
      </nav>

      {/* Pomodoro button */}
      <button onClick={() => setShowPomodoro?.(s => !s)} style={{
        margin: '4px 8px', display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 10px', borderRadius: 8, border: 'none',
        background: 'var(--bg-elem)', color: 'var(--text-1)',
        fontSize: 11, fontWeight: 600, cursor: 'pointer', width: 'calc(100% - 16px)',
      }}>
        <Timer size={13} color="var(--accent)" /> Temporizador Pomodoro
      </button>

      {/* Sync USB */}
      <div style={{ padding: '10px 10px 14px', borderTop: '0.5px solid var(--border-lit)' }}>
        {syncMsg && (
          <p style={{ fontSize: 10, color: syncMsg.startsWith('✓') ? 'var(--success)' : 'var(--error)', marginBottom: 6, textAlign: 'center' }}>
            {syncMsg}
          </p>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={syncToTablet} disabled={syncing || !usbDevice} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            padding: '6px', borderRadius: 7, border: 'none', fontSize: 10, fontWeight: 600,
            background: usbDevice ? 'var(--accent)' : 'var(--bg-elem)',
            color: usbDevice ? '#fff' : 'var(--text-3)',
            cursor: usbDevice ? 'pointer' : 'not-allowed',
          }}>
            {syncing ? <Loader size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={10}/>}
            PC→Tab
          </button>
          <button onClick={syncFromTablet} disabled={syncing || !usbDevice} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            padding: '6px', borderRadius: 7, border: 'none', fontSize: 10, fontWeight: 600,
            background: usbDevice ? 'var(--bg-elem)' : 'var(--bg-elem)',
            color: usbDevice ? 'var(--text-1)' : 'var(--text-3)',
            cursor: usbDevice ? 'pointer' : 'not-allowed',
          }}>
            <Download size={10}/> Tab→PC
          </button>
        </div>
        {!usbDevice && (
          <p style={{ fontSize: 9, color: 'var(--text-3)', textAlign: 'center', marginTop: 4 }}>
            Conecta USB para sincronizar
          </p>
        )}
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .notes-btn { transition: background 0.15s ease, transform 0.12s ease, opacity 0.15s ease; }
        .notes-btn:hover { transform: scale(1.03); }
        .notes-btn:active { transform: scale(0.97); }

        /* Scrollbar suave y delgada */
        .notes-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .notes-scroll::-webkit-scrollbar-track { background: transparent; }
        .notes-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
        .notes-scroll::-webkit-scrollbar-thumb:hover { background: var(--text-3); }

        /* Scroll suave global en notas */
        * { scroll-behavior: smooth; }
      `}</style>
    </div>
  )
}

function SideItem({ icon, label, active, onClick, onRename, onDelete }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
        background: active ? 'var(--accent-soft)' : hovered ? 'var(--bg-hover)' : 'transparent',
        marginBottom: 1, border: 'none',
        transition: 'background 0.18s ease, transform 0.15s ease',
        transform: hovered && !active ? 'translateX(2px)' : 'none',
      }}
    >
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{
        flex: 1, fontSize: 12, fontWeight: active ? 600 : 400,
        color: active ? 'var(--accent)' : 'var(--text-1)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>
      {hovered && (onRename || onDelete) && (
        <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
          {onRename && <IconBtn small onClick={onRename}><Edit3 size={10}/></IconBtn>}
          {onDelete && <IconBtn small onClick={onDelete}><Trash2 size={10}/></IconBtn>}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// HOME VIEW
// ════════════════════════════════════════════════════════════════════════════════
function HomeView({ data, notes, onOpenFolder, onOpenNote, onCreateNote, onCreateFolder, onDeleteNote, hasWallpaper }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', minHeight: 0, scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-h)' }}>📓 Mis Notas</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn onClick={onCreateFolder} icon={<Folder size={13}/>}>Nueva carpeta</Btn>
          <Btn primary onClick={onCreateNote} icon={<Plus size={13}/>}>Nueva nota</Btn>
        </div>
      </div>

      {/* Carpetas */}
      {data.folders.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, marginBottom: 12 }}>CARPETAS</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {data.folders.map(f => (
              <FolderCard key={f.id} folder={f}
                noteCount={data.notes.filter(n => n.folderId === f.id).length}
                onClick={() => onOpenFolder(f)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Notas recientes */}
      <section>
        <h2 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, marginBottom: 12 }}>
          {notes.length > 0 ? 'NOTAS RECIENTES' : 'SIN NOTAS AÚN'}
        </h2>
        {notes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
            <span style={{ fontSize: 36 }}>📝</span>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 8 }}>Crea tu primera nota</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {notes.slice(0, 12).map(n => (
              <NoteCard key={n.id} note={n}
                onClick={() => onOpenNote(n)}
                onDelete={() => onDeleteNote(n.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// FOLDER VIEW
// ════════════════════════════════════════════════════════════════════════════════
function FolderView({ folder, notes, onOpenNote, onCreateNote, onDeleteNote, onUpdateFolder, hasWallpaper }) {
  const [editingCover, setEditingCover] = useState(false)

  return (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}>
      {/* Cover */}
      <div style={{
        height: 140, background: folder.color,
        display: 'flex', alignItems: 'flex-end',
        padding: '16px 28px', position: 'relative',
        backgroundImage: folder.coverImg ? `url(${folder.coverImg})` : undefined,
        backgroundSize: 'cover', backgroundPosition: 'center',
      }}>
        <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
          <button onClick={() => setEditingCover(!editingCover)} style={{
            background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: 6,
            padding: '4px 10px', color: '#fff', fontSize: 11, cursor: 'pointer',
          }}>
            <Palette size={12} style={{ display: 'inline', marginRight: 4 }} />
            Color
          </button>
        </div>
        {editingCover && (
          <div style={{
            position: 'absolute', top: 40, right: 10,
            background: 'var(--bg-panel)', borderRadius: 10, padding: 10,
            display: 'flex', gap: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            {COVER_COLORS.map(c => (
              <button key={c} onClick={() => { onUpdateFolder({ color: c }); setEditingCover(false) }} style={{
                width: 24, height: 24, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                outline: folder.color === c ? '2px solid #fff' : 'none', outlineOffset: 2,
              }} />
            ))}
          </div>
        )}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
            {folder.name}
          </h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
            {notes.length} nota{notes.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '20px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <Btn primary onClick={onCreateNote} icon={<Plus size={13}/>}>Nueva nota</Btn>
        </div>
        {notes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
            <span style={{ fontSize: 36 }}>📂</span>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 8 }}>Carpeta vacía</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {notes.map(n => (
              <NoteCard key={n.id} note={n}
                onClick={() => onOpenNote(n)}
                onDelete={() => onDeleteNote(n.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// NOTE EDITOR
// ════════════════════════════════════════════════════════════════════════════════
function NoteEditor({ note, onUpdate, onDelete, config, hasWallpaper, setModal, setPdfViewer, onShowFlashcards, allNotes, allFolders, onNavigate, onMoveToFolder }) {
  const [title,      setTitle]      = useState(note.title)
  const [blocks,     setBlocks]     = useState(note.blocks || [{ id: genId(), type: 'text', content: '' }])
  // Persistir historial del chat IA — no se borra al cambiar de nota
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', content: '¡Hola! Soy tu asistente de notas. Puedo ayudarte a escribir, analizar, resumir, o responder preguntas sobre lo que estás trabajando. También puedo analizar capturas de tu tablet o imágenes que pegues. ¿En qué te ayudo?' }
  ])

  // Sync state when navigating between notes
  useEffect(() => {
    setTitle(note.title)
    setBlocks(note.blocks || [{ id: genId(), type: 'text', content: '' }])
  }, [note.id])
  const [showDraw,   setShowDraw]   = useState(false)
  const saveTimer = useRef(null)

  // Auto-save
  useEffect(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const content = blocks.map(b => b.content).join('\n')
      onUpdate({ title, blocks, content })
    }, 800)
    return () => clearTimeout(saveTimer.current)
  }, [title, blocks])

  const addBlock = (type = 'text', afterId = null) => {
    const nb = { id: genId(), type, content: '' }
    if (!afterId) {
      setBlocks(b => [...b, nb])
    } else {
      setBlocks(b => {
        const idx = b.findIndex(x => x.id === afterId)
        const copy = [...b]
        copy.splice(idx + 1, 0, nb)
        return copy
      })
    }
    return nb.id
  }

  const updateBlock = (id, changes) => {
    setBlocks(b => b.map(x => x.id === id ? { ...x, ...changes } : x))
  }

  const deleteBlock = (id) => {
    setBlocks(b => b.length > 1 ? b.filter(x => x.id !== id) : b)
  }

  const handleAI = async () => {
    const apiKey = config?.openrouterKey
    if (!apiKey) { setAiResponse('⚠ Configura tu API key en Configuración → General'); return }
    setAiState('loading')
    try {
      const content = blocks.map(b => b.content).join('\n')
      const resp = await askAI(content, aiPrompt, apiKey)
      setAiResponse(resp)
      setAiState('done')
    } catch(e) {
      setAiResponse(`Error: ${e.message}`)
      setAiState('error')
    }
  }

  const insertAIResponse = () => {
    if (!aiResponse) return
    addBlock('text')
    const newId = genId()
    setBlocks(b => [...b, { id: newId, type: 'ai', content: aiResponse }])
    setAiResponse('')
    setAiState('idle')
    setShowAI(false)
  }

  const addImage = async () => {
    const path = await window.api.pickFile()
    if (!path) return
    // Leer como base64
    const ext = path.split('.').pop().toLowerCase()
    const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[ext] || 'image/png'
    // Usar pickImage que ya retorna base64
    const base64 = await window.api.pickImage()
    if (base64) {
      setBlocks(b => [...b, { id: genId(), type: 'image', content: base64 }])
    }
  }

  const exportToPDF = async () => {
    const apiKey = config?.openrouterKey
    // Build HTML from blocks
    const blocksHtml = blocks.map(b => {
      if (b.type === 'h1') return `<h1 style="font-size:24px;font-weight:800;margin:16px 0 8px">${b.content}</h1>`
      if (b.type === 'h2') return `<h2 style="font-size:18px;font-weight:700;margin:14px 0 6px">${b.content}</h2>`
      if (b.type === 'list') return `<ul style="margin:8px 0 8px 20px">${(b.items||[]).map(i=>`<li style="margin:4px 0">${i}</li>`).join('')}</ul>`
      if (b.type === 'image') return `<img src="${b.content}" style="max-width:100%;border-radius:8px;margin:8px 0" />`
      if (b.type === 'drawing') return `<img src="${b.content}" style="max-width:100%;border-radius:8px;margin:8px 0" />`
      if (b.type === 'ai') return `<div style="background:#f0f4ff;border-left:3px solid #4f6ef7;padding:10px 14px;margin:10px 0;border-radius:4px;font-size:13px">${b.content}</div>`
      if (b.type === 'table') {
        const rows = b.rows || []
        return `<table style="border-collapse:collapse;width:100%;margin:10px 0">${rows.map((row,ri)=>`<tr>${row.map(cell=>`<td style="border:1px solid #ddd;padding:6px 10px;${ri===0?'font-weight:700;background:#f5f5f5':''}">${cell}</td>`).join('')}</tr>`).join('')}</table>`
      }
      return `<p style="margin:6px 0;line-height:1.7;font-size:14px">${b.content || ''}</p>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 40px;color:#1a1a2e}
h1{font-size:28px;margin-bottom:4px}p{color:#444}</style></head>
<body>
<div style="border-bottom:3px solid ${note.cover||'#4f6ef7'};padding-bottom:16px;margin-bottom:24px">
  <h1>${note.emoji||'📝'} ${title}</h1>
  <p style="font-size:12px;color:#888">Exportado el ${new Date().toLocaleDateString('es')}</p>
</div>
${blocksHtml}
</body></html>`

    const r = await window.api.exportPdf({ html, filename: `${title}.pdf` })
    if (r?.ok) {
      setModal({ type: 'alert', title: '✓ PDF guardado', message: `Guardado en: ${r.path}`, onOk: () => {} })
    } else {
      setModal({ type: 'alert', title: '❌ Error', message: r?.error || 'No se pudo guardar el PDF', onOk: () => {} })
    }
  }

  const openPDF = async (fromTablet = false) => {
    if (!fromTablet) {
      const r = await window.api.pickPdf?.()
      if (!r) return
      setPdfViewer?.({ url: r.fileUrl || r.base64, name: r.name, path: r.path })
      return
    }
    if (fromTablet) {
      // Listar PDFs en la tablet y elegir
      const devs = await window.api?.adbDevices?.()
      const usb = devs?.find(d => d.status === 'device' && !d.serial?.includes(':'))
      if (!usb) { setModal({ type: 'alert', title: '⚠️ Sin tablet USB', message: 'Conecta la tablet por USB', onOk: () => {} }); return }
      // Buscar PDFs en Downloads de la tablet
      const r = await window.api.adbShell({ serial: usb.serial, cmd: "find /sdcard/Download /sdcard/Documents -name '*.pdf' 2>/dev/null | head -20" })
      const files = (r?.out || '').split('\n').filter(f => f.trim().endsWith('.pdf'))
      if (!files.length) { setModal({ type: 'alert', title: 'Sin PDFs', message: 'No se encontraron PDFs en Downloads de la tablet', onOk: () => {} }); return }
      // Mostrar lista para elegir
      setModal({
        type: 'select', title: '📄 PDFs en la tablet', options: files.map(f => ({ label: f.split('/').pop(), value: f })),
        onOk: async (remotePath) => {
          if (!remotePath) return
          const tmpDir = '/tmp/synctablet_pdfs'
          const pullR = await window.api.adbPull({ serial: usb.serial, remotePath, localDir: tmpDir })
          if (pullR?.ok !== false) {
            const localPath = tmpDir + '/' + remotePath.split('/').pop()
            const fileR = await window.api.readFileBase64(localPath)
            if (fileR?.ok) setPdfViewer?.({ base64: fileR.base64, name: remotePath.split('/').pop(), path: localPath })
          }
        }
      })
      return
    }
  }

  const generateFlashcards = async () => {
    const hasKey = config?.groqKey || config?.geminiKey || config?.openrouterKey
    if (!hasKey) { setModal({ type: 'alert', title: '⚠️ API Key requerida', message: 'Configura Groq en Configuración', onOk: () => {} }); return }
    setModal({ type: 'alert', title: '⏳ Generando flashcards...', message: 'La IA está analizando tu nota, espera unos segundos.', onOk: () => {} })
    const noteText = blocks.map(b => b.content || (b.items||[]).join(', ')).filter(Boolean).join('\n')
    const prompt = `Basándote en esta nota, genera 8-12 flashcards de estudio en español.
Devuelve SOLO un JSON válido, sin markdown:
[{"front":"pregunta o concepto","back":"respuesta o definición"}]

Nota:
${noteText.slice(0, 2000)}`
    try {
      let raw = ''
      if (config?.groqKey) {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.groqKey}` },
          body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 1000, temperature: 0.3 })
        })
        if (r.ok) { const d = await r.json(); raw = d.choices?.[0]?.message?.content || '' }
      }
      if (!raw && config?.geminiKey) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.geminiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
        })
        if (r.ok) { const d = await r.json(); raw = d.candidates?.[0]?.content?.parts?.[0]?.text || '' }
      }
      const clean = raw.replace(/```json|```/g, '').trim()
      const cards = JSON.parse(clean)
      onShowFlashcards?.(cards)
      setModal(null)
    } catch(e) {
      setModal({ type: 'alert', title: '❌ Error', message: e.message, onOk: () => {} })
    }
  }

  const syncToMarkdown = async () => {
    const devs = await window.api?.adbDevices?.()
    const usb = devs?.find(d => d.status === 'device' && !d.serial?.includes(':'))
    if (!usb) { setModal({ type: 'alert', title: 'Sin USB', message: 'Conecta la tablet por USB', onOk: () => {} }); return }
    const mdLines = ['# ' + title, '']
    for (const b of blocks) {
      if (b.type === 'h1')      mdLines.push('# ' + b.content, '')
      else if (b.type === 'h2') mdLines.push('## ' + b.content, '')
      else if (b.type === 'list') { (b.items||[]).forEach(item => mdLines.push('- ' + item)); mdLines.push('') }
      else if (b.type === 'latex') { mdLines.push('$$' + b.content + '$$', '') }
      else if (b.type === 'table') {
        const rows = b.rows || []
        if (rows.length) {
          mdLines.push('| ' + rows[0].join(' | ') + ' |')
          mdLines.push('| ' + rows[0].map(() => '---').join(' | ') + ' |')
          rows.slice(1).forEach(r => mdLines.push('| ' + r.join(' | ') + ' |'))
          mdLines.push('')
        }
      }
      else if (b.type === 'ai') { mdLines.push('> ' + (b.content || '').replace(/\n/g, '\n> '), '') }
      else if (b.content) { mdLines.push(b.content, '') }
    }
    const mdContent = mdLines.join('\n')
    const fileName = title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/ /g, '_').slice(0,50) + '.md'
    const remotePath = '/sdcard/SyncTabletNotas/' + fileName
    const writeR = await window.api.writeTextDrop?.({ text: mdContent, folder: '/tmp', filename: fileName })
    const tmpPath = '/tmp/' + fileName
    const pushR = await window.api.adbPushSingle({ serial: usb.serial, localPath: tmpPath, remotePath })
    if (pushR?.ok !== false) {
      setModal({ type: 'alert', title: 'Sincronizado', message: 'Nota guardada como ' + fileName + ' en la tablet', onOk: () => {} })
    } else {
      setModal({ type: 'alert', title: 'Error', message: 'No se pudo sincronizar', onOk: () => {} })
    }
  }

    const addTable = () => {
    setBlocks(b => [...b, {
      id: genId(), type: 'table',
      rows: [
        ['Columna 1', 'Columna 2', 'Columna 3'],
        ['', '', ''],
        ['', '', ''],
      ]
    }])
  }

  const captureTablet = async (analyzeWithAI = false) => {
    const devs = await window.api?.adbDevices?.()
    const usb = devs?.find(d => d.status === 'device' && !d.serial?.includes(':'))
    if (!usb) {
      setModal({ type: 'alert', title: '⚠️ Sin tablet USB', message: 'Conecta la tablet por USB para tomar una captura', onOk: () => {} })
      return
    }
    const r = await window.api.adbScreenshot({ serial: usb.serial })
    if (!r?.ok || !r.base64) {
      setModal({ type: 'alert', title: '❌ Error en captura', message: 'Error: ' + (r?.error || 'desconocido'), onOk: () => {} })
      return
    }

    const imgBase64 = `data:image/png;base64,${r.base64}`

    // Insertar imagen en la nota
    setBlocks(b => [...b, {
      id: genId(), type: 'image',
      content: imgBase64, imgWidth: '480px',
    }])

    // Si se pidió análisis con IA
    if (analyzeWithAI) {
      const apiKey = config?.openrouterKey
      if (!apiKey) {
        setModal({ type: 'alert', title: '⚠️ API Key requerida', message: 'Configura tu API key de OpenRouter en Configuración para usar análisis con IA.', onOk: () => {} })
        return
      }
      setAiState('loading')
      setShowAI(true)
      try {
        const analysis = await askAIVision(imgBase64, aiPrompt || null, apiKey)
        setAiResponse('📸 Análisis de captura:\n\n' + analysis)
        setAiState('done')
      } catch(e) {
        setAiResponse('Error en análisis: ' + e.message)
        setAiState('error')
      }
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

      {/* ── Nota principal ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

        {/* Cover */}
        <div style={{
          height: 90, background: note.cover || 'var(--accent)',
          flexShrink: 0, position: 'relative', display: 'flex',
          alignItems: 'flex-end', padding: '0 28px 10px',
        }}>
          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
            <button onClick={() => onUpdate({ cover: COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)] })}
              style={{ background: 'rgba(0,0,0,0.3)', border: 'none', borderRadius: 6, padding: '4px 8px', color: '#fff', fontSize: 10, cursor: 'pointer' }}>
              🎨
            </button>
            <button onClick={onDelete}
              style={{ background: 'rgba(200,0,0,0.3)', border: 'none', borderRadius: 6, padding: '4px 8px', color: '#fff', fontSize: 10, cursor: 'pointer' }}>
              <Trash2 size={11}/>
            </button>
          </div>
          <span style={{ fontSize: 26, marginRight: 10, cursor: 'pointer' }}
            onClick={() => setModal?.({
              type: 'input', title: '🎨 Emoji', placeholder: 'Escribe un emoji',
              value: note.emoji || '📝', onOk: (e) => { if (e) onUpdate({ emoji: e }) }
            })}
          >{note.emoji || '📝'}</span>
        </div>

        {/* Título + meta */}
        <div style={{ padding: '14px 28px 0', flexShrink: 0 }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Sin título"
            style={{ width: '100%', fontSize: 24, fontWeight: 800, color: 'var(--text-h)', background: 'none', border: 'none', outline: 'none', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
              Actualizado {fmtDate(note.updatedAt)}
            </p>
            {allFolders?.length > 0 && (
              <select value={note.folderId || ''} onChange={e => onMoveToFolder?.(e.target.value || null)}
                style={{ fontSize: 11, background: 'var(--bg-elem)', color: 'var(--text-2)', border: '0.5px solid var(--border-lit)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                <option value="">📄 Sin carpeta</option>
                {allFolders.map(f => <option key={f.id} value={f.id}>📁 {f.name}</option>)}
              </select>
            )}
            {allNotes?.length > 1 && (() => {
              const idx = allNotes.findIndex(n => n.id === note.id)
              return (
                <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                  <button onClick={() => onNavigate?.(allNotes[idx-1])} disabled={idx===0}
                    style={{ padding: '2px 8px', borderRadius: 6, border: 'none', background: 'var(--bg-elem)', color: idx===0?'var(--text-3)':'var(--text-1)', cursor: idx===0?'not-allowed':'pointer', fontSize: 11 }}>← Anterior</button>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'center' }}>{idx+1}/{allNotes.length}</span>
                  <button onClick={() => onNavigate?.(allNotes[idx+1])} disabled={idx===allNotes.length-1}
                    style={{ padding: '2px 8px', borderRadius: 6, border: 'none', background: 'var(--bg-elem)', color: idx===allNotes.length-1?'var(--text-3)':'var(--text-1)', cursor: idx===allNotes.length-1?'not-allowed':'pointer', fontSize: 11 }}>Siguiente →</button>
                </div>
              )
            })()}
          </div>
        </div>

        {/* Toolbar simplificada */}
        <div style={{ display: 'flex', gap: 4, padding: '8px 28px', borderBottom: '0.5px solid var(--border-lit)', flexShrink: 0, flexWrap: 'wrap' }}>
          {[
            { label: 'Texto',   icon: <AlignLeft size={12}/>,  action: () => addBlock('text') },
            { label: 'H1',      icon: <Heading1 size={12}/>,   action: () => addBlock('h1') },
            { label: 'H2',      icon: <Heading2 size={12}/>,   action: () => addBlock('h2') },
            { label: 'Lista',   icon: <List size={12}/>,       action: () => addBlock('list') },
            { label: 'Tabla',   icon: <Table size={12}/>,      action: addTable },
            { label: 'Imagen',  icon: <Image size={12}/>,      action: addImage },
            { label: '📸 Captura', icon: <Camera size={12}/>,  action: () => captureTablet(false) },
            { label: 'Dibujo',  icon: <Pen size={12}/>,        action: () => setShowDraw(true) },
            { label: 'PDF',     icon: <FileText size={12}/>,   action: exportToPDF },
            { label: 'Abrir PDF', icon: <FolderOpen size={12}/>, action: () => openPDF(false) },
          ].map(t => (
            <button key={t.label} onClick={t.action} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 6, border: 'none',
              background: 'var(--bg-elem)', color: 'var(--text-1)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.15s',
            }}>{t.icon} {t.label}</button>
          ))}
        </div>

        {/* Bloques */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px 48px', scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
          {blocks.map((block) => (
            <Block
              key={block.id}
              block={block}
              onChange={(changes) => updateBlock(block.id, changes)}
              onDelete={() => deleteBlock(block.id)}
              onAddAfter={(type) => addBlock(type, block.id)}
            />
          ))}
          <button onClick={() => addBlock('text')} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', borderRadius: 8, border: '1px dashed var(--border)',
            background: 'none', color: 'var(--text-3)', fontSize: 12,
            cursor: 'pointer', marginTop: 8, width: '100%',
          }}>
            <Plus size={13} /> Agregar bloque
          </button>
        </div>
      </div>



      {/* ── Panel Chat IA Groq (derecha) ── */}
      <AIChatPanel
        note={{ title, blocks }}
        config={config}
        messages={chatMessages}
        setMessages={setChatMessages}
        onInsertBlock={(text) => setBlocks(b => [...b, { id: genId(), type: 'ai', content: text }])}
        onCaptureTablet={captureTablet}
      />

      {/* Draw overlay */}
      {showDraw && (
        <DrawCanvas
          note={note}
          onSave={(drawing) => {
            setBlocks(b => [...b, { id: genId(), type: 'drawing', content: drawing }])
            setShowDraw(false)
          }}
          onClose={() => setShowDraw(false)}
        />
      )}
    </div>
  )
}

// ── Bloque individual ─────────────────────────────────────────────────────────
function Block({ block, onChange, onDelete, onAddAfter }) {
  const [hovered, setHovered] = useState(false)

  const commonStyle = {
    width: '100%', background: 'none', border: 'none', outline: 'none',
    color: 'var(--text-h)', fontFamily: 'inherit', resize: 'none',
  }

  const renderContent = () => {
    switch (block.type) {
      case 'h1':
        return <input value={block.content} onChange={e => onChange({ content: e.target.value })}
          placeholder="Título 1" style={{ ...commonStyle, fontSize: 22, fontWeight: 800 }} />
      case 'h2':
        return <input value={block.content} onChange={e => onChange({ content: e.target.value })}
          placeholder="Título 2" style={{ ...commonStyle, fontSize: 18, fontWeight: 700 }} />
      case 'list':
        return (
          <div>
            {(block.items || ['']).map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ color: 'var(--accent)', fontSize: 16 }}>•</span>
                <input
                  value={item}
                  onChange={e => {
                    const items = [...(block.items || [''])]
                    items[i] = e.target.value
                    onChange({ items })
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const items = [...(block.items || ['']), '']
                      onChange({ items })
                    }
                    if (e.key === 'Backspace' && !item && block.items?.length > 1) {
                      const items = (block.items || ['']).filter((_, j) => j !== i)
                      onChange({ items })
                    }
                  }}
                  placeholder="Elemento de lista"
                  style={{ ...commonStyle, fontSize: 13 }}
                />
              </div>
            ))}
          </div>
        )
      case 'table':
        return <TableBlock block={block} onChange={onChange} />
      case 'image':
        return (
          <div style={{ borderRadius: 8, maxWidth: '100%' }}>
            <img src={block.content} alt=""
              style={{
                width: block.imgWidth || '320px',
                maxWidth: '100%',
                borderRadius: 8, display: 'block',
                cursor: 'pointer',
                height: 'auto',
              }}
              onClick={() => {
                const sizes = ['160px','320px','480px','100%']
                const cur = block.imgWidth || '320px'
                const next = sizes[(sizes.indexOf(cur) + 1) % sizes.length]
                onChange({ imgWidth: next })
              }}
              title="Clic para cambiar tamaño"
            />
            <span style={{ fontSize: 10, color: 'var(--text-3)', display: 'block', marginTop: 3 }}>
              🖱 Clic en la imagen para cambiar tamaño ({block.imgWidth || '320px'})
            </span>
          </div>
        )
      case 'drawing':
        return (
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '0.5px solid var(--border-lit)' }}>
            <img src={block.content} alt="Dibujo" style={{ maxWidth: '100%' }} />
          </div>
        )
      case 'pdf':
        return (
          <div style={{ borderRadius: 8, border: '0.5px solid var(--border-lit)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-elem)', borderBottom: '0.5px solid var(--border-lit)' }}>
              <span style={{ fontSize: 16 }}>📄</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-h)', flex: 1 }}>{block.name || 'Documento PDF'}</span>
              <button onClick={() => window.api?.openUrl?.('file://' + block.path)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}>Abrir</button>
            </div>
            <iframe
              src={block.content}
              style={{ width: '100%', height: 480, border: 'none' }}
              title={block.name}
            />
          </div>
        )
      case 'latex':
        return (
          <LatexBlock content={block.content} onChange={v => onChange({ content: v })} />
        )
      case 'ai':
        return (
          <div style={{
            padding: '10px 14px', borderRadius: 8,
            background: 'rgba(79,110,247,0.08)', border: '1px solid rgba(79,110,247,0.2)',
            fontSize: 13, color: 'var(--text-1)', lineHeight: 1.7, whiteSpace: 'pre-wrap',
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', display: 'block', marginBottom: 4 }}>✨ IA</span>
            {block.content}
          </div>
        )
      default:
        return (
          <textarea
            value={block.content}
            onChange={e => {
              onChange({ content: e.target.value })
              // Auto-resize
              e.target.style.height = 'auto'
              e.target.style.height = e.target.scrollHeight + 'px'
            }}
            onFocus={e => {
              e.target.style.height = 'auto'
              e.target.style.height = e.target.scrollHeight + 'px'
            }}
            placeholder="Escribe algo…"
            rows={1}
            style={{
              ...commonStyle, fontSize: 14, lineHeight: 1.7,
              overflow: 'hidden', minHeight: 28,
              resize: 'none', display: 'block', width: '100%',
            }}
          />
        )
    }
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6,
        position: 'relative',
        borderRadius: 6,
        padding: '2px 4px',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        transition: 'background 0.15s ease',
      }}
    >
      <div style={{
        display: 'flex', gap: 2, flexShrink: 0, paddingTop: 2,
        opacity: hovered ? 1 : 0,
        transition: 'opacity 0.15s ease',
      }}>
        <IconBtn small onClick={onDelete}><Trash2 size={10}/></IconBtn>
      </div>
      <div style={{ flex: 1 }}>{renderContent()}</div>
    </div>
  )
}

// ── Tabla editable ────────────────────────────────────────────────────────────
function TableBlock({ block, onChange }) {
  const rows = block.rows || [['Col 1', 'Col 2'], ['', '']]

  const updateCell = (r, c, val) => {
    const newRows = rows.map((row, ri) =>
      ri === r ? row.map((cell, ci) => ci === c ? val : cell) : row
    )
    onChange({ rows: newRows })
  }

  const addRow = () => onChange({ rows: [...rows, new Array(rows[0].length).fill('')] })
  const addCol = () => onChange({ rows: rows.map(r => [...r, '']) })

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  border: '0.5px solid var(--border-lit)',
                  padding: 0,
                  background: ri === 0 ? 'var(--bg-elem)' : 'var(--bg-card)',
                  fontWeight: ri === 0 ? 700 : 400,
                  minWidth: 80,
                }}>
                  <input
                    value={cell}
                    onChange={e => updateCell(ri, ci, e.target.value)}
                    style={{
                      width: '100%', border: 'none', outline: 'none', background: 'none',
                      padding: '6px 8px', fontSize: 12, color: 'var(--text-h)',
                      fontFamily: 'inherit', fontWeight: ri === 0 ? 700 : 400,
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button onClick={addRow} style={{ fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>+ Fila</button>
        <button onClick={addCol} style={{ fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>+ Columna</button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// AI CHAT PANEL — panel fijo a la derecha con historial de conversación
// ════════════════════════════════════════════════════════════════════════════════
// ── LaTeX Block ───────────────────────────────────────────────────────────────
function LatexBlock({ content, onChange }) {
  const [editing, setEditing] = useState(!content)
  const [draft,   setDraft]   = useState(content || '')
  const [loaded,  setLoaded]  = useState(false)
  const previewRef = useRef(null)

  useEffect(() => {
    loadKaTeX().then(() => setLoaded(true))
  }, [])

  useEffect(() => {
    if (!loaded || !previewRef.current || editing) return
    try {
      window.katex?.render(content, previewRef.current, { displayMode: true, throwOnError: false })
    } catch {}
  }, [content, loaded, editing])

  if (editing) {
    return (
      <div style={{ border: '1px solid var(--accent)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '4px 10px', background: 'rgba(79,110,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>∑ LaTeX</span>
          <button onClick={() => { onChange(draft); setEditing(false) }} style={{
            padding: '2px 10px', borderRadius: 5, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 11, cursor: 'pointer'
          }}>Renderizar</button>
        </div>
        <textarea
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) { onChange(draft); setEditing(false) } }}
          placeholder="\frac{-b \pm \sqrt{b^2-4ac}}{2a}"
          rows={3}
          style={{
            width: '100%', padding: '10px 12px', fontFamily: 'monospace', fontSize: 13,
            background: 'var(--bg-elem)', border: 'none', color: 'var(--text-h)', outline: 'none',
            resize: 'vertical', boxSizing: 'border-box',
          }}
        />
        <p style={{ fontSize: 10, color: 'var(--text-3)', padding: '4px 10px' }}>Ctrl+Enter para renderizar</p>
      </div>
    )
  }

  return (
    <div
      onClick={() => { setDraft(content); setEditing(true) }}
      style={{
        padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
        background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)',
        textAlign: 'center', minHeight: 40,
      }}
      title="Click para editar"
    >
      {loaded
        ? <div ref={previewRef} />
        : <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-2)' }}>{content}</span>
      }
    </div>
  )
}


function AIChatPanel({ note, config, onInsertBlock, onCaptureTablet, onClose, messages, setMessages }) {
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [pendingImg, setPendingImg] = useState(null)  // imagen pegada pendiente de enviar
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Ctrl+V dentro del chat: pegar imagen para la IA ──────────────────────
  useEffect(() => {
    const handler = async (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'v') return
      const active = document.activeElement
      // Solo si el foco está en el textarea del chat
      if (active !== inputRef.current) return
      // Intentar leer imagen del portapapeles via Electron
      const r = await window.api?.pasteImage?.(null)
      if (r?.ok && r.type === 'image' && r.tmpPath) {
        e.preventDefault()
        // Leer como base64 para enviar a la IA
        const b64 = await window.api?.readFileBase64?.(r.tmpPath)
        if (b64) {
          setPendingImg(`data:image/png;base64,${b64}`)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Subir PDF al chat ────────────────────────────────────────────────────
  const uploadPdfToChat = async () => {
    const r = await window.api?.pickPdf?.()
    if (!r) return
    setMessages(m => [...m, { role: 'user', content: `📄 PDF adjunto: **${r.name}**` }])
    setLoading(true)
    try {
      // Extraer texto del PDF via adb o leer localmente
      let text = ''
      if (r.path) {
        // Intentar leer como texto usando pdftotext si está disponible
        const rt = await window.api?.adbShell?.({ serial: null, cmd: `pdftotext "${r.path}" - 2>/dev/null | head -c 3000` })
        text = rt?.out?.trim() || ''
      }
      if (!text && r.base64) {
        text = '(PDF adjunto — solo puedo analizar el contenido si está en texto)'
      }
      const prompt = `El usuario ha adjuntado un PDF llamado "${r.name}".\n${text ? `Contenido extraído:\n${text.slice(0, 2500)}` : 'No se pudo extraer texto del PDF.'}\n\nAnaliza y resume el contenido más importante.`
      await send(prompt, null, true)
    } catch(e) {
      setMessages(m => [...m, { role: 'assistant', content: `Error procesando PDF: ${e.message}` }])
      setLoading(false)
    }
  }

  const noteContext = () => {
    const text = note.blocks?.map(b => b.content || (b.items?.join(', ')) || '').filter(Boolean).join('\n')
    return `Título: ${note.title}\n\nContenido:\n${text?.slice(0, 2000) || '(vacío)'}`
  }

  // ── Llamar a Groq (gratis, muy rápido, sin restricciones) ────────────────
  const callGroq = async (groqKey, text, history) => {
    const systemMsg = `Eres un asistente integrado en Sync Tablet, una app de notas.
Nota actual del usuario:
---
${noteContext()}
---
Responde siempre en español. Sé conciso y directo.`

    const messages = [
      { role: 'system', content: systemMsg },
      ...history.slice(-8).map(m => ({ role: m.role, content: m.content || '' })),
      { role: 'user', content: text }
    ]

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',  // Gratis en Groq
        messages,
        max_tokens: 1000,
        temperature: 0.7,
      })
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`Groq ${res.status}: ${err?.error?.message || res.statusText}`)
    }
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  }

  // ── Llamar a Gemini (1500 req/día gratis) ─────────────────────────────────
  const callGemini = async (geminiKey, text, imageBase64, history) => {
    // Modelos Gemini — 1.5-flash es el más confiable en tier gratuito
    const GEMINI_MODELS = imageBase64
      ? ['gemini-1.5-flash', 'gemini-1.5-pro']   // Con imagen: necesita vision
      : ['gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.0-pro']

    let lastErr = ''
    for (const model of GEMINI_MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`

    const systemCtx = `Eres un asistente integrado en una app de notas llamada Sync Tablet. El usuario trabaja en esta nota:\n---\n${noteContext()}\n---\nResponde siempre en español. Sé conciso y directo.`

    // Construir partes del mensaje actual
    const parts = []
    if (imageBase64) {
      const b64 = imageBase64.split(',')[1] || imageBase64
      parts.push({ inlineData: { mimeType: 'image/png', data: b64 } })
    }
    parts.push({ text: text || 'Analiza esta imagen de mi tablet' })

    // Historial de conversación para Gemini
    const geminiHistory = history.slice(-6).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content || '' }]
    }))

      const body = {
        system_instruction: { parts: [{ text: systemCtx }] },
        contents: [
          ...geminiHistory,
          { role: 'user', parts }
        ],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
      }

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          const msg = err?.error?.message || res.statusText || ''
          // 400 = API key inválida/expirada — no tiene sentido probar más modelos
          if (res.status === 400 && msg.toLowerCase().includes('api key')) {
            throw new Error('❌ API key de Gemini inválida o expirada. Ve a aistudio.google.com/apikey y crea una nueva.')
          }
          lastErr = `${model} ${res.status}: ${msg.slice(0, 80)}`
          continue
        }
        const data = await res.json()
        const txt = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (txt) return txt
        lastErr = `${model}: sin respuesta`
        continue
      } catch(e) {
        lastErr = `${model}: ${e.message}`
        continue
      }
    }
    // Si llegamos aquí, dar un mensaje claro
    if (lastErr.includes('quota') || lastErr.includes('429')) {
      throw new Error('⏱ Gemini: límite de requests alcanzado. Intenta en unos minutos.')
    }
    throw new Error(`Gemini falló: ${lastErr}`)
  }

  // ── Llamar a OpenRouter como respaldo ──────────────────────────────────────
  const callOpenRouter = async (orKey, text, imageBase64, history) => {
    const MODELS = [
      'openrouter/free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'mistralai/mistral-small-3.1-24b-instruct:free',
    ]
    const systemMsg = `Eres un asistente integrado en Sync Tablet. Nota actual:\n${noteContext()}\nResponde en español.`
    const apiMessages = [
      { role: 'system', content: systemMsg },
      ...history.slice(-6).map(m => ({ role: m.role, content: m.content || '' })),
      {
        role: 'user',
        content: imageBase64
          ? [{ type: 'image_url', image_url: { url: imageBase64 } }, { type: 'text', text: text || 'Analiza esta imagen' }]
          : text
      }
    ]
    for (const model of MODELS) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${orKey}`, 'HTTP-Referer': 'https://synctablet.app' },
          body: JSON.stringify({ model, messages: apiMessages, max_tokens: 1000 })
        })
        if (res.status === 429 || res.status === 503 || res.status === 404) continue
        if (!res.ok) continue
        const data = await res.json()
        const txt = data.choices?.[0]?.message?.content
        if (txt) return txt
      } catch { continue }
    }
    throw new Error('OpenRouter: todos los modelos fallaron')
  }

  const send = async (userMsg, imageBase64 = null) => {
    const img = imageBase64 || pendingImg
    if ((!userMsg?.trim() && !img) || loading) return
    const displayMsg = userMsg || (img ? '📷 Analizar imagen' : '')
    const currentHistory = [...messages]
    setMessages(m => [...m, { role: 'user', content: displayMsg, image: img }])
    setInput('')
    setPendingImg(null)
    setLoading(true)

    try {
      const geminiKey   = config?.geminiKey
      const openrouterKey = config?.openrouterKey

      if (!config?.groqKey && !geminiKey && !openrouterKey) {
        setMessages(m => [...m, { role: 'assistant', content: '⚠️ Para usar la IA configura tu API key en Configuración.\n\n🔵 **Gemini** (recomendado — gratis): aistudio.google.com/apikey\n🟠 **OpenRouter** (respaldo): openrouter.ai' }])
        setLoading(false)
        return
      }

      let response = null
      let provider = ''

      // 1. Groq primero — más rápido y sin límites estrictos
      if (config?.groqKey && !img) {
        try {
          response = await callGroq(config.groqKey, userMsg, currentHistory)
          provider = 'groq'
        } catch(e) { console.warn('Groq falló:', e.message) }
      }

      // 2. Gemini — soporta imágenes
      if (!response && geminiKey) {
        try {
          response = await callGemini(geminiKey, userMsg, img, currentHistory)
          provider = 'gemini'
        } catch(e) { console.warn('Gemini falló:', e.message) }
      }

      // 3. OpenRouter como último respaldo
      if (!response && openrouterKey) {
        try {
          response = await callOpenRouter(openrouterKey, userMsg, img, currentHistory)
          provider = 'openrouter'
        } catch(e) { console.warn('OpenRouter falló:', e.message) }
      }

      setMessages(m => [...m, {
        role: 'assistant',
        content: response || '❌ Sin respuesta de ninguna IA. Revisa que tu API key esté bien configurada en Configuración.',
        provider
      }])
    } catch(e) {
      setMessages(m => [...m, { role: 'assistant', content: 'Error inesperado: ' + e.message }])
    }
    setLoading(false)
  }

  // Pegar imagen desde portapapeles (botón manual)
  const pasteImageFromClipboard = async () => {
    const r = await window.api?.pasteImage?.(null)
    if (r?.ok && r.type === 'image' && r.tmpPath) {
      const b64 = await window.api?.readFileBase64?.(r.tmpPath)
      if (b64) setPendingImg(`data:image/png;base64,${b64}`)
    }
  }

  const captureAndAnalyze = async () => {
    setCapturing(true)
    try {
      const devs = await window.api?.adbDevices?.()
      const usb = devs?.find(d => d.status === 'device' && !d.serial?.includes(':'))
      if (!usb) {
        setMessages(m => [...m, { role: 'assistant', content: '⚠️ No hay tablet conectada por USB.' }])
        setCapturing(false)
        return
      }
      const r = await window.api.adbScreenshot({ serial: usb.serial })
      if (r?.ok && r.base64) {
        const imgBase64 = `data:image/png;base64,${r.base64}`
        await send(input || null, imgBase64)
      } else {
        setMessages(m => [...m, { role: 'assistant', content: '❌ Error tomando captura de la tablet.' }])
      }
    } catch(e) {
      setMessages(m => [...m, { role: 'assistant', content: 'Error: ' + e.message }])
    }
    setCapturing(false)
  }

  const clearChat = () => setMessages([
    { role: 'assistant', content: '¡Chat reiniciado! ¿En qué te ayudo con tu nota?' }
  ])

  return (
    <div style={{
      width: 300, flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      borderLeft: '0.5px solid var(--border-lit)',
      background: 'var(--bg-panel)',
      minHeight: 0,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 12px', borderBottom: '0.5px solid var(--border-lit)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-h)', flex: 1 }}>✨ Asistente IA</span>
        <button onClick={clearChat} title="Limpiar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11, padding: '2px 4px' }}>
          Limpiar
        </button>
        <button onClick={onClose} title="Cerrar panel IA" style={{ background: 'var(--bg-elem)', border: 'none', borderRadius: 5, padding: '3px 6px', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center' }}>
          <X size={12}/>
        </button>
      </div>

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, scrollBehavior: 'smooth' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {/* Imagen adjunta */}
            {msg.image && (
              <img src={msg.image} alt="captura" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 4, maxHeight: 120, objectFit: 'contain' }} />
            )}
            {/* Burbuja */}
            <div style={{
              maxWidth: '90%', padding: '8px 12px', borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
              background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-elem)',
              color: msg.role === 'user' ? '#fff' : 'var(--text-1)',
              fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
            {/* Botón insertar en nota (solo respuestas IA) */}
            {msg.role === 'assistant' && i > 0 && (
              <button
                onClick={() => onInsertBlock(msg.content)}
                title="Agregar a la nota"
                style={{
                  marginTop: 4, padding: '3px 10px', borderRadius: 6,
                  border: '0.5px solid var(--border-lit)', background: 'var(--bg-panel)',
                  color: 'var(--text-2)', fontSize: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-panel)'; e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <Plus size={9}/> Agregar a nota
              </button>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12, background: 'var(--bg-elem)', alignSelf: 'flex-start' }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: `dotBounce 1.2s ease-in-out ${i*0.2}s infinite` }} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{ padding: '10px', borderTop: '0.5px solid var(--border-lit)', flexShrink: 0 }}>
        {/* Accesos rápidos */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
          {[
            { label: '📝 Resumir', msg: 'Resume el contenido de esta nota en 3 puntos clave' },
            { label: '✨ Mejorar', msg: 'Mejora la redacción de esta nota manteniendo el mismo contenido' },
            { label: '💡 Ideas',   msg: 'Sugiere 3 ideas para ampliar o continuar esta nota' },
            { label: '📸 Tablet',  action: captureAndAnalyze, loading: capturing },
          ].map(q => (
            <button key={q.label}
              onClick={() => q.action ? q.action() : send(q.msg)}
              disabled={loading || q.loading}
              style={{
                padding: '3px 8px', borderRadius: 5,
                border: '0.5px solid var(--border-lit)',
                background: 'var(--bg-elem)', color: 'var(--text-2)',
                fontSize: 10, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 3,
                opacity: loading ? 0.5 : 1,
              }}
            >
              {q.loading ? <Loader size={9} style={{ animation: 'spin 1s linear infinite' }}/> : null}
              {q.label}
            </button>
          ))}
        </div>

        {/* Preview imagen pegada */}
        {pendingImg && (
          <div style={{ position: 'relative', marginBottom: 8, display: 'inline-block' }}>
            <img src={pendingImg} alt="pendiente" style={{ maxHeight: 80, maxWidth: '100%', borderRadius: 8, border: '1px solid var(--accent-border)', display: 'block' }} />
            <button
              onClick={() => setPendingImg(null)}
              style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >✕</button>
            <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 3 }}>Imagen lista — escribe un mensaje o envía directo</div>
          </div>
        )}

        {/* Fila de botones de adjuntar + textarea + enviar */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end' }}>
          {/* Botón pegar imagen */}
          <button
            onClick={pasteImageFromClipboard}
            title="Pegar imagen del portapapeles (Ctrl+V en el chat)"
            disabled={loading}
            style={{
              width: 30, height: 30, borderRadius: 7, border: '0.5px solid var(--border-lit)',
              background: pendingImg ? 'var(--accent-soft)' : 'var(--bg-elem)',
              color: pendingImg ? 'var(--accent)' : 'var(--text-3)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, fontSize: 14, transition: 'all 0.15s',
            }}
          >🖼️</button>
          {/* Botón subir PDF */}
          <button
            onClick={uploadPdfToChat}
            title="Subir PDF para analizar con IA"
            disabled={loading}
            style={{
              width: 30, height: 30, borderRadius: 7, border: '0.5px solid var(--border-lit)',
              background: 'var(--bg-elem)', color: 'var(--text-3)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, fontSize: 14, transition: 'all 0.15s',
            }}
          >📄</button>
          {/* Textarea */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
            }}
            placeholder="Escribe… (Ctrl+V para pegar imagen)"
            rows={2}
            style={{
              flex: 1, background: 'var(--bg-elem)', border: '0.5px solid var(--border-lit)',
              borderRadius: 8, padding: '8px 10px', fontSize: 12,
              color: 'var(--text-h)', fontFamily: 'inherit', outline: 'none',
              resize: 'none', lineHeight: 1.5,
            }}
          />
          {/* Enviar */}
          <button onClick={() => send(input)} disabled={loading || (!input.trim() && !pendingImg)} style={{
            width: 36, height: 36, borderRadius: 8, border: 'none',
            background: (input.trim() || pendingImg) ? 'var(--accent)' : 'var(--bg-elem)',
            color: (input.trim() || pendingImg) ? '#fff' : 'var(--text-3)',
            cursor: (input.trim() || pendingImg) ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s', flexShrink: 0,
          }}>
            {loading
              ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }}/>
              : <ChevronRight size={16}/>}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// PDF SPLIT VIEWER — usa PDF.js para renderizar en canvas
// ════════════════════════════════════════════════════════════════════════════════
function PDFSplitViewer({ pdf, onClose, onAddToNote }) {
  const [selected, setSelected] = useState('')
  const [pdf2,     setPdf2]     = useState(null)
  const [activeTab,setActiveTab]= useState(1)
  const [mode,     setMode]     = useState('viewer') // 'viewer' | 'browser'
  const [browserUrl,    setBrowserUrl]    = useState('https://www.google.com')
  const [browserInput,  setBrowserInput]  = useState('https://www.google.com')
  const webviewRef = useRef(null)

  const openSecondPDF = async () => {
    const r = await window.api.pickPdf?.()
    if (!r) return
    setPdf2(r)
    setActiveTab(2)
  }

  const activePdf = activeTab === 1 ? pdf : pdf2

  return (
    <div style={{
      width: '100%', display: 'flex', flexDirection: 'column',
      borderLeft: '0.5px solid var(--border-lit)', background: '#1e2130',
      minHeight: 0, height: '100%',
    }}>
      {/* Header tabs */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, background: '#16181f' }}>
        <button onClick={() => setActiveTab(1)} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6,
          border: 'none', background: activeTab===1 ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
          color: activeTab===1 ? '#fff' : '#888', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          maxWidth: 160, overflow: 'hidden',
        }}>
          <span>📄</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pdf?.name?.slice(0,18) || 'PDF 1'}
          </span>
        </button>

        {pdf2 ? (
          <button onClick={() => setActiveTab(2)} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6,
            border: 'none', background: activeTab===2 ? '#10b981' : 'rgba(255,255,255,0.08)',
            color: activeTab===2 ? '#fff' : '#888', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            maxWidth: 160, overflow: 'hidden',
          }}>
            <span>📗</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pdf2?.name?.slice(0,18) || 'PDF 2'}
            </span>
          </button>
        ) : (
          <button onClick={openSecondPDF} style={{
            padding: '4px 10px', borderRadius: 6,
            border: '1px dashed rgba(255,255,255,0.2)',
            background: 'none', color: '#666', fontSize: 11, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Plus size={10}/> PDF 2
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button onClick={() => setMode(m => m==='viewer' ? 'browser' : 'viewer')} style={{
            background: mode==='browser' ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
            border: 'none', borderRadius: 6, padding: '4px 8px',
            cursor: 'pointer', color: mode==='browser' ? '#fff' : '#aaa', fontSize: 12, fontWeight: 700,
          }}>{mode==='browser' ? '📄' : '🌐'}</button>
          <button onClick={() => window.api?.openPath?.(activePdf?.path)} style={{
            background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6,
            padding: '4px 8px', cursor: 'pointer', color: '#aaa', fontSize: 12,
          }}>↗</button>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6,
            padding: '4px 8px', cursor: 'pointer', color: '#888',
          }}><X size={13}/></button>
        </div>
      </div>

      {/* Browser mode */}
      {mode === 'browser' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 6, padding: '6px 8px', background: '#2a2d3e', borderBottom: '1px solid #333', flexShrink: 0, alignItems: 'center' }}>
            <button onClick={() => webviewRef.current?.goBack?.()} style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>‹</button>
            <button onClick={() => webviewRef.current?.goForward?.()} style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>›</button>
            <button onClick={() => webviewRef.current?.reload?.()} style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>↺</button>
            <input
              value={browserInput}
              onChange={e => setBrowserInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  let url = browserInput.trim()
                  if (!url.startsWith('http')) url = 'https://' + url
                  setBrowserUrl(url); setBrowserInput(url)
                }
              }}
              style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '4px 10px', color: '#fff', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
            />
          </div>
          <webview ref={webviewRef} src={browserUrl} style={{ flex: 1, width: '100%', minHeight: 0 }} partition="persist:browser" />
        </div>
      )}

      {/* PDF viewer — ambos montados, solo activo visible para preservar posición */}
      {mode === 'viewer' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
          <div style={{
            position: 'absolute', inset: 0,
            visibility: activeTab===1 ? 'visible' : 'hidden',
            pointerEvents: activeTab===1 ? 'auto' : 'none',
            display: 'flex', flexDirection: 'column',
          }}>
            <WebviewPDF pdf={pdf} />
          </div>
          {pdf2 && (
            <div style={{
              position: 'absolute', inset: 0,
              visibility: activeTab===2 ? 'visible' : 'hidden',
              pointerEvents: activeTab===2 ? 'auto' : 'none',
              display: 'flex', flexDirection: 'column',
            }}>
              <WebviewPDF pdf={pdf2} />
            </div>
          )}
        </div>
      )}

      {/* Pegar texto a nota */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid #333', flexShrink: 0, background: '#16181f' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <textarea
            value={selected}
            onChange={e => setSelected(e.target.value)}
            placeholder="Copia texto del documento y pégalo aquí → + Nota"
            rows={2}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 7, padding: '6px 10px', fontSize: 11, color: '#fff',
              fontFamily: 'inherit', resize: 'none', outline: 'none',
            }}
          />
          <button
            onClick={() => { if (selected.trim()) { onAddToNote(selected.trim()); setSelected('') } }}
            disabled={!selected.trim()} style={{
              padding: '6px 12px', borderRadius: 7, border: 'none',
              background: selected.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
              color: selected.trim() ? '#fff' : '#555',
              cursor: selected.trim() ? 'pointer' : 'default',
              fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}>+ Nota</button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers UI ────────────────────────────────────────────────────────────────
function IconBtn({ children, onClick, small, title }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: 'var(--bg-elem)', border: 'none',
      borderRadius: small ? 5 : 7,
      padding: small ? '3px 5px' : '5px 7px',
      cursor: 'pointer', color: 'var(--text-2)',
      display: 'flex', alignItems: 'center',
    }}>{children}</button>
  )
}

function Btn({ children, onClick, icon, primary }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '7px 14px', borderRadius: 8, border: 'none',
      background: primary ? 'var(--accent)' : 'var(--bg-elem)',
      color: primary ? '#fff' : 'var(--text-1)',
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
    }}>
      {icon}{children}
    </button>
  )
}

function Modal({ modal, onClose }) {
  const [value, setValue] = useState(modal.value || '')
  if (!modal) return null
  const ok = () => { modal.onOk?.(value); onClose() }
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 998, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'fixed', zIndex: 999,
        top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: 'var(--bg-panel)', borderRadius: 16,
        padding: '24px 28px', minWidth: 320, maxWidth: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        border: '0.5px solid var(--border-lit)',
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-h)', marginBottom: 8 }}>{modal.title}</h3>
        {modal.message && <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.5 }}>{modal.message}</p>}
        {modal.type === 'input' && (
          <input autoFocus value={value} onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ok()}
            placeholder={modal.placeholder || ''}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '0.5px solid var(--border-lit)', background: 'var(--bg-elem)', color: 'var(--text-h)', fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 16, boxSizing: 'border-box' }}
          />
        )}
        {modal.type === 'select' && modal.options && (
          <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 16 }}>
            {modal.options.map(opt => (
              <div key={opt.value} onClick={() => setValue(opt.value)} style={{
                padding: '8px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                background: value === opt.value ? 'var(--accent-soft)' : 'var(--bg-elem)',
                border: value === opt.value ? '1px solid var(--accent)' : '1px solid transparent',
                fontSize: 12, color: 'var(--text-h)',
              }}>{opt.label}</div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {modal.type !== 'alert' && (
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--bg-elem)', color: 'var(--text-1)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          )}
          <button onClick={ok} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: modal.type === 'confirm' ? '#ef4444' : 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {modal.type === 'confirm' ? 'Eliminar' : modal.type === 'alert' ? 'OK' : modal.type === 'select' ? 'Abrir' : 'Crear'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── FolderCard ────────────────────────────────────────────────────────────────
function FolderCard({ folder, noteCount, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'var(--bg-card)', border: '0.5px solid var(--border-lit)',
      borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
      transition: 'transform 0.15s, box-shadow 0.15s',
      borderTop: `3px solid ${folder.cover || 'var(--accent)'}`,
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 20 }}>📁</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {folder.name}
        </span>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{noteCount} nota{noteCount !== 1 ? 's' : ''}</p>
    </div>
  )
}

// ── NoteCard ──────────────────────────────────────────────────────────────────
function NoteCard({ note, onClick, onDelete }) {
  const preview = (note.blocks || [])
    .map(b => b.content || (b.items || []).join(' '))
    .filter(Boolean).join(' ').slice(0, 80)

  return (
    <div style={{
      background: 'var(--bg-card)', border: '0.5px solid var(--border-lit)',
      borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
      transition: 'transform 0.15s, box-shadow 0.15s', position: 'relative',
    }}
      onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
    >
      <div style={{ height: 6, background: note.cover || 'var(--accent)' }} />
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 16 }}>{note.emoji || '📝'}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-h)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {note.title || 'Sin título'}
          </span>
        </div>
        {preview && <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{preview}</p>}
        <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>{fmtDate(note.updatedAt)}</p>
      </div>
      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{
            position: 'absolute', top: 10, right: 8,
            background: 'rgba(239,68,68,0.15)', border: 'none', borderRadius: 6,
            padding: '3px 6px', cursor: 'pointer', color: '#ef4444', opacity: 0,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0'}
        >
          <Trash2 size={11}/>
        </button>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// DRAW CANVAS
// ════════════════════════════════════════════════════════════════════════════════
function DrawCanvas({ note, onSave, onClose }) {
  const canvasRef   = useRef(null)
  const snapshotRef = useRef(null)
  const [tool,      setTool]      = useState('pen')
  const [color,     setColor]     = useState('#4f6ef7')
  const [lineWidth, setLineWidth] = useState(3)
  const [drawing,   setDrawing]   = useState(false)
  const startPos    = useRef(null)
  const lastPos     = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#1e2130'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (note.drawing) {
      const img = new window.Image()
      img.onload = () => ctx.drawImage(img, 0, 0)
      img.src = note.drawing
    }
  }, [])

  const getPos = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    const src = e.touches ? e.touches[0] : e
    return { x: src.clientX - r.left, y: src.clientY - r.top }
  }

  const startDraw = (e) => {
    const pos = getPos(e)
    setDrawing(true)
    startPos.current = pos
    lastPos.current  = pos
    const ctx = canvasRef.current.getContext('2d')
    if (['ellipse','rect','arrow','line'].includes(tool)) {
      snapshotRef.current = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height)
    }
  }

  const draw = (e) => {
    if (!drawing) return
    e.preventDefault()
    const pos = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.strokeStyle = tool === 'eraser' ? '#1e2130' : color
    ctx.lineWidth   = tool === 'eraser' ? lineWidth * 4 : lineWidth
    ctx.lineCap     = 'round'

    if (tool === 'pen' || tool === 'eraser') {
      ctx.beginPath()
      ctx.moveTo(lastPos.current.x, lastPos.current.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      lastPos.current = pos
    } else if (snapshotRef.current) {
      ctx.putImageData(snapshotRef.current, 0, 0)
      const s = startPos.current
      ctx.beginPath()
      if (tool === 'line') {
        ctx.moveTo(s.x, s.y); ctx.lineTo(pos.x, pos.y)
      } else if (tool === 'rect') {
        ctx.strokeRect(s.x, s.y, pos.x - s.x, pos.y - s.y)
      } else if (tool === 'ellipse') {
        ctx.ellipse((s.x+pos.x)/2, (s.y+pos.y)/2, Math.abs(pos.x-s.x)/2, Math.abs(pos.y-s.y)/2, 0, 0, Math.PI*2)
      } else if (tool === 'arrow') {
        ctx.moveTo(s.x, s.y); ctx.lineTo(pos.x, pos.y)
        const a = Math.atan2(pos.y-s.y, pos.x-s.x)
        const h = 15
        ctx.moveTo(pos.x, pos.y)
        ctx.lineTo(pos.x - h*Math.cos(a-0.4), pos.y - h*Math.sin(a-0.4))
        ctx.moveTo(pos.x, pos.y)
        ctx.lineTo(pos.x - h*Math.cos(a+0.4), pos.y - h*Math.sin(a+0.4))
      }
      ctx.stroke()
    }
  }

  const endDraw = () => setDrawing(false)

  const TOOLS = [
    { id:'pen',    label:'✏️' },
    { id:'eraser', label:'⬜' },
    { id:'line',   label:'╱' },
    { id:'rect',   label:'▭' },
    { id:'ellipse',label:'◯' },
    { id:'arrow',  label:'→' },
  ]
  const COLORS = ['#4f6ef7','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#fff','#000']

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.8)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
      <div style={{ display:'flex', gap:8, alignItems:'center', background:'var(--bg-panel)', borderRadius:12, padding:'8px 14px', flexWrap:'wrap' }}>
        {TOOLS.map(t => (
          <button key={t.id} onClick={() => setTool(t.id)} style={{ padding:'6px 10px', borderRadius:7, border:'none', background: tool===t.id?'var(--accent)':'var(--bg-elem)', color: tool===t.id?'#fff':'var(--text-1)', cursor:'pointer', fontSize:14 }}>{t.label}</button>
        ))}
        <div style={{ width:1, height:24, background:'var(--border)', margin:'0 4px' }} />
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)} style={{ width:22, height:22, borderRadius:'50%', border: color===c?'3px solid var(--accent)':'2px solid transparent', background:c, cursor:'pointer', flexShrink:0 }} />
        ))}
        <div style={{ width:1, height:24, background:'var(--border)', margin:'0 4px' }} />
        <input type="range" min={1} max={20} value={lineWidth} onChange={e => setLineWidth(+e.target.value)} style={{ width:70 }} />
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={() => { const ctx=canvasRef.current.getContext('2d'); ctx.fillStyle='#1e2130'; ctx.fillRect(0,0,canvasRef.current.width,canvasRef.current.height) }} style={{ padding:'6px 12px', borderRadius:8, border:'none', background:'var(--bg-elem)', color:'var(--text-1)', cursor:'pointer', fontSize:12 }}>Limpiar</button>
          <button onClick={() => onSave(canvasRef.current.toDataURL())} style={{ padding:'6px 14px', borderRadius:8, border:'none', background:'var(--accent)', color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700 }}>Guardar</button>
          <button onClick={onClose} style={{ padding:'6px 10px', borderRadius:8, border:'none', background:'var(--bg-elem)', color:'var(--text-1)', cursor:'pointer' }}><X size={14}/></button>
        </div>
      </div>
      <canvas
        ref={canvasRef} width={900} height={580}
        style={{ borderRadius:12, cursor:'crosshair', touchAction:'none' }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// POMODORO — pastilla flotante estilo Samsung
// ════════════════════════════════════════════════════════════════════════════════
function PomodoroTimer({ onClose }) {
  const MODES = { work: 25*60, short: 5*60, long: 15*60 }
  const [mode,    setMode]    = useState('work')
  const [secs,    setSecs]    = useState(MODES.work)
  const [running, setRunning] = useState(false)
  const [pos,     setPos]     = useState({ x: window.innerWidth - 220, y: 80 })
  const [dragging,setDragging]= useState(false)
  const dragRef = useRef(null)
  const intervalRef = useRef(null)
  const color = mode === 'work' ? '#ef4444' : '#10b981'
  const pct   = secs / MODES[mode]
  const mins  = String(Math.floor(secs/60)).padStart(2,'0')
  const s     = String(secs%60).padStart(2,'0')

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecs(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current)
            setRunning(false)
            if (Notification.permission === 'granted')
              new Notification('Sync Tablet', { body: mode==='work' ? '¡Descanso! 🎉' : '¡A trabajar! 💪' })
            return 0
          }
          return s - 1
        })
      }, 1000)
    } else clearInterval(intervalRef.current)
    return () => clearInterval(intervalRef.current)
  }, [running, mode])

  // Drag
  const onMouseDown = (e) => {
    if (e.target.tagName === 'BUTTON') return
    setDragging(true)
    dragRef.current = { startX: e.clientX - pos.x, startY: e.clientY - pos.y }
  }
  useEffect(() => {
    if (!dragging) return
    const move = (e) => setPos({ x: e.clientX - dragRef.current.startX, y: e.clientY - dragRef.current.startY })
    const up   = () => setDragging(false)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [dragging])

  const setModeReset = (m) => { setMode(m); setSecs(MODES[m]); setRunning(false) }
  const toggle = () => { if (!running && Notification.permission !== 'granted') Notification.requestPermission(); setRunning(r => !r) }

  // Radio del círculo SVG
  const R = 28
  const circ = 2 * Math.PI * R
  const dash = circ * pct

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'fixed',
        left: pos.x, top: pos.y,
        zIndex: 400,
        background: 'rgba(20,22,32,0.96)',
        backdropFilter: 'blur(12px)',
        borderRadius: 50,
        padding: '6px 14px 6px 8px',
        display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px ${color}44`,
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        minWidth: 180,
      }}
    >
      {/* Círculo progreso */}
      <div style={{ position:'relative', width:64, height:64, flexShrink:0 }}>
        <svg width={64} height={64} style={{ transform:'rotate(-90deg)' }}>
          <circle cx={32} cy={32} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5}/>
          <circle cx={32} cy={32} r={R} fill="none" stroke={color} strokeWidth={5}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s linear' }}
          />
        </svg>
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontSize:13, fontWeight:800, color:'#fff', fontFamily:'monospace', lineHeight:1 }}>{mins}:{s}</span>
          <span style={{ fontSize:8, color:'rgba(255,255,255,0.5)', marginTop:1 }}>
            {mode==='work'?'🍅':mode==='short'?'☕':'🌿'}
          </span>
        </div>
      </div>

      {/* Controles */}
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {/* Modos */}
        <div style={{ display:'flex', gap:3 }}>
          {[['work','25m'],['short','5m'],['long','15m']].map(([m,l]) => (
            <button key={m} onClick={() => setModeReset(m)} style={{
              padding:'2px 7px', borderRadius:10, border:'none', fontSize:9,
              background: mode===m ? color : 'rgba(255,255,255,0.08)',
              color: mode===m ? '#fff' : 'rgba(255,255,255,0.5)',
              cursor:'pointer', fontWeight: mode===m ? 700 : 400,
            }}>{l}</button>
          ))}
        </div>
        {/* Play/pause + cerrar */}
        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
          <button onClick={toggle} style={{
            flex:1, padding:'4px 8px', borderRadius:10, border:'none',
            background: color, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer',
          }}>{running ? '⏸' : '▶'}</button>
          <button onClick={() => { setSecs(MODES[mode]); setRunning(false) }} style={{
            padding:'4px 7px', borderRadius:10, border:'none',
            background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.6)', cursor:'pointer', fontSize:11,
          }}>↺</button>
          <button onClick={onClose} style={{
            padding:'4px 7px', borderRadius:10, border:'none',
            background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.4)', cursor:'pointer', fontSize:11,
          }}>✕</button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// FLASHCARDS VIEWER
// ════════════════════════════════════════════════════════════════════════════════
function FlashcardsViewer({ cards, onClose }) {
  const [idx,     setIdx]     = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [known,   setKnown]   = useState(new Set())
  const card = cards[idx]

  const next = (markKnown = false) => {
    if (markKnown) setKnown(s => new Set([...s, idx]))
    setFlipped(false)
    setTimeout(() => setIdx(i => Math.min(i+1, cards.length-1)), 150)
  }
  const prev = () => { setFlipped(false); setTimeout(() => setIdx(i => Math.max(i-1,0)), 150) }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:998, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)' }}/>
      <div style={{
        position:'fixed', zIndex:999,
        top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        width:480, background:'var(--bg-panel)', borderRadius:20,
        boxShadow:'0 24px 80px rgba(0,0,0,0.4)', border:'1px solid var(--border)',
        overflow:'hidden',
      }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:13, fontWeight:700, color:'var(--text-h)' }}>🃏 Flashcards — {idx+1}/{cards.length}</span>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:11, color:'var(--success)' }}>✓ {known.size} sabidas</span>
            <button onClick={onClose} style={{ background:'var(--bg-elem)', border:'none', borderRadius:6, padding:'4px 8px', cursor:'pointer', color:'var(--text-2)' }}><X size={13}/></button>
          </div>
        </div>
        <div style={{ height:3, background:'var(--bg-elem)' }}>
          <div style={{ height:'100%', width:`${((idx+1)/cards.length)*100}%`, background:'var(--accent)', transition:'width 0.3s' }}/>
        </div>
        <div onClick={() => setFlipped(f => !f)} style={{
          margin:24, minHeight:160, borderRadius:14, cursor:'pointer',
          background: flipped?'rgba(79,110,247,0.1)':'var(--bg-elem)',
          border:`2px solid ${flipped?'var(--accent)':'var(--border)'}`,
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          padding:24, textAlign:'center', transition:'all 0.2s',
        }}>
          <span style={{ fontSize:10, fontWeight:700, color: flipped?'var(--accent)':'var(--text-3)', marginBottom:12, letterSpacing:1 }}>
            {flipped ? 'RESPUESTA' : 'PREGUNTA — click para ver'}
          </span>
          <p style={{ fontSize:15, fontWeight: flipped?400:600, color:'var(--text-h)', lineHeight:1.6 }}>
            {flipped ? card.back : card.front}
          </p>
        </div>
        <div style={{ padding:'0 24px 24px', display:'flex', gap:8 }}>
          <button onClick={prev} disabled={idx===0} style={{ flex:1, padding:10, borderRadius:10, border:'none', background:'var(--bg-elem)', color:idx===0?'var(--text-3)':'var(--text-1)', cursor:idx===0?'not-allowed':'pointer', fontWeight:600, fontSize:13 }}>← Anterior</button>
          {flipped && idx < cards.length-1 && <>
            <button onClick={() => next(false)} style={{ flex:1, padding:10, borderRadius:10, border:'none', background:'rgba(239,68,68,0.15)', color:'#ef4444', cursor:'pointer', fontWeight:700, fontSize:13 }}>✗ No sabía</button>
            <button onClick={() => next(true)} style={{ flex:1, padding:10, borderRadius:10, border:'none', background:'rgba(16,185,129,0.15)', color:'#10b981', cursor:'pointer', fontWeight:700, fontSize:13 }}>✓ Sabía</button>
          </>}
          {idx===cards.length-1 && flipped && (
            <button onClick={() => { setIdx(0); setFlipped(false); setKnown(new Set()) }} style={{ flex:2, padding:10, borderRadius:10, border:'none', background:'var(--accent)', color:'#fff', cursor:'pointer', fontWeight:700, fontSize:13 }}>🔄 Reiniciar</button>
          )}
          {!flipped && <button onClick={() => setIdx(i => Math.min(i+1,cards.length-1))} disabled={idx===cards.length-1} style={{ flex:1, padding:10, borderRadius:10, border:'none', background:'var(--bg-elem)', color:idx===cards.length-1?'var(--text-3)':'var(--text-1)', cursor:idx===cards.length-1?'not-allowed':'pointer', fontWeight:600, fontSize:13 }}>Siguiente →</button>}
        </div>
      </div>
    </>
  )
}
