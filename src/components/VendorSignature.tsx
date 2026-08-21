/** The company's half of a signature block on printed agreements. Prints the
 *  author's signature (drawn on the Team page) above the line, with their
 *  printed name / title / date under it; falls back to a blank line to sign. */
export default function VendorSignature({
  companyName, signatureSrc, signerName, signerTitle, date,
}: {
  companyName: string
  signatureSrc?: string | null
  signerName?: string | null
  signerTitle?: string | null
  date?: string
}) {
  const printed = [signerName, signerTitle, date].filter(Boolean).join(' / ')
  return (
    <div>
      <div className="font-semibold">VENDOR — {companyName}</div>
      <div className="relative mt-8 h-0">
        {signatureSrc && (
          <img src={signatureSrc} alt="" className="absolute -bottom-3 left-2 h-14 max-w-[15rem] object-contain object-left-bottom" />
        )}
      </div>
      <div className="border-t-2 border-slate-900 pt-0.5 text-[9px] uppercase tracking-wider text-slate-500">
        {signatureSrc && printed ? printed : 'Signature / Printed Name / Title / Date'}
      </div>
    </div>
  )
}
