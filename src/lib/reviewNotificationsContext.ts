import { createContext, useContext } from 'react'
import type { ReviewQueueItem } from './bidReview'
export const ReviewNotifications = createContext({ items: [] as ReviewQueueItem[], loading: true, error: null as string | null, reload: () => {} })
export const useReviewNotifications = () => useContext(ReviewNotifications)
