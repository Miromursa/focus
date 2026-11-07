import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../db/db'
import type { Settings } from '../db/types'
import { addDays, toLocalDate } from '../domain/dates'
import { computeGate, type Gate } from '../domain/gates'

/** undefined while loading, null before setup. */
export function useSettings(): Settings | null | undefined {
  return useLiveQuery(async () => (await db.settings.get('settings')) ?? null, [])
}

/** The current time, refreshed every `intervalMs` and whenever the app comes back into view. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = window.setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [intervalMs])
  return now
}

/** Which ritual gate (if any) applies right now. undefined while loading. */
export function useGate(settings: Settings | null | undefined, now: number): Gate | undefined {
  const today = settings ? toLocalDate(now, settings.dayStartHour) : undefined
  const data = useLiveQuery(async () => {
    if (!today) return null
    const [days, last, overrides] = await Promise.all([
      db.days.where('date').between(addDays(today, -14), today, true, true).toArray(),
      db.reviews.orderBy('completedAt').last(),
      db.overrides.where('date').equals(today).toArray(),
    ])
    return {
      days,
      lastReviewDate: last?.date,
      overriddenToday: overrides.some((o) => o.rule.startsWith('gate:') && !o.deletedAt),
    }
  }, [today])
  if (settings === undefined || data === undefined) return undefined
  return computeGate({
    now,
    settings,
    days: data?.days ?? [],
    lastReviewDate: data?.lastReviewDate,
    overriddenToday: data?.overriddenToday ?? false,
  })
}
