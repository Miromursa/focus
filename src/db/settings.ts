import { db } from './db'
import { defaultSettings, logEvent, tx, uid } from './core'
import { addOverride } from './reviews'
import type { ID, Settings } from './types'

export type SettingsPatch = Partial<Omit<Settings, 'id' | 'createdAt' | 'updatedAt' | 'onboardedAt' | 'onboardedDate'>>

export async function updateSettings(patch: SettingsPatch): Promise<void> {
  await tx(async () => {
    const now = Date.now()
    const cur = (await db.settings.get('settings')) ?? defaultSettings(now)
    const keys = (Object.keys(patch) as (keyof SettingsPatch)[]).filter(
      (k) => JSON.stringify(patch[k]) !== JSON.stringify(cur[k]),
    )
    if (!keys.length) return
    await db.settings.put({ ...cur, ...patch, updatedAt: now })
    await logEvent('settings.changed', { data: { keys: keys.join(',') }, at: now })
  })
}

/** Outside a weekly review, gates can only be turned off with a logged reason. */
export async function turnGatesOff(reason: string): Promise<void> {
  await tx(async () => {
    await addOverride('settings:gates-off', reason)
    await updateSettings({ gatesEnabled: false })
  })
}

export async function addRestActivity(title: string): Promise<void> {
  const t = title.trim()
  if (!t) return
  await tx(async () => {
    const now = Date.now()
    const order = (await db.restActivities.toArray()).reduce((m, r) => Math.max(m, r.order), 0) + 1
    await db.restActivities.add({ id: uid(), title: t, order, createdAt: now, updatedAt: now })
    await logEvent('settings.changed', { data: { keys: 'rest.added', name: t }, at: now })
  })
}

export async function deleteRestActivity(id: ID): Promise<void> {
  await tx(async () => {
    const now = Date.now()
    const r = await db.restActivities.get(id)
    await db.restActivities.update(id, { deletedAt: now, updatedAt: now })
    await logEvent('settings.changed', { data: { keys: 'rest.removed', name: r?.title }, at: now })
  })
}
