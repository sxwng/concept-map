import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Download, Eye, Grip, Link2, Maximize2, Pencil, Sparkles, Trash2, Upload, X, ZoomIn, ZoomOut } from 'lucide-react'
import './styles.css'

type NodeKind = 'concept' | 'detail'
type MapNode = { id: string; kind: NodeKind; title: string; body: string; longDefinition?: string; x: number; y: number }
type MapEdge = { id: string; from: string; to: string; label: string }
type ContextMenu = { x: number; y: number; mapX: number; mapY: number } | null

// initial nodes for testing
const initialNodes: MapNode[] = [
  { id: 'concept', kind: 'concept', title: 'Concept Box', body: 'Big concepts go here!', x: 760, y: 260 },
  { id: 'detail', kind: 'detail', title: 'Detail Box', body: 'Specific details go here!', x: 330, y: 110 }
]
const initialEdges: MapEdge[] = [
  { id: 'e1', from: 'concept', to: 'detail', label: 'provides the framework for' },
]
const nodeSizes: Record<NodeKind, { width: number; height: number }> = {
  concept: { width: 300, height: 196 },
  detail: { width: 208, height: 150 },
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function validateGraph(nodes: MapNode[], edges: MapEdge[]) {
  if (nodes.length === 0) throw new Error('The file has no nodes.')
  const ids = new Set<string>()
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error(`Duplicate node id "${node.id}".`)
    ids.add(node.id)
  }
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error(`Relationship "${edge.id}" references a node that doesn't exist.`)
  }
}

function parseImportedJSON(text: string): { nodes: MapNode[]; edges: MapEdge[]; title?: string } {
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new Error('That file is not valid JSON.') }
  if (!data || typeof data !== 'object' || !Array.isArray((data as Record<string, unknown>).nodes) || !Array.isArray((data as Record<string, unknown>).edges)) {
    throw new Error('JSON must have "nodes" and "edges" arrays.')
  }
  const raw = data as { nodes: unknown[]; edges: unknown[]; title?: unknown }
  const nodes: MapNode[] = raw.nodes.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Node ${index + 1} is not an object.`)
    const node = item as Record<string, unknown>
    if (typeof node.id !== 'string' || !node.id) throw new Error(`Node ${index + 1} is missing an id.`)
    if (node.kind !== 'concept' && node.kind !== 'detail') throw new Error(`Node "${node.id}" kind must be "concept" or "detail".`)
    if (typeof node.title !== 'string') throw new Error(`Node "${node.id}" is missing a title.`)
    if (typeof node.x !== 'number' || typeof node.y !== 'number') throw new Error(`Node "${node.id}" is missing numeric x/y.`)
    return {
      id: node.id,
      kind: node.kind,
      title: node.title,
      body: typeof node.body === 'string' ? node.body : '',
      x: node.x,
      y: node.y,
      ...(typeof node.longDefinition === 'string' ? { longDefinition: node.longDefinition } : {}),
    }
  })
  const edges: MapEdge[] = raw.edges.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Relationship ${index + 1} is not an object.`)
    const edge = item as Record<string, unknown>
    if (typeof edge.id !== 'string' || !edge.id) throw new Error(`Relationship ${index + 1} is missing an id.`)
    if (typeof edge.from !== 'string' || typeof edge.to !== 'string') throw new Error(`Relationship "${edge.id}" is missing a from/to node id.`)
    return { id: edge.id, from: edge.from, to: edge.to, label: typeof edge.label === 'string' ? edge.label : '' }
  })
  const title = typeof raw.title === 'string' ? raw.title : undefined
  validateGraph(nodes, edges)
  return { nodes, edges, ...(title !== undefined ? { title } : {}) }
}

const csvColumns = ['type', 'id', 'kind', 'title', 'body', 'longDefinition', 'x', 'y', 'from', 'to', 'label'] as const

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function nodesEdgesToCSV(nodes: MapNode[], edges: MapEdge[], title: string): string {
  const rows = [csvColumns as unknown as string[]]
  rows.push(['map', '', '', title, '', '', '', '', '', '', ''])
  for (const node of nodes) rows.push(['node', node.id, node.kind, node.title, node.body, node.longDefinition ?? '', String(node.x), String(node.y), '', '', ''])
  for (const edge of edges) rows.push(['edge', edge.id, '', '', '', '', '', '', edge.from, edge.to, edge.label])
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')
}

function parseCSVText(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1 } else inQuotes = false
      } else field += char
    } else if (char === '"') inQuotes = true
    else if (char === ',') { row.push(field); field = '' }
    else if (char === '\r') { /* ignore, \n closes the row */ }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += char
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((cells) => !(cells.length === 1 && cells[0] === ''))
}

