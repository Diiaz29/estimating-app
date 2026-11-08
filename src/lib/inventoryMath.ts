export const STOCK_UNITS = ['each', 'case', 'gal', 'ft'] as const
export const quantityNeeded = (onHand: number, minimum: number) => Math.max(0, Math.round((minimum - onHand) * 1000) / 1000)
export const needsWeeklyCheck = (checkedAt: string, now = Date.now()) => now - new Date(checkedAt).getTime() >= 7 * 24 * 60 * 60 * 1000
