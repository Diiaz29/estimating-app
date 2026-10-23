import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { useUnsavedWarning } from './useSaveQueue'

/** Personal bookkeeping marks: never written onto the shared receipt. */
export function useReceiptQuickBooks(userId: string | undefined, enabled: boolean) {
  const [marks, setMarks] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const busy = useRef(new Set<string>())
  const [retry, setRetry] = useState(0)
  const [preview, setPreview] = useState(false)
  useUnsavedWarning(pending.size > 0)

  useEffect(() => {
    let active = true
    setMarks(new Set())
    setError(null)
    setLoading(true)
    setPreview(false)
    if (!enabled || !userId) return () => { active = false }
    void (async () => {
      try {
        const result = await supabase!.from('receipt_quickbooks_marks').select('receipt_id').eq('user_id', userId)
        if (import.meta.env.DEV && result.error?.code === 'PGRST205') {
          const saved: unknown = JSON.parse(localStorage.getItem(`receipt-qb-preview:${userId}`) || '[]')
          if (active) {
            setMarks(new Set(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []))
            setPreview(true)
          }
          return
        }
        if (result.error) throw result.error
        if (active) setMarks(new Set(result.data.map(row => row.receipt_id as string)))
      } catch {
        if (active) setError('Your QuickBooks checkmarks could not be loaded. Try again.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [userId, enabled, retry])

  async function toggle(receiptId: string, checked: boolean) {
    if (!userId || !enabled || loading || busy.current.has(receiptId)) return
    busy.current.add(receiptId)
    setPending(new Set(busy.current))
    try {
      if (preview) {
        const next = new Set(marks)
        if (checked) next.add(receiptId)
        else next.delete(receiptId)
        localStorage.setItem(`receipt-qb-preview:${userId}`, JSON.stringify([...next]))
        setMarks(next)
        setError(null)
        return
      }
      const query = checked
        ? supabase!.from('receipt_quickbooks_marks').upsert({ user_id: userId, receipt_id: receiptId }, { onConflict: 'user_id,receipt_id' }).select('receipt_id').single()
        : supabase!.from('receipt_quickbooks_marks').delete().eq('user_id', userId).eq('receipt_id', receiptId).select('receipt_id')
      const result = await query
      if (result.error) throw result.error
      setMarks(previous => {
        const next = new Set(previous)
        if (checked) next.add(receiptId)
        else next.delete(receiptId)
        return next
      })
      setError(null)
    } catch {
      setError('Your QuickBooks checkmark was not saved. Please try again.')
    } finally {
      busy.current.delete(receiptId)
      setPending(new Set(busy.current))
    }
  }

  return { marks, loading, error, pending, preview, toggle, reload: () => setRetry(value => value + 1) }
}
