export interface SaveState {
  pending: number
  error: string | null
  label: string | null
  saved: boolean
}

/** Ordered, explicitly retryable writes. Only enqueue idempotent updates/upserts/deletes. */
export class SaveQueue {
  private jobs: { label: string; write: () => Promise<void> }[] = []
  private listeners = new Set<() => void>()
  private running = false
  private state: SaveState = { pending: 0, error: null, label: null, saved: false }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private publish(error: string | null = this.state.error) {
    this.state = { pending: this.jobs.length, error, label: this.jobs[0]?.label ?? null, saved: !this.jobs.length }
    this.listeners.forEach(listener => listener())
  }
  enqueue(label: string, write: () => Promise<void>) {
    this.jobs.push({ label, write })
    this.publish()
    if (!this.state.error) void this.drain()
  }
  retry = () => {
    if (this.running) return
    this.publish(null)
    void this.drain()
  }
  private async drain() {
    if (this.running) return
    this.running = true
    try {
      while (this.jobs.length) {
        try { await this.jobs[0].write() }
        catch (error) {
          this.publish(error instanceof Error ? error.message : 'The server did not confirm this change.')
          return
        }
        this.jobs.shift()
        this.publish(null)
      }
    } finally { this.running = false }
  }
}

export async function checkedWrite(request: PromiseLike<{ error: { message: string } | null }>) {
  const result = await request
  if (result.error) throw new Error(result.error.message)
}
