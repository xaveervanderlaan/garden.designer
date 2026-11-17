// The pairing code: a random secret the app sends as a bearer token. It is stored in the user's
// config directory, so the app stays paired when the bridge restarts.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Crockford base32: no I, L, O or U, so a code can be read aloud and typed without mix-ups. */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_LENGTH = 10
const CONFIG_FILE = 'bridge.json'

/** 10 characters of 5 bits each (50 bits). */
export function newPairingCode(random: (size: number) => Uint8Array = randomBytes): string {
  const bytes = random(CODE_LENGTH)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[(bytes[i] ?? 0) & 31]
  return code
}

/** `ABCDE-FGHJK`, as the terminal shows it. */
export function formatCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`
}

/** Drops spaces and dashes and uppercases, so `abcde-fghjk` and `ABCDE FGHJK` are the same code. */
export function normaliseCode(s: string): string {
  return s.replace(/[\s-]+/g, '').toUpperCase()
}

/** Compares in constant time (for equal lengths), so the code can't be guessed by timing. */
export function codesMatch(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

function isValidCode(code: unknown): code is string {
  return (
    typeof code === 'string' &&
    code.length === CODE_LENGTH &&
    [...code].every((c) => CODE_ALPHABET.includes(c))
  )
}

export function defaultConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(base, 'garden-designer')
}

/** Reads the stored code, or makes and stores a new one (always with `renew`). */
export async function loadOrCreateCode(
  configDir: string,
  { renew = false }: { renew?: boolean } = {},
): Promise<string> {
  const file = join(configDir, CONFIG_FILE)
  if (!renew) {
    try {
      const stored: unknown = JSON.parse(await readFile(file, 'utf8'))
      const code = (stored as { code?: unknown } | null)?.code
      if (isValidCode(code)) return code
    } catch {
      // Missing or unreadable: make a new one.
    }
  }
  const code = newPairingCode()
  await mkdir(configDir, { recursive: true, mode: 0o700 })
  await chmod(configDir, 0o700)
  await writeFile(file, `${JSON.stringify({ code }, null, 2)}\n`, { mode: 0o600 })
  await chmod(file, 0o600)
  return code
}
