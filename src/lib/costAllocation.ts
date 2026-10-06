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

/** Display rows that reconcile to the existing shop/install cost buckets. */
export function jobLaborCostRows(
  settings: Record<string, number>, estimatedShop: number, estimatedInstall: number,
  actualShop: number | null = null, actualInstall: number | null = null,
) {
  const rates = costRateBreakdown(settings)
  if (!rates) return [
    { label: 'Shop labor + overhead', estimated: estimatedShop, actual: actualShop },
    { label: 'Install labor + overhead', estimated: estimatedInstall, actual: actualInstall },
  ]
  const shop = splitCost(estimatedShop, rates.share)
  const install = splitCost(estimatedInstall, rates.share)
  const shopActual = actualShop == null ? null : splitCost(actualShop, rates.share)
  const installActual = actualInstall == null ? null : splitCost(actualInstall, rates.share)
  return [
    { label: 'Shop labor', estimated: shop.labor, actual: shopActual?.labor ?? null },
    { label: 'Install labor', estimated: install.labor, actual: installActual?.labor ?? null },
    { label: 'Overhead (shop + install)', estimated: shop.overhead + install.overhead,
      actual: shopActual == null && installActual == null ? null : (shopActual?.overhead ?? 0) + (installActual?.overhead ?? 0) },
  ]
}
