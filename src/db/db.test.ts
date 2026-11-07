import { beforeEach, describe, expect, it } from 'vitest'
import { toLocalDate } from '../domain/dates'
import { exportBackup, importBackup } from './backup'
import { bumpOneThing, completeOneThing, decideSlide, pickOneThing, reopenOneThing } from './days'
import { db } from './db'
import { createProject, RuleError, updateProject } from './projects'
import { addOverride, completeReview } from './reviews'
import { settleExpiredSessions, startSession } from './sessions'
import { completeSetup, type SetupPayload } from './setup'
import { captureTasks, completeTask, splitLines, taskToNextAction } from './tasks'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const types = async () => (await db.events.orderBy('at').toArray()).map((e) => e.type)

describe('capture', () => {
  it('splits a brain dump and logs each item', async () => {
    expect(splitLines('- call bank\n\n2. email Tom\n• buy milk ')).toEqual(['call bank', 'email Tom', 'buy milk'])
    const tasks = await captureTasks(['a', ' ', 'b'], 'shutdown')
    expect(tasks.map((t) => t.status)).toEqual(['inbox', 'inbox'])
    expect(await types()).toEqual(['task.captured', 'task.captured'])
  })

  it('logs finishing something before the One Thing', async () => {
    const [t] = await captureTasks(['tidy desk'], 'capture', { status: 'today' })
    await completeTask(t.id, { beforeOneThing: true })
    const done = await db.events.where('type').equals('task.done').first()
    expect(done?.data?.beforeOneThing).toBe(true)
  })
})

describe('project rules', () => {
  it('blocks an Active project without a next action', async () => {
    await expect(createProject({ name: 'Thesis', status: 'active', nextAction: '' })).rejects.toMatchObject({
      code: 'next-action-required',
    })
  })

  it('allows a fourth Active project only by parking one in the same step', async () => {
    const a = await createProject({ name: 'A', status: 'active', nextAction: 'a' })
    await createProject({ name: 'B', status: 'active', nextAction: 'b' })
    await createProject({ name: 'C', status: 'active', nextAction: 'c' })
    await expect(createProject({ name: 'D', status: 'active', nextAction: 'd' })).rejects.toBeInstanceOf(RuleError)
    await createProject({ name: 'D', status: 'active', nextAction: 'd' }, { parkId: a.id, reconsiderDate: '2026-12-01' })
    const parked = await db.projects.get(a.id)
    expect(parked?.status).toBe('parked')
    expect(parked?.reconsiderDate).toBe('2026-12-01')
    expect((await db.projects.where('status').equals('active').toArray()).length).toBe(3)
  })

  it('logs next action changes and keeps an open next action when replacing it from the inbox', async () => {
    const p = await createProject({ name: 'Thesis', status: 'active', nextAction: 'outline' })
    const [t] = await captureTasks(['email advisor'])
    await taskToNextAction(t.id, p.id)
    expect((await db.projects.get(p.id))?.nextAction).toBe('email advisor')
    const kept = (await db.tasks.where('projectId').equals(p.id).toArray()).map((x) => x.title)
    expect(kept).toContain('outline')
    expect(await types()).toContain('project.next-action')
  })
})

describe('One Thing', () => {
  it('creates a task from a next action, reuses it, counts slides and asks for a new next action when done', async () => {
    const p = await createProject({ name: 'Thesis', status: 'active', nextAction: 'Write intro' })
    const t1 = await pickOneThing({ date: '2026-11-05', via: 'default', firstStep: 'open doc', fromProjectId: p.id })
    expect(t1.fromNextAction).toBe(true)
    const t2 = await pickOneThing({ date: '2026-11-06', via: 'carried', firstStep: 'open doc', taskId: t1.id, slide: true })
    expect(t2.id).toBe(t1.id)
    expect((await db.tasks.get(t1.id))?.slideCount).toBe(1)

    await completeOneThing('2026-11-06', 'done')
    expect((await db.projects.get(p.id))?.nextActionDone).toBe(true)
    await reopenOneThing('2026-11-06')
    expect((await db.projects.get(p.id))?.nextActionDone).toBeUndefined()
    await completeOneThing('2026-11-06', 'done')
    await updateProject(p.id, { nextAction: 'Write methods' })
    expect((await db.projects.get(p.id))?.nextActionDone).toBeUndefined()
  })

  it('requires a first step', async () => {
    await expect(pickOneThing({ date: '2026-11-06', via: 'manual', firstStep: ' ', newTitle: 'x' })).rejects.toThrow()
  })

  it('counts a tiny day without closing the task', async () => {
    const t = await pickOneThing({ date: '2026-11-06', via: 'manual', firstStep: 'one line', newTitle: 'Draft' })
    await completeOneThing('2026-11-06', 'tiny')
    expect((await db.days.get('2026-11-06'))?.outcome).toBe('tiny')
    expect((await db.tasks.get(t.id))?.status).toBe('today')
  })

  it('bumps the One Thing to the next workday, and asks when that day is taken', async () => {
    const t = await pickOneThing({ date: '2026-11-06', via: 'manual', firstStep: 's', newTitle: 'Report' })
    expect(await bumpOneThing('2026-11-06', '2026-11-09', 'Server down')).toEqual({ status: 'moved' })
    expect((await db.days.get('2026-11-09'))?.oneThingTaskId).toBe(t.id)
    expect((await db.days.get('2026-11-06'))?.outcome).toBe('bumped')
    expect((await db.tasks.get(t.id))?.slideCount).toBe(1)

    await pickOneThing({ date: '2026-11-10', via: 'manual', firstStep: 's', newTitle: 'Call' })
    await pickOneThing({ date: '2026-11-09', via: 'manual', firstStep: 's', newTitle: 'Plan' })
    const res = await bumpOneThing('2026-11-09', '2026-11-10', 'Leak')
    expect(res).toEqual({ status: 'conflict', existingTitle: 'Call' })
    expect(await bumpOneThing('2026-11-09', '2026-11-10', 'Leak', 'keep')).toEqual({ status: 'kept' })
    expect((await db.days.get('2026-11-10'))?.oneThingTaskId).not.toBe(t.id)
  })

  it('letting go of a next-action task asks the project for a new next action', async () => {
    const p = await createProject({ name: 'Club', status: 'active', nextAction: 'Book room' })
    const t = await pickOneThing({ date: '2026-11-06', via: 'default', firstStep: 'open site', fromProjectId: p.id })
    await decideSlide(t.id, 'let-go', 3)
    expect((await db.tasks.get(t.id))?.status).toBe('deleted')
    expect((await db.projects.get(p.id))?.nextActionDone).toBe(true)
    expect(await types()).toContain('onething.slide-decision')
  })
})

