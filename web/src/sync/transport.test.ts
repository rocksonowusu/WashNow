import { afterEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta, setMeta } from '../db/db.ts'
import { createCustomer, createExpense, createSale } from '../db/repositories.ts'
import type { Account } from '../db/types.ts'
import { NetworkError } from '../lib/api.ts'
import { account, customer, seedBay } from '../test/factories.ts'
import { applyPullReply, applyPushReply, pullChanges, pushOutbox } from './transport.ts'

type Call = { url: string; token: string | null; body: { items: { op: string; table: string; record: { id: string } }[] } | null }

/** Replace the network with a function and record what was sent. */
function mockServer(respond: (call: Call) => { status?: number; body: unknown } | Error) {
  const calls: Call[] = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>
      const call: Call = {
        url,
        token: headers.Authorization?.replace('Bearer ', '') ?? null,
        body: init.body ? JSON.parse(init.body as string) : null,
      }
      calls.push(call)

      const reply = respond(call)
      if (reply instanceof Error) throw reply

      return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 })
    }),
  )

  return calls
}

async function signedIn(overrides: Partial<Account> = {}): Promise<Account> {
  const person = account(overrides)
  await db.accounts.add(person)
  return person
}

afterEach(() => vi.unstubAllGlobals())

describe('pushing the outbox', () => {
  it('sends waiting records with their maker’s token and clears the accepted ones', async () => {
    const { sedan, kofi } = await seedBay()
    const esi = await signedIn()
    const sale = await createSale(esi, { categoryId: sedan.id, amount: 5000, paymentMethod: 'cash', washerIds: [kofi.id] })

    const calls = mockServer(() => ({ body: { accepted: [sale.id], rejected: [] } }))
    await pushOutbox()

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toMatch(/\/api\/sync\/push$/)
    expect(calls[0].token).toBe('token-esi')
    expect(calls[0].body?.items).toEqual([{ op: 'upsert', table: 'sales', record: expect.objectContaining({ id: sale.id, amount: 5000 }) }])

    expect(await db.outbox.count()).toBe(0)
    expect(await db.sales.get(sale.id)).toBeDefined()
  })

  it('sends at most 50 at a time, oldest first, until the outbox is empty', async () => {
    const esi = await signedIn()
    for (let index = 0; index < 120; index++) {
      await createExpense(esi, { category: 'water', amount: 100 + index, paymentMethod: 'cash' })
    }

    const calls = mockServer((call) => ({ body: { accepted: call.body!.items.map((item) => item.record.id), rejected: [] } }))
    await pushOutbox()

    expect(calls.map((call) => call.body!.items.length)).toEqual([50, 50, 20])
    expect((calls[0].body!.items[0].record as unknown as { amount: number }).amount).toBe(100)
    expect(await db.outbox.count()).toBe(0)
  })

  it('pushes each person’s records with their own token', async () => {
    const esi = await signedIn({ name: 'Esi', token: 'token-esi' })
    const owner = await signedIn({ name: 'Owner', role: 'owner', token: 'token-owner' })
    await createExpense(esi, { category: 'soap', amount: 1000, paymentMethod: 'cash' })
    await createExpense(owner, { category: 'fuel', amount: 2000, paymentMethod: 'cash' })

    const calls = mockServer((call) => ({ body: { accepted: call.body!.items.map((item) => item.record.id), rejected: [] } }))
    await pushOutbox()

    const amountsByToken = Object.fromEntries(
      calls.map((call) => [call.token, (call.body!.items[0].record as unknown as { amount: number }).amount]),
    )
    expect(amountsByToken).toEqual({ 'token-esi': 1000, 'token-owner': 2000 })
  })

  it('keeps everything waiting when the server cannot be reached', async () => {
    const esi = await signedIn()
    await createExpense(esi, { category: 'soap', amount: 1000, paymentMethod: 'cash' })

    mockServer(() => new TypeError('Failed to fetch'))

    await expect(pushOutbox()).rejects.toBeInstanceOf(NetworkError)

    const [stillWaiting] = await db.outbox.toArray()
    expect(stillWaiting.attempts).toBe(1)
    expect(stillWaiting.last_error).toBeTruthy()
  })

  it('forgets a token the server no longer accepts, without losing the records', async () => {
    const esi = await signedIn()
    await createExpense(esi, { category: 'soap', amount: 1000, paymentMethod: 'cash' })
    const expired = vi.fn()

    mockServer(() => ({ status: 401, body: { message: 'Unauthenticated.' } }))
    await pushOutbox(expired)

    expect((await db.accounts.get(esi.user_id))?.token).toBeNull()
    expect(expired).toHaveBeenCalledWith(esi.user_id)
    expect(await db.outbox.count()).toBe(1)
  })

  it('skips people who must sign in again', async () => {
    const esi = await signedIn({ token: null })
    await createExpense(esi, { category: 'soap', amount: 1000, paymentMethod: 'cash' })

    const calls = mockServer(() => ({ body: { accepted: [], rejected: [] } }))
    await pushOutbox()

    expect(calls).toHaveLength(0)
    expect(await db.outbox.count()).toBe(1)
  })
})

