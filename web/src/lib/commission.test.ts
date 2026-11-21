import { describe, expect, it } from 'vitest'
import { splitCommission } from './commission.ts'

describe('splitCommission', () => {
  it('gives one washer their rate of the whole sale', () => {
    expect(splitCommission(5000, ['30.00'])).toEqual([1500])
  })

  it('shares the sale equally, then applies each rate', () => {
    // GH₵50 between two: GH₵25 each; 30% is GH₵7.50, 40% is GH₵10.
    expect(splitCommission(5000, ['30.00', '40.00'])).toEqual([750, 1000])
  })

  it('gives spare pesewas to the first washers', () => {
    // 1001 between three is 334, 334, 333.
    expect(splitCommission(1001, [100, 100, 100])).toEqual([334, 334, 333])
  })

  it('rounds to the nearest pesewa like the server', () => {
    // 27.5% of 3333 = 916.575, rounded half up to 917.
    expect(splitCommission(3333, ['27.50'])).toEqual([917])
    // 30% of 1235 = 370.5 -> 371.
    expect(splitCommission(1235, ['30'])).toEqual([371])
  })

  it('pays nothing with no amount or an unset rate', () => {
    expect(splitCommission(0, ['30.00'])).toEqual([0])
    expect(splitCommission(5000, [null])).toEqual([0])
    expect(splitCommission(5000, [])).toEqual([])
  })
})
