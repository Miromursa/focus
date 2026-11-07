import { z } from 'zod'
import { db, TABLE_NAMES, type TableName } from './db'
import { logEvent, tx } from './core'

export const BACKUP_VERSION = 1

const withId = z.array(z.looseObject({ id: z.string() }))

const backupSchema = z.object({
  app: z.literal('focus'),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.number(),
  tables: z.object({
    settings: z.array(z.looseObject({ id: z.literal('settings') })),
    projects: withId,
    tasks: withId,
    days: z.array(z.looseObject({ date: z.string() })),
    routines: withId,
    routineItems: withId,
    routineLogs: withId,
    sessions: withId,
    reviews: withId,
    overrides: withId,
    restActivities: withId,
    events: withId,
  }),
})

export type BackupFile = {
  app: 'focus'
  version: typeof BACKUP_VERSION
  exportedAt: number
  tables: Record<TableName, unknown[]>
}

/** Everything on this device, as one JSON-serializable object. */
export async function exportBackup(): Promise<BackupFile> {
  return tx(async () => {
    const now = Date.now()
    const tables = {} as Record<TableName, unknown[]>
    for (const name of TABLE_NAMES) tables[name] = await db.table(name).toArray()
    await db.settings.update('settings', { lastBackupAt: now, updatedAt: now })
    await logEvent('data.exported', { at: now })
    return { app: 'focus', version: BACKUP_VERSION, exportedAt: now, tables }
  })
}

/** Replaces all data on this device with a backup. Throws if the file isn't a FOCUS backup. */
export async function importBackup(raw: unknown): Promise<number> {
  const file = backupSchema.parse(raw)
  return tx(async () => {
    let count = 0
    for (const name of TABLE_NAMES) await db.table(name).clear()
    for (const name of TABLE_NAMES) {
      const rows = file.tables[name]
      await db.table(name).bulkAdd(rows)
      count += rows.length
    }
    await logEvent('data.imported', { data: { exportedAt: file.exportedAt, records: count } })
    return count
  })
}

/** Deletes the whole local database. The caller should reload the page afterwards. */
export async function deleteEverything(): Promise<void> {
  await db.delete()
}
