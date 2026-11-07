import { toLocalDate } from '../domain/dates'
import { db } from './db'
import type { Day, EventData, EventType, ID, LocalDate, LogEvent, Settings } from './types'

export const DEFAULT_DAY_START = 4

export function uid(): ID {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // randomUUID needs a secure context; fall back for plain-http LAN testing.
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function defaultSettings(now: number): Settings {
  return {
    id: 'settings',
    energyStart: '09:00',
    energyEnd: '11:00',
    shutdownTime: '17:30',
    workdays: [1, 2, 3, 4, 5],
    dayStartHour: DEFAULT_DAY_START,
    reviewWeekday: 0,
    reviewTime: '18:00',
    bufferMinutes: 60,
    restBlockMinutes: 60,
    locale: 'auto',
    gatesEnabled: true,
    createdAt: now,
    updatedAt: now,
  }
}

/** Runs `fn` in one read-write transaction over every table, so a change and its log event land together. */
export function tx<T>(fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', db.tables, fn)
}

export async function dateOf(ts: number): Promise<LocalDate> {
  const s = await db.settings.get('settings')
  return toLocalDate(ts, s?.dayStartHour ?? DEFAULT_DAY_START)
}

export interface EventOptions {
  refId?: ID
  projectId?: ID
  data?: EventData
  at?: number
  date?: LocalDate
}

let seq = Date.now() * 1000

export async function logEvent(type: EventType, opts: EventOptions = {}): Promise<void> {
  const at = opts.at ?? Date.now()
  const date = opts.date ?? (await dateOf(at))
  seq = Math.max(seq + 1, Date.now() * 1000)
  await db.events.add({ id: uid(), at, seq, date, type, refId: opts.refId, projectId: opts.projectId, data: opts.data })
}

/** Chronological order for log events. */
export const byTime = (a: Pick<LogEvent, 'at' | 'seq'>, b: Pick<LogEvent, 'at' | 'seq'>): number => a.at - b.at || (a.seq ?? 0) - (b.seq ?? 0)

/** Creates or patches a day record. Call inside tx(). */
export async function upsertDay(date: LocalDate, patch: Partial<Omit<Day, 'date'>>, now: number): Promise<Day> {
  const cur = await db.days.get(date)
  const next: Day = { ...(cur ?? { date, createdAt: now }), ...patch, date, updatedAt: now }
  await db.days.put(next)
  return next
}
