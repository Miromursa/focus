import { toLocalDate } from '../domain/dates'
import { MAX_ACTIVE, validateProject } from '../domain/projects'
import { db } from './db'
import { defaultSettings, logEvent, tx, uid, upsertDay } from './core'
import { RuleError } from './projects'
import type { ID, LocalDate, Locale, Project, Settings, Task } from './types'

export interface SetupProject {
  name: string
  status: 'active' | 'parked' | 'dead'
  nextAction: string
  reconsiderDate?: LocalDate
}

export interface SetupPayload {
  locale: Locale
  projects: SetupProject[]
  routine: { name: string; anchor: string; items: { title: string; tinyVersion?: string }[] }
  schedule: Pick<Settings, 'energyStart' | 'energyEnd' | 'shutdownTime' | 'workdays' | 'reviewWeekday' | 'reviewTime'>
  restActivities: string[]
  accountabilityPerson?: string
  oneThing: { date: LocalDate; projectIndex?: number; title: string; firstStep: string }
}

/** Writes the whole first-run setup in one transaction. Setup counts as the first review. */
export async function completeSetup(p: SetupPayload, startedAt: number): Promise<void> {
  const projects = p.projects.filter((x) => x.name.trim())
  if (projects.filter((x) => x.status === 'active').length > MAX_ACTIVE) throw new RuleError('max-active')
  for (const x of projects) {
    const [problem] = validateProject(x)
    if (problem) throw new RuleError(problem)
  }
  if (!p.oneThing.title.trim() || !p.oneThing.firstStep.trim()) throw new Error('one-thing-required')

  await tx(async () => {
    const now = Date.now()
    const base = (await db.settings.get('settings')) ?? defaultSettings(now)
    const today = toLocalDate(now, base.dayStartHour)
    await db.settings.put({
      ...base,
      ...p.schedule,
      locale: p.locale,
      accountabilityPerson: p.accountabilityPerson?.trim() || undefined,
      onboardedAt: now,
      onboardedDate: today,
      updatedAt: now,
    })

    const ids: ID[] = []
    let order = 1
    for (const x of projects) {
      const proj: Project = {
        id: uid(),
        name: x.name.trim(),
        status: x.status,
        order: order++,
        nextAction: x.nextAction.trim(),
        nextActionChangedAt: x.nextAction.trim() ? now : undefined,
        reconsiderDate: x.status === 'parked' ? x.reconsiderDate : undefined,
        statusChangedAt: now,
        createdAt: now,
        updatedAt: now,
      }
      await db.projects.add(proj)
      ids.push(proj.id)
      await logEvent('project.created', { refId: proj.id, projectId: proj.id, data: { name: proj.name, status: proj.status }, at: now })
    }

    const items = p.routine.items.filter((i) => i.title.trim())
    if (items.length) {
      const routineId = uid()
      await db.routines.add({
        id: routineId,
        name: p.routine.name.trim(),
        anchor: p.routine.anchor.trim(),
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        order: 1,
        createdAt: now,
        updatedAt: now,
      })
      let o = 1
      for (const it of items) {
        await db.routineItems.add({
          id: uid(),
          routineId,
          title: it.title.trim(),
          tinyVersion: it.tinyVersion?.trim() || undefined,
          order: o++,
          active: true,
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    let ro = 1
    for (const title of p.restActivities.map((t) => t.trim()).filter(Boolean)) {
      await db.restActivities.add({ id: uid(), title, order: ro++, createdAt: now, updatedAt: now })
    }

    const idx = p.oneThing.projectIndex
    const source = idx !== undefined ? projects[idx] : undefined
    const projectId = idx !== undefined ? ids[idx] : undefined
    const fromNextAction = !!source && source.nextAction.trim() === p.oneThing.title.trim()
    const task: Task = {
      id: uid(),
      title: p.oneThing.title.trim(),
      projectId,
      fromNextAction: fromNextAction || undefined,
      firstStep: p.oneThing.firstStep.trim(),
      status: 'today',
      slideCount: 0,
      source: 'setup',
      createdAt: now,
      updatedAt: now,
    }
    await db.tasks.add(task)
    const via = fromNextAction ? 'default' : 'manual'
    await upsertDay(p.oneThing.date, { oneThingTaskId: task.id, pickedAt: now, pickedVia: via }, now)
    await logEvent('onething.picked', {
      refId: task.id,
      projectId,
      data: { title: task.title, via, forDate: p.oneThing.date, firstStep: task.firstStep },
      at: now,
    })
    await db.reviews.add({
      id: uid(),
      kind: 'onboarding',
      date: today,
      startedAt,
      completedAt: now,
      decisions: [],
      createdAt: now,
      updatedAt: now,
    })
    await logEvent('setup.done', { data: { minutes: Math.max(1, Math.round((now - startedAt) / 60_000)) }, at: now })
  })
}
