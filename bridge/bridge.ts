// The local bridge: lets the garden designer in the browser ask Claude Code on this computer
// for design proposals. Start it with `npm run bridge` and stop it with Ctrl+C.
import { parseArgs } from 'node:util'
import {
  BRIDGE_DEFAULT_PORT,
  BRIDGE_MODELS,
  isBridgeModel,
  MAX_CONCURRENT,
} from '../src/proposals/bridgeProtocol.ts'
import { checkClaude } from './claude.ts'
import { defaultConfigDir, formatCode, loadOrCreateCode } from './pairing.ts'
import { startBridge } from './server.ts'

/** Where the app is served: the published site, the dev server and the preview server. */
export const DEFAULT_ORIGINS = [
  'https://xaveervanderlaan.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]

const USAGE = `Usage: npm run bridge -- [options]

  --port <n>        port on 127.0.0.1 (default ${BRIDGE_DEFAULT_PORT})
  --model <name>    default model: ${BRIDGE_MODELS.join(' or ')} (default sonnet)
  --timeout <min>   stop a run after this many minutes (default 10)
  --origin <url>    also allow the app from this address (repeatable)
  --new-code        replace the pairing code (pair the app again afterwards)
  --claude <path>   the Claude Code executable (default: claude on the PATH)
  --help            show this help`

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`)
  process.exit(1)
}

function parseCli() {
  let values
  try {
    ;({ values } = parseArgs({
      options: {
        port: { type: 'string' },
        model: { type: 'string' },
        timeout: { type: 'string' },
        origin: { type: 'string', multiple: true },
        'new-code': { type: 'boolean' },
        claude: { type: 'string' },
        help: { type: 'boolean' },
      },
    }))
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
  if (values.help) {
    console.log(USAGE)
    process.exit(0)
  }
  const port = Number(values.port ?? BRIDGE_DEFAULT_PORT)
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`Not a port: ${values.port}`)
  const model = values.model ?? 'sonnet'
  if (!isBridgeModel(model)) fail(`Unknown model: ${model}`)
  const minutes = Number(values.timeout ?? 10)
  if (!Number.isFinite(minutes) || minutes <= 0) fail(`Not a number of minutes: ${values.timeout}`)
  const origins = [...DEFAULT_ORIGINS]
  for (const value of values.origin ?? []) {
    let origin = 'null'
    try {
      origin = new URL(value).origin
    } catch {
      // handled below
    }
    if (origin === 'null') fail(`Not an origin (like https://example.org): ${value}`)
    if (!origins.includes(origin)) origins.push(origin)
  }
  return {
    port,
    model,
    timeoutMs: minutes * 60_000,
    origins,
    renew: values['new-code'] === true,
    command: [values.claude ?? 'claude'],
  }
}

async function main() {
  const cli = parseCli()
  const claude = await checkClaude(cli.command)
  if (!claude.installed) {
    console.error(
      `Claude Code was not found (${cli.command[0]}).\n` +
        'Install it (https://claude.com/claude-code) and log in with `claude`, ' +
        'or point to it with --claude <path>.',
    )
    process.exit(1)
  }
  const code = await loadOrCreateCode(defaultConfigDir(), { renew: cli.renew })
  let bridge
  try {
    bridge = await startBridge({
      port: cli.port,
      code,
      model: cli.model,
      origins: cli.origins,
      command: cli.command,
      timeoutMs: cli.timeoutMs,
    })
  } catch (error) {
    const busy = (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
    console.error(
      busy
        ? `Port ${cli.port} is in use. Is the bridge already running? Or pick another with --port.`
        : `Could not start the bridge: ${String(error)}`,
    )
    process.exit(1)
  }

  console.log(`Garden designer bridge
  Claude Code ${claude.version ?? '(unknown version)'}, ${
    claude.loggedIn ? 'logged in' : 'NOT logged in: run `claude` and log in, then try again'
  }
  Address       http://127.0.0.1:${bridge.port}
  Pairing code  ${formatCode(code)}
  Model         ${cli.model} (the app can choose ${BRIDGE_MODELS.join(' or ')})
  Allowed from  ${cli.origins.join('\n                ')}

Every run uses your Claude plan and counts towards its usage limits.
At most ${MAX_CONCURRENT} runs at a time. Prompts and answers are not logged.
Ctrl+C to stop.
`)

  const stop = () => {
    void bridge.close().then(() => process.exit(0))
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

await main()
