import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Runs the fake `claude` with this Node, so tests never touch the real CLI. */
export const FAKE_CLAUDE = [
  process.execPath,
  '--no-warnings',
  fileURLToPath(new URL('./fakeClaude.ts', import.meta.url)),
]

export type FakeRun = { argv: string[]; stdin: string; pid: number }

export function fakeRuns(logFile: string): FakeRun[] {
  if (!existsSync(logFile)) return []
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FakeRun)
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const until = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > until) throw new Error('waitFor timed out')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
