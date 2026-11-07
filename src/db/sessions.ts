import { db } from './db'
import { dateOf, logEvent, tx, uid } from './core'
import type { FocusSession, ID, SessionKind } from './types'

const plannedEnd = (s: Pick<FocusSession, 'startedAt' | 'plannedMin'>) => s.startedAt + s.plannedMin * 60_000

async function finish(s: FocusSession, at: number, early: boolean): Promise<void> {
  const endedAt = early ? Math.min(at, plannedEnd(s)) : plannedEnd(s)
  await db.sessions.update(s.id, { endedAt, endedEarly: early || undefined, updatedAt: at })
  await logEvent('focus.ended', {
    refId: s.id,
    projectId: s.projectId,
    data: { title: s.title, minutes: Math.round((endedAt - s.startedAt) / 60_000), early: early || undefined },
    at: endedAt,
  })
}

export async function runningSessions(): Promise<FocusSession[]> {
  return db.sessions.filter((s) => !s.endedAt && !s.deletedAt).toArray()
}

/** Starts a focus session. A session that's still running ends first. */
export async function startSession(input: {
  taskId?: ID
  projectId?: ID
  title: string
  plannedMin?: number
  kind: SessionKind
}): Promise<FocusSession> {
  return tx(async () => {
    const now = Date.now()
    for (const s of await runningSessions()) await finish(s, now, true)
    const s: FocusSession = {
      id: uid(),
      taskId: input.taskId,
      projectId: input.projectId,
      title: input.title,
      date: await dateOf(now),
      startedAt: now,
      plannedMin: input.plannedMin ?? 10,
      kind: input.kind,
      createdAt: now,
      updatedAt: now,
    }
    await db.sessions.add(s)
    await logEvent('focus.started', {
      refId: s.id,
      projectId: s.projectId,
      data: { title: s.title, minutes: s.plannedMin, kind: s.kind },
      at: now,
    })
    return s
  })
}

export async function extendSession(id: ID, addMin = 10): Promise<void> {
  await tx(async () => {
    const s = await db.sessions.get(id)
    if (!s || s.endedAt) return
    const now = Date.now()
    await db.sessions.update(id, { plannedMin: s.plannedMin + addMin, updatedAt: now })
    await logEvent('focus.extended', { refId: id, projectId: s.projectId, data: { title: s.title, minutes: addMin }, at: now })
  })
}

/** Ends a session. Stopping early records the real minutes; otherwise the planned end counts. */
export async function endSession(id: ID, early: boolean): Promise<void> {
  await tx(async () => {
    const s = await db.sessions.get(id)
    if (!s || s.endedAt) return
    await finish(s, Date.now(), early)
  })
}

/** Closes sessions whose time ran out while the app was closed, at their planned end. */
export async function settleExpiredSessions(now = Date.now()): Promise<FocusSession[]> {
  return tx(async () => {
    const expired = (await runningSessions()).filter((s) => plannedEnd(s) <= now)
    for (const s of expired) await finish(s, now, false)
    return expired
  })
}
