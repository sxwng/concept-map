import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Eye, Grip, Link2, Maximize2, Pencil, Sparkles, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import './styles.css'

type NodeKind = 'concept' | 'detail'
type MapNode = { id: string; kind: NodeKind; title: string; body: string; longDefinition?: string; x: number; y: number }
type MapEdge = { id: string; from: string; to: string; label: string }
type ContextMenu = { x: number; y: number; mapX: number; mapY: number } | null

// initial nodes for testing
const initialNodes: MapNode[] = [
  { id: 'quantum', kind: 'concept', title: 'Quantum chemistry', body: 'The behavior of matter and energy at atomic scales.', x: 760, y: 260 },
  { id: 'duality', kind: 'concept', title: 'Wave-particle duality', body: 'Quantum objects can display wave-like and particle-like properties.', x: 330, y: 110 },
  { id: 'uncertainty', kind: 'concept', title: 'Uncertainty principle', body: 'Momentum and position cannot both be known precisely.', x: 1110, y: 100 },
  { id: 'catastrophe', kind: 'detail', title: 'Ultraviolet catastrophe', body: 'Classical physics predicted that hot objects emit infinite energy at short wavelengths. Planck solved the crisis by proposing quantized energy.', x: 90, y: 410 },
  { id: 'photoelectric', kind: 'detail', title: 'Photoelectric effect', body: 'Light knocks electrons from a material in discrete packets of energy, showing light has particle-like behavior.', x: 480, y: 500 },
  { id: 'electron', kind: 'detail', title: 'Electron microscope', body: 'A practical example of wave behavior: electron wavelengths enable imaging at a scale smaller than visible light.', x: 1060, y: 420 },
]
const initialEdges: MapEdge[] = [
  { id: 'e1', from: 'quantum', to: 'duality', label: 'provides the framework for' },
  { id: 'e2', from: 'quantum', to: 'uncertainty', label: 'reveals limits within' },
  { id: 'e3', from: 'duality', to: 'catastrophe', label: 'was suggested by' },
  { id: 'e4', from: 'duality', to: 'photoelectric', label: 'is demonstrated by' },
  { id: 'e5', from: 'uncertainty', to: 'electron', label: 'shapes the design of' },
]
const nodeSizes: Record<NodeKind, { width: number; height: number }> = {
  concept: { width: 300, height: 196 },
  detail: { width: 208, height: 150 },
}

