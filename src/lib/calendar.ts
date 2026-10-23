import { parseDay, toDay } from './schedule'

export const EVENT_KINDS = { custom: 'Event', build: 'Cabinets ready by', install: 'Install' } as const
export type EventKind = keyof typeof EVENT_KINDS
export interface CalendarEvent {
  id: string
  bid_id: string | null
  kind: EventKind
  title: string
  event_date: string
  event_time: string | null
  notes: string
}
export const JOB_COLORS = ['#2563eb', '#047857', '#a16207', '#7c3aed', '#be123c', '#0e7490', '#4d7c0f', '#a21caf']

export function calendarDays(month: Date): string[] {
  const start = new Date(month.getFullYear(), month.getMonth(), 1)
  start.setDate(start.getDate() - start.getDay())
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  end.setDate(end.getDate() + 6 - end.getDay())
  const days: string[] = []
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(toDay(d))
  return days
}

export function eventValidation(event: CalendarEvent): string | null {
  if (!event.title.trim()) return 'Enter an event name.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.event_date) || toDay(parseDay(event.event_date)) !== event.event_date) return 'Choose a valid date.'
  if (event.kind !== 'custom' && !event.bid_id) return 'Choose a job for this date.'
  if (event.event_time && !/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(event.event_time)) return 'Choose a valid time.'
  return null
}

export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.event_time ?? '').localeCompare(b.event_time ?? '') || a.title.localeCompare(b.title))
}
