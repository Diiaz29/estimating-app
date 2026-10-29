import { describe, expect, it } from 'vitest'
import { canReviewAction, estimatorAttentionCount, reviewAttentionCount, reviewBelongsTo, type ReviewQueueItem } from './bidReview'
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
  it('keeps input-invalidated reviews in the admin queue until an admin sends feedback', () => {
    const item = (reviewed_by: string | null, status = 'working') => ({
      stage: 'changes_requested', reviewed_by, bid: { status },
    }) as ReviewQueueItem
    expect(reviewAttentionCount([item(null), item('admin'), item(null, 'won'), item(null, 'lost')])).toBe(1)
    expect(canReviewAction('return', 'changes_requested', true, true)).toBe(true)
    expect(canReviewAction('return', 'changes_requested', false, true)).toBe(false)
    expect(canReviewAction('approve', 'changes_requested', true, true)).toBe(false)
    expect(canReviewAction('sign', 'changes_requested', true, true)).toBe(false)
  })
  it('routes returned notes to the assigned estimator even when an admin resubmits', () => {
    const returned = { stage: 'changes_requested', submitted_by: 'admin', reviewed_by: 'admin', bid: {
      status: 'working', assignment: { estimator_id: 'joel' },
    } } as ReviewQueueItem
    expect(reviewBelongsTo(returned, 'joel')).toBe(true)
    expect(reviewBelongsTo(returned, 'admin')).toBe(false)
    expect(reviewBelongsTo(returned, 'another-estimator')).toBe(false)
    expect(estimatorAttentionCount([returned], 'joel')).toBe(1)
    expect(estimatorAttentionCount([returned], 'another-estimator')).toBe(0)
    expect(estimatorAttentionCount([{ ...returned, stage: 'ready' }, { ...returned, reviewed_by: null }], 'joel')).toBe(0)
    expect(estimatorAttentionCount([{ ...returned, bid: { ...returned.bid!, status: 'won' } }], 'joel')).toBe(0)
  })
  it('falls back to legacy submitters but respects explicit unassignment', () => {
    const legacy = { submitted_by: 'joel', bid: { status: 'working' } } as ReviewQueueItem
    expect(reviewBelongsTo(legacy, 'joel')).toBe(true)
    expect(reviewBelongsTo({ ...legacy, bid: { ...legacy.bid!, assignment: { estimator_id: null } } }, 'joel')).toBe(false)
    expect(reviewBelongsTo(legacy)).toBe(false)
  })
})
