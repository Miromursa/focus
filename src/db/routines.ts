import { logKey } from '../domain/routines'
import { db } from './db'
import { logEvent, tx, uid } from './core'
import type { ID, LocalDate, RoutineMark } from './types'

export async function saveRoutine(input: { id?: ID; name: string; anchor: string; weekdays: number[] }): Promise<ID> {
  return tx(async () => {
    const now = Date.now()
    const fields = { name: input.name.trim(), anchor: input.anchor.trim(), weekdays: [...input.weekdays].sort() }
    if (input.id) {
      await db.routines.update(input.id, { ...fields, updatedAt: now })
      await logEvent('settings.changed', { refId: input.id, data: { keys: 'routine', name: fields.name }, at: now })
      return input.id
    }
    const order = (await db.routines.toArray()).reduce((m, r) => Math.max(m, r.order), 0) + 1
    const id = uid()
    await db.routines.add({ id, ...fields, order, createdAt: now, updatedAt: now })
    await logEvent('settings.changed', { refId: id, data: { keys: 'routine.added', name: fields.name }, at: now })
    return id
  })
}

export async function deleteRoutine(id: ID): Promise<void> {
  await tx(async () => {
    const now = Date.now()
    const r = await db.routines.get(id)
    await db.routines.update(id, { deletedAt: now, updatedAt: now })
    const items = await db.routineItems.where('routineId').equals(id).toArray()
    for (const it of items) await db.routineItems.update(it.id, { active: false, deletedAt: now, updatedAt: now })
    await logEvent('settings.changed', { refId: id, data: { keys: 'routine.removed', name: r?.name }, at: now })
  })
}

export async function saveRoutineItem(input: { id?: ID; routineId: ID; title: string; tinyVersion?: string }): Promise<ID> {
  return tx(async () => {
    const now = Date.now()
    const fields = { title: input.title.trim(), tinyVersion: input.tinyVersion?.trim() || undefined }
    if (input.id) {
      await db.routineItems.update(input.id, { ...fields, updatedAt: now })
      await logEvent('settings.changed', { refId: input.id, data: { keys: 'routine.item', name: fields.title }, at: now })
      return input.id
    }
    const siblings = await db.routineItems.where('routineId').equals(input.routineId).toArray()
    const order = siblings.reduce((m, r) => Math.max(m, r.order), 0) + 1
    const id = uid()
    await db.routineItems.add({ id, routineId: input.routineId, ...fields, order, active: true, createdAt: now, updatedAt: now })
    await logEvent('settings.changed', { refId: id, data: { keys: 'routine.item.added', name: fields.title }, at: now })
    return id
  })
}

export async function deleteRoutineItem(id: ID): Promise<void> {
  await tx(async () => {
    const now = Date.now()
    const it = await db.routineItems.get(id)
    await db.routineItems.update(id, { active: false, deletedAt: now, updatedAt: now })
    await logEvent('settings.changed', { refId: id, data: { keys: 'routine.item.removed', name: it?.title }, at: now })
  })
}

export async function moveRoutineItem(id: ID, dir: -1 | 1): Promise<void> {
  await tx(async () => {
    const item = await db.routineItems.get(id)
    if (!item) return
    const list = (await db.routineItems.where('routineId').equals(item.routineId).toArray())
      .filter((i) => i.active && !i.deletedAt)
      .sort((a, b) => a.order - b.order)
    const i = list.findIndex((x) => x.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    const now = Date.now()
    await db.routineItems.update(list[i].id, { order: list[j].order, updatedAt: now })
    await db.routineItems.update(list[j].id, { order: list[i].order, updatedAt: now })
  })
}

/** Marks a routine item done or tiny for a date (any date, so a forgotten tick can be fixed), or clears it. */
export async function setRoutineMark(date: LocalDate, itemId: ID, mark: RoutineMark | null): Promise<void> {
  await tx(async () => {
    const item = await db.routineItems.get(itemId)
    if (!item) return
    const id = logKey(date, itemId)
    const existing = await db.routineLogs.get(id)
    const now = Date.now()
    if (mark === null) {
      if (!existing || existing.deletedAt) return
      await db.routineLogs.update(id, { deletedAt: now, updatedAt: now })
      await logEvent('routine.unmarked', { refId: itemId, data: { title: item.title, forDate: date }, at: now })
      return
    }
    await db.routineLogs.put({
      id,
      date,
      routineItemId: itemId,
      mark,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    await logEvent('routine.marked', { refId: itemId, data: { title: item.title, mark, forDate: date }, at: now })
  })
}