function App() {
  const [nodes, setNodes] = useState(initialNodes)
  const [edges, setEdges] = useState(initialEdges)
  const [editing, setEditing] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null)
  const [relationId, setRelationId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(0.82)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const [connecting, setConnecting] = useState<{ from: string; x: number; y: number } | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const preFocusView = useRef<{ pan: { x: number; y: number }; zoom: number } | null>(null)
  const longDefOnFocusRef = useRef<Record<string, string>>({})
  const nodeRefs = useRef<Record<string, HTMLElement | null>>({})

  const selected = nodes.find((node) => node.id === selectedId)
  const relation = edges.find((edge) => edge.id === relationId)
  const relationNodes = relation ? { from: nodes.find((node) => node.id === relation.from), to: nodes.find((node) => node.id === relation.to) } : null
  const bounds = useMemo(() => ({ width: 1500, height: 820 }), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!editing || !selectedId || !['Backspace', 'Delete'].includes(event.key) || (event.target as HTMLElement).tagName === 'INPUT' || (event.target as HTMLElement).tagName === 'TEXTAREA') return
      event.preventDefault()
      setNodes((current) => current.filter((node) => node.id !== selectedId))
      setEdges((current) => current.filter((edge) => edge.from !== selectedId && edge.to !== selectedId))
      setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, selectedId])

  useEffect(() => { if (editing) { setFocusedId(null); setExpandedId(null) } }, [editing])

  useEffect(() => { if (expandedId && expandedId !== focusedId) setExpandedId(null) }, [focusedId, expandedId])

  useEffect(() => {
    if (focusedId) {
      const node = nodes.find((item) => item.id === focusedId)
      if (!node) return
      if (!preFocusView.current) preFocusView.current = { pan, zoom }
      const el = nodeRefs.current[focusedId]
      const size = el ? { width: el.offsetWidth, height: el.offsetHeight } : nodeSizes[node.kind]
      const center = { x: node.x + size.width / 2, y: node.y + size.height / 2 }
      const canvas = canvasRef.current
      if (expandedId === focusedId && el && canvas) {
        const margin = 72
        const availW = canvas.clientWidth - margin * 2
        const availH = canvas.clientHeight - margin * 2
        const fitZoom = Math.max(0.35, Math.min(availW / el.offsetWidth, availH / el.offsetHeight))
        setZoom(fitZoom)
        setPan({ x: -(center.x - bounds.width / 2) * fitZoom, y: -(center.y - bounds.height / 2) * fitZoom })
      } else {
        const focusZoom = Math.min(1.25, Math.max(zoom, 1.05))
        setZoom(focusZoom)
        setPan({ x: -(center.x - bounds.width / 2) * focusZoom, y: -(center.y - bounds.height / 2) * focusZoom })
      }
    } else if (preFocusView.current) {
      setPan(preFocusView.current.pan)
      setZoom(preFocusView.current.zoom)
      preFocusView.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId, expandedId, nodes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      if (focusedId) return
      event.preventDefault()
      if (event.ctrlKey) { setZoom((value) => Math.min(1.25, Math.max(0.55, value - event.deltaY * 0.012))); return }
      setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [focusedId])

  const getMapPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left - rect.width / 2 - pan.x) / zoom + bounds.width / 2, y: (clientY - rect.top - rect.height / 2 - pan.y) / zoom + bounds.height / 2 }
  }

  const hashAngle = (id: string) => {
    let hash = 0
    for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0
    return ((Math.abs(hash) % 1000) / 1000) * 12 - 6
  }

  const nodeCenter = (node: MapNode) => {
    const size = nodeSizes[node.kind]
    return { x: node.x + size.width / 2, y: node.y + size.height / 2 }
  }

  const nodeTransform = (node: MapNode) => {
    const parts: string[] = []
    if (selectedId === node.id) parts.push('translateY(-2px)')
    if (focusedId === node.id) {
      parts.push('scale(1.06)')
    } else if (focusedId) {
      const focusNode = nodes.find((item) => item.id === focusedId)
      if (focusNode) {
        const a = nodeCenter(focusNode)
        const b = nodeCenter(node)
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance = Math.hypot(dx, dy) || 1
        const strength = Math.min(220, Math.max(60, 240 - distance * 0.22))
        parts.push(`translate(${(dx / distance) * strength}px, ${(dy / distance) * strength}px) rotate(${hashAngle(node.id)}deg) scale(0.92)`)
      }
    }
    return parts.length ? parts.join(' ') : undefined
  }

  const addNode = (kind: NodeKind) => {
    if (!contextMenu) return
    const id = `${kind}-${Date.now()}`
    const size = nodeSizes[kind]
    setNodes((current) => [...current, { id, kind, title: kind === 'concept' ? 'New concept' : 'New detail', body: 'Add a definition or observation here.', x: contextMenu.mapX - size.width / 2, y: contextMenu.mapY - size.height / 2 }])
    setContextMenu(null)
  }

  const updateNode = (id: string, changes: Partial<MapNode>) => setNodes((current) => current.map((node) => node.id === id ? { ...node, ...changes } : node))

  const requestSummary = async (node: MapNode, longDefinition: string) => {
    try {
      const response = await fetch('/api/generate-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: node.title, kind: node.kind, longDefinition }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Summary generation failed')
      updateNode(node.id, { body: data.summary })
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : 'Summary generation failed')
    }
  }

  const generateDefinition = async (node: MapNode) => {
    setGenerating(node.id); setError('')
    try {
      const response = await fetch('/api/generate-definition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: node.title, kind: node.kind }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Generation failed')
      updateNode(node.id, { longDefinition: data.definition })
      if (!node.body.trim()) await requestSummary(node, data.definition)
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Generation failed')
    } finally { setGenerating(null) }
  }

  const onNodePointerDown = (event: React.PointerEvent, node: MapNode) => {
    if (!editing) { setSelectedId(node.id); return }
    event.stopPropagation(); setSelectedId(node.id)
    const point = getMapPoint(event.clientX, event.clientY)
    setDragging({ id: node.id, offsetX: point.x - node.x, offsetY: point.y - node.y })
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const onCanvasPointerMove = (event: React.PointerEvent) => {
    const point = getMapPoint(event.clientX, event.clientY)
    if (dragging) updateNode(dragging.id, { x: point.x - dragging.offsetX, y: point.y - dragging.offsetY })
    if (connecting) setConnecting({ ...connecting, x: point.x, y: point.y })
  }

  const finishConnection = (toId: string) => {
    if (!connecting || connecting.from === toId) return setConnecting(null)
    if (!edges.some((edge) => edge.from === connecting.from && edge.to === toId)) setEdges((current) => [...current, { id: `e-${Date.now()}`, from: connecting.from, to: toId, label: 'relates to' }])
    setConnecting(null)
  }

  const edgePath = (edge: MapEdge) => {
    const from = nodes.find((node) => node.id === edge.from); const to = nodes.find((node) => node.id === edge.to)
    if (!from || !to) return null
    const a = nodeCenter(from); const b = nodeCenter(to); const bend = Math.max(80, Math.abs(b.x - a.x) * 0.34)
    return { path: `M ${a.x} ${a.y} C ${a.x + (b.x > a.x ? bend : -bend)} ${a.y}, ${b.x - (b.x > a.x ? bend : -bend)} ${b.y}, ${b.x} ${b.y}`, labelX: (a.x + b.x) / 2, labelY: (a.y + b.y) / 2 - 8 }
  }

  return <main className={`app-shell ${expandedId ? 'is-expanded' : ''}`}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark">✦</span><span>Concept Atlas</span><span className="crumb">/ Workspace</span></div>
      <div className="top-actions"><span className="saved"><span className="save-dot" /> Saved just now</span><button className="icon-button" title="Zoom out" disabled={!!focusedId} onClick={() => setZoom((value) => Math.max(0.55, value - 0.08))}><ZoomOut size={17} /></button><span className="zoom-label">{Math.round(zoom * 100)}%</span><button className="icon-button" title="Zoom in" disabled={!!focusedId} onClick={() => setZoom((value) => Math.min(1.25, value + 0.08))}><ZoomIn size={17} /></button></div>
    </header>
    <section className="map-header"><div><span className="eyebrow">SUBJECT MAP <span>•</span> 06 NODES</span><h1>Quantum chemistry</h1><div className="canvas-hint"><span className="hint-dot" /> {editing ? 'Right-click anywhere to add a concept or detail' : 'Click an idea to bring it into focus · drag with two fingers to pan'}</div></div><div className="header-actions"><button className="primary-button" onClick={() => setEditing((value) => !value)}>{editing ? <><Eye size={16} /> View map</> : <><Pencil size={16} /> Edit map</>}</button></div></section>
    <section className="canvas-wrap">
      <div ref={canvasRef} className={`map-canvas ${editing ? 'is-editing' : 'is-viewing'}`} onPointerMove={onCanvasPointerMove} onPointerUp={() => { setDragging(null); setConnecting(null) }} onPointerDown={() => { setSelectedId(null); setFocusedId(null); setRelationId(null); setContextMenu(null) }} onContextMenu={(event) => { if (!editing) return; event.preventDefault(); const point = getMapPoint(event.clientX, event.clientY); setContextMenu({ x: event.clientX, y: event.clientY, mapX: point.x, mapY: point.y }) }}>
        <div className="map-stage" style={{ width: bounds.width, height: bounds.height, transform: `translate(${pan.x}px, ${pan.y}px) translate(-50%, -50%) scale(${zoom})` }}>
          <svg className="edges" width={bounds.width} height={bounds.height} aria-hidden="true">
            <defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" fill="none" stroke="#73809e" strokeWidth="1.4" /></marker></defs>
            {edges.map((edge) => { const computed = edgePath(edge); const dimmed = focusedId && edge.from !== focusedId && edge.to !== focusedId; return computed && <g key={edge.id} onPointerDown={(event) => { event.stopPropagation(); setRelationId(edge.id) }} className={`edge-group ${dimmed ? 'dimmed' : ''}`}><path d={computed.path} className="edge-line" markerEnd="url(#arrow)" /><text x={computed.labelX} y={computed.labelY} className="edge-label">{edge.label}</text></g> })}
            {connecting && <path d={`M ${nodeCenter(nodes.find((node) => node.id === connecting.from)!).x} ${nodeCenter(nodes.find((node) => node.id === connecting.from)!).y} L ${connecting.x} ${connecting.y}`} className="edge-line connecting-line" />}
          </svg>
          {nodes.map((node) => {
            const isActive = selectedId === node.id || focusedId === node.id
            const showLong = Boolean(node.longDefinition) && isActive
            return <article key={node.id} className={`map-node ${node.kind} ${selectedId === node.id ? 'selected' : ''} ${focusedId === node.id ? 'focused' : ''}`} style={{ left: node.x, top: node.y, transform: nodeTransform(node), opacity: focusedId && focusedId !== node.id ? 0.55 : 1 }} onPointerDown={(event) => onNodePointerDown(event, node)} onClick={(event) => { event.stopPropagation(); if (!editing) setFocusedId((current) => current === node.id ? null : node.id) }}>
            <div className="node-kicker">{node.kind === 'concept' ? 'CONCEPT' : 'DETAIL'} {focusedId === node.id ? <Maximize2 size={13} /> : <Grip size={13} />}</div>
            <input value={node.title} onChange={(event) => updateNode(node.id, { title: event.target.value })} readOnly={!editing} aria-label={`${node.kind} title`} />
            <textarea
              value={showLong ? node.longDefinition : node.body}
              onChange={(event) => updateNode(node.id, showLong ? { longDefinition: event.target.value } : { body: event.target.value })}
              onFocus={() => {
                if (!editing) return
                setFocusedId(node.id)
                longDefOnFocusRef.current[node.id] = node.longDefinition ?? ''
              }}
              onBlur={() => {
                if (!editing || !node.longDefinition) return
                const changed = node.longDefinition !== longDefOnFocusRef.current[node.id]
                const missingSummary = !node.body.trim()
                if (changed || missingSummary) requestSummary(node, node.longDefinition)
              }}
              readOnly={!editing}
              aria-label={`${node.kind} details`}
            />
            {editing && <><button className="connect-handle" title="Drag to connect" onPointerDown={(event) => { event.stopPropagation(); const point = getMapPoint(event.clientX, event.clientY); setConnecting({ from: node.id, x: point.x, y: point.y }) }} onPointerUp={(event) => { event.stopPropagation(); finishConnection(node.id) }}><Link2 size={13} /></button><button className="generate-button" disabled={generating === node.id} onPointerDown={(event) => event.stopPropagation()} onClick={() => generateDefinition(node)}><Sparkles size={13} /> {generating === node.id ? 'Generating...' : 'Generate definition'}</button></>}
            {editing && selectedId === node.id && <button className="delete-node" title="Delete node" onPointerDown={(event) => { event.stopPropagation(); setNodes((current) => current.filter((item) => item.id !== node.id)); setEdges((current) => current.filter((edge) => edge.from !== node.id && edge.to !== node.id)); setSelectedId(null) }}><Trash2 size={14} /></button>}
          </article>
          })}
        </div>
        {contextMenu && <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}><span className="menu-label">ADD TO MAP</span><button onClick={() => addNode('concept')}><span className="menu-swatch concept-swatch" />Concept box</button><button onClick={() => addNode('detail')}><span className="menu-swatch detail-swatch" />Detail box</button><span className="menu-rule" /><button className="danger-menu" onClick={() => { if (selectedId) setNodes((current) => current.filter((node) => node.id !== selectedId)); setContextMenu(null) }}><Trash2 size={14} />Remove selected</button></div>}
        {relation && relationNodes?.from && relationNodes.to && <div className="relation-popover" onPointerDown={(event) => event.stopPropagation()}><button className="close-button" onClick={() => setRelationId(null)}><X size={14} /></button><span className="eyebrow">RELATIONSHIP</span><p><strong>{relationNodes.from.title}</strong> <span>→</span> <strong>{relationNodes.to.title}</strong></p><input value={relation.label} onChange={(event) => setEdges((current) => current.map((item) => item.id === relation.id ? { ...item, label: event.target.value } : item))} readOnly={!editing} /></div>}
        {error && <div className="error-toast">{error}<button onClick={() => setError('')}><X size={14} /></button></div>}
      </div>
      {/* <div className="canvas-hint"><span className="hint-dot" /> {editing ? 'Right-click anywhere to add a concept or detail' : 'Click an idea to bring it into focus · drag with two fingers to pan'}</div> */}
    </section>
    <footer className="statusbar"><button className={`mode-toggle ${editing ? 'active' : ''}`} onClick={() => setEditing((value) => !value)}>{editing ? <Pencil size={15} /> : <Eye size={15} />}<span>{editing ? 'Editing' : 'Viewing'}</span></button><div className="legend"><span><i className="legend-dot concept-dot" />Concept</span><span><i className="legend-dot detail-dot" />Detail</span><span><i className="legend-line" />Relationship</span></div><span className="status-note">Press <kbd>⌘</kbd> <kbd>K</kbd> to search</span></footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
