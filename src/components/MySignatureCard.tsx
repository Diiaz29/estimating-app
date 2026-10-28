import { useEffect, useState } from 'react'
import UiIcon from './UiIcon'
import SignaturePad from './SignaturePad'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

/** Draw and save your own signature — it prints on the proposals and change
 *  orders you author. Stored on your profile as a small PNG. */
export default function MySignatureCard({ me, onSaved }: { me: Profile; onSaved: () => void | Promise<void> }) {
  const [drawing, setDrawing] = useState(false)
  const [drawn, setDrawn] = useState<string | null>(null)
  const [name, setName] = useState(me.signer_name ?? '')
  const [title, setTitle] = useState(me.signer_title ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    setName(me.signer_name ?? '')
    setTitle(me.signer_title ?? '')
  }, [me.signer_name, me.signer_title])

  async function save(data: string | null | undefined) {
    if (busy) return
    setBusy(true)
    setMsg(null)
    // undefined = keep the saved drawing, null = remove it, string = replace it
    const payload = data === undefined ? (me.signature_data ?? '') : (data ?? '')
    try {
      const { error } = await supabase!.rpc('set_my_signature', { p_data: payload, p_name: name.trim(), p_title: title.trim() })
      if (error) return setMsg(error.message)
      await onSaved()
      setDrawing(false)
      setDrawn(null)
      setMsg('Saved.')
    } catch {
      setMsg('Could not refresh your signature. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  // a photo of a paper signature works too — shrink it so the profile stays small
  async function fromFile(file: File) {
    if (busy) return
    setMsg(null)
    try {
      const bmp = await createImageBitmap(file)
      const scale = Math.min(1, 900 / bmp.width)
      const c = document.createElement('canvas')
      c.width = Math.round(bmp.width * scale)
      c.height = Math.round(bmp.height * scale)
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
      bmp.close()
      await save(c.toDataURL('image/png'))
    } catch {
      setMsg('Could not read this image. Choose a PNG, JPEG, or WebP file.')
    }
  }

  return (
    <section aria-label="Your signature" className="rounded-lg border-2 border-slate-800 bg-white p-4">
      <div className="team-signature-layout flex flex-wrap items-start gap-4">
        <div className="team-signature-preview flex h-24 w-56 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
          {me.signature_data ? (
            <img src={me.signature_data} alt="Your signature" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-slate-400">no signature yet</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Your signature</h2>
          <div className="mt-0.5 text-sm text-slate-500">
            Prints in the vendor box on the work authorization and change orders you create, with your
            name and title under the line.
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-xs uppercase tracking-widest text-slate-500">Printed name</span>
              <input value={name} disabled={busy} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className="input mt-0.5" />
            </label>
            <label className="block">
              <span className="font-mono text-xs uppercase tracking-widest text-slate-500">Title</span>
              <input value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} placeholder="Your job title" className="input mt-0.5" />
            </label>
          </div>
          {drawing && (
            <div className="mt-3">
              <SignaturePad onChange={setDrawn} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {drawing ? (
              <>
                <button
                  onClick={() => void save(drawn)}
                  disabled={busy || !drawn}
                  className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:bg-slate-400"
                >
                  {busy ? 'Saving…' : <><UiIcon name="check" /> Save signature</>}
                </button>
                <button disabled={busy} onClick={() => { setDrawing(false); setDrawn(null) }} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button disabled={busy} onClick={() => setDrawing(true)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                  <UiIcon name="pen" /> {me.signature_data ? 'Draw a new one' : 'Draw signature'}
                </button>
                <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
                  upload a photo
                  <input
                    type="file"
                    disabled={busy}
                    aria-label="Upload your signature image"
                    accept="image/png,image/jpeg,image/webp"
                    className="file-upload-input"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void fromFile(f)
                      e.target.value = ''
                    }}
                  />
                </label>
                <button onClick={() => void save(undefined)} disabled={busy} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
                  {busy ? 'Saving…' : 'Save name / title'}
                </button>
                {me.signature_data && (
                  <button disabled={busy} onClick={() => void save(null)} className="text-xs text-slate-400 underline decoration-dotted hover:text-red-600">
                    remove signature
                  </button>
                )}
              </>
            )}
            {msg && <span role={msg === 'Saved.' ? 'status' : 'alert'} className={`text-sm ${msg === 'Saved.' ? 'text-emerald-700' : 'text-red-600'}`}>{msg}</span>}
          </div>
        </div>
      </div>
    </section>
  )
}
