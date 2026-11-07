import type { Day, LocalDate, Settings } from '../db/types'
import { addDays, diffDays, isWorkday, lastWeekdayOnOrBefore, prevWorkday, toLocalDate } from './dates'

export type GateKind = 'setup' | 'restart' | 'review' | 'checkin' | 'none'

export interface Gate {
  kind: GateKind
  reason?: 'shutdown-gap' | 'review-gap'
  dueDate?: LocalDate
  missedDate?: LocalDate
}

export type GateSettings = Pick<
  Settings,
  'onboardedAt' | 'onboardedDate' | 'gatesEnabled' | 'workdays' | 'dayStartHour' | 'reviewWeekday'
>

export interface GateInput {
  now: number
  settings: GateSettings | null | undefined
  /** Recent days (at least the last two weeks). */
  days: readonly Pick<Day, 'date' | 'shutdownAt' | 'checkinAt'>[]
  /** Date of the most recent completed review of any kind (weekly, restart, onboarding). */
  lastReviewDate?: LocalDate
  /** A gate override was logged today, which snoozes gates until the next day starts. */
  overriddenToday: boolean
}

/** Workdays without a shutdown or check-in before the restart flow takes over. */
export const RESTART_AFTER_DAYS = 3
/** A weekly review this many days before review day still counts for it. */
export const REVIEW_EARLY_DAYS = 2

export interface ReviewStatus {
  due?: LocalDate
  satisfied: boolean
  overdueDays: number
}

export function reviewStatus(
  today: LocalDate,
  s: Pick<Settings, 'reviewWeekday' | 'onboardedDate'>,
  lastReviewDate?: LocalDate,
): ReviewStatus {
  const due = lastWeekdayOnOrBefore(today, s.reviewWeekday)
  // Setup counts as the first review, so review days on or before it don't count.
  if (!s.onboardedDate || due <= s.onboardedDate) return { satisfied: true, overdueDays: 0 }
  const satisfied = !!lastReviewDate && lastReviewDate >= addDays(due, -REVIEW_EARLY_DAYS)
  return { due, satisfied, overdueDays: satisfied ? 0 : diffDays(today, due) }
}

/**
 * Decides which ritual, if any, must happen before the rest of the app opens.
 * Order: setup → restart → weekly review → morning check-in → none.
 * Days on or before the onboarding date never trigger a gate.
 */
export function computeGate(i: GateInput): Gate {
  const s = i.settings
  if (!s?.onboardedAt || !s.onboardedDate) return { kind: 'setup' }
  if (!s.gatesEnabled || i.overriddenToday) return { kind: 'none' }

  const today = toLocalDate(i.now, s.dayStartHour)
  const onboard = s.onboardedDate
  if (i.lastReviewDate === today) return { kind: 'none' }

  const byDate = new Map(i.days.map((d) => [d.date, d]))
  const touched = (d: LocalDate) =>
    !!byDate.get(d)?.shutdownAt || !!byDate.get(d)?.checkinAt || i.lastReviewDate === d

  const recent: LocalDate[] = []
  let cursor = today
  while (recent.length < RESTART_AFTER_DAYS) {
    const p = prevWorkday(cursor, s.workdays)
    if (!p || p <= onboard) break
    recent.push(p)
    cursor = p
  }
  const shutdownGap = recent.length === RESTART_AFTER_DAYS && recent.every((d) => !touched(d))
  const review = reviewStatus(today, s, i.lastReviewDate)

  if (shutdownGap || review.overdueDays >= RESTART_AFTER_DAYS) {
    return { kind: 'restart', reason: shutdownGap ? 'shutdown-gap' : 'review-gap' }
  }
  if (review.overdueDays >= 1) return { kind: 'review', dueDate: review.due }

  if (isWorkday(today, s.workdays)) {
    const prev = prevWorkday(today, s.workdays)
    if (prev && prev > onboard && !byDate.get(prev)?.shutdownAt && !byDate.get(today)?.checkinAt) {
      return { kind: 'checkin', missedDate: prev }
    }
  }
  return { kind: 'none' }
}
