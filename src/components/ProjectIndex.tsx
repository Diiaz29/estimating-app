import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import type { Bid, BidStatus } from '../lib/types'
import { fmtDueDate, fmtFollowUp, fmtMoney, followUpAt, isOverdue } from '../lib/format'
import StatusBadge from './StatusBadge'
import ProjectEstimatePreview from './ProjectEstimatePreview'
import UiIcon from './UiIcon'

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
  const [jobNumber, setJobNumber] = useState('')
  const [contractorFilter, setContractorFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [sort, setSort] = useState<{ key: 'name' | 'number' | 'contractor' | 'due' | 'status'; descending: boolean } | null>(null)
  const matches = (b: Bid, key: string) => key === 'all' || (key === 'bids' ? b.status === 'received' || b.status === 'working' : key === 'jobs' ? b.status === 'won' : b.status === 'sent')
  const contractors = [...new Set(bids.map(b => contractor(b.id)).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b))
  const matchesDetails = (b: Bid) =>
    `${b.name} ${b.job_number} ${contractor(b.id) ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    b.job_number.toLowerCase().includes(jobNumber.trim().toLowerCase()) &&
    (!contractorFilter || (contractorFilter === '__unassigned__' ? !contractor(b.id) : contractor(b.id) === contractorFilter))
  const visible = bids.filter(b => (statusFilter !== undefined ? statusFilter ? b.status === statusFilter : b.status !== 'won' : matches(b, filter)) && matchesDetails(b))
  const hasDetailFilters = !!(query || jobNumber || contractorFilter)
  function clearDetailFilters() { setQuery(''); setJobNumber(''); setContractorFilter('') }
  if (statusFilter === null || statusFilter === 'received' || statusFilter === 'working' || (statusFilter === undefined && filter === 'bids')) {
    visible.sort((a, b) => !a.due_at ? !b.due_at ? 0 : 1 : !b.due_at ? -1 : new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
  }
  const selected = visible.find(b => b.id === selectedId) ?? visible[0]
  if (sort) visible.sort((a, b) => {
    const first = sort.key === 'name' ? a.name : sort.key === 'number' ? a.job_number : sort.key === 'contractor' ? contractor(a.id) ?? '' : sort.key === 'due' ? a.due_at ?? '9999' : a.status
    const second = sort.key === 'name' ? b.name : sort.key === 'number' ? b.job_number : sort.key === 'contractor' ? contractor(b.id) ?? '' : sort.key === 'due' ? b.due_at ?? '9999' : b.status
    return first.localeCompare(second, undefined, { numeric: sort.key === 'number' }) * (sort.descending ? -1 : 1)
  })
  function sortBy(key: 'name' | 'number' | 'contractor' | 'due' | 'status') { setSort(current => ({ key, descending: current?.key === key ? !current.descending : false })) }
  const sent = bids.filter(b => b.status === 'sent')
  const filteredSent = sent.filter(matchesDetails)
  return (
    <section className="project-index">
      <div className="project-heading">
        <div><h1>{title}</h1><p>{bids.filter(b => b.status === 'received' || b.status === 'working').length} bids in progress. {sent.length} proposals awaiting a reply.</p></div>
        {onNew && <button className="index-primary" onClick={onNew}>+ New bid</button>}
      </div>
      <div className={`project-workspace construction-register ${showPreview ? 'construction-preview-open' : ''}`}>
        <div className="project-index-column">
          <div className="project-index-tools">
            <nav className="index-tabs" aria-label="Project filters">
              {onStatusFilter ? ([null, 'received', 'working', 'sent', 'lost', 'won'] as const).map(key => <button key={key ?? 'all'} aria-pressed={statusFilter === key} onClick={() => onStatusFilter(key)}>{key == null ? 'All bids' : ({ received: 'Received', working: 'Working', sent: 'Sent', lost: 'Lost', won: 'Jobs' })[key]}<span>{bids.filter(b => key ? b.status === key : b.status !== 'won').length}</span></button>) : (['bids', 'sent', 'jobs', 'all'] as const).map(key => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{({ bids: 'Bids', sent: 'Sent', jobs: 'Jobs', all: 'All' })[key]} <span>{bids.filter(b => matches(b, key)).length}</span></button>)}
            </nav>
            <div className="construction-register-filters">
              <label className="construction-register-filter"><span>Search</span><span className="index-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg><input type="search" aria-label="Search projects" placeholder="Find a project" value={query} onChange={e => setQuery(e.target.value)} /></span></label>
              <label className="construction-register-filter"><span>Job number</span><input type="search" placeholder="e.g. 26-004" value={jobNumber} onChange={e => setJobNumber(e.target.value)} /></label>
              <label className="construction-register-filter"><span>Contractor</span><select aria-label="Contractor" value={contractorFilter} onChange={e => setContractorFilter(e.target.value)}><option value="">All contractors</option>{contractors.map(name => <option key={name} value={name}>{name}</option>)}{bids.some(b => !contractor(b.id)) && <option value="__unassigned__">No contractor assigned</option>}</select></label>
              {hasDetailFilters && <button className="index-secondary construction-clear-filters" onClick={clearDetailFilters}>Clear filters</button>}
            </div>
          </div>
          <div className="construction-register-caption"><span>{visible.length} {visible.length === 1 ? 'project' : 'projects'}</span><button className="index-secondary" aria-pressed={showPreview} onClick={() => setShowPreview(!showPreview)}>{showPreview ? 'Hide project overview' : 'Show project overview'}</button></div>
          <div className="construction-table-scroll">
          <table className="construction-register-table"><thead><tr>
            <th scope="col" aria-sort={sort?.key === 'number' ? sort.descending ? 'descending' : 'ascending' : 'none'}><button onClick={() => sortBy('number')}>Job number <UiIcon name={sort?.key === 'number' ? sort.descending ? 'down' : 'up' : 'sort'} /></button></th>
            <th scope="col" aria-sort={sort?.key === 'name' ? sort.descending ? 'descending' : 'ascending' : 'none'}><button onClick={() => sortBy('name')}>Project <UiIcon name={sort?.key === 'name' ? sort.descending ? 'down' : 'up' : 'sort'} /></button></th>
            <th scope="col" aria-sort={sort?.key === 'contractor' ? sort.descending ? 'descending' : 'ascending' : 'none'}><button onClick={() => sortBy('contractor')}>Contractor <UiIcon name={sort?.key === 'contractor' ? sort.descending ? 'down' : 'up' : 'sort'} /></button></th>
            <th scope="col" aria-sort={sort?.key === 'due' ? sort.descending ? 'descending' : 'ascending' : 'none'}><button onClick={() => sortBy('due')}>Due date <UiIcon name={sort?.key === 'due' ? sort.descending ? 'down' : 'up' : 'sort'} /></button></th>
            <th scope="col" aria-sort={sort?.key === 'status' ? sort.descending ? 'descending' : 'ascending' : 'none'}><button onClick={() => sortBy('status')}>Status <UiIcon name={sort?.key === 'status' ? sort.descending ? 'down' : 'up' : 'sort'} /></button></th>{seesMoney && <th scope="col">Recorded value</th>}<th scope="col">Actions</th>
          </tr></thead><tbody>
            {visible.map(b => <tr key={b.id} className={showPreview && selected?.id === b.id ? 'construction-selected-row' : undefined}>
              <td className="construction-job-number">{b.job_number}</td>
              <td><button className="construction-project-select" aria-label={`Show overview for ${b.name}`} aria-pressed={showPreview && selected?.id === b.id} onClick={() => { setSelectedId(b.id); setShowPreview(true) }}><strong>{b.name}</strong></button></td>
              <td>{contractor(b.id) ?? '—'}</td><td><span className={isOverdue(b) ? 'construction-overdue' : undefined}>{isOverdue(b) && 'Overdue · '}{b.due_at ? fmtDueDate(b.due_at) : 'Not set'}</span></td><td><StatusBadge status={b.status} /></td>{seesMoney && <td className="construction-money">{valueFor(b) == null ? '—' : fmtMoney(valueFor(b)!)}</td>}
              <td><div className="construction-row-actions"><Link className="construction-row-link" aria-label={`Open details for ${b.name}`} to={`/bids/${b.id}`}>Details</Link>{!isOffice && <Link className="construction-row-link" aria-label={`Open estimate for ${b.name}`} to={`/bids/${b.id}/estimate`}>Estimate</Link>}</div></td>
            </tr>)}
          </tbody></table>
            {!visible.length && <div className="index-empty"><h2>No matching projects</h2><p>Try another project name, number, or contractor.</p><button onClick={() => { clearDetailFilters(); setFilter('all'); onStatusFilter?.(null) }}>{onStatusFilter ? 'Show all bids' : 'Show all projects'}</button></div>}
          </div>
          <div className="index-list-foot">{visible.length} {visible.length === 1 ? 'project' : 'projects'}</div>
          {!!filteredSent.length && <section className="index-followups"><div className="index-section-line"><h2>Follow up</h2><span>Proposals awaiting a reply</span></div>{filteredSent.map(b => <div className="index-follow-row" key={b.id}><div><strong>{b.name}</strong><p>{contractor(b.id)}{seesMoney && valueFor(b) != null ? ` · ${fmtMoney(valueFor(b)!)}` : ''}</p><p className="index-follow-date">{(() => { const date = followUpAt(b, followupDays); return date ? `${date.getTime() <= Date.now() ? 'Follow up due' : 'Follow up'} ${fmtFollowUp(date)}` : 'Follow-up date not set' })()}</p></div><Link className="index-secondary" to={`/bids/${b.id}`}>Open bid</Link></div>)}</section>}
        </div>
        {selected && showPreview && <aside className="index-preview" aria-label="Selected project">
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
