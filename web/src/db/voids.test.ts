import { describe, expect, it } from 'vitest'
import { account, seedBay } from '../test/factories.ts'
import { db } from './db.ts'
import { createSale, declineVoidRequest, requestVoid, voidSale } from './repositories.ts'
import type { Account, Sale } from './types.ts'

async function saleBy(cashier: Account): Promise<Sale> {
  const { sedan, kofi } = await seedBay()
  const sale = await createSale(cashier, { categoryId: sedan.id, amount: 5000, paymentMethod: 'cash', washerIds: [kofi.id] })
  await db.outbox.clear() // as if the sale itself had already synced
  return sale
}

describe('a cashier asking for a void', () => {
  it('marks the sale as requested, leaves it active and queues the request', async () => {
    const esi = account()
    const sale = await saleBy(esi)

    const updated = await requestVoid(esi, sale.id, '  Entered twice ')

    expect(updated).toMatchObject({
      status: 'active',
      void_requested_by: esi.user_id,
      void_request_reason: 'Entered twice',
      version: 2,
    })
    expect(updated.void_requested_at).toBeTruthy()
    expect((await db.outbox.toArray())[0].record).toEqual({ id: sale.id, void_request_reason: 'Entered twice', version: 2 })
  })

  it('needs a reason', async () => {
    const esi = account()
    const sale = await saleBy(esi)

    await expect(requestVoid(esi, sale.id, ' a ')).rejects.toMatchObject({ field: 'reason' })
    expect(await db.outbox.count()).toBe(0)
  })

  it('keeps the first request when asked again', async () => {
    const esi = account()
    const sale = await saleBy(esi)

    await requestVoid(esi, sale.id, 'Entered twice')
    const again = await requestVoid(esi, sale.id, 'Something else')

    expect(again.void_request_reason).toBe('Entered twice')
    expect(await db.outbox.count()).toBe(1)
  })

  it('cannot void directly', async () => {
    const esi = account()
    const sale = await saleBy(esi)

    await expect(voidSale(esi, sale.id, 'Entered twice')).rejects.toMatchObject({ field: 'form' })
    await expect(declineVoidRequest(esi, sale.id)).rejects.toMatchObject({ field: 'form' })
    expect((await db.sales.get(sale.id))?.status).toBe('active')
  })

  it('finds requests waiting for the owner through the index', async () => {
    const esi = account()
    const sale = await saleBy(esi)
    await requestVoid(esi, sale.id, 'Entered twice')

    const waiting = await db.sales.where('void_requested_at').above('').toArray()

    expect(waiting.map((row) => row.id)).toEqual([sale.id])
  })
})

describe('the owner answering', () => {
  it('approves by voiding and queues the void', async () => {
    const esi = account()
    const owner = account({ role: 'owner', name: 'Owner' })
    const sale = await saleBy(esi)
    await requestVoid(esi, sale.id, 'Entered twice')
    await db.outbox.clear()

    const voided = await voidSale(owner, sale.id, 'Entered twice')

    expect(voided).toMatchObject({ status: 'voided', void_reason: 'Entered twice', version: 3, void_requested_by: esi.user_id })
    expect((await db.outbox.toArray())[0]).toMatchObject({
      user_id: owner.user_id,
      record: { id: sale.id, status: 'voided', void_reason: 'Entered twice', version: 3 },
    })
  })

  it('declines by clearing the request and queues the answer', async () => {
    const esi = account()
    const owner = account({ role: 'owner', name: 'Owner' })
    const sale = await saleBy(esi)
    await requestVoid(esi, sale.id, 'Entered twice')
    await db.outbox.clear()

    const kept = await declineVoidRequest(owner, sale.id)

    expect(kept).toMatchObject({ status: 'active', void_requested_at: null, void_request_reason: null, version: 3 })
    expect((await db.outbox.toArray())[0].record).toEqual({ id: sale.id, void_request_declined: true, version: 3 })
    expect(await db.sales.where('void_requested_at').above('').count()).toBe(0)
  })

  it('cannot void the same sale twice', async () => {
    const owner = account({ role: 'owner' })
    const sale = await saleBy(owner)

    await voidSale(owner, sale.id, 'Mistake')

    await expect(voidSale(owner, sale.id, 'Again')).rejects.toMatchObject({ field: 'form' })
    await expect(requestVoid(account(), sale.id, 'Too late')).rejects.toMatchObject({ field: 'form' })
  })
})
