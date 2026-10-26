export function safeProductUrl(value: string): string {
  try { const url = new URL(value.trim()); return ['https:', 'http:'].includes(url.protocol) && !!url.hostname ? url.href : '' } catch { return '' }
}
export function priorityRank(value?: string): number { return value === 'high' ? 2 : value === 'low' ? 0 : 1 }
export function matchesListSearch(item: { title: string; notes: string; store_name?: string }, search: string): boolean {
  return [item.title, item.notes, item.store_name ?? ''].join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
}
