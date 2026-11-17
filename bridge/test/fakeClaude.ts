// A stand-in for the `claude` CLI, so the bridge tests never start the real one.
// Run as `node fakeClaude.ts …`. Environment:
//   FAKE_CLAUDE_MODE      ok (default) | slow | notLoggedIn | usageLimit | garbage
//   FAKE_CLAUDE_DELAY_MS  how long `slow` waits before answering
//   FAKE_CLAUDE_LOGGED_IN '0' makes `auth status` report logged out
//   FAKE_CLAUDE_LOG       file that gets one JSON line { argv, stdin, pid } per print run
import { appendFileSync } from 'node:fs'

const args = process.argv.slice(2)
const env = process.env

function result(fields: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 12,
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 5,
      cache_creation_input_tokens: 0,
    },
    session_id: 'fake',
    ...fields,
  })
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

async function print(): Promise<void> {
  const stdin = await readStdin()
  if (env.FAKE_CLAUDE_LOG) {
    appendFileSync(
      env.FAKE_CLAUDE_LOG,
      `${JSON.stringify({ argv: args, stdin, pid: process.pid })}\n`,
    )
  }
  switch (env.FAKE_CLAUDE_MODE ?? 'ok') {
    case 'slow':
      await new Promise((resolve) => setTimeout(resolve, Number(env.FAKE_CLAUDE_DELAY_MS ?? 1000)))
      process.stdout.write(result({ result: `answer:${stdin.length}` }))
      return
    case 'notLoggedIn':
      process.stdout.write(
        result({ subtype: 'error', is_error: true, result: 'Not logged in · Please run /login' }),
      )
      process.exitCode = 1
      return
    case 'usageLimit':
      process.stdout.write(
        result({ subtype: 'error', is_error: true, result: 'Claude usage limit reached' }),
      )
      process.exitCode = 1
      return
    case 'garbage':
      process.stdout.write('this is not json')
      return
    default:
      process.stdout.write(result({ result: `answer:${stdin.length}` }))
  }
}

if (args[0] === '--version') {
  process.stdout.write('2.1.326 (Claude Code)\n')
} else if (args[0] === 'auth' && args[1] === 'status') {
  process.stdout.write(`${JSON.stringify({ loggedIn: env.FAKE_CLAUDE_LOGGED_IN !== '0' })}\n`)
  if (env.FAKE_CLAUDE_LOGGED_IN === '0') process.exitCode = 1
} else if (args.includes('-p')) {
  await print()
} else {
  process.stderr.write(`fake claude: unexpected arguments ${JSON.stringify(args)}\n`)
  process.exitCode = 2
}
