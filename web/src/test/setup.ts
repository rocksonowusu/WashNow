// Gives the tests a real (in-memory) IndexedDB, so the device database and
// everything built on it runs exactly as it does in a browser.
import 'fake-indexeddb/auto'
import { beforeEach } from 'vitest'
import { db } from '../db/db.ts'

beforeEach(async () => {
  await db.delete()
  await db.open()
})
