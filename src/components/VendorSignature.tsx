import { useState } from 'react'
import { SIGNATURE_URL } from '../lib/branding'

/** The company's half of a signature block on printed agreements. Prints the
 *  uploaded signature (Settings → Company) above the line, with the signer's
 *  printed name / title / date under it; falls back to a blank line to sign. */
export default function VendorSignature({
  companyName, signerName, signerTitle, date,
}: {
  companyName: string
  signerName?: string
  signerTitle?: string
  date?: string
}) {
  const [hasSig, setHasSig] = useState(true) // img onError flips it
  const printed = [signerName, signerTitle, date].filter(Boolean).join(' / ')
  return (
    <div>
      <div className="font-semibold">VENDOR — {companyName}</div>
      <div className="relative mt-8 h-0">
        {hasSig && (
          <img
            src={SIGNATURE_URL}
            alt=""
            className="absolute bottom-0 left-2 h-12 max-w-[14rem] object-contain object-left-bottom"
            onError={() => setHasSig(false)}
          />
        )}
      </div>
      <div className="border-t-2 border-slate-900 pt-0.5 text-[9px] uppercase tracking-wider text-slate-500">
        {printed || 'Signature / Printed Name / Title / Date'}
      </div>
    </div>
  )
}
