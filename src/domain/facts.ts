import type {
  Day,
  FocusSession,
  LocalDate,
  LogEvent,
  Override,
  OverrideRule,
  Project,
  Routine,
  RoutineItem,
  RoutineLog,
  Settings,
} from '../db/types'
import { datesBetween, isWorkday, toLocalDate, weekdayOf } from './dates'
import { dayResult } from './oneThing'

export interface PeriodFacts {
  from: LocalDate
  to: LocalDate
  workdays: number
  oneThing: { done: number; tiny: number; bumped: number; open: number; none: number }
  focusMinutes: number
  focusByProject: { projectId?: string; name?: string; minutes: number }[]
  shutdowns: number
  checkins: number
  routines: { itemId: string; title: string; scheduled: number; done: number; tiny: number }[]
  urgent: number
  lowEnergyDays: number
  overwhelm: number
  tasksDone: number
  overrides: { date: LocalDate; rule: OverrideRule; reason: string }[]
}

export interface FactsInput {
  from: LocalDate
  to: LocalDate
  now: number
  settings: Pick<Settings, 'workdays' | 'dayStartHour' | 'onboardedDate'>
  days: readonly Day[]
  sessions: readonly FocusSession[]
  routines: readonly Routine[]
  items: readonly RoutineItem[]
  logs: readonly RoutineLog[]
  overrides: readonly Override[]
  events: readonly LogEvent[]
  projects: readonly Project[]
}

export function sessionMinutes(s: Pick<FocusSession, 'startedAt' | 'endedAt' | 'plannedMin'>, now: number): number {
  const end = s.endedAt ?? Math.min(now, s.startedAt + s.plannedMin * 60_000)
  return Math.max(0, Math.round((end - s.startedAt) / 60_000))
}

/** Plain counts for a period. Days before setup are left out; nothing is scored or ranked. */
export function computeFacts(i: FactsInput): PeriodFacts {
  const onboard = i.settings.onboardedDate
  const byDate = new Map(i.days.map((d) => [d.date, d]))
  const inRange = (d: LocalDate) => d >= i.from && d <= i.to && (!onboard || d >= onboard)
  // The setup day only counts if it already had a One Thing.
  const counts = (d: LocalDate) => !onboard || d > onboard || !!byDate.get(d)?.oneThingTaskId
  const dates = datesBetween(i.from, i.to).filter((d) => inRange(d) && counts(d))
  const work = dates.filter((d) => isWorkday(d, i.settings.workdays))

  const oneThing = { done: 0, tiny: 0, bumped: 0, open: 0, none: 0 }
  for (const d of work) oneThing[dayResult(byDate.get(d))]++

  const names = new Map(i.projects.map((p) => [p.id, p.name]))
  const byProject = new Map<string, number>()
  let focusMinutes = 0
  for (const s of i.sessions) {
    if (s.deletedAt || !inRange(s.date)) continue
    const m = sessionMinutes(s, i.now)
    focusMinutes += m
    const key = s.projectId ?? ''
    byProject.set(key, (byProject.get(key) ?? 0) + m)
  }
  const focusByProject = [...byProject.entries()]
    .map(([id, minutes]) => ({ projectId: id || undefined, name: id ? names.get(id) : undefined, minutes }))
    .filter((p) => p.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)

  const marks = new Map<string, RoutineLog>()
  for (const l of i.logs) if (!l.deletedAt) marks.set(`${l.date}|${l.routineItemId}`, l)
  const routineById = new Map(i.routines.map((r) => [r.id, r]))
  const routines = i.items
    .filter((it) => it.active && !it.deletedAt && routineById.get(it.routineId) && !routineById.get(it.routineId)?.deletedAt)
    .map((it) => {
      const r = routineById.get(it.routineId)!
      const since = toLocalDate(it.createdAt, i.settings.dayStartHour)
      let scheduled = 0
      let done = 0
      let tiny = 0
      for (const d of dates) {
        if (d < since || !r.weekdays.includes(weekdayOf(d))) continue
        scheduled++
        const m = marks.get(`${d}|${it.id}`)
        if (m?.mark === 'done') done++
        else if (m?.mark === 'tiny') tiny++
      }
      return { itemId: it.id, title: it.title, scheduled, done, tiny }
    })
    .filter((r) => r.scheduled > 0)

  const eventsIn = i.events.filter((e) => inRange(e.date))
  return {
    from: i.from,
    to: i.to,
    workdays: work.length,
    oneThing,
    focusMinutes,
    focusByProject,
    shutdowns: work.filter((d) => byDate.get(d)?.shutdownAt).length,
    checkins: dates.filter((d) => byDate.get(d)?.checkinAt).length,
    routines,
    urgent: eventsIn.filter((e) => e.type === 'task.triaged' && e.data?.path === 'urgent').length,
    lowEnergyDays: dates.filter((d) => byDate.get(d)?.lowEnergyAt).length,
    overwhelm: eventsIn.filter((e) => e.type === 'overwhelm.used').length,
    tasksDone: eventsIn.filter((e) => e.type === 'task.done' || e.type === 'onething.done').length,
    overrides: i.overrides
      .filter((o) => !o.deletedAt && inRange(o.date))
      .sort((a, b) => a.at - b.at)
      .map((o) => ({ date: o.date, rule: o.rule, reason: o.reason })),
  }
}
