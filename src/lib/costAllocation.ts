import type { OverheadItem } from './types'

export function annualCostAllocation(items: OverheadItem[]) {
  let labor = 0
  let total = 0
  for (const item of items) {
    const annual = Number(item.amount) * (item.period === 'monthly' ? 12 : 1)
    total += annual
    labor += annual * Math.min(100, Math.max(0, Number(item.labor_pct ?? 0))) / 100
  }
  return { total, labor, overhead: total - labor, share: total > 0 ? labor / total : 0 }
}

/** Split an existing cost; never add another cost to pricing. */
export function splitCost(total: number, share: number) {
  const labor = Math.round(total * Math.min(1, Math.max(0, share)) * 100) / 100
  return { labor, overhead: total - labor }
}

export function costRateBreakdown(settings: Record<string, number>) {
  const combined = settings.cost_shop_rate ?? 0
  const share = settings.cost_labor_share
  return share == null ? null : { combined, share, ...splitCost(combined, share) }
}