describe('what the server refused', () => {
  it('marks a refused new record, lists it for review and stops retrying it', async () => {
    const { sedan, kofi } = await seedBay()
    const esi = await signedIn()
    const good = await createSale(esi, { categoryId: sedan.id, amount: 5000, paymentMethod: 'cash', washerIds: [kofi.id] })
    const late = await createSale(esi, { categoryId: sedan.id, amount: 3000, paymentMethod: 'cash', washerIds: [kofi.id] })

    await applyPushReply(await db.outbox.toArray(), {
      accepted: [good.id],
      rejected: [
        { index: 1, id: late.id, table: 'sales', op: 'upsert', reason: 'day_closed', message: '2026-11-10 has been closed.', server_record: null },
      ],
    })

    expect(await db.outbox.count()).toBe(0)
    expect((await db.sales.get(good.id))?.sync_state).toBeUndefined()
    expect((await db.sales.get(late.id))?.sync_state).toBe('rejected')

    const [issue] = await db.sync_issues.toArray()
    expect(issue).toMatchObject({ table: 'sales', record_id: late.id, reason: 'day_closed', user_id: esi.user_id })
  })

  it('replaces the local copy with the server’s when the server won', async () => {
    const { sedan, kofi } = await seedBay()
    const owner = await signedIn({ role: 'owner' })
    const sale = await createSale(owner, { categoryId: sedan.id, amount: 5000, paymentMethod: 'cash', washerIds: [kofi.id] })
    const serverCopy = { ...sale, washer_ids: undefined, status: 'voided', void_reason: 'Entered twice', version: 2 }

    await applyPushReply(await db.outbox.toArray(), {
      accepted: [],
      rejected: [{ index: 0, id: sale.id, table: 'sales', op: 'upsert', reason: 'voided', message: 'This sale was voided.', server_record: serverCopy }],
    })

    expect(await db.sales.get(sale.id)).toMatchObject({ status: 'voided', void_reason: 'Entered twice', version: 2 })
  })

  it('matches replies by position when one record is in the batch twice', async () => {
    const esi = await signedIn()
    const expense = await createExpense(esi, { category: 'soap', amount: 1000, paymentMethod: 'cash' })
    // A second change to the same record, queued behind the first.
    await db.outbox.add({ ...(await db.outbox.toArray())[0], seq: undefined, record: { id: expense.id, amount: 9999, version: 2 } })

    await applyPushReply(await db.outbox.toArray(), {
      accepted: [expense.id],
      rejected: [{ index: 1, id: expense.id, table: 'expenses', op: 'upsert', reason: 'forbidden', message: 'Only the owner can change a recorded expense.' }],
    })

    expect(await db.outbox.count()).toBe(0)
    expect((await db.sync_issues.toArray()).map((issue) => issue.record.amount)).toEqual([9999])
  })

  it('swaps in the customer another device saved first and re-points our sales', async () => {
    const { sedan, kofi } = await seedBay()
    const esi = await signedIn()
    const ours = await createCustomer(esi, { plateNumber: 'GR 1234-21', name: 'Duplicate' })
    const sale = await createSale(esi, {
      categoryId: sedan.id,
      amount: 5000,
      paymentMethod: 'cash',
      washerIds: [kofi.id],
      plateNumber: 'GR123421',
    })
    expect(sale.customer_id).toBe(ours.id)

    const theirs = customer({ name: 'Mr Mensah', visit_count: 4 })
    const customerItem = (await db.outbox.toArray()).filter((item) => item.table === 'customers')

    await applyPushReply(customerItem, {
      accepted: [],
      rejected: [
        { index: 0, id: ours.id, table: 'customers', op: 'upsert', reason: 'duplicate_plate', message: 'A customer with this plate number already exists.', server_record: theirs },
      ],
    })

    expect(await db.customers.get(ours.id)).toBeUndefined()
    expect(await db.customers.get(theirs.id)).toMatchObject({ name: 'Mr Mensah', visit_count: 4 })
    expect((await db.sales.get(sale.id))?.customer_id).toBe(theirs.id)

    // The sale still waiting to be sent now points at the surviving customer too.
    const [waitingSale] = await db.outbox.toArray()
    expect(waitingSale.record.customer_id).toBe(theirs.id)
  })
})

