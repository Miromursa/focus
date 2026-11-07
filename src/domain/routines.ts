import type { LocalDate, Routine, RoutineItem } from '../db/types'
import { addDays, weekdayOf } from './dates'

export const logKey = (date: LocalDate, itemId: string): string => `${date}|${itemId}`

export function routinesOn(date: LocalDate, routines: readonly Routine[]): Routine[] {
  const wd = weekdayOf(date)
  return routines.filter((r) => !r.deletedAt && r.weekdays.includes(wd)).sort((a, b) => a.order - b.order)
}

export function itemsOf(routineId: string, items: readonly RoutineItem[]): RoutineItem[] {
  return items
    .filter((i) => i.routineId === routineId && i.active && !i.deletedAt)
    .sort((a, b) => a.order - b.order)
}

/**
 * Consecutive scheduled days right before `today` on which the item has no mark (0, 1 or 2).
 * Days before `since` (setup, or when the item was added) don't count.
 */
export function missedInARow(
  itemId: string,
  routine: Pick<Routine, 'weekdays'>,
  marked: ReadonlySet<string>,
  today: LocalDate,
  since: LocalDate,
): number {
  let missed = 0
  let d = today
  for (let i = 0; i < 14 && missed < 2; i++) {
    d = addDays(d, -1)
    if (d < since) break
    if (!routine.weekdays.includes(weekdayOf(d))) continue
    if (marked.has(logKey(d, itemId))) break
    missed++
  }
  return missed
}
