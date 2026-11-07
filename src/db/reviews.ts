import type { PeriodFacts } from '../domain/facts'
import { db } from './db'
import { dateOf, logEvent, tx, uid, upsertDay } from './core'
import type { OverrideRule, ProjectDecision, ReviewKind } from './types'

export async function completeReview(input: {
  kind: ReviewKind
  startedAt: number
  decisions?: ProjectDecision[]
  facts?: PeriodFacts
  /** Gates may only be turned off here (or with a logged reason). */
  gatesEnabled?: boolean
}): Promise<void> {
  await tx(async () => {
    const now = Date.now()
    const date = await dateOf(now)
    const id = uid()
    await db.reviews.add({
      id,
      kind: input.kind,
      date,
      startedAt: input.startedAt,
      completedAt: now,
      decisions: input.decisions ?? [],
      facts: input.facts,
      createdAt: now,
      updatedAt: now,
    })
    if (input.kind === 'restart') await upsertDay(date, { checkinAt: now }, now)
    if (input.gatesEnabled !== undefined) {
      const s = await db.settings.get('settings')
      if (s && s.gatesEnabled !== input.gatesEnabled) {
        await db.settings.update('settings', { gatesEnabled: input.gatesEnabled, updatedAt: now })
        await logEvent('settings.changed', { data: { keys: 'gatesEnabled', gatesEnabled: input.gatesEnabled }, at: now })
      }
    }
    await logEvent('review.done', {
      refId: id,
      data: { kind: input.kind, minutes: Math.max(1, Math.round((now - input.startedAt) / 60_000)) },
      at: now,
    })
  })
}

/** Logs a typed reason for getting past a rule. Shown at the weekly review. */
export async function addOverride(rule: OverrideRule, reason: string): Promise<void> {
  const r = reason.trim()
  if (!r) throw new Error('reason-required')
  await tx(async () => {
    const now = Date.now()
    await db.overrides.add({ id: uid(), date: await dateOf(now), at: now, rule, reason: r, createdAt: now, updatedAt: now })
    await logEvent('override', { data: { rule, reason: r }, at: now })
  })
}
