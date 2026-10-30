import React, { useState, useEffect, useRef } from 'react'
import Tutorial, { useTutorial, TUTORIALS } from './Tutorial.jsx'
import { loadConfig, saveConfig } from '../api.js'
import { CheckCircle2, Circle, Plus, X, ChevronRight, Trash2, GripVertical, Flag, Calendar } from 'lucide-react'

const PRIORITIES = {
  high:   { color: '#ef4444', label: 'Alta' },
  medium: { color: '#f59e0b', label: 'Media' },
  low:    { color: '#6b8aff', label: 'Baja' },
}

export default function TodoPanel({ hasWallpaper }) {
  const [open,     setOpen]     = useState(false)
  const [todos,    setTodos]    = useState([])
  const [input,    setInput]    = useState('')
  const [priority, setPriority] = useState('medium')
  const [filter,   setFilter]   = useState('all')
  const [loaded,   setLoaded]   = useState(false)
  const inputRef = useRef(null)
  const tutorial = useTutorial('todo')

  // Cargar tareas desde config al montar
  useEffect(() => {
    loadConfig().then(cfg => {
      setTodos(cfg.todos || [])
      setLoaded(true)
    })
  }, [])

  // Guardar tareas en config cada vez que cambian (solo después de cargar)
  useEffect(() => {
    if (!loaded) return
    loadConfig().then(cfg => {
      saveConfig({ ...cfg, todos })
    })
  }, [todos, loaded])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 350) }, [open])

  const addTodo = () => {
    const text = input.trim()
    if (!text) return
    setTodos(p => [{
      id: Date.now(),
      text,
      done: false,
      priority,
      createdAt: new Date().toLocaleDateString('es', { day: 'numeric', month: 'short' }),
    }, ...p])
    setInput('')
  }

  const toggle = (id) => setTodos(p => p.map(t => t.id === id ? { ...t, done: !t.done } : t))
  const remove = (id) => setTodos(p => p.filter(t => t.id !== id))
  const clearDone = () => setTodos(p => p.filter(t => !t.done))

  const filtered = todos.filter(t =>
    filter === 'all' ? true : filter === 'active' ? !t.done : t.done
  )
  const doneCount   = todos.filter(t => t.done).length
  const activeCount = todos.filter(t => !t.done).length
  const progress    = todos.length ? Math.round((doneCount / todos.length) * 100) : 0

  const glassStyle = { background: 'rgba(12,14,20,0.82)', backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)' }

  return (
    <>
      {/* ── Botón flotante para abrir ── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Lista de tareas"
        style={{
          position: 'fixed', right: open ? 324 : 0, top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 150,
          width: 28,
          height: 72,
          borderRadius: '10px 0 0 10px',
          background: open ? 'var(--accent)' : (hasWallpaper ? 'rgba(79,110,247,0.85)' : 'var(--accent)'),
          backdropFilter: 'blur(8px)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 3,
          transition: 'right 0.38s cubic-bezier(0.4,0,0.2,1), background 0.2s',
          boxShadow: '-3px 0 16px rgba(79,110,247,0.3)',
        }}
      >
        <ChevronRight
          size={14}
          color="#fff"
          style={{
            transition: 'transform 0.3s',
            transform: open ? 'rotate(0deg)' : 'rotate(180deg)',
          }}
        />
        {activeCount > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 800, color: '#fff',
            background: 'rgba(255,255,255,0.25)',
            borderRadius: 6, padding: '1px 4px', lineHeight: 1.4,
          }}>{activeCount}</span>
        )}
      </button>

      {/* ── Panel lateral ── */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 320,
        zIndex: 140,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.38s cubic-bezier(0.4,0,0.2,1)',
        borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        ...glassStyle,
      }}>

        {/* Header */}
        <div style={{
          padding: '18px 18px 12px',
          borderBottom: '0.5px solid var(--border-lit)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-h)', letterSpacing: -0.3 }}>
                Tareas
              </h2>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                {activeCount} pendientes · {doneCount} completadas
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
              }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Barra de progreso */}
          {todos.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>PROGRESO</span>
                <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>{progress}%</span>
              </div>
              <div style={{
                height: 4, borderRadius: 4,
                background: 'var(--bg-elem)', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  width: `${progress}%`,
                  background: progress === 100
                    ? 'var(--success)'
                    : 'linear-gradient(90deg, var(--accent), #a78bfa)',
                  transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                }} />
              </div>
            </div>
          )}

          {/* Input nueva tarea */}
          <div style={{
            display: 'flex', gap: 6,
            background: 'var(--bg-elem)',
            borderRadius: 10, padding: '6px 8px',
            border: '1.5px solid var(--border-lit)',
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTodo()}
              placeholder="Nueva tarea…"
              style={{
                flex: 1, background: 'none', border: 'none',
                fontSize: 13, color: 'var(--text-h)',
                outline: 'none',
              }}
            />
            {/* Selector prioridad */}
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {Object.entries(PRIORITIES).map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => setPriority(key)}
                  title={p.label}
                  style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: p.color, border: 'none', cursor: 'pointer',
                    opacity: priority === key ? 1 : 0.3,
                    transform: priority === key ? 'scale(1.3)' : 'scale(1)',
                    transition: 'all 0.15s',
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
            <button
              onClick={addTodo}
              disabled={!input.trim()}
              style={{
                background: input.trim() ? 'var(--accent)' : 'transparent',
                border: 'none', borderRadius: 7, padding: '4px 8px',
                cursor: input.trim() ? 'pointer' : 'default',
                color: input.trim() ? '#fff' : 'var(--text-3)',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center',
              }}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div style={{
          display: 'flex', gap: 4, padding: '10px 18px 6px',
          borderBottom: '0.5px solid var(--border-lit)',
        }}>
          {[
            { id: 'all',    label: 'Todas', count: todos.length },
            { id: 'active', label: 'Pendientes', count: activeCount },
            { id: 'done',   label: 'Hechas', count: doneCount },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              flex: 1, padding: '5px 4px', borderRadius: 7, border: 'none',
              fontSize: 11, fontWeight: filter === f.id ? 700 : 400,
              background: filter === f.id ? 'var(--accent)' : 'transparent',
              color: filter === f.id ? '#fff' : 'var(--text-3)',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              {f.label}
              {f.count > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 800,
                  background: filter === f.id ? 'rgba(255,255,255,0.25)' : 'var(--bg-elem)',
                  color: filter === f.id ? '#fff' : 'var(--text-3)',
                  borderRadius: 5, padding: '0 4px', lineHeight: 1.6,
                }}>{f.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Lista de tareas */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {filtered.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              height: '100%', gap: 10, opacity: 0.5,
            }}>
              <span style={{ fontSize: 32 }}>
                {filter === 'done' ? '🎉' : '📋'}
              </span>
              <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                {filter === 'done' ? 'Nada completado aún' : filter === 'active' ? 'Todo listo!' : 'Sin tareas'}
              </p>
            </div>
          )}

          {filtered.map((todo, i) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              index={i}
              onToggle={() => toggle(todo.id)}
              onRemove={() => remove(todo.id)}
            />
          ))}
        </div>

        {/* Footer */}
        {doneCount > 0 && (
          <div style={{
            padding: '10px 18px',
            borderTop: '0.5px solid var(--border-lit)',
            display: 'flex', justifyContent: 'flex-end',
          }}>
            <button
              onClick={clearDone}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11, color: 'var(--text-3)',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '4px 8px', borderRadius: 6,
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
            >
              <Trash2 size={12} /> Limpiar completadas
            </button>
          </div>
        )}
      </div>

      {/* Overlay semitransparente al abrir (solo en móvil o ventana pequeña) */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 139,
            background: 'transparent',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Tutorial Todo */}
      {tutorial.show && open && (
        <Tutorial
          steps={TUTORIALS.todo}
          onDone={(f) => tutorial.dismiss(f)}
          accentColor="var(--accent)"
        />
      )}

      <style>{`
        @keyframes todoSlideIn {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  )
}

function TodoItem({ todo, index, onToggle, onRemove }) {
  const [hovered, setHovered] = useState(false)
  const p = PRIORITIES[todo.priority] || PRIORITIES.medium

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '9px 10px', borderRadius: 10, marginBottom: 4,
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        transition: 'background 0.15s',
        animation: `todoSlideIn 0.25s ease ${index * 0.04}s both`,
        cursor: 'default',
      }}
    >
      {/* Checkbox */}
      <button
        onClick={onToggle}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 0, flexShrink: 0, marginTop: 1,
          color: todo.done ? 'var(--success)' : 'var(--text-3)',
          transition: 'color 0.2s, transform 0.15s',
          transform: hovered && !todo.done ? 'scale(1.1)' : 'scale(1)',
        }}
      >
        {todo.done
          ? <CheckCircle2 size={17} />
          : <Circle size={17} />
        }
      </button>

      {/* Texto */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13, color: todo.done ? 'var(--text-3)' : 'var(--text-h)',
          textDecoration: todo.done ? 'line-through' : 'none',
          lineHeight: 1.4, wordBreak: 'break-word',
          transition: 'color 0.2s',
        }}>
          {todo.text}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {/* Dot de prioridad */}
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: p.color, flexShrink: 0,
            opacity: todo.done ? 0.4 : 1,
          }} />
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{todo.createdAt}</span>
        </div>
      </div>

      {/* Botón eliminar */}
      <button
        onClick={onRemove}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 3, borderRadius: 5,
          color: 'var(--text-3)',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s, color 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
      >
        <X size={13} />
      </button>
    </div>
  )
}
