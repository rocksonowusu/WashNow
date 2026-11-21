import { describe, expect, it } from 'vitest'
import {
  bucketKey,
  buckets,
  comparedWith,
  elapsedSpan,
  isoRange,
  percentChange,
  periodSpan,
  previousSpan,
  shiftAnchor,
  spanLabel,
} from './periods.ts'

describe('periods', () => {
  it('starts weeks on Monday', () => {
    // 20 Nov 2026 is a Friday.
    expect(periodSpan('week', '2026-11-20')).toEqual({ first: '2026-11-16', last: '2026-11-22' })
    expect(periodSpan('week', '2026-11-16')).toEqual({ first: '2026-11-16', last: '2026-11-22' })
    expect(periodSpan('week', '2026-11-22')).toEqual({ first: '2026-11-16', last: '2026-11-22' })
  })

  it('knows how long each month is', () => {
    expect(periodSpan('month', '2026-02-10')).toEqual({ first: '2026-02-01', last: '2026-02-28' })
    expect(periodSpan('month', '2028-02-10')).toEqual({ first: '2028-02-01', last: '2028-02-29' })
    expect(periodSpan('year', '2026-11-20')).toEqual({ first: '2026-01-01', last: '2026-12-31' })
  })

  it('stops a current period at today', () => {
    expect(elapsedSpan('month', '2026-11-20', '2026-11-20')).toEqual({ first: '2026-11-01', last: '2026-11-20' })
    expect(elapsedSpan('month', '2026-10-05', '2026-11-20')).toEqual({ first: '2026-10-01', last: '2026-10-31' })
  })

  it('compares with the same stretch of the period before', () => {
    expect(previousSpan('day', { first: '2026-11-01', last: '2026-11-01' })).toEqual({ first: '2026-10-31', last: '2026-10-31' })
    expect(previousSpan('week', { first: '2026-11-16', last: '2026-11-19' })).toEqual({ first: '2026-11-09', last: '2026-11-12' })
    expect(previousSpan('month', { first: '2026-11-01', last: '2026-11-20' })).toEqual({ first: '2026-10-01', last: '2026-10-20' })
    // March 31 has no match in February: use February's last day.
    expect(previousSpan('month', { first: '2026-03-01', last: '2026-03-31' })).toEqual({ first: '2026-02-01', last: '2026-02-28' })
    expect(previousSpan('year', { first: '2028-01-01', last: '2028-02-29' })).toEqual({ first: '2027-01-01', last: '2027-02-28' })
  })

  it('steps one period at a time', () => {
    expect(shiftAnchor('day', '2026-11-01', -1)).toBe('2026-10-31')
    expect(shiftAnchor('week', '2026-11-20', -1)).toBe('2026-11-13')
    expect(shiftAnchor('month', '2026-03-31', -1)).toBe('2026-02-01')
    expect(shiftAnchor('month', '2026-12-15', 1)).toBe('2027-01-01')
    expect(shiftAnchor('year', '2026-11-20', -1)).toBe('2025-01-01')
  })

  it('gives the ISO range the device database is queried with', () => {
    expect(isoRange({ first: '2026-11-16', last: '2026-11-22' })).toEqual({ start: '2026-11-16T00:00:00', end: '2026-11-23T00:00:00' })
  })

  it('makes one bar per hour, day or month', () => {
    expect(buckets('day', '2026-11-20')).toHaveLength(24)
    expect(buckets('week', '2026-11-20').map((bucket) => bucket.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(buckets('month', '2026-11-20')).toHaveLength(30)
    expect(buckets('year', '2026-11-20')[10]).toEqual({ key: '2026-11', label: 'Nov' })
  })

  it('puts a sale in the right bar', () => {
    const soldAt = '2026-11-20T14:05:00.000Z'
    expect(bucketKey('day', soldAt)).toBe('14')
    expect(bucketKey('week', soldAt)).toBe('2026-11-20')
    expect(bucketKey('year', soldAt)).toBe('2026-11')
  })

  it('labels periods for people', () => {
    expect(spanLabel('week', '2026-11-20')).toBe('16 – 22 Nov 2026')
    expect(spanLabel('week', '2026-12-02')).toBe('30 Nov – 6 Dec 2026')
    expect(spanLabel('week', '2026-12-30')).toBe('28 Dec 2026 – 3 Jan 2027')
    expect(spanLabel('month', '2026-11-20')).toBe('November 2026')
    expect(spanLabel('year', '2026-11-20')).toBe('2026')
    expect(comparedWith('day', '2026-11-20', '2026-11-20')).toBe('yesterday')
    expect(comparedWith('day', '2026-11-18', '2026-11-20')).toBe('the day before')
  })

  it('has no percentage when there is nothing to compare with', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(50, 100)).toBe(-50)
    expect(percentChange(50, 0)).toBeNull()
  })
})
