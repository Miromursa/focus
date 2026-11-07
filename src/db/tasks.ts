import { createProject } from './projects'
import { db } from './db'
import { logEvent, tx, uid } from './core'
import type { ID, LocalDate, Task, TaskSource } from './types'

/** Splits a brain dump into one item per non-empty line and drops list bullets. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
}

export async function captureTasks(
  titles: readonly string[],
  source: TaskSource = 'capture',
  opts: { status?: 'inbox' | 'today'; projectId?: ID } = {},
): Promise<Task[]> {
  const clean = titles.map((t) => t.trim()).filter(Boolean)
  if (!clean.length) return []
  return tx(async () => {
    const now = Date.now()
    const out: Task[] = []
    for (const title of clean) {
      const task: Task = {
        id: uid(),
        title,
        status: opts.status ?? 'inbox',
        projectId: opts.projectId,
        slideCount: 0,
        source,
        createdAt: now,
        updatedAt: now,
      }
      await db.tasks.add(task)
      await logEvent('task.captured', { refId: task.id, projectId: task.projectId, data: { title, source }, at: now })
      out.push(task)
    }
    return out
  })
}

export type TriagePath = 'two-min' | 'not-urgent' | 'urgent'

/** Captures one item and records which branch of the urgency test it took. */
export async function captureTriaged(title: string, path: TriagePath): Promise<Task> {
  return tx(async () => {
    const now = Date.now()
    const t = title.trim()
    const task: Task = {
      id: uid(),
      title: t,
      status: path === 'two-min' ? 'done' : path === 'urgent' ? 'today' : 'inbox',
      urgent: path === 'urgent' ? true : undefined,
      doneAt: path === 'two-min' ? now : undefined,
      slideCount: 0,
      source: 'capture',
      createdAt: now,
      updatedAt: now,
    }
    await db.tasks.add(task)
    await logEvent('task.captured', { refId: task.id, data: { title: t, source: 'capture' }, at: now })
    await logEvent('task.triaged', { refId: task.id, data: { title: t, path }, at: now })
    if (path === 'two-min') await logEvent('task.done', { refId: task.id, data: { title: t }, at: now })
    return task
  })
}

export async function completeTask(id: ID, opts: { beforeOneThing?: boolean } = {}): Promise<void> {
  await tx(async () => {
    const task = await db.tasks.get(id)
    if (!task || task.status === 'done') return
    const now = Date.now()
    await db.tasks.update(id, { status: 'done', doneAt: now, updatedAt: now })
    await logEvent('task.done', {
      refId: id,
      projectId: task.projectId,
      data: { title: task.title, beforeOneThing: opts.beforeOneThing ? true : undefined },
      at: now,
    })
  })
}

export async function reopenTask(id: ID): Promise<void> {
  await tx(async () => {
    const task = await db.tasks.get(id)
    if (!task || task.status !== 'done') return
    const now = Date.now()
    await db.tasks.update(id, { status: 'today', doneAt: undefined, updatedAt: now })
    await logEvent('task.reopened', { refId: id, projectId: task.projectId, data: { title: task.title }, at: now })
  })
}

export async function deleteTask(id: ID): Promise<void> {
  await tx(async () => {
    const task = await db.tasks.get(id)
    if (!task || task.status === 'deleted') return
    const now = Date.now()
    await db.tasks.update(id, { status: 'deleted', deletedAt: now, updatedAt: now })
    await logEvent('task.deleted', { refId: id, projectId: task.projectId, data: { title: task.title }, at: now })
  })
}

/**
 * Moves a task between the inbox, today and a project's task list.
 * A task with a project and status 'inbox' sits in that project's list, not in the inbox.
 */
export async function moveTask(id: ID, patch: { status?: 'inbox' | 'today'; projectId?: ID | null }): Promise<void> {
  await tx(async () => {
    const task = await db.tasks.get(id)
    if (!task) return
    const now = Date.now()
    const projectId = patch.projectId === null ? undefined : (patch.projectId ?? task.projectId)
    const status = patch.status ?? (task.status === 'done' || task.status === 'deleted' ? 'inbox' : task.status)
    await db.tasks.update(id, { status, projectId, updatedAt: now })
    const project = projectId ? await db.projects.get(projectId) : undefined
    await logEvent('task.moved', {
      refId: id,
      projectId,
      data: { title: task.title, status, project: project?.name },
      at: now,
    })
  })
}

export async function editTask(id: ID, patch: { title?: string; firstStep?: string }): Promise<void> {
  await tx(async () => {
    const task = await db.tasks.get(id)
    if (!task) return
    const title = patch.title?.trim() || task.title
    const firstStep = patch.firstStep === undefined ? task.firstStep : patch.firstStep.trim() || undefined
    if (title === task.title && firstStep === task.firstStep) return
    const now = Date.now()
    await db.tasks.update(id, { title, firstStep, updatedAt: now })
    if (task.fromNextAction && task.projectId && title !== task.title) {
      const p = await db.projects.get(task.projectId)
      if (p && p.nextAction === task.title) {
        await db.projects.update(p.id, { nextAction: title, nextActionChangedAt: now, updatedAt: now })
      }
    }
    await logEvent('task.edited', { refId: id, projectId: task.projectId, data: { title, from: task.title }, at: now })
  })
}

/** Makes an inbox item a project's next action. The old next action, if still open, stays as a project task. */
export async function taskToNextAction(taskId: ID, projectId: ID): Promise<void> {
  await tx(async () => {
    const task = await db.tasks.get(taskId)
    const project = await db.projects.get(projectId)
    if (!task || !project) return
    const now = Date.now()
    if (project.nextAction.trim() && !project.nextActionDone) {
      await db.tasks.add({
        id: uid(),
        title: project.nextAction,
        projectId,
        status: 'inbox',
        slideCount: 0,
        source: 'project',
        createdAt: now,
        updatedAt: now,
      })
    }
    await db.projects.update(projectId, {
      nextAction: task.title,
      nextActionChangedAt: now,
      nextActionDone: undefined,
      updatedAt: now,
    })
    await db.tasks.update(taskId, { status: 'deleted', deletedAt: now, updatedAt: now })
    await logEvent('project.next-action', {
      refId: projectId,
      projectId,
      data: { name: project.name, from: project.nextAction || undefined, to: task.title },
      at: now,
    })
  })
}

/** Turns an inbox item into a parked project idea. */
export async function parkTaskAsProject(taskId: ID, reconsiderDate: LocalDate): Promise<void> {
  await tx(async () => {
    const task = await db.tasks.get(taskId)
    if (!task) return
    await createProject({ name: task.title, status: 'parked', nextAction: '', reconsiderDate })
    const now = Date.now()
    await db.tasks.update(taskId, { status: 'deleted', deletedAt: now, updatedAt: now })
    await logEvent('task.moved', { refId: taskId, data: { title: task.title, status: 'project' }, at: now })
  })
}
