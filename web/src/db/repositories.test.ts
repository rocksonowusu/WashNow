import { describe, expect, it } from 'vitest'
import { account, customer, seedBay } from '../test/factories.ts'
import { db } from './db.ts'
import { createCustomer, createExpense, createSale, LocalValidationError } from './repositories.ts'

describe('recording a sale on the device', () => {
  it('saves the sale and queues it for the server together', async () => {
    const { sedan, kofi, ama } = await seedBay()
    const esi = account()

    const sale = await createSale(esi, {
      categoryId: sedan.id,
      amount: 5000,
      paymentMethod: 'momo',
      washerIds: [kofi.id, ama.id],
      plateNumber: 'gr 1234-21',
    })

    expect(await db.sales.get(sale.id)).toMatchObject({
      amount: 5000,
      payment_method: 'momo',
      plate_number: 'GR123421',
      recorded_by: esi.user_id,
      status: 'active',
      version: 1,
    })

    const [queued] = await db.outbox.toArray()
    expect(queued).toMatchObject({ op: 'upsert', table: 'sales', record_id: sale.id, user_id: esi.user_id, attempts: 0 })
    expect(queued.record).toMatchObject({ id: sale.id, amount: 5000, washer_ids: [kofi.id, ama.id], category_id: sedan.id })
  })

  it('refuses a price outside the range from a cashier and saves nothing', async () => {
    const { sedan, kofi } = await seedBay()

    for (const amount of [1499, 10001]) {
      await expect(
        createSale(account(), { categoryId: sedan.id, amount, paymentMethod: 'cash', washerIds: [kofi.id] }),
      ).rejects.toMatchObject({ field: 'amount' })
    }

    expect(await db.sales.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('accepts prices exactly on the edges of the range', async () => {
    const { sedan, kofi } = await seedBay()

    for (const amount of [1500, 10000]) {
      await createSale(account(), { categoryId: sedan.id, amount, paymentMethod: 'cash', washerIds: [kofi.id] })
    }

    expect(await db.sales.count()).toBe(2)
  })

  it('lets the owner go outside the range only with a reason', async () => {
    const { sedan, kofi } = await seedBay()
    const owner = account({ role: 'owner', name: 'Owner' })
    const sale = { categoryId: sedan.id, amount: 12000, paymentMethod: 'cash' as const, washerIds: [kofi.id] }

    await expect(createSale(owner, sale)).rejects.toMatchObject({ field: 'overrideReason' })

    const saved = await createSale(owner, { ...sale, overrideReason: ' Full detail ' })
    expect(saved.override_reason).toBe('Full detail')
  })

  it('needs a category and at least one active washer', async () => {
    const { sedan, kofi } = await seedBay()
    await db.washers.update(kofi.id, { active: false })

    await expect(
      createSale(account(), { categoryId: 'missing', amount: 5000, paymentMethod: 'cash', washerIds: [kofi.id] }),
    ).rejects.toBeInstanceOf(LocalValidationError)

    for (const washerIds of [[], [kofi.id]]) {
      await expect(
        createSale(account(), { categoryId: sedan.id, amount: 5000, paymentMethod: 'cash', washerIds }),
      ).rejects.toMatchObject({ field: 'washerIds' })
    }
  })

  it('links the sale to a saved customer with the same plate', async () => {
    const { sedan, kofi } = await seedBay()
    const mensah = customer({ plate_number: 'GR123421' })
    await db.customers.add(mensah)

    const sale = await createSale(account(), {
      categoryId: sedan.id,
      amount: 5000,
      paymentMethod: 'cash',
      washerIds: [kofi.id],
      plateNumber: 'GR-1234-21',
    })

    expect(sale.customer_id).toBe(mensah.id)
  })
})

describe('other records', () => {
  it('saves and queues an expense', async () => {
    const expense = await createExpense(account(), { category: 'soap', amount: 2500, paymentMethod: 'cash', note: ' 2 gallons ' })

    expect(await db.expenses.get(expense.id)).toMatchObject({ category: 'soap', amount: 2500, note: '2 gallons' })
    expect((await db.outbox.toArray())[0]).toMatchObject({ table: 'expenses', record_id: expense.id })
  })

  it('saves and queues a customer, and refuses a plate already on the device', async () => {
    const saved = await createCustomer(account(), { plateNumber: 'gw 55-22', name: 'Akos' })

    expect(saved.plate_number).toBe('GW5522')
    expect((await db.outbox.toArray())[0]).toMatchObject({ table: 'customers', record_id: saved.id })

    await expect(createCustomer(account(), { plateNumber: 'GW-5522' })).rejects.toMatchObject({ field: 'plateNumber' })
    await expect(createCustomer(account(), { plateNumber: '  ' })).rejects.toMatchObject({ field: 'plateNumber' })
  })
})
