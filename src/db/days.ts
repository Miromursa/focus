import { db } from './db'
import { logEvent, tx, uid, upsertDay } from './core'
import type { ID, LocalDate, PickedVia, Task } from './types'

export interface PickInput {
  date: LocalDate
  via: PickedVia
  firstStep: string
  /** Pick an existing task... */
  taskId?: ID
  /** ...or a project's next action... */
  fromProjectId?: ID
  /** ...or something new. */
  newTitle?: string
  newProjectId?: ID
  /** Carrying an unfinished One Thing counts as a slide. */
  slide?: boolean
}

/** Sets the One Thing for a date. A tiny first step is required. */
export async function pickOneThing(i: PickInput): Promise<Task> {
  const firstStep = i.firstStep.trim()
  if (!firstStep) throw new Error('first-step-required')
  return tx(async () => {
    const now = Date.now()
    let task: Task | undefined
    let created = false
    if (i.taskId) {
      task = await db.tasks.get(i.taskId)
    } else if (i.fromProjectId) {
      const p = await db.projects.get(i.fromProjectId)
      const title = p?.nextAction.trim()
      if (!p || !title) throw new Error('project-has-no-next-action')
      task = (await db.tasks.where('projectId').equals(p.id).toArray()).find(
        (t) => t.fromNextAction && (t.status === 'today' || t.status === 'inbox') && t.title === title,
      )
      if (!task) {
        task = {
          id: uid(),
          title,
          projectId: p.id,
          fromNextAction: true,
          status: 'today',
          slideCount: 0,
          source: 'project',
          createdAt: now,
          updatedAt: now,
        }
        await db.tasks.add(task)
      }
    } else if (i.newTitle?.trim()) {
      task = {
        id: uid(),
        title: i.newTitle.trim(),
        projectId: i.newProjectId,
        status: 'today',
        slideCount: 0,
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      }
      created = true
      await db.tasks.add(task)
    }
    if (!task) throw new Error('nothing-picked')
    if (created) {
      await logEvent('task.captured', { refId: task.id, projectId: task.projectId, data: { title: task.title, source: 'manual' }, at: now })
    }

    const changes: Partial<Task> = { firstStep, updatedAt: now }
    if (task.status === 'inbox' || task.status === 'done') changes.status = 'today'
    if (i.slide) changes.slideCount = task.slideCount + 1
    await db.tasks.update(task.id, changes)

    const day = await db.days.get(i.date)
    const unchanged = day?.oneThingTaskId === task.id && day.outcome === undefined
    if (!unchanged) {
      const replaced = day?.oneThingTaskId && day.oneThingTaskId !== task.id ? await db.tasks.get(day.oneThingTaskId) : undefined
      await upsertDay(i.date, { oneThingTaskId: task.id, pickedAt: now, pickedVia: i.via, outcome: undefined, doneAt: undefined }, now)
      await logEvent('onething.picked', {
        refId: task.id,
        projectId: task.projectId,
        data: { title: task.title, via: i.via, forDate: i.date, firstStep, replaced: replaced?.title },
        at: now,
      })
    }
    return { ...task, ...changes }
  })
}

/** 'done' finishes the task. 'tiny' (low-energy day) counts the day, but the task stays open. */
export async function completeOneThing(date: LocalDate, kind: 'done' | 'tiny'): Promise<void> {
  await tx(async () => {
    const day = await db.days.get(date)
    if (!day?.oneThingTaskId || day.outcome) return
    const task = await db.tasks.get(day.oneThingTaskId)
    if (!task) return
    const now = Date.now()
    await upsertDay(date, { outcome: kind, doneAt: now }, now)
    if (kind === 'done') {
      await db.tasks.update(task.id, { status: 'done', doneAt: now, updatedAt: now })
      if (task.fromNextAction && task.projectId) {
        const p = await db.projects.get(task.projectId)
        if (p && p.nextAction.trim() === task.title) await db.projects.update(p.id, { nextActionDone: true, updatedAt: now })
      }
    }
    await logEvent(kind === 'done' ? 'onething.done' : 'onething.tiny', {
      refId: task.id,
      projectId: task.projectId,
      data: { title: task.title, firstStep: task.firstStep, forDate: date },
      at: now,
    })
  })
}

export async function reopenOneThing(date: LocalDate): Promise<void> {
  await tx(async () => {
    const day = await db.days.get(date)
    if (!day?.oneThingTaskId || (day.outcome !== 'done' && day.outcome !== 'tiny')) return
    const task = await db.tasks.get(day.oneThingTaskId)
    const now = Date.now()
    await upsertDay(date, { outcome: undefined, doneAt: undefined }, now)
    if (task?.status === 'done') {
      await db.tasks.update(task.id, { status: 'today', doneAt: undefined, updatedAt: now })
      if (task.fromNextAction && task.projectId) {
        const p = await db.projects.get(task.projectId)
        if (p?.nextActionDone && p.nextAction.trim() === task.title) {
          await db.projects.update(p.id, { nextActionDone: undefined, updatedAt: now })
        }
      }
    }
    await logEvent('onething.reopened', { refId: day.oneThingTaskId, projectId: task?.projectId, data: { title: task?.title }, at: now })
  })
}

