import { activeProjects, validateProject, wouldExceedActive, type ProjectProblem, type ProjectShape } from '../domain/projects'
import { db } from './db'
import { logEvent, tx, uid } from './core'
import type { ID, LocalDate, Project, ProjectStatus } from './types'

export interface ProjectInput {
  name: string
  status: ProjectStatus
  nextAction: string
  goal?: string
  deadline?: LocalDate
  accountabilityPerson?: string
  reconsiderDate?: LocalDate
  obstacle?: string
  ifThenPlan?: string
}

/** Thrown when a change would break a project rule (max 3 Active, next action required, ...). */
export class RuleError extends Error {
  readonly code: ProjectProblem
  constructor(code: ProjectProblem) {
    super(code)
    this.name = 'RuleError'
    this.code = code
  }
}

/** Which Active project to park, and until when, so another one can become Active. */
export interface MakeRoom {
  parkId: ID
  reconsiderDate: LocalDate
}

const OPTIONAL = ['goal', 'deadline', 'accountabilityPerson', 'reconsiderDate', 'obstacle', 'ifThenPlan'] as const

function normalize<T extends Partial<ProjectInput>>(patch: T): T {
  const out: Partial<ProjectInput> = { ...patch }
  if (out.name !== undefined) out.name = out.name.trim()
  if (out.nextAction !== undefined) out.nextAction = out.nextAction.trim()
  for (const k of OPTIONAL) {
    if (k in out) {
      const v = out[k]
      out[k] = typeof v === 'string' && v.trim() ? v.trim() : undefined
    }
  }
  return out as T
}

function assertValid(p: ProjectShape): void {
  const [problem] = validateProject(p)
  if (problem) throw new RuleError(problem)
}

async function makeRoom(room: MakeRoom | undefined, forId: ID | undefined, now: number): Promise<void> {
  const all = await db.projects.toArray()
  if (!wouldExceedActive(all, forId)) return
  const target = room && all.find((p) => p.id === room.parkId && p.status === 'active' && !p.deletedAt)
  if (!room || !target) throw new RuleError('max-active')
  if (!room.reconsiderDate) throw new RuleError('reconsider-date-required')
  await db.projects.update(target.id, {
    status: 'parked',
    reconsiderDate: room.reconsiderDate,
    statusChangedAt: now,
    updatedAt: now,
  })
  await logEvent('project.status', {
    refId: target.id,
    projectId: target.id,
    data: { name: target.name, from: 'active', to: 'parked', reconsiderDate: room.reconsiderDate },
    at: now,
  })
}

async function nextOrder(): Promise<number> {
  const all = await db.projects.toArray()
  return all.reduce((m, p) => Math.max(m, p.order), 0) + 1
}

export async function createProject(input: ProjectInput, room?: MakeRoom): Promise<Project> {
  const n = normalize(input)
  assertValid(n)
  return tx(async () => {
    const now = Date.now()
    if (n.status === 'active') await makeRoom(room, undefined, now)
    const p: Project = {
      ...n,
      id: uid(),
      order: await nextOrder(),
      statusChangedAt: now,
      nextActionChangedAt: n.nextAction ? now : undefined,
      createdAt: now,
      updatedAt: now,
    }
    await db.projects.add(p)
    await logEvent('project.created', { refId: p.id, projectId: p.id, data: { name: p.name, status: p.status }, at: now })
    return p
  })
}

export async function updateProject(id: ID, patch: Partial<ProjectInput>, room?: MakeRoom): Promise<void> {
  const n = normalize(patch)
  await tx(async () => {
    const cur = await db.projects.get(id)
    if (!cur) return
    const now = Date.now()
    const merged = { ...cur, ...n }
    assertValid(merged)
    const changes: Partial<Project> = { ...n, updatedAt: now }

    if (n.status && n.status !== cur.status) {
      if (n.status === 'active') {
        await makeRoom(room, id, now)
        changes.order = await nextOrder()
      }
      changes.statusChangedAt = now
      await logEvent('project.status', {
        refId: id,
        projectId: id,
        data: {
          name: merged.name,
          from: cur.status,
          to: n.status,
          reconsiderDate: n.status === 'parked' ? merged.reconsiderDate : undefined,
        },
        at: now,
      })
    }

    if (n.nextAction !== undefined && (n.nextAction !== cur.nextAction || cur.nextActionDone)) {
      changes.nextActionChangedAt = now
      changes.nextActionDone = undefined
      await logEvent('project.next-action', {
        refId: id,
        projectId: id,
        data: { name: merged.name, from: cur.nextAction || undefined, to: n.nextAction || undefined },
        at: now,
      })
    }

    const edited = (['name', ...OPTIONAL] as const).filter((k) => k in n && n[k] !== cur[k])
    if (edited.length) {
      await logEvent('project.edited', {
        refId: id,
        projectId: id,
        data: { name: merged.name, fields: edited.join(',') },
        at: now,
      })
    }
    await db.projects.update(id, changes)
  })
}

/** Moves an Active project up or down. The top one supplies the default One Thing. */
export async function moveProject(id: ID, dir: -1 | 1): Promise<void> {
  await tx(async () => {
    const list = activeProjects(await db.projects.toArray())
    const i = list.findIndex((p) => p.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    const now = Date.now()
    const a = list[i]
    const b = list[j]
    await db.projects.update(a.id, { order: b.order, updatedAt: now })
    await db.projects.update(b.id, { order: a.order, updatedAt: now })
    await logEvent('project.reordered', { refId: a.id, projectId: a.id, data: { name: a.name, position: j + 1 }, at: now })
  })
}
