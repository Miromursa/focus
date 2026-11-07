import type { TFunction } from 'i18next'
import type { LocalDate } from '../db/types'
import { addDays, parseLocalDate } from '../domain/dates'

const tag = (lng: string) => (lng.startsWith('de') ? 'de-DE' : 'en-GB')

export function fmtDay(date: LocalDate, lng: string, style: 'long' | 'short' | 'weekday' = 'long'): string {
  const opts: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long' }
      : style === 'short'
        ? { weekday: 'short', day: 'numeric', month: 'short' }
        : { weekday: 'long' }
  return new Intl.DateTimeFormat(tag(lng), opts).format(parseLocalDate(date))
}

export function fmtDate(date: LocalDate, lng: string): string {
  return new Intl.DateTimeFormat(tag(lng), { day: 'numeric', month: 'short', year: 'numeric' }).format(parseLocalDate(date))
}

export function fmtTime(ts: number, lng: string): string {
  return new Intl.DateTimeFormat(tag(lng), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ts)
}

export function fmtTimestamp(ts: number, lng: string): string {
  return new Intl.DateTimeFormat(tag(lng), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ts)
}

/** Weekday names indexed like Date.getDay() (0 = Sunday). */
export function weekdayNames(lng: string, style: 'short' | 'long' = 'short'): string[] {
  const f = new Intl.DateTimeFormat(tag(lng), { weekday: style })
  return Array.from({ length: 7 }, (_, d) => f.format(new Date(2023, 0, 1 + d, 12))) // 2023-01-01 was a Sunday
}

/** Monday-first order for weekday pickers. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function fmtMinutes(min: number, t: TFunction): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? t('common.hoursMinutes', { h, m }) : t('common.minutes', { n: m })
}

/** "Today", "Tomorrow" or a short date. */
export function dayLabel(date: LocalDate, today: LocalDate, lng: string, t: TFunction): string {
  if (date === today) return t('common.today')
  if (date === addDays(today, 1)) return t('common.tomorrow')
  return fmtDay(date, lng, 'short')
}

export function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
