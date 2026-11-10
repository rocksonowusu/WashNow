import { describe, expect, it } from 'vitest'
import { nextDelay, SYNC_INTERVAL_MS } from '../sync/SyncService.ts'
import { formatMoney, normalisePlate, parseMoney, todayRange } from './format.ts'
import { hashPin, verifyPin } from './pin.ts'
import { uuidv7 } from './uuid.ts'

describe('uuidv7', () => {
  it('makes a version 7 UUID', () => {
    expect(uuidv7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('sorts in the order ids were made', () => {
    const earlier = uuidv7(Date.parse('2026-11-10T09:00:00Z'))
    const later = uuidv7(Date.parse('2026-11-10T09:00:01Z'))

    expect(earlier < later).toBe(true)
  })

  it('never repeats', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => uuidv7()))

    expect(ids.size).toBe(2000)
  })
})

describe('PIN hashing', () => {
  it('accepts the right PIN and refuses a wrong one', async () => {
    const { salt, hash } = await hashPin('4821')

    expect(await verifyPin('4821', salt, hash)).toBe(true)
    expect(await verifyPin('4822', salt, hash)).toBe(false)
  })

  it('never stores the PIN itself and salts every hash', async () => {
    const first = await hashPin('4821')
    const second = await hashPin('4821')

    expect(first.hash).not.toContain('4821')
    expect(first.hash).not.toBe(second.hash)
  })
})

describe('money', () => {
  it('shows pesewas as cedis', () => {
    expect(formatMoney(1500)).toBe('GH₵15.00')
    expect(formatMoney(123456)).toBe('GH₵1,234.56')
  })

  it('reads what a cashier types into pesewas', () => {
    expect(parseMoney('35')).toBe(3500)
    expect(parseMoney('35.5')).toBe(3550)
    expect(parseMoney(' 1,200.75 ')).toBe(120075)
    expect(parseMoney('19.99')).toBe(1999)
  })

  it('refuses anything that is not a positive amount', () => {
    for (const bad of ['', 'abc', '-5', '0', '3.999', '1.2.3']) {
      expect(parseMoney(bad)).toBeNull()
    }
  })
})

describe('plates and dates', () => {
  it('stores a plate the same way however it is typed', () => {
    expect(normalisePlate('gr 1234-21')).toBe('GR123421')
    expect(normalisePlate('GR-1234 21')).toBe('GR123421')
    expect(normalisePlate('  ')).toBeNull()
    expect(normalisePlate(null)).toBeNull()
  })

  it('brackets the bay’s day so server and device timestamps both fall inside', () => {
    const { start, end } = todayRange(new Date('2026-11-10T14:30:00Z'))

    for (const inside of ['2026-11-10T00:00:00.000Z', '2026-11-10T13:49:20.000000Z', '2026-11-10T23:59:59.999Z']) {
      expect(inside >= start && inside < end).toBe(true)
    }
    for (const outside of ['2026-11-09T23:59:59.999Z', '2026-11-11T00:00:00.000000Z']) {
      expect(outside >= start && outside < end).toBe(false)
    }
  })
})

describe('sync back-off', () => {
  it('syncs every 30 seconds while all is well', () => {
    expect(nextDelay(0)).toBe(SYNC_INTERVAL_MS)
  })

  it('doubles the wait after each failure, up to five minutes', () => {
    expect([1, 2, 3, 4].map(nextDelay)).toEqual([5_000, 10_000, 20_000, 40_000])
    expect(nextDelay(20)).toBe(5 * 60_000)
  })
})
