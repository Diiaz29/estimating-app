import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'

/** Gate before mounting financial screens, including direct and print URLs. */
export default function FinancialPage({ children, allowOffice = false }: { children?: ReactNode; allowOffice?: boolean }) {
  const { isAdmin, isOffice } = useAuth()
  if (!isAdmin && !(allowOffice && isOffice)) return <p role="status">This page is available to administrators only.</p>
  return children
}
