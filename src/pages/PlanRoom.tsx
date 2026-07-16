import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { supabase } from '../lib/supabase'
import type { Bid } from '../lib/types'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

interface Plan {
  id: string
  bid_id: string
  file_path: string
  created_at: string
}

const isImage = (path: string) => /\.(png|jpe?g|gif|webp)$/i.test(path)
const fileName = (p: Plan) => p.file_path.split('/').pop()?.replace(/^\d+_/, '') ?? p.file_path

type Tool = 'pan' | 'calibrate' | 'measure'
interface Pt {
  x: number
  y: number
}
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)

interface SheetScale {
  ftPerPt: number
  line: { a: Pt; b: Pt } | null
  label: string | null
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/** Feet as e.g. 12'-4 3/8", rounded to the nearest 1/denom inch. */
function fmtFeetInches(v: number, denom = 16): string {
  const totalSixteenths = Math.round(v * 12 * denom)
  let ft = Math.floor(totalSixteenths / (12 * denom))
  const rem = totalSixteenths - ft * 12 * denom
  let whole = Math.floor(rem / denom)
  const num = rem - whole * denom
  if (whole === 12) {
    ft += 1
    whole = 0
  }
  let frac = ''
  if (num > 0) {
    const g = gcd(num, denom)
    frac = ` ${num / g}/${denom / g}`
  }
  return `${ft}'-${whole}${frac}"`
}

export default function PlanRoom() {
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const [bid, setBid] = useState<Bid | null>(null)
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageNum, setPageNum] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // ------- measuring / calibration -------
  const [tool, setTool] = useState<Tool>('pan')
  const [renderInfo, setRenderInfo] = useState<{ cssW: number; cssH: number; cssScale: number } | null>(null)
  const [pending, setPending] = useState<Pt | null>(null)          // first click, PDF coords
  const [cursor, setCursor] = useState<Pt | null>(null)            // live mouse, PDF coords
  const [measurements, setMeasurements] = useState<{ a: Pt; b: Pt }[]>([])
  const [scales, setScales] = useState<Map<number, SheetScale>>(new Map()) // page → calibration
  const [calDraft, setCalDraft] = useState<{ a: Pt; b: Pt } | null>(null)
  const [calFeet, setCalFeet] = useState('')
  const [calInches, setCalInches] = useState('')
  const [denom, setDenom] = useState(16) // measurement precision: nearest 1/denom inch

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const holderRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)
  // where the cursor was when a ctrl-zoom happened, so the point under the
  // mouse stays under the mouse after the page re-renders at the new size
  const anchorRef = useRef<{ mouseX: number; mouseY: number; oldZoom: number; scrollLeft: number; scrollTop: number } | null>(null)

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  const applyAnchor = useCallback(() => {
    const holder = holderRef.current
    const a = anchorRef.current
    if (!holder || !a) return
    anchorRef.current = null
    const ratio = zoomRef.current / a.oldZoom
    holder.scrollLeft = (a.scrollLeft + a.mouseX) * ratio - a.mouseX
    holder.scrollTop = (a.scrollTop + a.mouseY) * ratio - a.mouseY
  }, [])

  const selectedId = params.get('file')
  const selected = plans?.find((p) => p.id === selectedId) ?? plans?.[0] ?? null

  useEffect(() => {
    ;(async () => {
      const [bidRes, planRes] = await Promise.all([
        supabase!.from('bids').select('*').eq('id', id!).single(),
        supabase!.from('plans').select('id, bid_id, file_path, created_at').eq('bid_id', id!).order('created_at'),
      ])
      if (bidRes.error) return setError(bidRes.error.message)
      setBid(bidRes.data as Bid)
      setPlans((planRes.data ?? []) as Plan[])
    })()
  }, [id])

  // signed URL + document load when the selected file changes
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoading(true)
    setDoc(null)
    setUrl(null)
    setPageNum(1)
    setZoom(1)
    ;(async () => {
      const { data, error } = await supabase!.storage.from('plans').createSignedUrl(selected.file_path, 3600)
      if (error || !data) {
        if (!cancelled) {
          setError(error?.message ?? 'Could not open file')
          setLoading(false)
        }
        return
      }
      if (cancelled) return
      setUrl(data.signedUrl)
      if (isImage(selected.file_path)) {
        setLoading(false)
        return
      }
      try {
        const loaded = await pdfjsLib.getDocument({ url: data.signedUrl }).promise
        if (!cancelled) setDoc(loaded)
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // render current page to canvas
  const renderPage = useCallback(async () => {
    if (!doc || !canvasRef.current || !holderRef.current) return
    const page = await doc.getPage(pageNum)
    const base = page.getViewport({ scale: 1 })
    const fit = (holderRef.current.clientWidth - 16) / base.width
    const dpr = window.devicePixelRatio || 1
    const cssScale = fit * zoom
    const viewport = page.getViewport({ scale: cssScale * dpr })
    const canvas = canvasRef.current
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.style.width = `${viewport.width / dpr}px`
    canvas.style.height = `${viewport.height / dpr}px`
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
    setRenderInfo({ cssW: viewport.width / dpr, cssH: viewport.height / dpr, cssScale })
    applyAnchor()
  }, [doc, pageNum, zoom, applyAnchor])

  useEffect(() => {
    void renderPage()
  }, [renderPage])

  // arrow keys flip pages; Escape backs out of measuring
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCalDraft(null)
        setPending(null)
        setTool('pan')
        return
      }
      if (!doc) return
      if (e.key === 'ArrowRight') setPageNum((p) => Math.min(doc.numPages, p + 1))
      if (e.key === 'ArrowLeft') setPageNum((p) => Math.max(1, p - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc])

  // load remembered calibrations for this plan; reset tools when switching
  useEffect(() => {
    setMeasurements([])
    setPending(null)
    setCalDraft(null)
    setTool('pan')
    if (!selected || isImage(selected.file_path)) {
      setScales(new Map())
      return
    }
    supabase!
      .from('plan_scales')
      .select('page, feet_per_unit, ax, ay, bx, by, label')
      .eq('plan_id', selected.id)
      .then(({ data }) => {
        const rows = (data ?? []) as { page: number; feet_per_unit: number; ax: number | null; ay: number | null; bx: number | null; by: number | null; label: string | null }[]
        setScales(
          new Map(
            rows.map((s) => [
              s.page,
              {
                ftPerPt: Number(s.feet_per_unit),
                line: s.ax != null ? { a: { x: Number(s.ax), y: Number(s.ay) }, b: { x: Number(s.bx), y: Number(s.by) } } : null,
                label: s.label,
              },
            ]),
          ),
        )
      })
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // measurements are per sheet
  useEffect(() => {
    setMeasurements([])
    setPending(null)
    setCalDraft(null)
  }, [pageNum])

  const sheetScale = scales.get(pageNum) ?? null
  const ftPerPt = sheetScale?.ftPerPt ?? null

  function overlayPoint(e: React.MouseEvent<SVGSVGElement>): Pt | null {
    if (!renderInfo) return null
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / renderInfo.cssScale,
      y: (e.clientY - rect.top) / renderInfo.cssScale,
    }
  }

  function overlayClick(e: React.MouseEvent<SVGSVGElement>) {
    if (tool === 'pan') return
    const pt = overlayPoint(e)
    if (!pt) return
    if (!pending) {
      setPending(pt)
      return
    }
    const pair = { a: pending, b: pt }
    setPending(null)
    if (tool === 'calibrate') {
      setCalFeet('')
      setCalInches('')
      setCalDraft(pair)
    } else {
      setMeasurements((prev) => [...prev, pair])
    }
  }

  async function saveCalibration() {
    if (!calDraft || !selected) return
    const totalFeet = Number(calFeet || 0) + Number(calInches || 0) / 12
    const d = dist(calDraft.a, calDraft.b)
    if (totalFeet <= 0 || d <= 0) return
    const feetPerUnit = totalFeet / d
    const label = fmtFeetInches(totalFeet, 16)
    setScales((prev) => new Map(prev).set(pageNum, { ftPerPt: feetPerUnit, line: calDraft, label }))
    setCalDraft(null)
    setTool('measure')
    await supabase!.from('plan_scales').upsert({
      plan_id: selected.id,
      page: pageNum,
      feet_per_unit: feetPerUnit,
      ax: calDraft.a.x,
      ay: calDraft.a.y,
      bx: calDraft.b.x,
      by: calDraft.b.y,
      label,
      calibrated_by: null,
    })
  }

  // Ctrl + scroll wheel zooms the plans, centered on the cursor. Captured at the
  // window level with preventDefault so Chrome's own page-zoom never fires here.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const holder = holderRef.current
      if (holder) {
        const rect = holder.getBoundingClientRect()
        anchorRef.current = {
          mouseX: e.clientX - rect.left,
          mouseY: e.clientY - rect.top,
          oldZoom: zoomRef.current,
          scrollLeft: holder.scrollLeft,
          scrollTop: holder.scrollTop,
        }
      }
      setZoom((z) => Math.min(5, Math.max(0.25, Math.round(z * (e.deltaY < 0 ? 1.1 : 0.9) * 100) / 100)))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  // images resize instantly — anchor right after the browser lays them out
  useEffect(() => {
    if (selected && isImage(selected.file_path)) {
      requestAnimationFrame(() => applyAnchor())
    }
  }, [zoom, selected, applyAnchor])

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!bid || !plans) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/bids/${bid.id}`} className="text-sm text-slate-500 hover:text-slate-900">
          ← {bid.job_number}
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
          {bid.name} — plan room
        </h1>
        {doc && (
          <div className="flex flex-wrap items-center gap-1.5">
            <PagerButton label="◀" onClick={() => setPageNum((p) => Math.max(1, p - 1))} disabled={pageNum <= 1} />
            <span className="w-24 text-center font-mono text-sm tabular-nums">
              {pageNum} / {doc.numPages}
            </span>
            <PagerButton label="▶" onClick={() => setPageNum((p) => Math.min(doc.numPages, p + 1))} disabled={pageNum >= doc.numPages} />
            <span className="mx-1 text-slate-300">|</span>
            <PagerButton label="−" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 4) / 4))} disabled={zoom <= 0.5} />
            <span className="w-12 text-center font-mono text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
            <PagerButton label="+" onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 4) / 4))} disabled={zoom >= 4} />
            <span className="mx-1 text-slate-300">|</span>
            <button
              onClick={() => {
                setTool(tool === 'calibrate' ? 'pan' : 'calibrate')
                setPending(null)
              }}
              className={`rounded-md border px-2.5 py-1 text-sm font-medium ${
                tool === 'calibrate' ? 'border-amber-500 bg-amber-100 text-amber-800' : 'border-slate-300 text-slate-600 hover:bg-slate-100'
              }`}
              title="Click two ends of a known dimension, then type its real length"
            >
              ⚖ Calibrate
            </button>
            <button
              onClick={() => {
                setTool(tool === 'measure' ? 'pan' : 'measure')
                setPending(null)
              }}
              className={`rounded-md border px-2.5 py-1 text-sm font-medium ${
                tool === 'measure' ? 'border-blue-500 bg-blue-100 text-blue-800' : 'border-slate-300 text-slate-600 hover:bg-slate-100'
              }`}
              title="Click two points to measure the real distance"
            >
              📏 Measure
            </button>
            <select
              value={denom}
              onChange={(e) => setDenom(Number(e.target.value))}
              title="Round measurements to the nearest…"
              className="rounded-md border border-slate-300 px-1.5 py-1 font-mono text-xs text-slate-600 focus:outline-none"
            >
              <option value={1}>1"</option>
              <option value={2}>1/2"</option>
              <option value={4}>1/4"</option>
              <option value={8}>1/8"</option>
              <option value={16}>1/16"</option>
            </select>
            {measurements.length > 0 && (
              <button
                onClick={() => setMeasurements([])}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Clear
              </button>
            )}
            <span className={`font-mono text-[10px] uppercase tracking-wider ${ftPerPt ? 'text-emerald-700' : 'text-amber-700'}`}>
              {ftPerPt ? '✓ sheet calibrated' : tool === 'measure' ? '⚠ calibrate this sheet first' : 'not calibrated'}
            </span>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* file list */}
        <aside className="w-48 shrink-0 overflow-y-auto rounded-lg border-2 border-slate-800 bg-white">
          <div className="border-b-2 border-slate-800 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            {plans.length} file{plans.length === 1 ? '' : 's'}
          </div>
          {plans.length === 0 ? (
            <p className="p-3 text-xs text-slate-400">No plans uploaded — add them on the bid page.</p>
          ) : (
            plans.map((p) => (
              <button
                key={p.id}
                onClick={() => setParams({ file: p.id })}
                className={`block w-full border-b border-slate-100 px-3 py-2 text-left text-xs ${
                  selected?.id === p.id ? 'bg-slate-900 font-semibold text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="break-all">{fileName(p)}</span>
              </button>
            ))
          )}
        </aside>

        {/* viewer */}
        <div ref={holderRef} className="min-w-0 flex-1 overflow-auto rounded-lg border-2 border-slate-800 bg-slate-200 p-2">
          {loading ? (
            <p className="p-6 text-center text-sm text-slate-500">Opening…</p>
          ) : selected && isImage(selected.file_path) && url ? (
            <img src={url} alt="" style={{ width: `${zoom * 100}%` }} className="mx-auto" />
          ) : doc ? (
            <div
              className="relative mx-auto"
              style={renderInfo ? { width: renderInfo.cssW, height: renderInfo.cssH } : undefined}
            >
              <canvas ref={canvasRef} className="shadow-lg" />
              {renderInfo && (
                <svg
                  width={renderInfo.cssW}
                  height={renderInfo.cssH}
                  onClick={overlayClick}
                  onMouseMove={(e) => {
                    if (tool !== 'pan' && pending) setCursor(overlayPoint(e))
                  }}
                  className={`absolute inset-0 ${tool === 'pan' ? 'pointer-events-none' : 'cursor-crosshair'}`}
                >
                  <MeasureLines
                    measurements={measurements}
                    pending={pending}
                    cursor={cursor}
                    calDraft={calDraft}
                    calLine={sheetScale?.line ?? null}
                    calLabel={sheetScale?.label ?? null}
                    cssScale={renderInfo.cssScale}
                    ftPerPt={ftPerPt}
                    denom={denom}
                    tool={tool}
                  />
                </svg>
              )}
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-slate-500">Pick a file on the left.</p>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Tips: ← → arrow keys flip pages · Ctrl + scroll zooms · Esc cancels a measurement.
      </p>

      {/* calibration length dialog */}
      {calDraft && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-6">
          <div className="w-full max-w-sm rounded-xl border-2 border-slate-800 bg-white shadow-[4px_4px_0_0_rgba(15,23,42,0.15)]">
            <div className="border-b-2 border-slate-800 px-5 py-3">
              <h2 className="font-semibold">How long is that line really?</h2>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void saveCalibration()
              }}
              className="space-y-4 p-5"
            >
              <div className="flex items-end gap-2">
                <label className="block flex-1">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Feet</span>
                  <input
                    type="number" min="0" step="1" autoFocus required
                    value={calFeet}
                    onChange={(e) => setCalFeet(e.target.value)}
                    className="input"
                  />
                </label>
                <label className="block flex-1">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Inches</span>
                  <input
                    type="number" min="0" max="11.999" step="any"
                    value={calInches}
                    onChange={(e) => setCalInches(e.target.value)}
                    placeholder="0"
                    className="input"
                  />
                </label>
              </div>
              <p className="text-xs text-slate-500">
                Saved for this sheet — everyone can measure it from now on without recalibrating.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCalDraft(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                >
                  Set scale
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function MeasureLines({
  measurements, pending, cursor, calDraft, calLine, calLabel, cssScale, ftPerPt, denom, tool,
}: {
  measurements: { a: Pt; b: Pt }[]
  pending: Pt | null
  cursor: Pt | null
  calDraft: { a: Pt; b: Pt } | null
  calLine: { a: Pt; b: Pt } | null
  calLabel: string | null
  cssScale: number
  ftPerPt: number | null
  denom: number
  tool: Tool
}) {
  const S = (p: Pt) => ({ x: p.x * cssScale, y: p.y * cssScale })

  const segment = (a: Pt, b: Pt, color: string, label: string, key: string | number, dashed = false) => {
    const A = S(a)
    const B = S(b)
    const mx = (A.x + B.x) / 2
    const my = (A.y + B.y) / 2
    return (
      <g key={key}>
        <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={color} strokeWidth={2} strokeDasharray={dashed ? '6 4' : undefined} />
        <circle cx={A.x} cy={A.y} r={3.5} fill={color} />
        <circle cx={B.x} cy={B.y} r={3.5} fill={color} />
        {label && (
          <text
            x={mx} y={my - 7}
            textAnchor="middle"
            fontSize={13} fontWeight={700} fontFamily="IBM Plex Mono, monospace"
            fill={color} stroke="white" strokeWidth={4} paintOrder="stroke"
          >
            {label}
          </text>
        )}
      </g>
    )
  }

  const lengthLabel = (a: Pt, b: Pt) => (ftPerPt ? fmtFeetInches(dist(a, b) * ftPerPt, denom) : 'calibrate first')

  return (
    <>
      {/* the sheet's saved calibration reference, always visible in green */}
      {calLine && segment(calLine.a, calLine.b, '#059669', `⚖ ${calLabel ?? ''}`, 'saved-cal')}
      {measurements.map((m, i) => segment(m.a, m.b, '#1d4ed8', lengthLabel(m.a, m.b), i))}
      {calDraft && segment(calDraft.a, calDraft.b, '#d97706', 'set length…', 'cal')}
      {pending && cursor &&
        segment(
          pending, cursor,
          tool === 'calibrate' ? '#d97706' : '#1d4ed8',
          tool === 'calibrate' ? '' : lengthLabel(pending, cursor),
          'live', true,
        )}
    </>
  )
}

function PagerButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-slate-300 px-2.5 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-30"
    >
      {label}
    </button>
  )
}