describe('sessions', () => {
  it('ends expired sessions at their planned end', async () => {
    const s = await startSession({ title: 'x', kind: 'start10', plannedMin: 10 })
    const later = s.startedAt + 60 * 60_000
    const settled = await settleExpiredSessions(later)
    expect(settled).toHaveLength(1)
    expect((await db.sessions.get(s.id))?.endedAt).toBe(s.startedAt + 10 * 60_000)
  })
})

describe('setup, overrides and backup', () => {
  const payload = (date: string): SetupPayload => ({
    locale: 'en',
    projects: [
      { name: 'Thesis', status: 'active', nextAction: 'Email advisor' },
      { name: 'Website', status: 'parked', nextAction: '', reconsiderDate: '2026-12-01' },
      { name: 'Old idea', status: 'dead', nextAction: '' },
    ],
    routine: { name: 'Daily routine', anchor: 'After coffee', items: [{ title: 'Vitamins', tinyVersion: 'One pill' }, { title: '' }] },
    schedule: { energyStart: '09:00', energyEnd: '11:00', shutdownTime: '17:30', workdays: [1, 2, 3, 4, 5], reviewWeekday: 0, reviewTime: '18:00' },
    restActivities: ['Walk', ''],
    accountabilityPerson: 'Sam',
    oneThing: { date, projectIndex: 0, title: 'Email advisor', firstStep: 'Open mail' },
  })

  it('writes setup in one go and counts it as the first review', async () => {
    const today = toLocalDate(Date.now(), 4)
    await completeSetup(payload(today), Date.now() - 5 * 60_000)
    const s = await db.settings.get('settings')
    expect(s?.onboardedDate).toBe(today)
    expect(await db.projects.count()).toBe(3)
    expect(await db.routineItems.count()).toBe(1)
    expect(await db.restActivities.count()).toBe(1)
    const day = await db.days.get(today)
    const task = await db.tasks.get(day!.oneThingTaskId!)
    expect(task?.fromNextAction).toBe(true)
    expect((await db.reviews.toArray())[0].kind).toBe('onboarding')
    expect(await types()).toContain('setup.done')
  })

  it('refuses more than three Active projects in setup', async () => {
    const p = payload('2026-11-06')
    p.projects = ['a', 'b', 'c', 'd'].map((name) => ({ name, status: 'active', nextAction: 'x' }))
    await expect(completeSetup(p, Date.now())).rejects.toBeInstanceOf(RuleError)
  })

  it('needs a reason for every override', async () => {
    await expect(addOverride('gate:checkin', '  ')).rejects.toThrow()
    await addOverride('gate:checkin', 'Train delayed')
    expect((await db.overrides.toArray())[0].reason).toBe('Train delayed')
  })

  it('records a restart as a review and a check-in, and can switch gates off only there', async () => {
    await completeSetup(payload(toLocalDate(Date.now(), 4)), Date.now())
    await completeReview({ kind: 'restart', startedAt: Date.now() - 60_000, gatesEnabled: false })
    expect((await db.settings.get('settings'))?.gatesEnabled).toBe(false)
    const today = toLocalDate(Date.now(), 4)
    expect((await db.days.get(today))?.checkinAt).toBeTypeOf('number')
  })

  it('round-trips a backup', async () => {
    await completeSetup(payload(toLocalDate(Date.now(), 4)), Date.now())
    const file = JSON.parse(JSON.stringify(await exportBackup()))
    const projects = await db.projects.toArray()
    await db.delete()
    await db.open()
    await importBackup(file)
    expect(await db.projects.toArray()).toEqual(projects)
    await expect(importBackup({ app: 'other' })).rejects.toThrow()
  })
})
