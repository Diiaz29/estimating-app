import { describe, expect, it } from 'vitest'
import { canReviewAction, reviewAttentionCount, type ReviewQueueItem } from './bidReview'
describe('bid review actions and notifications', () => {
  it('keeps submission separate from administrator approval and signing', () => {
    expect(canReviewAction('submit', null, false, true)).toBe(true)
    expect(canReviewAction('submit', 'changes_requested', false, true)).toBe(true)
    for (const stage of ['ready','approved','signed'] as const) expect(canReviewAction('submit', stage, true, true)).toBe(false)
    for (const action of ['approve','return','sign'] as const) expect(canReviewAction(action,'ready',false,true)).toBe(false)
    expect(canReviewAction('approve','ready',true,true)).toBe(true)
    expect(canReviewAction('sign','ready',true,true)).toBe(false)
    expect(canReviewAction('sign','approved',true,true)).toBe(true)
    expect(canReviewAction('submit',null,false,false)).toBe(false)
  })
  it('counts outstanding work, excluding completed reviews and closed bids', () => {
    const item = (stage: string, status='working') => ({ stage, bid: { status } }) as ReviewQueueItem
    expect(reviewAttentionCount([item('ready'),item('approved'),item('signed'),item('changes_requested'),item('ready','won'),item('ready','lost')])).toBe(2)
    expect(reviewAttentionCount([])).toBe(0)
  })
})
