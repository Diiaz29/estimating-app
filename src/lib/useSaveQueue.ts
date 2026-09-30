import { useEffect, useState, useSyncExternalStore } from 'react'
import { SaveQueue } from './saveQueue'

export function useSaveQueue(warnOnLeave = true) {
  const [queue] = useState(() => new SaveQueue())
  const state = useSyncExternalStore(queue.subscribe, queue.getSnapshot)
  useUnsavedWarning(warnOnLeave && state.pending > 0)
  return { queue, ...state }
}

export function useUnsavedWarning(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest('a[href]') as HTMLAnchorElement | null
      if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || link.target === '_blank' || link.pathname === location.pathname) return
      if (!window.confirm('Changes have not saved yet. Leave this page before saving is confirmed?')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', navigate, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true) }
  }, [unsaved])
}
