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
    const scale = fit * zoom * (window.devicePixelRatio || 1)
    const viewport = page.getViewport({ scale })
    const canvas = canvasRef.current
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`
    canvas.style.height = `${viewport.height / (window.devicePixelRatio || 1)}px`
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
    applyAnchor()
  }, [doc, pageNum, zoom, applyAnchor])

  useEffect(() => {
    void renderPage()
  }, [renderPage])

  // arrow keys flip pages
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!doc) return
      if (e.key === 'ArrowRight') setPageNum((p) => Math.min(doc.numPages, p + 1))
      if (e.key === 'ArrowLeft') setPageNum((p) => Math.max(1, p - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc])

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
          <div className="flex items-center gap-1.5">
            <PagerButton label="◀" onClick={() => setPageNum((p) => Math.max(1, p - 1))} disabled={pageNum <= 1} />
            <span className="w-24 text-center font-mono text-sm tabular-nums">
              {pageNum} / {doc.numPages}
            </span>
            <PagerButton label="▶" onClick={() => setPageNum((p) => Math.min(doc.numPages, p + 1))} disabled={pageNum >= doc.numPages} />
            <span className="mx-1 text-slate-300">|</span>
            <PagerButton label="−" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 4) / 4))} disabled={zoom <= 0.5} />
            <span className="w-12 text-center font-mono text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
            <PagerButton label="+" onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 4) / 4))} disabled={zoom >= 4} />
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
            <canvas ref={canvasRef} className="mx-auto shadow-lg" />
          ) : (
            <p className="p-6 text-center text-sm text-slate-500">Pick a file on the left.</p>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500">Tip: use the ← → arrow keys to flip pages.</p>
    </div>
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
