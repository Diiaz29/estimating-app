import { describe, it, expect } from 'vitest'
import { safeProductUrl, matchesListSearch, priorityRank } from './privateListDetails'
describe('private list helpers', () => {
 it('allows only web product links', () => { expect(safeProductUrl(' https://example.com/item?q=1 ')).toBe('https://example.com/item?q=1'); for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///test', 'invalid', '']) expect(safeProductUrl(url)).toBe('') })
 it('searches details and store without case or outer whitespace sensitivity', () => { const item={title:'Discs',notes:'120 grit',store_name:'Woodcraft'}; expect(matchesListSearch(item,' WOODCRAFT ')).toBe(true); expect(matchesListSearch(item,'120')).toBe(true); expect(matchesListSearch(item,'saw')).toBe(false); expect(matchesListSearch(item,'')).toBe(true) })
 it('orders high before normal before low and handles existing notes', () => { expect(priorityRank('high')).toBeGreaterThan(priorityRank()); expect(priorityRank()).toBeGreaterThan(priorityRank('low')) })
})
