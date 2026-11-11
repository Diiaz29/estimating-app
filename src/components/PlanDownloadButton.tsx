import { useState } from 'react'
import { supabase } from '../lib/supabase'

/** Download the original upload, rather than a rendered sheet or screenshot. */
export default function PlanDownloadButton({ filePath }: { filePath: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = filePath.split('/').pop()?.replace(/^\d+_/, '') || 'plan'
  async function download() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const { data, error: downloadError } = await supabase!.storage.from('plans')
        .createSignedUrl(filePath, 60, { download: name })
      if (downloadError || !data) throw new Error('Download unavailable')
      const link = document.createElement('a')
      link.href = data.signedUrl
      link.download = name
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch {
      setError('Could not download this file. Please try again.')
    } finally { setBusy(false) }
  }
  return <span className="inline-flex flex-wrap items-center gap-2">
    <button type="button" className="index-secondary" aria-label={`Download ${name}`} disabled={busy} onClick={() => void download()}>{busy ? 'Preparing…' : 'Download'}</button>
    {error && <span role="alert" className="text-sm text-red-600">{error}</span>}
  </span>
}