describe('pulling changes', () => {
  it('stores new and changed records, removes deleted ones and remembers the cursor', async () => {
    const { sedan, kofi, ama } = await seedBay()
    const esi = await signedIn()

    await applyPullReply(esi.user_id, {
      cursor: '2026-11-10T10:00:00+00:00',
      tables: {
        vehicle_categories: [{ ...sedan, max_price: 12000, version: 2 }],
        washers: [
          { ...kofi, deleted_at: '2026-11-10T09:59:00.000000Z', version: 2 },
          { id: 'washer-new', branch_id: 'branch-1', name: 'Yaw', commission_percent: '25.00', active: true, deleted_at: null },
        ],
      },
    })

    expect((await db.vehicle_categories.get(sedan.id))?.max_price).toBe(12000)
    expect(await db.washers.get(kofi.id)).toBeUndefined()
    expect(await db.washers.get(ama.id)).toBeDefined()
    expect(await db.washers.get('washer-new')).toMatchObject({ name: 'Yaw' })
    expect(await getMeta(`cursor:${esi.user_id}`)).toBe('2026-11-10T10:00:00+00:00')
  })

  it('never overwrites a record that still has a change waiting to be sent', async () => {
    const esi = await signedIn()
    const expense = await createExpense(esi, { category: 'soap', amount: 1000, paymentMethod: 'cash' })

    await applyPullReply(esi.user_id, {
      cursor: '2026-11-10T10:00:00+00:00',
      tables: { expenses: [{ ...expense, amount: 1, version: 5 }] },
    })

    expect((await db.expenses.get(expense.id))?.amount).toBe(1000)
  })

  it('asks only for changes since the last cursor, with the person’s token', async () => {
    const esi = await signedIn()
    await setMeta(`cursor:${esi.user_id}`, '2026-11-10T09:00:00+00:00')

    const calls = mockServer(() => ({ body: { cursor: '2026-11-10T09:30:00+00:00', tables: {} } }))
    await pullChanges(esi.user_id)

    expect(calls[0].url).toContain('/api/sync/pull?since=2026-11-10T09%3A00%3A00%2B00%3A00')
    expect(calls[0].token).toBe('token-esi')
    expect(await getMeta(`cursor:${esi.user_id}`)).toBe('2026-11-10T09:30:00+00:00')
  })

  it('keeps the old cursor when the pull fails, so nothing is skipped next time', async () => {
    const esi = await signedIn()
    await setMeta(`cursor:${esi.user_id}`, '2026-11-10T09:00:00+00:00')

    mockServer(() => new TypeError('Failed to fetch'))

    await expect(pullChanges(esi.user_id)).rejects.toBeInstanceOf(NetworkError)
    expect(await getMeta(`cursor:${esi.user_id}`)).toBe('2026-11-10T09:00:00+00:00')
  })
})
