import type { TFunction } from 'i18next'
import { db } from '../../db/db'
import type { LocalDate, Settings } from '../../db/types'
import { computeFacts, type PeriodFacts } from '../../domain/facts'
import { fmtDay, fmtMinutes } from '../../lib/format'
import { ruleLabel } from './eventText'

export async function loadFacts(from: LocalDate, to: LocalDate, settings: Settings): Promise<PeriodFacts> {
  const [days, sessions, routines, items, logs, overrides, events, projects] = await Promise.all([
    db.days.where('date').between(from, to, true, true).toArray(),
    db.sessions.where('date').between(from, to, true, true).toArray(),
    db.routines.toArray(),
    db.routineItems.toArray(),
    db.routineLogs.where('date').between(from, to, true, true).toArray(),
    db.overrides.where('date').between(from, to, true, true).toArray(),
    db.events.where('date').between(from, to, true, true).toArray(),
    db.projects.toArray(),
  ])
  return computeFacts({ from, to, now: Date.now(), settings, days, sessions, routines, items, logs, overrides, events, projects })
}

/** The facts as plain lines, for the screen and for the shareable summary. */
export function factLines(f: PeriodFacts, t: TFunction, lng: string): { main: string[]; routines: string[]; overrides: string[] } {
  const o = f.oneThing
  const main = [t('facts.oneThing', { done: o.done + o.tiny, count: f.workdays })]
  if (o.tiny || o.bumped || o.open || o.none) main.push(t('facts.oneThingDetail', o))
  main.push(t('facts.focus', { time: fmtMinutes(f.focusMinutes, t) }))
  if (f.focusByProject.length) {
    main.push(f.focusByProject.map((p) => t('facts.focusProject', { name: p.name ?? t('common.noProject'), time: fmtMinutes(p.minutes, t) })).join(' · '))
  }
  main.push(t('facts.shutdowns', { done: f.shutdowns, count: f.workdays }))
  if (f.checkins) main.push(t('facts.checkins', { n: f.checkins }))
  main.push(t('facts.urgent', { n: f.urgent }))
  if (f.lowEnergyDays) main.push(t('facts.lowEnergy', { n: f.lowEnergyDays }))
  if (f.overwhelm) main.push(t('facts.overwhelm', { n: f.overwhelm }))
  main.push(t('facts.tasksDone', { n: f.tasksDone }))
  const routines = f.routines.map((r) =>
    r.tiny
      ? t('facts.routineTiny', { title: r.title, done: r.done + r.tiny, tiny: r.tiny, count: r.scheduled })
      : t('facts.routineItem', { title: r.title, done: r.done, count: r.scheduled }),
  )
  const overrides = f.overrides.map((x) =>
    t('facts.overrideLine', { day: fmtDay(x.date, lng, 'short'), rule: ruleLabel(x.rule, t), reason: x.reason }),
  )
  return { main, routines, overrides }
}
