import { describe, expect, it, vi } from 'vitest'
import { checkedWrite, SaveQueue } from './saveQueue'

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
describe('save queue', () => {
  it('serializes rapid edits so older writes cannot overwrite the last edit', async () => {
    const queue = new SaveQueue()
    let finish!: () => void
    const order: number[] = []
    queue.enqueue('Quantity', async () => { await new Promise<void>(resolve => { finish = resolve }); order.push(1) })
    queue.enqueue('Quantity', async () => { order.push(2) })
    expect(order).toEqual([])
    expect(queue.getSnapshot().pending).toBe(2)
    finish(); await flush()
    expect(order).toEqual([1, 2])
    expect(queue.getSnapshot()).toMatchObject({ pending: 0, error: null, saved: true })
  })
  it('retains failed and subsequent drafts until explicit retry, then saves them in order', async () => {
    const queue = new SaveQueue()
    const write = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined)
    const next = vi.fn().mockResolvedValue(undefined)
    queue.enqueue('Room name', write); await flush()
    queue.enqueue('Quantity', next); await flush()
    expect(queue.getSnapshot()).toMatchObject({ pending: 2, error: 'Offline', saved: false })
    expect(next).not.toHaveBeenCalled()
    queue.retry(); await flush()
    expect(write).toHaveBeenCalledTimes(2)
    expect(next).toHaveBeenCalledOnce()
    expect(queue.getSnapshot().pending).toBe(0)
  })
  it('does not launch duplicate retries while a request is pending', async () => {
    const queue = new SaveQueue()
    let finish!: () => void
    const write = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    queue.enqueue('Quantity', write); queue.retry(); queue.retry()
    expect(write).toHaveBeenCalledOnce()
    finish(); await flush()
  })
  it('treats returned backend errors as failures, not saved changes', async () => {
    await expect(checkedWrite(Promise.resolve({ error: { message: 'Permission denied' } }))).rejects.toThrow('Permission denied')
    await expect(checkedWrite(Promise.resolve({ error: null }))).resolves.toBeUndefined()
  })
})
