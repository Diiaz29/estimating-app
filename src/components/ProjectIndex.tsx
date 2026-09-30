import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import type { Bid, BidStatus } from '../lib/types'
import { fmtDueDate, fmtFollowUp, fmtMoney, followUpAt } from '../lib/format'
import StatusBadge from './StatusBadge'
import ProjectEstimatePreview from './ProjectEstimatePreview'

export default function ProjectIndex({ bids, contractor, valueFor, onNew, title = 'Your projects', followupDays = 7, statusFilter, onStatusFilter }: {
  bids: Bid[]
  contractor: (id: string) => string | null
  valueFor: (bid: Bid) => number | null
  onNew?: () => void
  title?: string
  followupDays?: number
  statusFilter?: BidStatus | null
  onStatusFilter?: (status: BidStatus | null) => void
}) {
  const { isOffice, isAdmin, seesMoney } = useAuth()
  const [filter, setFilter] = useState('bids')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const matches = (b: Bid, key: string) => key === 'all' || (key === 'bids' ? b.status === 'received' || b.status === 'working' : key === 'jobs' ? b.status === 'won' : b.status === 'sent')
  const visible = bids.filter(b => (statusFilter !== undefined ? statusFilter ? b.status === statusFilter : b.status !== 'won' : matches(b, filter)) && `${b.name} ${b.job_number} ${contractor(b.id) ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  if (statusFilter === null || statusFilter === 'received' || statusFilter === 'working' || (statusFilter === undefined && filter === 'bids')) {
    visible.sort((a, b) => !a.due_at ? !b.due_at ? 0 : 1 : !b.due_at ? -1 : new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
  }
  const selected = visible.find(b => b.id === selectedId) ?? visible[0]
  const sent = bids.filter(b => b.status === 'sent')
  return (
    <section className="project-index">
      <div className="project-heading">
        <div><h1>{title}</h1><p>{bids.filter(b => b.status === 'received' || b.status === 'working').length} bids in progress. {sent.length} proposals awaiting a reply.</p></div>
        {onNew && <button className="index-primary" onClick={onNew}>+ New bid</button>}
      </div>
      <div className="project-workspace">
        <div className="project-index-column">
          <div className="project-index-tools">
            <nav className="index-tabs" aria-label="Project filters">
              {onStatusFilter ? ([null, 'received', 'working', 'sent', 'lost', 'won'] as const).map(key => <button key={key ?? 'all'} aria-pressed={statusFilter === key} onClick={() => onStatusFilter(key)}>{key == null ? 'All bids' : ({ received: 'Received', working: 'Working', sent: 'Sent', lost: 'Lost', won: 'Jobs' })[key]}<span>{bids.filter(b => key ? b.status === key : b.status !== 'won').length}</span></button>) : (['bids', 'sent', 'jobs', 'all'] as const).map(key => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{({ bids: 'Bids', sent: 'Sent', jobs: 'Jobs', all: 'All' })[key]} <span>{bids.filter(b => matches(b, key)).length}</span></button>)}
            </nav>
            <label className="index-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg><input type="search" aria-label="Search projects" placeholder="Find a project" value={query} onChange={e => setQuery(e.target.value)} /></label>
          </div>
          <div className="project-list-label"><span>Project / contractor</span><span>Due</span><span>Status</span></div>
          <div className="index-project-list">
            {visible.map(b => <div className="index-project-entry" key={b.id}><button key={b.id} className="index-project-row" aria-pressed={selected?.id === b.id} onClick={() => setSelectedId(b.id)}>
              <span><strong>{b.name}</strong><small><span>{b.job_number}</span>{contractor(b.id)}</small></span>
              <span className="index-due">{b.due_at ? fmtDueDate(b.due_at) : 'No due date'}</span>
              <StatusBadge status={b.status} />
            </button><Link className="index-row-action index-secondary" aria-label={`${isOffice ? 'Open project' : 'Open estimate'} for ${b.name}`} to={`/bids/${b.id}${isOffice ? '' : '/estimate'}`}>{isOffice ? 'Open project' : 'Open estimate'}</Link></div>)}
            {!visible.length && <div className="index-empty"><h2>No matching projects</h2><p>Try another project name, number, or contractor.</p><button onClick={() => { setQuery(''); setFilter('all'); onStatusFilter?.(null) }}>{onStatusFilter ? 'Show all bids' : 'Show all projects'}</button></div>}
          </div>
          <div className="index-list-foot">{visible.length} {visible.length === 1 ? 'project' : 'projects'}</div>
          {!!sent.length && <section className="index-followups"><div className="index-section-line"><h2>Follow up</h2><span>Proposals awaiting a reply</span></div>{sent.map(b => <div className="index-follow-row" key={b.id}><div><strong>{b.name}</strong><p>{contractor(b.id)}{seesMoney && valueFor(b) != null ? ` · ${fmtMoney(valueFor(b)!)}` : ''}</p><p className="index-follow-date">{(() => { const date = followUpAt(b, followupDays); return date ? `${date.getTime() <= Date.now() ? 'Follow up due' : 'Follow up'} ${fmtFollowUp(date)}` : 'Follow-up date not set' })()}</p></div><Link className="index-secondary" to={`/bids/${b.id}`}>Open bid</Link></div>)}</section>}
        </div>
        {selected && <aside className="index-preview" aria-label="Selected project">
          <StatusBadge status={selected.status} />
          <h2>{selected.name}</h2><p className="index-contractor">{contractor(selected.id)}</p>
          <Link className="index-primary" to={`/bids/${selected.id}${isOffice ? '' : '/estimate'}`}>{isOffice ? 'Open project' : 'Open estimate'}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg></Link>
          <dl className="index-detail-grid"><div><dt>Project number</dt><dd>{selected.job_number}</dd></div><div><dt>Due</dt><dd>{selected.due_at ? fmtDueDate(selected.due_at) : 'Not set'}</dd></div><div><dt>Drawings</dt><dd>{selected.drawings_date ? fmtDueDate(selected.drawings_date) : 'Not set'}</dd></div><div><dt>Tax</dt><dd>{selected.tax_exempt ? 'Exempt' : 'Taxable'}</dd></div></dl>
          {!isOffice && seesMoney ? <ProjectEstimatePreview bid={selected} /> : <h3>Project overview</h3>}
          {selected.address && <p className="index-address">{selected.address}</p>}
          {seesMoney && <div className="index-preview-total"><span>Recorded value</span><strong className={valueFor(selected) == null ? 'index-recorded-empty' : undefined}>{valueFor(selected) == null ? 'No recorded value' : fmtMoney(valueFor(selected)!)}</strong></div>}

          <div className="index-preview-links"><Link to={`/bids/${selected.id}`}>Details</Link><Link to={`/bids/${selected.id}/proposal`}>Proposal</Link>{!isOffice && <><Link to={`/bids/${selected.id}/order`}>Order sheet</Link><Link to={`/bids/${selected.id}/schedule`}>Schedule</Link></>}{(isAdmin || isOffice) && <Link to={`/bids/${selected.id}/actuals`}>Actuals</Link>}</div>
        </aside>}
      </div>
    </section>
  )
}
