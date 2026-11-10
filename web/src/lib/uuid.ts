/**
 * UUID v7: the first 48 bits are the time in milliseconds, the rest is random.
 * Ids made on any device never collide and sort in the order they were made.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))

  bytes[0] = Math.floor(now / 2 ** 40) & 0xff
  bytes[1] = Math.floor(now / 2 ** 32) & 0xff
  bytes[2] = Math.floor(now / 2 ** 24) & 0xff
  bytes[3] = Math.floor(now / 2 ** 16) & 0xff
  bytes[4] = Math.floor(now / 2 ** 8) & 0xff
  bytes[5] = now & 0xff

  bytes[6] = (bytes[6] & 0x0f) | 0x70 // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC variant

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
