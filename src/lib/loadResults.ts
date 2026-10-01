/** Do not turn failed reads into empty records or financial totals. */
export function requireLoaded(results: Record<string, { error: { message: string } | null }>) {
  for (const [label, result] of Object.entries(results)) {
    if (result.error) throw new Error(`${label}: ${result.error.message}`)
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The server did not confirm the request.'
}
