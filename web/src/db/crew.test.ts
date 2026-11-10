import { describe, expect, it } from 'vitest'
import { applyPushReply } from '../sync/transport.ts'
import { account, seedBay } from '../test/factories.ts'
import { db } from './db.ts'
import { createCrewMember, createSale, removeCrewMember, updateCrewMember } from './repositories.ts'
import type { Branch } from './types.ts'

async function seedBranch(standard: string | null): Promise<void> {
  const branch: Branch = {
    id: 'branch-1',
    name: 'Test Bay',
    location: null,
    phone: null,
    default_commission_percent: standard,
    version: 1,
    created_at: null,
    updated_at: null,
    deleted_at: null,
  }
  await db.branches.put(branch)
}

describe('adding crew on the device', () => {
  it('starts a cashier’s addition on the standard commission and queues it', async () => {
    await seedBranch('30.00')
    const esi = account()

    const yaw = await createCrewMember(esi, { name: '  yaw   Mensah ', commissionPercent: 95 })

    expect(yaw).toMatchObject({ name: 'yaw Mensah', commission_percent: '30.00', active: true })
    expect((await db.outbox.toArray())[0]).toMatchObject({ op: 'upsert', table: 'washers', record_id: yaw.id, user_id: esi.user_id })
  })

  it('does not let a cashier add anyone until the owner has set the standard commission', async () => {
    await seedBranch(null)

    await expect(createCrewMember(account(), { name: 'Yaw' })).rejects.toMatchObject({ field: 'commissionPercent' })
    expect(await db.washers.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('lets the owner give a rate, or use the standard one', async () => {
    await seedBranch('30.00')
    const owner = account({ role: 'owner' })

    expect((await createCrewMember(owner, { name: 'Yaw', commissionPercent: 45 })).commission_percent).toBe('45.00')
    expect((await createCrewMember(owner, { name: 'Esi' })).commission_percent).toBe('30.00')
    await expect(createCrewMember(owner, { name: 'Abena', commissionPercent: 120 })).rejects.toMatchObject({ field: 'commissionPercent' })
  })

  it('refuses a name already on the list, whatever the capitals', async () => {
    await seedBranch('30.00')
    await seedBay() // Kofi and Ama

    await expect(createCrewMember(account(), { name: 'KOFI' })).rejects.toMatchObject({ field: 'name' })
    await expect(createCrewMember(account(), { name: '   ' })).rejects.toMatchObject({ field: 'name' })
  })

  it('lets a brand-new person be picked for a sale straight away', async () => {
    await seedBranch('30.00')
    const { sedan } = await seedBay()
    const esi = account()

    const yaw = await createCrewMember(esi, { name: 'Yaw' })
    const sale = await createSale(esi, { categoryId: sedan.id, amount: 5000, paymentMethod: 'cash', washerIds: [yaw.id] })

    // The crew member is queued ahead of the sale that needs them.
    expect((await db.outbox.orderBy('seq').toArray()).map((item) => item.table)).toEqual(['washers', 'sales'])
    expect(sale.washer_ids).toEqual([yaw.id])
  })
})

describe('the owner managing crew', () => {
  it('changes a rate and queues only what changed, with the next version', async () => {
    const { kofi } = await seedBay()
    const owner = account({ role: 'owner' })

    const updated = await updateCrewMember(owner, kofi.id, { commissionPercent: 35 })

    expect(updated).toMatchObject({ commission_percent: '35.00', version: 2, name: 'Kofi' })
    expect((await db.outbox.toArray())[0].record).toEqual({ id: kofi.id, commission_percent: '35.00', version: 2 })
  })

  it('removes someone from the list and queues the removal', async () => {
    const { kofi } = await seedBay()

    await removeCrewMember(account({ role: 'owner' }), kofi.id)

    expect(await db.washers.get(kofi.id)).toBeUndefined()
    expect((await db.outbox.toArray())[0]).toMatchObject({ op: 'delete', table: 'washers', record_id: kofi.id })
  })

  it('is closed to cashiers', async () => {
    const { kofi } = await seedBay()

    await expect(updateCrewMember(account(), kofi.id, { commissionPercent: 90 })).rejects.toMatchObject({ field: 'form' })
    await expect(removeCrewMember(account(), kofi.id)).rejects.toMatchObject({ field: 'form' })
    expect((await db.washers.get(kofi.id))?.commission_percent).toBe('30.00')
  })
})

describe('when the same name was already on the server', () => {
  it('swaps in the existing person for sales saved here and sales still waiting', async () => {
    await seedBranch('30.00')
    const { sedan, ama } = await seedBay()
    const esi = account()

    const ours = await createCrewMember(esi, { name: 'Yaw' })
    const sale = await createSale(esi, { categoryId: sedan.id, amount: 5000, paymentMethod: 'cash', washerIds: [ours.id, ama.id] })

    const theirs = { ...ours, id: 'washer-on-server', commission_percent: '40.00' }
    const crewItem = (await db.outbox.toArray()).filter((item) => item.table === 'washers')

    await applyPushReply(crewItem, {
      accepted: [],
      rejected: [
        { index: 0, id: ours.id, table: 'washers', op: 'upsert', reason: 'duplicate_name', message: 'Yaw is already on the crew list.', server_record: theirs },
      ],
    })

    expect(await db.washers.get(ours.id)).toBeUndefined()
    expect(await db.washers.get('washer-on-server')).toMatchObject({ name: 'Yaw', commission_percent: '40.00' })
    expect((await db.sales.get(sale.id))?.washer_ids).toEqual(['washer-on-server', ama.id])

    const [waitingSale] = await db.outbox.toArray()
    expect(waitingSale.record.washer_ids).toEqual(['washer-on-server', ama.id])
  })
})
