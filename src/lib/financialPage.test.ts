import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import FinancialPage from '../components/FinancialPage'
const auth = vi.hoisted(() => ({ isAdmin: false, isOffice: false }))
vi.mock('./auth', () => ({ useAuth: () => auth }))
describe('financial page boundary', () => {
  it('does not mount or render confidential content for an estimator or other non-admin', () => {
    auth.isAdmin = false; auth.isOffice = false
    const NeverMount = () => { throw new Error('Confidential page mounted') }
    for (const allowOffice of [false, true]) {
      const html = renderToStaticMarkup(createElement(FinancialPage, { allowOffice }, createElement(NeverMount)))
      expect(html).toContain('administrators only')
    }
  })
  it('preserves admin access and office access only where expressly enabled', () => {
    auth.isAdmin = true; auth.isOffice = false
    expect(renderToStaticMarkup(createElement(FinancialPage, {}, 'Financial content'))).toContain('Financial content')
    auth.isAdmin = false; auth.isOffice = true
    expect(renderToStaticMarkup(createElement(FinancialPage, {}, 'Financial content'))).not.toContain('Financial content')
    expect(renderToStaticMarkup(createElement(FinancialPage, { allowOffice: true }, 'Office actuals'))).toContain('Office actuals')
  })
})
