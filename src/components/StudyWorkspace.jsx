import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Play, X, Plus, FileText } from 'lucide-react'
import { launchScrcpy, adbDevices } from '../api.js'

const AI_TABS = [
  { id: 'claude',  label: 'Claude',  url: 'https://claude.ai',         color: '#d97706' },
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com',       color: '#10b981' },
  { id: 'gemini',  label: 'Gemini',  url: 'https://gemini.google.com', color: '#4f6ef7' },
]

export default function StudyWorkspace({ devices, config, addLog, hasWallpaper, isActive }) {
  const glass = { background: 'rgba(12,14,20,0.80)', backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)' }
  const [dragging,   setDragging]   = useState(false)
  const [sending,    setSending]    = useState(false)
  const [status,     setStatus]     = useState('')
  const [statusColor,setColor]      = useState('var(--text-2)')

  const [pdfTabs,   setPdfTabs]   = useState([])
  const [activePdf, setActivePdf] = useState(null)
  const pdfViewRefs = useRef({})

  const [aiTab,     setAiTab]     = useState('claude')
  const aiWebRefs   = useRef({})

  const [notes,     setNotes]     = useState([])
  const [noteInput, setNoteInput] = useState('')
  const aiPanelRef = useRef(null)
  const aiDragState = useRef({ startX: 0, startW: 320, currentW: 320 })

  const usbDevice = devices.find(d => d.status === 'device' && !d.serial?.includes(':'))
  const folder    = config.drop_folder || '~/Drop'

  const setMsg = (msg, color = 'var(--text-2)') => { setStatus(msg); setColor(color) }

  // ── Ctrl+V ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = async (e) => {
      if (!isActive) return          // no interceptar cuando no es el tab activo
      if (!(e.ctrlKey||e.metaKey) || e.key!=='v') return
      const tag = document.activeElement?.tagName
      if (tag==='INPUT'||tag==='TEXTAREA') return
      e.preventDefault()
      const r = await window.api.pasteImage(null)
      if (!r?.ok || r.type!=='image') return
      setSending(true)
      if (usbDevice) {
        setMsg(`Enviando ${r.filename} a tablet…`, 'var(--warning)')
        const res = await window.api.adbPushSingle({ serial: usbDevice.serial, localPath: r.tmpPath, remotePath: `/sdcard/Download/${r.filename}` })
        setMsg(res?.ok ? `✓ ${r.filename} en la tablet` : '✗ Error', res?.ok ? 'var(--success)' : 'var(--error)')
        if (res?.ok) addLog(`✓ ${r.filename} → tablet`, 'ok')
      } else {
        setMsg(`Enviando ${r.filename} a Drop…`, 'var(--warning)')
        const res = await window.api.copyToDrop({ src: r.tmpPath, folder })
        setMsg(res?.ok ? `✓ ${r.filename} en Drop` : '✗ Error', res?.ok ? 'var(--success)' : 'var(--error)')
      }
      setSending(false)
      setTimeout(() => setMsg(''), 3000)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [folder, usbDevice])

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const handleDragOver  = (e) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = (e) => { e.preventDefault(); setDragging(false) }
  const handleDrop = async (e) => {
    e.preventDefault(); setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (!files.length) return
    setSending(true)
    for (const file of files) {
      if (!file.path) continue
      if (file.name.toLowerCase().endsWith('.pdf')) { openPdfPath(file.path, file.name); continue }
      if (usbDevice) {
        setMsg(`Enviando ${file.name}…`, 'var(--warning)')
        await window.api.adbPushSingle({ serial: usbDevice.serial, localPath: file.path, remotePath: `/sdcard/Download/${file.name}` })
      } else {
        await window.api.copyToDrop({ src: file.path, folder })
      }
    }
    setSending(false)
    setTimeout(() => setMsg(''), 3000)
  }

  // ── AI panel resize handled inline in onMouseDown ──────────────────────────

  // ── PDF ────────────────────────────────────────────────────────────────────
  const openPdfPath = async (path, name) => {
    const r = await window.api.servePdf?.(path)
    if (!r?.ok) return
    const id = Date.now().toString()
    setPdfTabs(tabs => [...tabs, { id, name, url: r.url, path }])
    setActivePdf(id)
  }

  const pickPdf = async () => {
    const r = await window.api.pickPdf?.()
    if (r) openPdfPath(r.path, r.name)
  }

  const closePdf = (id) => {
    setPdfTabs(tabs => {
      const closing = tabs.find(t => t.id === id)
      if (closing?.path) window.api.closePdfServer?.(closing.path)
      const rest = tabs.filter(t => t.id !== id)
      if (activePdf === id) setActivePdf(rest[rest.length-1]?.id || null)
      return rest
    })
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  const addNote = () => {
    if (!noteInput.trim()) return
    setNotes(n => [{ id: Date.now(), text: noteInput.trim(), ts: new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}) }, ...n])
    setNoteInput('')
  }

  const S = {
    col: { display:'flex', flexDirection:'column', overflow:'hidden' },
    label: { fontSize:10, fontWeight:700, color:'var(--text-3)', letterSpacing:0.8, marginBottom:5 },
  }

  return (
    <div
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      style={{ height:'100%', display:'flex', overflow:'hidden', position:'relative',
        outline: dragging?'3px dashed var(--accent)':'none',
        background: 'transparent' }}
    >
      {/* Drag overlay */}
      {dragging && (
        <div style={{ position:'absolute', inset:0, zIndex:50, background:'rgba(79,110,247,0.08)',
          display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
          <div style={{ background:'var(--bg-panel)', borderRadius:16, padding:'20px 36px',
            border:'2px solid var(--accent)', textAlign:'center' }}>
            <div style={{ fontSize:36, marginBottom:6 }}>{usbDevice?'📲':'📂'}</div>
            <p style={{ fontSize:14, fontWeight:700, color:'var(--accent)' }}>
              {usbDevice?'Enviar a tablet':'Enviar a Drop'}
            </p>
            <p style={{ fontSize:11, color:'var(--text-2)', marginTop:3 }}>PDFs se abren en el visor</p>
          </div>
        </div>
      )}

      {/* ── COL IZQUIERDA: Tablet + PDFs ── */}
      <div style={{ width:200, flexShrink:0, ...S.col, borderRight:'1px solid var(--border)',
        ...glass, padding:'12px' }}>

        {/* Estado tablet */}
        <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:10 }}>
          <div style={{ width:7, height:7, borderRadius:'50%',
            background: usbDevice?'var(--success)':'var(--text-3)', flexShrink:0 }}/>
          <span style={{ fontSize:11, color:'var(--text-2)' }}>
            {usbDevice ? 'USB conectado' : 'Sin tablet USB'}
          </span>
        </div>

        {/* Ctrl+V hint */}
        <div style={{ padding:'7px 10px', borderRadius:7, marginBottom:12,
          background: usbDevice?'rgba(16,185,129,0.08)':'var(--bg-elem)',
          border:`1px solid ${usbDevice?'rgba(16,185,129,0.25)':'var(--border)'}`,
          fontSize:11, color: usbDevice?'var(--success)':'var(--text-3)' }}>
          {usbDevice
            ? <><strong>Ctrl+V</strong> o arrastra → tablet</>
            : <>Ctrl+V o arrastra → Drop</>}
        </div>

        {status && <p style={{ fontSize:10, color:statusColor, marginBottom:8, textAlign:'center' }}>{status}</p>}

        {/* PDFs */}
        <div style={{ marginBottom:4, display:'flex', alignItems:'center' }}>
          <span style={S.label}>PDFS ABIERTOS</span>
          <button onClick={pickPdf} style={{ marginLeft:'auto', background:'var(--accent)',
            border:'none', borderRadius:5, padding:'2px 8px', cursor:'pointer',
            color:'#fff', fontSize:10, fontWeight:700 }}>+ Abrir</button>
        </div>

        {pdfTabs.length === 0 && (
          <div style={{ fontSize:10, color:'var(--text-3)', textAlign:'center',
            padding:'12px 8px', border:'1px dashed var(--border)', borderRadius:6 }}>
            Arrastra PDFs aquí<br/>o usa "+ Abrir"
          </div>
        )}

        <div style={{ flex:1, overflowY:'auto' }}>
          {pdfTabs.map(tab => (
            <div key={tab.id} onClick={()=>setActivePdf(tab.id)}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 7px',
                borderRadius:6, marginBottom:2, cursor:'pointer',
                background: activePdf===tab.id?'var(--accent-soft)':'var(--bg-elem)',
                border:`1px solid ${activePdf===tab.id?'var(--accent)':'transparent'}`,
                transition:'all 0.12s' }}>
              <FileText size={10} color={activePdf===tab.id?'var(--accent)':'var(--text-3)'}/>
              <span style={{ flex:1, fontSize:10, color: activePdf===tab.id?'var(--accent)':'var(--text-1)',
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {tab.name.replace('.pdf','').slice(0,20)}
              </span>
              <button onClick={e=>{e.stopPropagation();closePdf(tab.id)}}
                style={{ background:'none', border:'none', cursor:'pointer',
                  color:'var(--text-3)', padding:0, display:'flex' }}>
                <X size={9}/>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── COL CENTRAL: Visor PDF ── */}
      <div style={{ flex:1, ...S.col, minWidth:0 }}>

        {/* PDF tabs bar */}
        <div style={{ display:'flex', alignItems:'center', borderBottom:'1px solid var(--border)',
          ...glass, flexShrink:0, overflowX:'auto', minHeight:36 }}>
          {pdfTabs.length === 0 ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
              gap:8, color:'var(--text-3)', fontSize:12, padding:'0 16px' }}>
              <FileText size={13}/> Abre o arrastra un PDF para leer aquí
            </div>
          ) : pdfTabs.map(tab => (
            <div key={tab.id} onClick={()=>setActivePdf(tab.id)}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px',
                cursor:'pointer',
                borderBottom: activePdf===tab.id?'2px solid var(--accent)':'2px solid transparent',
                color: activePdf===tab.id?'var(--accent)':'var(--text-2)',
                fontSize:11, fontWeight: activePdf===tab.id?700:400,
                whiteSpace:'nowrap', flexShrink:0, transition:'all 0.15s' }}>
              📄 {tab.name.replace('.pdf','').slice(0,22)}
              <button onClick={e=>{e.stopPropagation();closePdf(tab.id)}}
                style={{ background:'none', border:'none', cursor:'pointer',
                  color:'var(--text-3)', padding:0, display:'flex', marginLeft:2 }}>
                <X size={10}/>
              </button>
            </div>
          ))}
          <button onClick={pickPdf}
            style={{ marginLeft:'auto', marginRight:6, background:'none', border:'none',
              cursor:'pointer', color:'var(--text-3)', padding:'5px 8px',
              display:'flex', alignItems:'center', gap:3, fontSize:11, flexShrink:0 }}>
            <Plus size={12}/> PDF
          </button>
        </div>

        {/* PDF viewer */}
        <div style={{ flex:1, position:'relative', background:'#3a3a3a' }}>
          {pdfTabs.length === 0 && (
            <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center', gap:14, color:'var(--text-3)' }}>
              <FileText size={44} opacity={0.2}/>
              <p style={{ fontSize:13 }}>Arrastra un PDF aquí o usa el panel izquierdo</p>
              <button onClick={pickPdf} style={{ padding:'9px 22px', borderRadius:9, border:'none',
                background:'var(--accent)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                Abrir PDF
              </button>
            </div>
          )}
          {activePdf && (() => {
            const tab = pdfTabs.find(t => t.id === activePdf)
            return tab ? (
              <webview
                ref={el => { pdfViewRefs.current['single'] = el }}
                src={tab.url}
                partition="persist:pdfview"
                style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}
              />
            ) : null
          })()}
        </div>
      </div>

      {/* ── COL DERECHA: IA + Notas (resizable) ── */}
      <AiResizableCol>

        {/* AI tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)',
          ...glass, flexShrink:0 }}>
          {AI_TABS.map(t => (
            <button key={t.id} onClick={()=>setAiTab(t.id)} style={{
              flex:1, padding:'8px 4px', border:'none', cursor:'pointer',
              background: aiTab===t.id ? t.color+'22' : 'transparent',
              color: aiTab===t.id ? t.color : 'var(--text-2)',
              fontSize:11, fontWeight: aiTab===t.id?700:400,
              borderBottom: aiTab===t.id?`2px solid ${t.color}`:'2px solid transparent',
              transition:'all 0.15s',
            }}>{t.label}</button>
          ))}
        </div>

        {/* AI webview — solo activo */}
        <div style={{ flex:1, position:'relative', minHeight:0 }}>
          {AI_TABS.filter(t => t.id === aiTab).map(t => (
            <webview key={t.id}
              ref={el=>{if(el)aiWebRefs.current[t.id]=el}}
              src={t.url}
              partition="persist:aibrowser"
              style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}/>
          ))}
        </div>

        {/* Notas rápidas */}
        <div style={{ flexShrink:0, borderTop:'1px solid var(--border)',
          ...glass, maxHeight:190, ...S.col }}>
          <div style={{ padding:'6px 10px 3px', display:'flex', alignItems:'center' }}>
            <span style={S.label}>📝 NOTAS RÁPIDAS</span>
            <span style={{ fontSize:10, color:'var(--text-3)', marginLeft:'auto' }}>{notes.length}</span>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'0 8px' }}>
            {notes.length === 0 && (
              <p style={{ fontSize:10, color:'var(--text-3)', textAlign:'center', padding:'6px 0' }}>
                Enter para guardar un enunciado
              </p>
            )}
            {notes.map(n => (
              <div key={n.id} style={{ display:'flex', gap:5, padding:'3px 6px',
                borderRadius:5, marginBottom:2, background:'var(--bg-elem)', fontSize:10 }}>
                <span style={{ color:'var(--text-3)', flexShrink:0 }}>{n.ts}</span>
                <span style={{ flex:1, color:'var(--text-1)', lineHeight:1.5,
                  wordBreak:'break-word' }}>{n.text}</span>
                <button onClick={()=>setNotes(ns=>ns.filter(x=>x.id!==n.id))}
                  style={{ background:'none', border:'none', cursor:'pointer',
                    color:'var(--text-3)', padding:0, display:'flex' }}>
                  <X size={9}/>
                </button>
              </div>
            ))}
          </div>
          <div style={{ padding:'5px 8px 7px', display:'flex', gap:5 }}>
            <textarea value={noteInput} onChange={e=>setNoteInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();addNote()}}}
              placeholder="Guardar enunciado… (Enter)" rows={2}
              style={{ flex:1, background:'var(--bg-elem)', border:'1px solid var(--border)',
                borderRadius:6, padding:'4px 7px', fontSize:10, color:'var(--text-h)',
                fontFamily:'inherit', resize:'none', outline:'none' }}/>
            <button onClick={addNote} disabled={!noteInput.trim()}
              style={{ padding:'5px 9px', borderRadius:6, border:'none',
                background: noteInput.trim()?'var(--accent)':'var(--bg-elem)',
                color: noteInput.trim()?'#fff':'var(--text-3)',
                cursor: noteInput.trim()?'pointer':'default',
                fontSize:11, fontWeight:700, flexShrink:0 }}>💾</button>
          </div>
        </div>
      </AiResizableCol>
    </div>
  )
}

function AiResizableCol({ children }) {
  const ref = useRef(null)
  return (
    <div ref={ref} style={{
      width: 320, flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
      position: 'relative', overflow: 'hidden',
      minWidth: 220, maxWidth: 700,
    }}>
      <div
        onPointerDown={e => {
          if (e.button !== 0) return
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          const el = ref.current
          const startX = e.clientX
          const startW = el.offsetWidth
          let raf = null
          e.currentTarget.onpointermove = (ev) => {
            if (raf) return
            raf = requestAnimationFrame(() => {
              raf = null
              const newW = Math.min(700, Math.max(220, startW + (startX - ev.clientX)))
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', paddingLeft: 6, minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}
