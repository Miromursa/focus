import { describe, expect, it } from 'vitest'
import type { Project } from '../db/types'
import { dayResult, defaultCandidate, needsSlideDecision } from './oneThing'

const project = (over: Partial<Project>): Project => ({
  id: 'p',
  name: 'P',
  status: 'active',
  order: 1,
  nextAction: 'Email Tom',
  statusChangedAt: 0,
  createdAt: 0,
  updatedAt: 0,
  ...over,
})

describe('defaultCandidate', () => {
  it('keeps what is already set for the day', () => {
    expect(defaultCandidate({ targetDay: { oneThingTaskId: 't1', pickedVia: 'bumped' }, projects: [] })).toEqual({
      kind: 'existing',
      taskId: 't1',
      via: 'bumped',
    })
  })

  it('carries an unfinished One Thing over as a slide', () => {
    const c = defaultCandidate({
      sourceDay: { date: '2026-11-05', oneThingTaskId: 't1' },
      sourceTask: { id: 't1', status: 'today' },
      projects: [project({})],
    })
    expect(c).toEqual({ kind: 'carry', taskId: 't1', fromDate: '2026-11-05', slides: true })
  })

  it('carries a low-energy (tiny) day without counting a slide', () => {
    const c = defaultCandidate({
      sourceDay: { date: '2026-11-05', oneThingTaskId: 't1', outcome: 'tiny' },
      sourceTask: { id: 't1', status: 'today' },
      projects: [],
    })
    expect(c).toMatchObject({ kind: 'carry', slides: false })
  })

  it('does not carry finished or let-go tasks', () => {
    const c = defaultCandidate({
      sourceDay: { date: '2026-11-05', oneThingTaskId: 't1', outcome: 'done' },
      sourceTask: { id: 't1', status: 'done' },
      projects: [project({})],
    })
    expect(c).toEqual({ kind: 'project', projectId: 'p', title: 'Email Tom' })
    const excluded = defaultCandidate({
      sourceDay: { date: '2026-11-05', oneThingTaskId: 't1' },
      sourceTask: { id: 't1', status: 'today' },
      projects: [],
      exclude: ['t1'],
    })
    expect(excluded.kind).toBe('none')
  })

  it('uses the top Active project and skips used-up next actions', () => {
    const ps = [
      project({ id: 'a', order: 2, nextAction: 'Second' }),
      project({ id: 'b', order: 1, nextAction: 'Used', nextActionDone: true }),
      project({ id: 'c', order: 0, status: 'parked', nextAction: 'Parked' }),
    ]
    expect(defaultCandidate({ projects: ps })).toEqual({ kind: 'project', projectId: 'a', title: 'Second' })
    expect(defaultCandidate({ projects: [] }).kind).toBe('none')
  })
})

describe('slides', () => {
  it('needs a decision from the third slide until it is answered', () => {
    expect(needsSlideDecision({ slideCount: 2 })).toBe(false)
    expect(needsSlideDecision({ slideCount: 2 }, 3)).toBe(true)
    expect(needsSlideDecision({ slideCount: 3, slideDecidedCount: 3 })).toBe(false)
    expect(needsSlideDecision({ slideCount: 3, slideDecidedCount: 3 }, 4)).toBe(true)
  })

  it('reads a day result', () => {
    expect(dayResult(undefined)).toBe('none')
    expect(dayResult({ oneThingTaskId: 't' })).toBe('open')
    expect(dayResult({ oneThingTaskId: 't', outcome: 'tiny' })).toBe('tiny')
  })
})
