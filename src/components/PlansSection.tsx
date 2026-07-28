import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fmtDueDate } from '../lib/format'
import ConfirmDialog from './ConfirmDialog'

interface Plan {
  id: string
  bid_id: string
  file_path: string
  note: string | null
  uploaded_by: string | null
  created_at: string
}

export default function PlansSection({ bidId, kind = 'plan' }: { bidId: string; kind?: 'plan' | 'document' }) {
  const { canEdit, session } = useAuth()
  const navigate = useNavigate()
  const [plans, setPlans] = useState<Plan[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [removing, setRemoving] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isDocs = kind === 'document'

  async function load() {
    const { data } = await supabase!
      .from('plans').select('*').eq('bid_id', bidId).eq('kind', kind).order('created_at', { ascending: false })
    setPlans((data ?? []) as Plan[])
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidId])

  async function uploadFiles(files: File[]) {
    if (!canEdit || files.length === 0) return
    setUploading(true)
    for (const file of files) {
      const path = `${bidId}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`
      const { error: upErr } = await supabase!.storage.from('plans').upload(path, file)
      if (upErr) {
        setError(upErr.message)
        continue
      }
      const { error } = await supabase!.from('plans').insert({
        bid_id: bidId,
        file_path: path,
        kind,
        uploaded_by: session?.user.email ?? null,
      })
      if (error) setError(error.message)
    }
    setUploading(false)
    void load()
  }

  async function view(p: Plan) {
    if (isDocs) {
      // signed paperwork opens directly in a new tab, not the plan room
      const { data } = await supabase!.storage.from('plans').createSignedUrl(p.file_path, 3600)
      if (data) window.open(data.signedUrl, '_blank')
      return
    }
    navigate(`/bids/${bidId}/plans/room?file=${p.id}`)
  }

  async function remove(p: Plan) {
    setRemoving(null)
    await supabase!.storage.from('plans').remove([p.file_path])
    await supabase!.from('plans').delete().eq('id', p.id)
    void load()
  }

  return (
    <section>
      <div className="mb-2 flex items-center">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
          {isDocs ? 'Signed & contract documents' : 'Plans & documents'}
        </h2>
        {!isDocs && plans.length > 0 && (
          <Link
            to={`/bids/${bidId}/plans/room`}
            className="ml-auto rounded-md border-2 border-slate-900 px-3 py-1 text-xs font-semibold text-slate-900 hover:bg-slate-900 hover:text-white"
          >
            Open plan room →
          </Link>
        )}
      </div>
      <div
        onDragOver={(e) => {
          if (!canEdit) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!canEdit) return
          e.preventDefault()
          setDragging(false)
          void uploadFiles([...e.dataTransfer.files])
        }}
        className={`rounded-lg border-2 bg-white p-4 transition-colors ${
          dragging ? 'border-dashed border-emerald-600 bg-emerald-50' : 'border-slate-800'
        }`}
      >
        {canEdit && (
          <div className="mb-3 flex items-center gap-3">
            <p className={`flex-1 rounded-md border border-dashed px-3 py-2 text-center text-xs ${dragging ? 'border-emerald-500 font-semibold text-emerald-700' : 'border-slate-300 text-slate-400'}`}>
              {dragging ? 'Drop to upload' : isDocs ? 'Drag the signed proposal or contract here' : 'Drag drawings or PDFs here'}
            </p>
            <label className={`cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-white ${uploading ? 'bg-slate-400' : 'bg-slate-900 hover:bg-slate-700'}`}>
              {uploading ? 'Uploading…' : '+ Upload'}
              <input
                type="file"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  if (e.target.files?.length) void uploadFiles([...e.target.files])
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        )}

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

        {plans.length === 0 ? (
          <p className="text-sm text-slate-400">{isDocs ? 'Nothing signed yet.' : 'No plans yet.'}</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {plans.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
                <button
                  onClick={() => view(p)}
                  className="min-w-0 flex-1 truncate text-left font-medium underline decoration-dotted underline-offset-4 hover:text-blue-700"
                  title={isDocs ? 'Open the file' : 'Open in the plan room'}
                >
                  {p.file_path.split('/').pop()?.replace(/^\d+_/, '')}
                </button>
                <span className="text-xs text-slate-400">{fmtDueDate(p.created_at)}</span>
                {p.uploaded_by && <span className="text-xs text-slate-400">{p.uploaded_by}</span>}
                {canEdit && (
                  <button onClick={() => setRemoving(p)} className="text-slate-300 hover:text-red-600">×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {removing && (
        <ConfirmDialog
          title="Delete plan"
          message={`Delete ${removing.file_path.split('/').pop()?.replace(/^\d+_/, '')}? The file goes too.`}
          onConfirm={() => void remove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}

    </section>
  )
}
