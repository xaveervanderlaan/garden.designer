import { request } from 'node:http'

export type CallOptions = {
  method?: string
  path?: string
  headers?: Record<string, string>
  body?: string
  /** Aborts the request (destroys the socket) when this signal fires. */
  signal?: AbortSignal
}

export type CallResult = { status: number; headers: Record<string, string>; body: string }

/** A raw HTTP call, so tests can send any Origin and Host headers (fetch won't). */
export function call(port: number, opts: CallOptions = {}): Promise<CallResult> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method: opts.method ?? 'GET',
        path: opts.path ?? '/health',
        headers: opts.headers,
        signal: opts.signal,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const headers: Record<string, string> = {}
          for (const [key, value] of Object.entries(res.headers)) {
            if (value !== undefined) headers[key] = Array.isArray(value) ? value.join(', ') : value
          }
          resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString() })
        })
      },
    )
    req.on('error', reject)
    req.end(opts.body)
  })
}
