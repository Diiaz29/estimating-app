import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import ConfirmDialog from '../components/ConfirmDialog'
import SignaturePad from '../components/SignaturePad'
import type { Profile, Role } from '../lib/types'

export default function Team() {
  const { isAdmin, profile: me } = useAuth()
  const [profiles, setProfiles] = useState<Profile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<Profile | null>(null)

  async function load() {
    const { data, error } = await supabase!.from('profiles').select('*').order('created_at')
    if (error) setError(error.message)
    else setProfiles(data as Profile[])
  }

  useEffect(() => {
    void load()
  }, [])

  if (!isAdmin) {
    return (
      <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        Admins only.
      </p>
    )
  }
  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!profiles) return <p className="text-sm text-slate-500">Loading…</p>

  async function setRole(p: Profile, role: Role) {
    const { error } = await supabase!.from('profiles').update({ role }).eq('id', p.id)
    if (error) setError(error.message)
    else void load()
  }

  async function removeUser(p: Profile) {
    setRemoving(null)
    const { error } = await supabase!.functions.invoke('delete-user', {
      body: { user_id: p.id },
    })
    if (error) {
      let message = error.message
      try {
        const ctx = (error as { context?: Response }).context
        if (ctx) {
          const body = await ctx.json()
          if (body?.error) message = body.error
        }
      } catch {
        /* keep the generic message */
      }
      setError(message)
    } else void load()
  }

  const admins = profiles.filter((p) => p.role === 'admin')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-slate-500">
          <span className="font-medium">Admin</span> — everything.{' '}
          <span className="font-medium">Estimator</span> — create and edit bids, estimates,
          contractors; no deleting. <span className="font-medium">PM</span> — manage schedules,
          order checkboxes, and receipts; everything else view-only.{' '}
          <span className="font-medium">Viewer</span> — look, don't touch. New people start as
          estimators.
        </p>
      </div>

      <AddUserForm onCreated={() => void load()} />

      {me && <MySignatureCard me={profiles.find((p) => p.id === me.id) ?? me} onSaved={() => void load()} />}
      <CardsSection profiles={profiles} />

      <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
        {profiles.map((p, i) => {
          const lastAdmin = p.role === 'admin' && admins.length === 1
          return (
            <div
              key={p.id}
              className={`flex flex-wrap items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-slate-200' : ''}`}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {p.email}
                {p.id === me?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}
              </span>
              <div className="flex gap-1.5">
                {(['viewer', 'office', 'pm', 'estimator', 'admin'] as Role[]).map((r) => (
                  <button
                    key={r}
                    disabled={lastAdmin && r !== 'admin'}
                    title={
                      lastAdmin && r !== 'admin'
                        ? 'The last admin can’t be demoted — promote someone else first.'
                        : undefined
                    }
                    onClick={() => p.role !== r && void setRole(p, r)}
                    className={`rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed ${
                      p.role === r
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-slate-500'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {p.id !== me?.id && (
                <button
                  onClick={() => setRemoving(p)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  remove
                </button>
              )}
            </div>
          )
        })}
      </div>

      {removing && (
        <ConfirmDialog
          title="Remove team member"
          message={`Remove ${removing.email}'s login? They'll no longer be able to sign in. Bids and contractors they worked on are untouched.`}
          confirmLabel="Remove"
          onConfirm={() => void removeUser(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  )
}

interface Card {
  id: string
  name: string
  owner_id: string | null
  active: boolean
  sort_order: number
}

/** Company cards / payment methods and who carries each one. Admin-only. */
function CardsSection({ profiles }: { profiles: Profile[] }) {
  const [cards, setCards] = useState<Card[]>([])
  const [newName, setNewName] = useState('')
  const [newOwner, setNewOwner] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase!.from('payment_methods').select('*').order('sort_order').order('name')
    setCards((data ?? []) as Card[])
  }
  useEffect(() => {
    void load()
  }, [])

  async function add(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const { error } = await supabase!.from('payment_methods').insert({
      name,
      owner_id: newOwner || null,
      sort_order: (cards[cards.length - 1]?.sort_order ?? 0) + 10,
    })
    if (error) setErr(error.message.includes('duplicate') ? 'That card name already exists.' : error.message)
    else {
      setNewName('')
      setNewOwner('')
      setErr(null)
      void load()
    }
  }

  async function patch(c: Card, fields: Partial<Card>) {
    const { error } = await supabase!.from('payment_methods').update(fields).eq('id', c.id)
    if (error) setErr(error.message.includes('duplicate') ? 'That card name already exists.' : error.message)
    else void load()
  }

  async function remove(c: Card) {
    const { error } = await supabase!.from('payment_methods').delete().eq('id', c.id)
    // FK from receipts is "set null", so delete always succeeds — retire is the gentler option
    if (error) setErr(error.message)
    else void load()
  }

  const who = (id: string | null) => profiles.find((p) => p.id === id)?.email.split('@')[0] ?? null

  return (
    <section>
      <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">
        Cards & payment methods — who carries what
      </h2>
      <div className="rounded-lg border-2 border-slate-800 bg-white">
        {cards.map((c, i) => (
          <div key={c.id} className={`flex flex-wrap items-center gap-2 px-4 py-2 ${i > 0 ? 'border-t border-slate-100' : ''} ${c.active ? '' : 'opacity-50'}`}>
            <input
              defaultValue={c.name}
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && void patch(c, { name: e.target.value.trim() })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="min-w-0 flex-1 basis-40 rounded border border-transparent px-2 py-1 text-sm font-medium hover:border-slate-200 focus:border-slate-800 focus:outline-none"
            />
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              carried by
              <select
                value={c.owner_id ?? ''}
                onChange={(e) => void patch(c, { owner_id: e.target.value || null })}
                className="input mt-0 w-auto py-1 text-sm"
              >
                <option value="">— shared / nobody —</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.email.split('@')[0]}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => void patch(c, { active: !c.active })}
              className="text-xs text-slate-400 hover:text-slate-900"
              title={c.active ? 'Hide from pickers; old receipts keep it' : 'Bring it back'}
            >
              {c.active ? 'retire' : 'unretire'}
            </button>
            <button onClick={() => void remove(c)} className="px-1 text-lg leading-none text-slate-300 hover:text-red-600" title="Delete — receipts on this card lose the link">
              ×
            </button>
          </div>
        ))}
        <form onSubmit={add} className={`flex flex-wrap items-center gap-2 px-4 py-2.5 ${cards.length > 0 ? 'border-t border-slate-200' : ''}`}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder='new card — e.g. "Visa 4421"'
            className="input mt-0 min-w-0 flex-1 basis-40 py-1.5"
          />
          <select value={newOwner} onChange={(e) => setNewOwner(e.target.value)} className="input mt-0 w-auto py-1.5">
            <option value="">carried by… (shared)</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.email.split('@')[0]}</option>
            ))}
          </select>
          <button type="submit" disabled={!newName.trim()} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40">
            + Add card
          </button>
        </form>
        {err && <p className="border-t border-slate-100 px-4 py-2 text-sm text-red-600">{err}</p>}
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          When someone uploads a receipt it defaults to their card. One card = no picker for them.
          No card = the receipt gets flagged for the office to sort out.{' '}
          {cards.filter((c) => c.owner_id).length > 0 && (
            <>Assigned: {cards.filter((c) => c.owner_id && c.active).map((c) => `${c.name} → ${who(c.owner_id)}`).join(', ')}.</>
          )}
        </p>
      </div>
    </section>
  )
}

function AddUserForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase!.functions.invoke('create-user', {
      body: { email: email.trim().toLowerCase(), password },
    })
    setBusy(false)
    if (error) {
      // Pull the real message out of the function's response when there is one
      let message = error.message
      try {
        const ctx = (error as { context?: Response }).context
        if (ctx) {
          const body = await ctx.json()
          if (body?.error) message = body.error
        }
      } catch {
        /* keep the generic message */
      }
      setError(message)
      return
    }
    setOkMsg(`${data.email} can now sign in.`)
    setEmail('')
    setPassword('')
    onCreated()
    setTimeout(() => setOkMsg(null), 5000)
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen(true)}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + Add user
        </button>
        {okMsg && <span className="text-sm font-medium text-emerald-600">{okMsg} ✓</span>}
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border-2 border-slate-800 bg-white p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Email</span>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            className="input"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
            Temporary password (8+ characters)
          </span>
          <input
            type="text"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input font-mono"
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">
        Share the email and temporary password with them however you like — they sign in at this
        same web address.
      </p>
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create login'}
        </button>
      </div>
    </form>
  )
}

/** Draw and save your own signature — it prints on the proposals and change
 *  orders you author. Stored on your profile as a small PNG. */
function MySignatureCard({ me, onSaved }: { me: Profile; onSaved: () => void }) {
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
    setBusy(true)
    setMsg(null)
    // undefined = keep the saved drawing, null = remove it, string = replace it
    const payload = data === undefined ? (me.signature_data ?? '') : (data ?? '')
    const { error } = await supabase!.rpc('set_my_signature', { p_data: payload, p_name: name.trim(), p_title: title.trim() })
    setBusy(false)
    if (error) return setMsg(error.message)
    setDrawing(false)
    setDrawn(null)
    setMsg('Saved.')
    setTimeout(() => setMsg(null), 3000)
    onSaved()
  }

  // a photo of a paper signature works too — shrink it so the profile stays small
  async function fromFile(file: File) {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 900 / bmp.width)
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    bmp.close()
    await save(c.toDataURL('image/png'))
  }

  return (
    <section className="rounded-lg border-2 border-slate-800 bg-white p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-24 w-56 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
          {me.signature_data ? (
            <img src={me.signature_data} alt="Your signature" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-slate-400">no signature yet</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Your signature</div>
          <div className="mt-0.5 text-sm text-slate-500">
            Prints in the vendor box on the work authorization and change orders you create, with your
            name and title under the line.
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Printed name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Brandon Diaz" className="input mt-0.5" />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Owner" className="input mt-0.5" />
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
                  {busy ? 'Saving…' : '✓ Save signature'}
                </button>
                <button onClick={() => { setDrawing(false); setDrawn(null) }} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setDrawing(true)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                  {me.signature_data ? '✎ Draw a new one' : '✎ Draw signature'}
                </button>
                <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
                  upload a photo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
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
                  <button onClick={() => void save(null)} className="text-xs text-slate-400 underline decoration-dotted hover:text-red-600">
                    remove signature
                  </button>
                )}
              </>
            )}
            {msg && <span className={`text-sm ${msg === 'Saved.' ? 'text-emerald-700' : 'text-red-600'}`}>{msg}</span>}
          </div>
        </div>
      </div>
    </section>
  )
}
