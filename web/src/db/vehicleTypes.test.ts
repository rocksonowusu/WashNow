import { describe, expect, it } from 'vitest'
import { account, seedBay } from '../test/factories.ts'
import { db } from './db.ts'
import { createVehicleType, removeVehicleType, updateVehicleType } from './repositories.ts'

const owner = () => account({ role: 'owner', name: 'Owner' })

describe('vehicle types on the device', () => {
  it('lets the owner add one at the end of the list and queues it', async () => {
    await seedBay() // Sedan, sort order 1

    const suv = await createVehicleType(owner(), { name: ' SUV ', minPrice: 2000, maxPrice: 15000, pricingNote: 'Parts washed' })

    expect(suv).toMatchObject({ name: 'SUV', min_price: 2000, max_price: 15000, sort_order: 2, active: true, version: 1 })
    expect((await db.outbox.toArray())[0]).toMatchObject({ op: 'upsert', table: 'vehicle_categories', record_id: suv.id })
  })

  it('checks the name and the prices', async () => {
    await seedBay()

    await expect(createVehicleType(owner(), { name: 'sedan', minPrice: 1, maxPrice: 2 })).rejects.toMatchObject({ field: 'name' })
    await expect(createVehicleType(owner(), { name: 'Bus', minPrice: 20000, maxPrice: 4000 })).rejects.toMatchObject({ field: 'maxPrice' })
    await expect(createVehicleType(owner(), { name: 'Bus', minPrice: -1, maxPrice: 4000 })).rejects.toMatchObject({ field: 'minPrice' })
    expect(await db.outbox.count()).toBe(0)
  })

  it('changes a range and queues it with the next version', async () => {
    const { sedan } = await seedBay()

    const updated = await updateVehicleType(owner(), sedan.id, { name: 'Sedan', minPrice: 2000, maxPrice: 12000 })

    expect(updated).toMatchObject({ min_price: 2000, max_price: 12000, version: 2 })
    expect((await db.outbox.toArray())[0].record).toMatchObject({ id: sedan.id, min_price: 2000, max_price: 12000, version: 2 })
  })

  it('removes one and queues the removal', async () => {
    const { sedan } = await seedBay()

    await removeVehicleType(owner(), sedan.id)

    expect(await db.vehicle_categories.get(sedan.id)).toBeUndefined()
    expect((await db.outbox.toArray())[0]).toMatchObject({ op: 'delete', table: 'vehicle_categories', record_id: sedan.id })
  })

  it('is closed to cashiers', async () => {
    const { sedan } = await seedBay()

    await expect(createVehicleType(account(), { name: 'Bus', minPrice: 1, maxPrice: 2 })).rejects.toMatchObject({ field: 'form' })
    await expect(updateVehicleType(account(), sedan.id, { name: 'Sedan', minPrice: 1, maxPrice: 2 })).rejects.toMatchObject({ field: 'form' })
    await expect(removeVehicleType(account(), sedan.id)).rejects.toMatchObject({ field: 'form' })
  })
})
