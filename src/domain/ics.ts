import type { LocalDate } from '../db/types'
import { addDays, weekdayOf } from './dates'

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

export interface IcsEvent {
  uid: string
  summary: string
  description: string
  time: string // 'HH:mm', local (floating) time
  durationMin: number
  /** Weekdays as in Date.getDay(). */
  byDay: number[]
}

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

const encoder = new TextEncoder()

/** Folds a content line at 75 octets without splitting a character (RFC 5545, section 3.1). */
export function foldLine(line: string): string {
  const parts: string[] = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const n = encoder.encode(ch).length
    const limit = parts.length === 0 ? 75 : 74 // continuation lines start with a space
    if (size + n > limit) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += ch
    size += n
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const utcStamp = (ts: number) => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const localStamp = (date: LocalDate, time: string) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`

export function firstOccurrence(from: LocalDate, byDay: readonly number[]): LocalDate {
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i)
    if (byDay.includes(weekdayOf(d))) return d
  }
  return from
}

/** A calendar file with weekly repeating reminders, so any calendar app can alert without a server. */
export function buildIcs(events: readonly IcsEvent[], today: LocalDate, now: number): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FOCUS//Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  for (const e of events) {
    if (!e.byDay.length) continue
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART:${localStamp(firstOccurrence(today, e.byDay), e.time)}`,
      `DURATION:PT${e.durationMin}M`,
      `RRULE:FREQ=WEEKLY;BYDAY=${[...e.byDay].sort().map((d) => DAY_CODES[d]).join(',')}`,
      `SUMMARY:${escapeText(e.summary)}`,
      `DESCRIPTION:${escapeText(e.description)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(e.summary)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
