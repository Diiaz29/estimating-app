import { fmtMoney } from '../lib/format'
import { costRateBreakdown } from '../lib/costAllocation'

interface CostRow { label: string; estimated: number; actual: number | null }
interface Props {
  jobNumber: string; jobName: string; rows: CostRow[]
  estimatedTotal: number; actualTotal: number | null
  shopHours: number | null; installHours: number | null; laborRate: number
  estimatedShopHours: number; estimatedInstallHours: number
  contract: number; showProfit: boolean; liveContract: boolean
  receiptCount: number; missingAmounts: number; notes: string | null
  costSettings?: Record<string, number>
}

/** Internal job-cost document. Values come from the Actuals page's existing calculations. */
export default function ActualsPrintSheet(p: Props) {
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric' })
  const estimatedProfit = p.contract - p.estimatedTotal
  const actualProfit = p.actualTotal == null ? null : p.contract - p.actualTotal
  const incomplete = p.rows.some(row => row.actual == null) || p.missingAmounts > 0
  const rates = p.costSettings ? costRateBreakdown(p.costSettings) : null
  return <article className="light-doc actuals-print-sheet rounded-lg border-2 border-slate-900 bg-white p-6 text-slate-900 print:rounded-none print:border-0 print:p-0">
    <style>{`@media print {
      .actuals-print-sheet { color: #0f172a; background: white; }
      .actuals-print-sheet tr { break-inside: avoid; }
      .actuals-print-sheet th, .actuals-print-sheet td { padding-top: 4px; padding-bottom: 4px; }
      .actuals-print-sheet tfoot { display: table-row-group; }
      .actuals-print-sheet p { orphans: 3; widows: 3; }
    }`}</style>
    <header className="border-b-4 border-slate-900 pb-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-sm text-slate-500">{p.jobNumber}</span>
        <h2 className="text-xl font-bold tracking-tight">{p.jobName}</h2>
        <span className="ml-auto text-xs text-slate-500">Actual job costs · {today}</span>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Internal job-cost report · {p.receiptCount} receipt{p.receiptCount === 1 ? '' : 's'} recorded</p>
    </header>
    <section className="mt-4">
      <h3 className="mb-2 text-sm font-semibold">Estimated vs actual costs</h3>
      <div className="overflow-x-auto print:overflow-visible"><table className="w-full min-w-[520px] text-sm sm:min-w-0 print:min-w-0">
        <thead><tr className="border-b-2 border-slate-900 text-left text-[11px]"><th scope="col" className="py-2 pr-2">Cost</th><th scope="col" className="py-2 text-right">Estimated</th><th scope="col" className="py-2 text-right">Actual</th><th scope="col" className="py-2 text-right">Difference</th></tr></thead>
        <tbody>{p.rows.map(row => <CostLine key={row.label} {...row} />)}</tbody>
        <tfoot><CostLine label="Total cost" estimated={p.estimatedTotal} actual={p.actualTotal} total /></tfoot>
      </table></div>
      <p className="mt-2 text-[10px] text-slate-500">Differences are actual minus estimated. Positive cost differences are over budget. A dash means no amount or hours have been recorded.</p>
      {incomplete && <p className="mt-2 text-xs font-medium">Actuals are incomplete; totals include recorded costs only.{p.missingAmounts > 0 && ` ${p.missingAmounts} receipt${p.missingAmounts === 1 ? ' has' : 's have'} no amount and count as $0.`}</p>}
    </section>
    <section className="mt-5 break-inside-avoid">
      <h3 className="mb-2 text-sm font-semibold">Labor hours</h3>
      <div className="overflow-x-auto print:overflow-visible"><table className="w-full min-w-[520px] text-sm sm:min-w-0 print:min-w-0"><thead><tr className="border-b border-slate-900 text-left text-[11px]"><th scope="col" className="py-1">Labor</th><th scope="col" className="text-right">Estimated hours</th><th scope="col" className="text-right">Actual hours</th></tr></thead>
        <tbody>{[['Shop', p.estimatedShopHours, p.shopHours], ['Install', p.estimatedInstallHours, p.installHours]].map(([label, estimated, actual]) => <tr key={String(label)} className="border-b border-slate-100"><th scope="row" className="py-1 text-left font-normal">{label}</th><td className="text-right tabular-nums">{Number(estimated).toFixed(1)}</td><td className="text-right tabular-nums">{actual == null ? '—' : Number(actual).toFixed(1)}</td></tr>)}</tbody>
      </table></div>
      <p className="mt-2 text-[10px] text-slate-500">{rates ? `Labor ${fmtMoney(rates.labor)}/hr · Overhead ${fmtMoney(rates.overhead)}/hr. Both are included in total cost.` : `Labor and overhead use the combined cost rate of ${fmtMoney(p.laborRate)}/hr.`}</p>
    </section>
    {p.showProfit && <section className="mt-5 break-inside-avoid">
      <h3 className="mb-2 text-sm font-semibold">Contract & profit</h3>
      <div className="overflow-x-auto print:overflow-visible"><table className="w-full min-w-[520px] text-sm sm:min-w-0 print:min-w-0"><thead><tr className="text-left text-[11px]"><th scope="col" className="py-1">Summary</th><th scope="col" className="text-right">Estimated</th><th scope="col" className="text-right">Actual</th><th scope="col" className="text-right">Difference</th></tr></thead><tbody>
        <tr className="border-y border-slate-900"><th scope="row" className="py-2 text-left font-normal">Contract amount</th><td colSpan={3} className="text-right tabular-nums">{fmtMoney(p.contract)}</td></tr>
        <CostLine label="Profit" estimated={estimatedProfit} actual={actualProfit} total />
        <tr><th scope="row" className="py-1 text-left font-normal">Margin</th><td className="text-right">{p.contract > 0 ? `${(estimatedProfit / p.contract * 100).toFixed(1)}%` : '—'}</td><td className="text-right">{actualProfit != null && p.contract > 0 ? `${(actualProfit / p.contract * 100).toFixed(1)}%` : '—'}</td><td /></tr>
      </tbody></table></div>
      <p className="mt-2 text-[10px] text-slate-500">{p.liveContract ? 'No snapshot found: contract amount uses live pricing.' : 'Contract amount uses the latest snapshot.'} {incomplete ? 'Actual profit and margin are provisional until all costs are recorded.' : ''}</p>
    </section>}
    {p.notes && <section className="mt-5"><h3 className="mb-2 text-sm font-semibold">Job notes</h3><p className="whitespace-pre-wrap break-words text-sm">{p.notes}</p></section>}
  </article>
}

function CostLine({ label, estimated, actual, total }: CostRow & { total?: boolean }) {
  return <tr className={total ? 'border-t-2 border-slate-900 font-semibold' : 'border-t border-slate-100'}>
    <th scope="row" className={`py-2 pr-2 text-left ${total ? 'font-semibold' : 'font-normal'}`}>{label}</th>
    <td className="py-2 text-right tabular-nums">{fmtMoney(estimated)}</td>
    <td className="py-2 text-right tabular-nums">{actual == null ? '—' : fmtMoney(actual)}</td>
    <td className="py-2 text-right tabular-nums">{actual == null ? '—' : fmtMoney(actual - estimated)}</td>
  </tr>
}
