import { costRateBreakdown, splitCost } from '../lib/costAllocation'
import { fmtMoney } from '../lib/format'

export default function LaborOverheadBreakdown({ settings, estimated, actual }: {
  settings: Record<string, number>; estimated: number; actual?: number | null
}) {
  const rates = costRateBreakdown(settings)
  if (!rates) return <p className="mt-3 text-xs text-slate-500">Labor and overhead use the combined cost rate. Set the breakdown in Settings → Overhead.</p>
  const est = splitCost(estimated, rates.share)
  const act = actual == null ? null : splitCost(actual, rates.share)
  return <section className="mt-4 text-sm" aria-label="Labor and overhead breakdown">
    <h3 className="font-semibold">Labor and overhead breakdown</h3>
    <p className="mt-1 text-xs text-slate-500">Included in the costs above. These amounts are not added again.</p>
    <table className="mt-2 w-full text-sm">
      <thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th scope="col" className="py-1 text-left">Cost</th><th scope="col" className="text-right">Per hour</th><th scope="col" className="text-right">Estimated</th>{actual !== undefined && <th scope="col" className="text-right">Actual</th>}</tr></thead>
      <tbody>{(['labor', 'overhead'] as const).map(key => <tr key={key}><th scope="row" className="py-1 text-left font-normal">{key === 'labor' ? 'Labor' : 'Overhead'}</th><td className="text-right tabular-nums">{fmtMoney(rates[key])}</td><td className="text-right tabular-nums">{fmtMoney(est[key])}</td>{actual !== undefined && <td className="text-right tabular-nums">{act ? fmtMoney(act[key]) : '—'}</td>}</tr>)}</tbody>
      <tfoot><tr className="border-t border-slate-200 font-semibold"><th scope="row" className="py-1 text-left">Combined</th><td className="text-right tabular-nums">{fmtMoney(rates.combined)}</td><td className="text-right tabular-nums">{fmtMoney(estimated)}</td>{actual !== undefined && <td className="text-right tabular-nums">{actual == null ? '—' : fmtMoney(actual)}</td>}</tr></tfoot>
    </table>
  </section>
}
