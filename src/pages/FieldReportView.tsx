import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Bid } from '../lib/types'
import { LOGO_URL } from '../lib/branding'
import type { FieldPhoto, FieldReport } from './Field'

const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })

/** Printable client report: the PM's write-up plus the photos they picked. */
export default function FieldReportView() {
  const { id, reportId } = useParams<{ id: string; reportId: string }>()
  const [bid, setBid] = useState<Bid | null>(null)
  const [report, setReport] = useState<FieldReport | null>(null)
  const [photos, setPhotos] = useState<FieldPhoto[]>([])
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map())
  const [company, setCompany] = useState<Record<string, string>>({})
  const [logoOk, setLogoOk] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const [bidRes, repRes, coRes] = await Promise.all([
        supabase!.from('bids').select('*').eq('id', id!).single(),
        supabase!.from('field_reports').select('*').eq('id', reportId!).single(),
        supabase!.from('text_settings').select('key, value').eq('group_name', 'Company'),
      ])
      if (bidRes.error) return setError(bidRes.error.message)
      if (repRes.error) return setError(repRes.error.message)
      setBid(bidRes.data as Bid)
      const rep = repRes.data as FieldReport
      setReport(rep)
      setCompany(Object.fromEntries(((coRes.data ?? []) as { key: string; value: string }[]).map((t) => [t.key, t.value])))
      if (rep.photo_ids.length > 0) {
        const { data: ph } = await supabase!.from('field_photos').select('*').in('id', rep.photo_ids)
        const rows = (ph ?? []) as FieldPhoto[]
        // keep the PM's picking order
        rows.sort((a, b) => rep.photo_ids.indexOf(a.id) - rep.photo_ids.indexOf(b.id))
        setPhotos(rows)
        const { data: urls } = await supabase!.storage.from('field').createSignedUrls(rows.map((p) => p.file_path), 3600)
        if (urls) setPhotoUrls(new Map(urls.flatMap((u, i) => (u.signedUrl ? [[rows[i].id, u.signedUrl] as [string, string]] : []))))
      }
    })()
  }, [id, reportId])

  useEffect(() => {
    if (bid && report) document.title = `PROGRESS REPORT ${bid.job_number} ${report.report_date} - ${bid.name.toUpperCase()}`
  }, [bid, report])

  if (error)
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!bid || !report) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="max-w-3xl space-y-4 pb-10 print:max-w-none print:pb-0">
      <div className="flex items-center gap-3 print:hidden">
        <Link to={`/bids/${bid.id}/field`} className="text-sm text-slate-500 hover:text-slate-900">
          ← Field
        </Link>
        <button
          onClick={() => window.print()}
          className="ml-auto rounded-md bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          🖨 Print / save PDF
        </button>
      </div>

      <div className="light-doc rounded-lg border-2 border-slate-900 bg-white p-6 print:rounded-none print:border-0 print:p-0">
        <header className="flex items-center gap-4 border-b-4 border-slate-900 pb-2">
          {logoOk && LOGO_URL ? (
            <img src={LOGO_URL} alt="" className="h-16 w-auto max-w-[16rem] object-contain" onError={() => setLogoOk(false)} />
          ) : (
            <div className="text-xl font-bold tracking-tight">{company.company_name ?? ''}</div>
          )}
          <div className="ml-auto text-right">
            <div className="text-lg font-bold tracking-tight">PROGRESS REPORT</div>
            <div className="text-[11px] text-slate-500">
              {[company.company_address, company.company_phone, company.company_email].filter(Boolean).join(' · ')}
            </div>
          </div>
        </header>

        <table className="mt-3 w-full text-[12px]">
          <tbody>
            <ReportRow k="Project" v={`${bid.job_number} — ${bid.name}`} />
            {bid.address && <ReportRow k="Address" v={bid.address} />}
            <ReportRow k="Report date" v={fmtDay(report.report_date)} />
            {report.crew && <ReportRow k="Crew on site" v={report.crew} />}
            {report.created_by && <ReportRow k="Prepared by" v={report.created_by} />}
          </tbody>
        </table>

        <SectionHead>Work performed</SectionHead>
        <p className="whitespace-pre-wrap text-[12px]">{report.work_performed}</p>

        {report.issues && (
          <>
            <SectionHead>Issues / delays</SectionHead>
            <p className="whitespace-pre-wrap text-[12px]">{report.issues}</p>
          </>
        )}

        {report.next_steps && (
          <>
            <SectionHead>Next steps</SectionHead>
            <p className="whitespace-pre-wrap text-[12px]">{report.next_steps}</p>
          </>
        )}

        {photos.length > 0 && (
          <>
            <SectionHead>Photos</SectionHead>
            <div className="grid grid-cols-2 gap-3">
              {photos.map((p) => (
                <figure key={p.id} className="break-inside-avoid">
                  {photoUrls.get(p.id) && (
                    <img src={photoUrls.get(p.id)} alt={p.note ?? ''} className="w-full rounded border border-slate-300 object-contain" />
                  )}
                  {p.note && <figcaption className="mt-0.5 text-[10px] text-slate-500">{p.note}</figcaption>}
                </figure>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ReportRow({ k, v }: { k: string; v: string }) {
  return (
    <tr className="border-b border-slate-200">
      <td className="w-28 py-0.5 pr-2 font-mono text-[9px] uppercase tracking-wider text-slate-500">{k}</td>
      <td className="py-0.5">{v}</td>
    </tr>
  )
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-1 mt-4 border-b-2 border-slate-900 pb-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-600">
      {children}
    </h2>
  )
}
