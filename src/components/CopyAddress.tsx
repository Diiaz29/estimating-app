import { useEffect, useState } from 'react'

export default function CopyAddress({ address }: { address: string | null | undefined }) {
  const [message, setMessage] = useState('')
  useEffect(() => { setMessage('') }, [address])
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 4000)
    return () => window.clearTimeout(timer)
  }, [message])
  async function copy() {
    try {
      await navigator.clipboard.writeText(address!.trim())
      setMessage('Address copied')
    } catch { setMessage('Could not copy. Select the address and copy it manually.') }
  }
  return <div className="copy-address-control">
    <button type="button" className="index-secondary" disabled={!address?.trim()} onClick={() => void copy()}>Copy address</button>
    <span role="status">{message}</span>
  </div>
}
