import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fmtDueDate } from '../lib/format'
import ConfirmDialog from './ConfirmDialog'

interface CustomerDoc {
  id: string
  customer_id: string
  file_path: string
  uploaded_by: string | null
  created_at: string
}

/** Company-wide paperwork for one contractor — tax exemption certificates,
 *  insurance COIs, master agreements. Lives here, not on any one job. */
export default function CustomerDocs({ customerId }: { customerId: string }) {
  const { canManageBids: canEdit, session } = useAuth()
  const [docs, setDocs] = useState<CustomerDoc[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [removing, setRemoving] = useState<CustomerDoc | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase!
      .from('customer_documents').select('*').eq('customer_id', customerId).order('created_at', { ascending: false })
    setDocs((data ?? []) as CustomerDoc[])
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  async function uploadFiles(files: File[]) {
    if (!canEdit || files.length === 0) return
    setUploading(true)
    for (const file of files) {
      const path = `${customerId}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`
      const { error: upErr } = await supabase!.storage.from('customer-docs').upload(path, file)
      if (upErr) {
        setError(upErr.message)
        continue
      }
      const { error } = await supabase!.from('customer_documents').insert({
        customer_id: customerId,
        file_path: path,
        uploaded_by: session?.user.email ?? null,
      })
      if (error) setError(error.message)
    }
    setUploading(false)
    void load()
  }

  async function view(d: CustomerDoc) {
    const { data, error } = await supabase!.storage.from('customer-docs').createSignedUrl(d.file_path, 3600)
    if (error) setError(error.message)
    else if (data) window.open(data.signedUrl, '_blank')
  }

  async function remove(d: CustomerDoc) {
    setRemoving(null)
    await supabase!.storage.from('customer-docs').remove([d.file_path])
    await supabase!.from('customer_documents').delete().eq('id', d.id)
    void load()
  }

  return (
    <section>
      <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">
        Company documents — tax exemption, insurance, agreements
      </h2>
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
              {dragging ? 'Drop to upload' : 'Drag the tax exemption form, COI, or agreement here'}
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

        {docs.length === 0 ? (
          <p className="text-sm text-slate-400">No documents on file for this contractor yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {docs.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
                <button
                  onClick={() => void view(d)}
                  className="min-w-0 flex-1 truncate text-left font-medium underline decoration-dotted underline-offset-4 hover:text-blue-700"
                  title="Open the file"
                >
                  {d.file_path.split('/').pop()?.replace(/^\d+_/, '')}
                </button>
                <span className="text-xs text-slate-400">{fmtDueDate(d.created_at)}</span>
                {d.uploaded_by && <span className="text-xs text-slate-400">{d.uploaded_by}</span>}
                {canEdit && (
                  <button onClick={() => setRemoving(d)} className="text-slate-300 hover:text-red-600">×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {removing && (
        <ConfirmDialog
          title="Delete document"
          message={`Delete ${removing.file_path.split('/').pop()?.replace(/^\d+_/, '')}? The file goes too.`}
          onConfirm={() => void remove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </section>
  )
}
