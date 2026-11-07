import { describe, expect, it } from 'vitest'
import { computeGate, type GateInput, type GateSettings } from './gates'

const at = (d: number, h = 9) => new Date(2026, 10, d, h, 0).getTime() // November 2026
// 2026-11-02 is a Monday. Review day is Sunday (0).
const settings: GateSettings = {
  onboardedAt: at(2),
  onboardedDate: '2026-11-02',
  gatesEnabled: true,
  workdays: [1, 2, 3, 4, 5],
  dayStartHour: 4,
  reviewWeekday: 0,
}
const shut = (...dates: string[]) => dates.map((date) => ({ date, shutdownAt: 1 }))

function gate(partial: Partial<GateInput>) {
  return computeGate({ now: at(4), settings, days: [], overriddenToday: false, ...partial })
}

describe('computeGate', () => {
  it('asks for setup until onboarding is finished', () => {
    expect(gate({ settings: null }).kind).toBe('setup')
    expect(gate({ settings: { ...settings, onboardedAt: undefined } }).kind).toBe('setup')
  })

  it('ignores the onboarding day itself', () => {
    expect(gate({ now: at(3) }).kind).toBe('none')
  })

  it('opens the morning check-in when the previous workday had no shutdown', () => {
    expect(gate({ now: at(4) })).toEqual({ kind: 'checkin', missedDate: '2026-11-03' })
    expect(gate({ now: at(4), days: shut('2026-11-03') }).kind).toBe('none')
    expect(gate({ now: at(4), days: [{ date: '2026-11-04', checkinAt: 1 }] }).kind).toBe('none')
  })

  it('does not gate days off', () => {
    expect(gate({ now: at(7), days: shut('2026-11-04', '2026-11-05') }).kind).toBe('none')
  })

  it('checks Friday from Monday', () => {
    const days = shut('2026-11-04', '2026-11-05')
    expect(gate({ now: at(9), days, lastReviewDate: '2026-11-08' })).toEqual({ kind: 'checkin', missedDate: '2026-11-06' })
  })

  it('restarts after three workdays without a shutdown or check-in', () => {
    expect(gate({ now: at(6) })).toEqual({ kind: 'restart', reason: 'shutdown-gap' })
    expect(gate({ now: at(6), days: [{ date: '2026-11-04', checkinAt: 1 }] }).kind).toBe('checkin')
  })

  it('gates the weekly review the day after review day', () => {
    const days = shut('2026-11-04', '2026-11-05', '2026-11-06')
    expect(gate({ now: at(8), days }).kind).toBe('none') // review day itself: card, not a gate
    expect(gate({ now: at(9), days })).toEqual({ kind: 'review', dueDate: '2026-11-08' })
  })

  it('counts a review done up to two days early', () => {
    const days = shut('2026-11-04', '2026-11-05', '2026-11-06')
    expect(gate({ now: at(9), days, lastReviewDate: '2026-11-06' }).kind).toBe('none')
    expect(gate({ now: at(9), days, lastReviewDate: '2026-11-05' }).kind).toBe('review')
  })

  it('restarts when the review is three or more days overdue', () => {
    const days = shut('2026-11-06', '2026-11-09', '2026-11-10')
    expect(gate({ now: at(11), days })).toEqual({ kind: 'restart', reason: 'review-gap' })
  })

  it('lets a review or restart done today clear every gate', () => {
    expect(gate({ now: at(6), lastReviewDate: '2026-11-06' }).kind).toBe('none')
  })

  it('stays out of the way when overridden today or switched off', () => {
    expect(gate({ now: at(6), overriddenToday: true }).kind).toBe('none')
    expect(gate({ now: at(6), settings: { ...settings, gatesEnabled: false } }).kind).toBe('none')
  })

  it('uses the logical day: 01:00 still belongs to yesterday', () => {
    // 01:00 on Thursday is still Wednesday; Wednesday's gate looks at Tuesday.
    expect(gate({ now: new Date(2026, 10, 5, 1).getTime(), days: shut('2026-11-03') }).kind).toBe('none')
  })
})
