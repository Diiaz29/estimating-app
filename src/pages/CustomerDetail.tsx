import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Bid, Contact, Customer, CustomerType } from '../lib/types'
import StatusBadge from '../components/StatusBadge'
import ConfirmDialog from '../components/ConfirmDialog'
import { fmtDueDate, formatPhone } from '../lib/format'

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin, canManageBids: canEdit } = useAuth()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [bids, setBids] = useState<Bid[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function load() {
    const [custRes, contactRes, bidRes] = await Promise.all([
      supabase!.from('customers').select('*').eq('id', id!).single(),
      supabase!.from('contacts').select('*').eq('customer_id', id!).order('created_at'),
      supabase!.from('bid_customers').select('bid:bids(*)').eq('customer_id', id!),
    ])
    if (custRes.error) setError(custRes.error.message)
    else setCustomer(custRes.data as Customer)
    if (contactRes.data) setContacts(contactRes.data as Contact[])
    if (bidRes.data) {
      const list = (bidRes.data as unknown as { bid: Bid }[]).map((r) => r.bid).filter(Boolean)
      list.sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
      setBids(list)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!customer) return <p className="text-sm text-slate-500">Loading…</p>

  function patch(fields: Partial<Customer>) {
    setCustomer((c) => (c ? { ...c, ...fields } : c))
    setSaved(false)
  }

  async function save() {
    if (!customer) return
    setBusy(true)
    const { id: _id, created_at, ...fields } = customer
    const { error } = await supabase!.from('customers').update(fields).eq('id', customer.id)
    setBusy(false)
    if (error) setError(error.message)
    else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  async function remove() {
    await supabase!.from('customers').delete().eq('id', customer!.id)
    navigate('/contractors')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/contractors" className="text-sm text-slate-500 hover:text-slate-900">
          ← Contractors
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {saved && <span className="text-xs font-medium text-emerald-600">Saved ✓</span>}
          {canEdit && (
            <button
              onClick={() => void save()}
              disabled={busy}
              className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>

      <input
        value={customer.company}
        onChange={(e) => patch({ company: e.target.value })}
        className="w-full border-0 border-b-2 border-slate-300 bg-transparent px-0 py-1 text-2xl font-semibold tracking-tight focus:border-slate-900 focus:outline-none focus:ring-0"
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Type">
          <select
            value={customer.type}
            onChange={(e) => patch({ type: e.target.value as CustomerType })}
            className="input"
          >
            <option value="GC">General contractor</option>
            <option value="direct">Direct client</option>
            <option value="architect">Architect</option>
          </select>
        </Field>
        <Field label="Phone">
          <input
            value={customer.phone ?? ''}
            onChange={(e) => patch({ phone: formatPhone(e.target.value) || null })}
            placeholder="(000) 000-0000"
            className="input"
          />
        </Field>
        <Field label="Email">
          <input
            value={customer.email ?? ''}
            onChange={(e) => patch({ email: e.target.value.toLowerCase() || null })}
            className="input"
          />
        </Field>
        <Field label="Address">
          <input value={customer.address ?? ''} onChange={(e) => patch({ address: e.target.value || null })} className="input" />
        </Field>
      </div>

      <Field label="Notes (institutional knowledge — 'requires AWI premium', 'always bids tight'…)">
        <textarea
          rows={3}
          value={customer.notes ?? ''}
          onChange={(e) => patch({ notes: e.target.value || null })}
          className="input"
        />
      </Field>

      <ContactsSection customerId={customer.id} contacts={contacts} onChange={() => void load()} />

      <section>
        <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">Bid history</h2>
        {bids.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
            No bids with this contractor yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
            {bids.map((b, i) => (
              <Link
                key={b.id}
                to={`/bids/${b.id}`}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 ${i > 0 ? 'border-t border-slate-200' : ''}`}
              >
                <span className="font-mono text-xs text-slate-500">{b.job_number}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span>
                <StatusBadge status={b.status} />
                <span className="hidden sm:block text-xs text-slate-500 tabular-nums">{fmtDueDate(b.due_at)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {isAdmin && (
        <div className="border-t border-slate-200 pt-4">
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-red-500 hover:text-red-700 hover:underline">
            Delete this contractor
          </button>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete contractor"
          message={`Delete ${customer.company}? Their people go too. This can't be undone.`}
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

function ContactsSection({
  customerId,
  contacts,
  onChange,
}: {
  customerId: string
  contacts: Contact[]
  onChange: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    await supabase!.from('contacts').insert({
      customer_id: customerId,
      name: name.trim(),
      role: role.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
    })
    setName(''); setRole(''); setPhone(''); setEmail('')
    setAdding(false)
    onChange()
  }

  const [removing, setRemoving] = useState<Contact | null>(null)

  async function removeContact(c: Contact) {
    await supabase!.from('contacts').delete().eq('id', c.id)
    setRemoving(null)
    onChange()
  }

  return (
    <section>
      <div className="mb-2 flex items-center">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-slate-500">People</h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          {adding ? 'Cancel' : '+ Add person'}
        </button>
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="mb-3 grid grid-cols-2 gap-2 rounded-lg border-2 border-slate-800 bg-white p-3 sm:grid-cols-5">
          <input placeholder="Name *" required value={name} onChange={(e) => setName(e.target.value)} className="input mt-0" />
          <input placeholder="Role (PM, super…)" value={role} onChange={(e) => setRole(e.target.value)} className="input mt-0" />
          <input placeholder="Phone" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} className="input mt-0" />
          <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value.toLowerCase())} className="input mt-0" />
          <button type="submit" className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Add
          </button>
        </form>
      )}

      {contacts.length === 0 && !adding ? (
        <p className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
          No people saved for this company yet.
        </p>
      ) : (
        contacts.length > 0 && (
          <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white">
            {contacts.map((c, i) =>
              editingId === c.id ? (
                <ContactEditRow
                  key={c.id}
                  contact={c}
                  first={i === 0}
                  onDone={() => {
                    setEditingId(null)
                    onChange()
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div key={c.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5 ${i > 0 ? 'border-t border-slate-200' : ''}`}>
                  <span className="text-sm font-medium">{c.name}</span>
                  {c.role && <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">{c.role}</span>}
                  <span className="text-xs text-slate-500">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
                  <span className="ml-auto flex items-center gap-3">
                    <button onClick={() => setEditingId(c.id)} className="text-xs text-slate-400 hover:text-slate-900">
                      edit
                    </button>
                    <button onClick={() => setRemoving(c)} className="text-xs text-slate-400 hover:text-red-600">
                      remove
                    </button>
                  </span>
                </div>
              ),
            )}
          </div>
        )
      )}

      {removing && (
        <ConfirmDialog
          title="Remove person"
          message={`Remove ${removing.name} from this company?`}
          confirmLabel="Remove"
          onConfirm={() => void removeContact(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </section>
  )
}

function ContactEditRow({
  contact,
  first,
  onDone,
  onCancel,
}: {
  contact: Contact
  first: boolean
  onDone: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(contact.name)
  const [role, setRole] = useState(contact.role ?? '')
  const [phone, setPhone] = useState(contact.phone ?? '')
  const [email, setEmail] = useState(contact.email ?? '')

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    await supabase!
      .from('contacts')
      .update({
        name: name.trim(),
        role: role.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
      })
      .eq('id', contact.id)
    onDone()
  }

  return (
    <form
      onSubmit={handleSave}
      className={`grid grid-cols-2 gap-2 bg-slate-50 px-4 py-3 sm:grid-cols-6 ${first ? '' : 'border-t border-slate-200'}`}
    >
      <input placeholder="Name *" required value={name} onChange={(e) => setName(e.target.value)} className="input mt-0" autoFocus />
      <input placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} className="input mt-0" />
      <input placeholder="Phone" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} className="input mt-0" />
      <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value.toLowerCase())} className="input mt-0" />
      <button type="submit" className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
        Save
      </button>
      <button type="button" onClick={onCancel} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
        Cancel
      </button>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">{label}</span>
      {children}
    </label>
  )
}
