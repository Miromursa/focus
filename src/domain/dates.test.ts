import { describe, expect, it } from 'vitest'
import {
  addDays,
  datesBetween,
  diffDays,
  isPastTime,
  lastWeekdayOnOrBefore,
  nextWorkday,
  pickTargetDate,
  prevWorkday,
  toLocalDate,
  weekdayOf,
} from './dates'

const at = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
const WEEK = [1, 2, 3, 4, 5]

describe('dates', () => {
  it('counts the hours before day start as the previous day', () => {
    expect(toLocalDate(at(2026, 11, 6, 0, 30), 4)).toBe('2026-11-05')
    expect(toLocalDate(at(2026, 11, 6, 4, 0), 4)).toBe('2026-11-06')
    expect(toLocalDate(at(2026, 11, 6, 0, 30), 0)).toBe('2026-11-06')
  })

  it('adds days across month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('diffs dates across a DST change', () => {
    expect(diffDays('2026-11-06', '2026-10-20')).toBe(17)
    expect(diffDays('2026-03-30', '2026-03-28')).toBe(2)
  })

  it('knows weekdays and skips weekends', () => {
    expect(weekdayOf('2026-11-06')).toBe(5) // Friday
    expect(nextWorkday('2026-11-06', WEEK)).toBe('2026-11-09')
    expect(prevWorkday('2026-11-09', WEEK)).toBe('2026-11-06')
    expect(prevWorkday('2026-11-09', [])).toBeUndefined()
  })

  it('treats 00:30 as later than a 23:00 shutdown within the same logical day', () => {
    expect(isPastTime(at(2026, 11, 6, 0, 30), '23:00', 4)).toBe(true)
    expect(isPastTime(at(2026, 11, 6, 22, 0), '23:00', 4)).toBe(false)
    expect(isPastTime(at(2026, 11, 6, 17, 30), '17:30', 4)).toBe(true)
  })

  it('finds the last review day', () => {
    expect(lastWeekdayOnOrBefore('2026-11-06', 0)).toBe('2026-11-01')
    expect(lastWeekdayOnOrBefore('2026-11-08', 0)).toBe('2026-11-08')
  })

  it('picks today before shutdown time on a workday, otherwise the next workday', () => {
    const s = { workdays: WEEK, shutdownTime: '17:30', dayStartHour: 4 }
    expect(pickTargetDate(at(2026, 11, 6, 9), s)).toBe('2026-11-06')
    expect(pickTargetDate(at(2026, 11, 6, 18), s)).toBe('2026-11-09')
    expect(pickTargetDate(at(2026, 11, 7, 10), s)).toBe('2026-11-09')
  })

  it('lists dates inclusively', () => {
    expect(datesBetween('2026-11-05', '2026-11-07')).toEqual(['2026-11-05', '2026-11-06', '2026-11-07'])
    expect(datesBetween('2026-11-07', '2026-11-05')).toEqual([])
  })
})
