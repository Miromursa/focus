import type { LocalDate } from '../db/types'

const pad = (n: number) => String(n).padStart(2, '0')

export function formatYMD(d: Date): LocalDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Noon on the given local date, which keeps date math clear of DST edges. */
export function parseLocalDate(date: LocalDate): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

/** The logical date of a timestamp. Before `dayStartHour` it still counts as the previous day. */
export function toLocalDate(ts: number, dayStartHour: number): LocalDate {
  const d = new Date(ts)
  if (d.getHours() < dayStartHour) d.setDate(d.getDate() - 1)
  return formatYMD(d)
}

/** The timestamp at which a logical day begins. */
export function dayStartTs(date: LocalDate, dayStartHour: number): number {
  const d = parseLocalDate(date)
  d.setHours(dayStartHour, 0, 0, 0)
  return d.getTime()
}

export function addDays(date: LocalDate, n: number): LocalDate {
  const d = parseLocalDate(date)
  d.setDate(d.getDate() + n)
  return formatYMD(d)
}

/** Whole days from b to a (a minus b). */
export function diffDays(a: LocalDate, b: LocalDate): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000)
}

export const weekdayOf = (date: LocalDate): number => parseLocalDate(date).getDay()

export const isWorkday = (date: LocalDate, workdays: readonly number[]): boolean =>
  workdays.includes(weekdayOf(date))

export function prevWorkday(date: LocalDate, workdays: readonly number[]): LocalDate | undefined {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(date, -i)
    if (isWorkday(d, workdays)) return d
  }
  return undefined
}

export function nextWorkday(date: LocalDate, workdays: readonly number[]): LocalDate {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(date, i)
    if (isWorkday(d, workdays)) return d
  }
  return addDays(date, 1)
}

/** Inclusive list of dates. */
export function datesBetween(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

function logicalMinutes(ts: number, dayStartHour: number): number {
  const d = new Date(ts)
  const m = d.getHours() * 60 + d.getMinutes()
  return d.getHours() < dayStartHour ? m + 1440 : m
}

function logicalTarget(hhmm: string, dayStartHour: number): number {
  const m = minutesOf(hhmm)
  return m < dayStartHour * 60 ? m + 1440 : m
}

/** True once the clock has passed `hhmm` within the current logical day (so 00:30 is after 23:00). */
export function isPastTime(ts: number, hhmm: string, dayStartHour: number): boolean {
  return logicalMinutes(ts, dayStartHour) >= logicalTarget(hhmm, dayStartHour)
}

export function lastWeekdayOnOrBefore(date: LocalDate, weekday: number): LocalDate {
  return addDays(date, -((weekdayOf(date) - weekday + 7) % 7))
}

export function nextWeekdayOnOrAfter(date: LocalDate, weekday: number): LocalDate {
  return addDays(date, (weekday - weekdayOf(date) + 7) % 7)
}

export interface ScheduleLike {
  workdays: readonly number[]
  shutdownTime: string
  dayStartHour: number
}

/** Where a fresh One Thing pick lands: today if it's a workday before shutdown time, otherwise the next workday. */
export function pickTargetDate(now: number, s: ScheduleLike): LocalDate {
  const today = toLocalDate(now, s.dayStartHour)
  if (isWorkday(today, s.workdays) && !isPastTime(now, s.shutdownTime, s.dayStartHour)) return today
  return nextWorkday(today, s.workdays)
}
