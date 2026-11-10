/**
 * The PIN is never stored. After a successful online sign-in, a slow salted
 * hash of it is kept on the device so the same person can unlock the app
 * later without internet.
 */
const ITERATIONS = 150_000

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    key,
    256,
  )
  return toHex(new Uint8Array(bits))
}

export async function hashPin(pin: string): Promise<{ salt: string; hash: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { salt: toHex(salt), hash: await derive(pin, salt) }
}

export async function verifyPin(pin: string, salt: string, hash: string): Promise<boolean> {
  const candidate = await derive(pin, fromHex(salt))

  // Compare every character so timing does not reveal how much matched.
  let difference = candidate.length ^ hash.length
  for (let index = 0; index < candidate.length; index++) {
    difference |= candidate.charCodeAt(index) ^ (hash.charCodeAt(index) || 0)
  }
  return difference === 0
}
