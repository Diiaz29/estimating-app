/** Actuals uses the configured shop cost rate for both kinds of labor. */
export function actualsLaborCosts(
  settings: Record<string, number>,
  shopHours: number | null,
  installHours: number | null,
  estimatedInstallHours: number,
  estimatedInstallBucket: number,
  installEnabled: boolean,
) {
  const rate = settings.cost_shop_rate ?? 0
  const estimatedInstallLabor = installEnabled ? estimatedInstallHours * rate : 0
  // The pricing engine's install cost bucket includes labor at cost plus fuel.
  const estimatedFuel = installEnabled
    ? estimatedInstallBucket - estimatedInstallLabor
    : 0
  return {
    rate,
    shopLabor: (shopHours ?? 0) * rate,
    installLabor: (installHours ?? 0) * rate,
    estimatedInstallLabor,
    estimatedFuel,
    estimatedInstallCost: estimatedInstallLabor + estimatedFuel,
  }
}