function csvToNodesEdges(text: string): { nodes: MapNode[]; edges: MapEdge[]; title?: string } {
  const rows = parseCSVText(text)
  if (rows.length === 0) throw new Error('CSV file is empty.')
  const [header, ...body] = rows
  const columnIndex = (name: string) => header.indexOf(name)
  for (const name of ['type', 'id']) if (columnIndex(name) === -1) throw new Error(`CSV is missing required column "${name}".`)
  const nodes: MapNode[] = []
  const edges: MapEdge[] = []
  let title: string | undefined
  body.forEach((row, rowIndex) => {
    const line = rowIndex + 2
    const get = (name: string) => { const index = columnIndex(name); return index === -1 ? '' : (row[index] ?? '') }
    const type = get('type')
    if (type === 'map') { title = get('title'); return }
    const id = get('id')
    if (!id) throw new Error(`Row ${line} is missing an id.`)
    if (type === 'node') {
      const kind = get('kind')
      if (kind !== 'concept' && kind !== 'detail') throw new Error(`Row ${line}: node kind must be "concept" or "detail".`)
      const x = Number(get('x'))
      const y = Number(get('y'))
      if (Number.isNaN(x) || Number.isNaN(y)) throw new Error(`Row ${line}: node x/y must be numbers.`)
      const longDefinition = get('longDefinition')
      nodes.push({ id, kind, title: get('title'), body: get('body'), x, y, ...(longDefinition ? { longDefinition } : {}) })
    } else if (type === 'edge') {
      edges.push({ id, from: get('from'), to: get('to'), label: get('label') })
    } else {
      throw new Error(`Row ${line}: unknown type "${type}" (expected "node", "edge", or "map").`)
    }
  })
  validateGraph(nodes, edges)
  return { nodes, edges, ...(title !== undefined ? { title } : {}) }
}

function App() {
  const [nodes, setNodes] = useState(initialNodes)
  const [edges, setEdges] = useState(initialEdges)
  const [mapTitle, setMapTitle] = useState('Example Concept Atlas')
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
  const importInputRef = useRef<HTMLInputElement>(null)
  const preFocusView = useRef<{ pan: { x: number; y: number }; zoom: number } | null>(null)
  const longDefOnFocusRef = useRef<Record<string, string>>({})
  const nodeRefs = useRef<Record<string, HTMLElement | null>>({})
  const summarizingRef = useRef<Set<string>>(new Set())

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
    setNodes((current) => [...current, { id, kind, title: kind === 'concept' ? 'New concept' : 'New detail', body: '', x: contextMenu.mapX - size.width / 2, y: contextMenu.mapY - size.height / 2 }])
    setContextMenu(null)
  }

  const updateNode = (id: string, changes: Partial<MapNode>) => setNodes((current) => current.map((node) => node.id === id ? { ...node, ...changes } : node))

  const exportAsJSON = () => downloadTextFile('concept-map.json', JSON.stringify({ title: mapTitle, nodes, edges }, null, 2), 'application/json')
  const exportAsCSV = () => downloadTextFile('concept-map.csv', nodesEdgesToCSV(nodes, edges, mapTitle), 'text/csv')

  const importMap = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '')
        const { nodes: importedNodes, edges: importedEdges, title: importedTitle } = file.name.toLowerCase().endsWith('.csv') ? csvToNodesEdges(text) : parseImportedJSON(text)
        setNodes(importedNodes)
        setEdges(importedEdges)
        if (importedTitle) setMapTitle(importedTitle)
        setSelectedId(null)
        setFocusedId(null)
        setRelationId(null)
        setContextMenu(null)
        setError('')
      } catch (importError) {
        setError(importError instanceof Error ? importError.message : 'Import failed.')
      }
    }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
    event.target.value = ''
  }

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

  useEffect(() => {
    for (const node of nodes) {
      if (node.id === focusedId || !node.longDefinition || node.body.trim() || summarizingRef.current.has(node.id)) continue
      summarizingRef.current.add(node.id)
      requestSummary(node, node.longDefinition).finally(() => summarizingRef.current.delete(node.id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, focusedId])

  const generateDefinition = async (node: MapNode) => {
    setGenerating(node.id); setError('')
    try {
      const response = await fetch('/api/generate-definition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: node.title, kind: node.kind }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Generation failed')
      updateNode(node.id, { longDefinition: data.definition })
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
    <section className="map-header"><div><span className="eyebrow">SUBJECT MAP <span>•</span> {nodes.length} NODE{nodes.length === 1 ? '' : 'S'}</span>{editing ? <input className="map-title-input" value={mapTitle} onChange={(event) => setMapTitle(event.target.value)} aria-label="Map title" /> : <h1>{mapTitle}</h1>}<div className="canvas-hint"><span className="hint-dot" /> {editing ? 'Right-click anywhere to add a concept or detail' : 'Click an idea to bring it into focus · drag with two fingers to pan'}</div></div><div className="header-actions"><button className="ghost-button" title="Export as JSON" onClick={exportAsJSON}><Download size={15} /> JSON</button><button className="ghost-button" title="Export as CSV" onClick={exportAsCSV}><Download size={15} /> CSV</button><button className="ghost-button" title="Import a concept map (.json or .csv)" onClick={() => importInputRef.current?.click()}><Upload size={15} /> Import</button><input ref={importInputRef} type="file" accept=".json,.csv" hidden onChange={importMap} /><button className="primary-button" onClick={() => setEditing((value) => !value)}>{editing ? <><Eye size={16} /> View map</> : <><Pencil size={16} /> Edit map</>}</button></div></section>
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
              placeholder={showLong ? 'Add the full definition here.' : 'Add a definition or observation here.'}
              onChange={(event) => updateNode(node.id, showLong ? { longDefinition: event.target.value } : { body: event.target.value })}
              onFocus={() => {
                if (!editing) return
                setFocusedId(node.id)
                longDefOnFocusRef.current[node.id] = node.longDefinition ?? ''
              }}
              onBlur={() => {
                if (!editing || !node.longDefinition) return
                const changed = node.longDefinition !== longDefOnFocusRef.current[node.id]
                if (changed) requestSummary(node, node.longDefinition)
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
