import { describe, expect, it } from 'vitest'
import type { Day, FocusSession, LogEvent, Override, Project, Routine, RoutineItem, RoutineLog } from '../db/types'
import { computeFacts } from './facts'
import { buildIcs, foldLine } from './ics'
import { resurfacedParked, validateProject, wouldExceedActive } from './projects'
import { logKey, missedInARow } from './routines'

const stamp = { createdAt: 0, updatedAt: 0 }
const project = (id: string, over: Partial<Project> = {}): Project => ({
  id,
  name: id,
  status: 'active',
  order: 1,
  nextAction: 'x',
  statusChangedAt: 0,
  ...stamp,
  ...over,
})

describe('project rules', () => {
  it('requires a next action for Active and a reconsider date for Parked', () => {
    expect(validateProject({ name: 'A', status: 'active', nextAction: ' ' })).toEqual(['next-action-required'])
    expect(validateProject({ name: 'A', status: 'parked', nextAction: '' })).toEqual(['reconsider-date-required'])
    expect(validateProject({ name: '', status: 'dead', nextAction: '' })).toEqual(['name-required'])
  })

  it('allows at most three Active projects', () => {
    const three = [project('a'), project('b'), project('c')]
    expect(wouldExceedActive(three)).toBe(true)
    expect(wouldExceedActive(three, 'a')).toBe(false)
    expect(wouldExceedActive(three.slice(0, 2))).toBe(false)
  })

  it('resurfaces parked projects once their date has come', () => {
    const ps = [
      project('a', { status: 'parked', reconsiderDate: '2026-11-01' }),
      project('b', { status: 'parked', reconsiderDate: '2026-12-01' }),
    ]
    expect(resurfacedParked(ps, '2026-11-06').map((p) => p.id)).toEqual(['a'])
  })
})

describe('routines', () => {
  const daily = { weekdays: [0, 1, 2, 3, 4, 5, 6] }
  it('counts misses in a row, up to two', () => {
    const marked = new Set([logKey('2026-11-03', 'i')])
    expect(missedInARow('i', daily, marked, '2026-11-04', '2026-11-01')).toBe(0)
    expect(missedInARow('i', daily, marked, '2026-11-05', '2026-11-01')).toBe(1)
    expect(missedInARow('i', daily, marked, '2026-11-07', '2026-11-01')).toBe(2)
  })

  it('skips days the routine is not scheduled and days before it existed', () => {
    const weekdays = { weekdays: [1, 2, 3, 4, 5] }
    const marked = new Set([logKey('2026-11-06', 'i')]) // Friday
    expect(missedInARow('i', weekdays, marked, '2026-11-09', '2026-11-01')).toBe(0) // Monday
    expect(missedInARow('i', daily, new Set(), '2026-11-06', '2026-11-05')).toBe(1)
  })
})

describe('facts', () => {
  it('counts a week in plain numbers', () => {
    const days: Day[] = [
      { date: '2026-11-02', oneThingTaskId: 't', outcome: 'done', shutdownAt: 1, ...stamp },
      { date: '2026-11-03', oneThingTaskId: 't', outcome: 'tiny', lowEnergyAt: 1, ...stamp },
      { date: '2026-11-04', oneThingTaskId: 't', outcome: 'bumped', shutdownAt: 1, ...stamp },
      { date: '2026-11-05', oneThingTaskId: 't', checkinAt: 1, ...stamp },
    ]
    const sessions: FocusSession[] = [
      { id: 's1', title: 'a', date: '2026-11-02', startedAt: 0, plannedMin: 10, endedAt: 600_000, kind: 'start10', projectId: 'p', ...stamp },
      { id: 's2', title: 'b', date: '2026-11-03', startedAt: 0, plannedMin: 10, endedAt: 300_000, kind: 'start10', ...stamp },
    ]
    const routines: Routine[] = [{ id: 'r', name: 'R', anchor: 'After coffee', weekdays: [1, 2, 3, 4, 5], order: 1, ...stamp }]
    const items: RoutineItem[] = [{ id: 'i', routineId: 'r', title: 'Vitamins', order: 1, active: true, ...stamp }]
    const logs: RoutineLog[] = [
      { id: logKey('2026-11-02', 'i'), date: '2026-11-02', routineItemId: 'i', mark: 'done', ...stamp },
      { id: logKey('2026-11-03', 'i'), date: '2026-11-03', routineItemId: 'i', mark: 'tiny', ...stamp },
    ]
    const overrides: Override[] = [{ id: 'o', date: '2026-11-05', at: 5, rule: 'gate:checkin', reason: 'tired', ...stamp }]
    const events: LogEvent[] = [
      { id: 'e1', at: 1, date: '2026-11-04', type: 'task.triaged', data: { path: 'urgent' } },
      { id: 'e2', at: 2, date: '2026-11-04', type: 'overwhelm.used' },
    ]
    const f = computeFacts({
      from: '2026-11-02',
      to: '2026-11-06',
      now: 10_000_000,
      settings: { workdays: [1, 2, 3, 4, 5], dayStartHour: 4, onboardedDate: '2026-11-01' },
      days,
      sessions,
      routines,
      items,
      logs,
      overrides,
      events,
      projects: [project('p', { name: 'Thesis' })],
    })
    expect(f.workdays).toBe(5)
    expect(f.oneThing).toEqual({ done: 1, tiny: 1, bumped: 1, open: 1, none: 1 })
    expect(f.focusMinutes).toBe(15)
    expect(f.focusByProject).toEqual([
      { projectId: 'p', name: 'Thesis', minutes: 10 },
      { projectId: undefined, name: undefined, minutes: 5 },
    ])
    expect(f.shutdowns).toBe(2)
    expect(f.checkins).toBe(1)
    expect(f.routines).toEqual([{ itemId: 'i', title: 'Vitamins', scheduled: 5, done: 1, tiny: 1 }])
    expect(f.urgent).toBe(1)
    expect(f.overwhelm).toBe(1)
    expect(f.lowEnergyDays).toBe(1)
    expect(f.overrides).toEqual([{ date: '2026-11-05', rule: 'gate:checkin', reason: 'tired' }])
  })
})

describe('ics', () => {
  it('builds weekly repeating events with CRLF line endings', () => {
    const ics = buildIcs(
      [{ uid: 'u1', summary: 'FOCUS: shutdown', description: 'Five minutes, then done.', time: '17:30', durationMin: 5, byDay: [5, 1, 2, 3, 4] }],
      '2026-11-07',
      Date.UTC(2026, 10, 7),
    )
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR\r\n')
    expect(ics).toContain('DTSTART:20261109T173000\r\n') // first weekday on or after Saturday
    expect(ics).toContain('DESCRIPTION:Five minutes\\, then done.')
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
  })

  it('folds long lines without splitting characters', () => {
    const folded = foldLine(`DESCRIPTION:${'ä'.repeat(60)}`)
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(`DESCRIPTION:${'ä'.repeat(60)}`)
  })
})