export type BumpMode = 'ask' | 'replace' | 'keep'
export type BumpResult = { status: 'moved' | 'kept' | 'nothing' } | { status: 'conflict'; existingTitle: string }

/**
 * Something genuinely urgent took today. Today's open One Thing moves to the first slot of `to`.
 * If `to` already has a different One Thing, mode 'ask' returns a conflict so the user can choose.
 */
export async function bumpOneThing(today: LocalDate, to: LocalDate, byTitle: string, mode: BumpMode = 'ask'): Promise<BumpResult> {
  return tx(async (): Promise<BumpResult> => {
    const day = await db.days.get(today)
    if (!day?.oneThingTaskId || day.outcome) return { status: 'nothing' }
    const task = await db.tasks.get(day.oneThingTaskId)
    if (!task) return { status: 'nothing' }
    const target = await db.days.get(to)
    if (mode === 'ask' && target?.oneThingTaskId && target.oneThingTaskId !== task.id && !target.outcome) {
      const existing = await db.tasks.get(target.oneThingTaskId)
      return { status: 'conflict', existingTitle: existing?.title ?? '' }
    }
    const now = Date.now()
    await upsertDay(today, { outcome: 'bumped', bumpedAt: now, bumpedTo: mode === 'keep' ? undefined : to }, now)
    await db.tasks.update(task.id, { slideCount: task.slideCount + 1, updatedAt: now })
    if (mode !== 'keep') {
      await upsertDay(to, { oneThingTaskId: task.id, pickedAt: now, pickedVia: 'bumped', outcome: undefined, doneAt: undefined }, now)
    }
    await logEvent('onething.bumped', {
      refId: task.id,
      projectId: task.projectId,
      data: { title: task.title, by: byTitle, toDate: mode === 'keep' ? undefined : to },
      at: now,
    })
    return { status: mode === 'keep' ? 'kept' : 'moved' }
  })
}

export type SlideDecision = 'shrink' | 'recommit' | 'park' | 'let-go'

/** Records what happens to a task that keeps sliding. `slides` is the count the decision answers. */
export async function decideSlide(
  taskId: ID,
  decision: SlideDecision,
  slides: number,
  opts: { title?: string; firstStep?: string; reconsiderDate?: LocalDate } = {},
): Promise<void> {
  await tx(async () => {
    const task = await db.tasks.get(taskId)
    if (!task) return
    const now = Date.now()
    const changes: Partial<Task> = { slideDecidedAt: now, slideDecidedCount: slides, updatedAt: now }
    const project = task.projectId ? await db.projects.get(task.projectId) : undefined

    if (decision === 'shrink') {
      const title = opts.title?.trim()
      if (title && title !== task.title) {
        changes.title = title
        if (task.fromNextAction && project && project.nextAction === task.title) {
          await db.projects.update(project.id, { nextAction: title, nextActionChangedAt: now, updatedAt: now })
        }
      }
      if (opts.firstStep?.trim()) changes.firstStep = opts.firstStep.trim()
    } else if (decision === 'park') {
      changes.status = 'inbox'
      if (project && project.status === 'active') {
        await db.projects.update(project.id, {
          status: 'parked',
          reconsiderDate: opts.reconsiderDate,
          statusChangedAt: now,
          updatedAt: now,
        })
        await logEvent('project.status', {
          refId: project.id,
          projectId: project.id,
          data: { name: project.name, from: 'active', to: 'parked', reconsiderDate: opts.reconsiderDate },
          at: now,
        })
      }
    } else if (decision === 'let-go') {
      changes.status = 'deleted'
      changes.deletedAt = now
      if (task.fromNextAction && project && project.nextAction === task.title) {
        await db.projects.update(project.id, { nextActionDone: true, updatedAt: now })
      }
    }
    await db.tasks.update(taskId, changes)
    await logEvent('onething.slide-decision', {
      refId: taskId,
      projectId: task.projectId,
      data: { title: task.title, decision, slides, newTitle: changes.title },
      at: now,
    })
  })
}

export async function setLowEnergy(date: LocalDate, on: boolean, note?: string): Promise<void> {
  await tx(async () => {
    const now = Date.now()
    const n = note?.trim() || undefined
    await upsertDay(date, on ? { lowEnergyAt: now, lowEnergyNote: n } : { lowEnergyAt: undefined, lowEnergyNote: undefined }, now)
    await logEvent(on ? 'lowenergy.on' : 'lowenergy.off', { data: { note: n, forDate: date }, at: now })
  })
}

async function markOnce(date: LocalDate, field: 'shutdownAt' | 'checkinAt' | 'restTakenAt', type: 'shutdown.done' | 'checkin.done' | 'rest.taken'): Promise<void> {
  await tx(async () => {
    const day = await db.days.get(date)
    if (day?.[field]) return
    const now = Date.now()
    await upsertDay(date, { [field]: now }, now)
    await logEvent(type, { data: { forDate: date }, at: now })
  })
}

export async function markOverwhelm(): Promise<void> {
  await tx(() => logEvent('overwhelm.used'))
}

export const markShutdown = (date: LocalDate) => markOnce(date, 'shutdownAt', 'shutdown.done')
export const markCheckin = (date: LocalDate) => markOnce(date, 'checkinAt', 'checkin.done')
export const markRestTaken = (date: LocalDate) => markOnce(date, 'restTakenAt', 'rest.taken')
