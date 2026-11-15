import type { SunHoursInput, SunHoursResult } from '../geometry/sunHours'

/**
 * Messages between the sun-hours client (main thread) and the worker. Every job has an id chosen
 * by the client; the worker answers with progress messages and then exactly one of done,
 * cancelled or error.
 */

export type SunHoursRequest =
  { type: 'start'; jobId: number; input: SunHoursInput } | { type: 'cancel'; jobId: number }

export type SunHoursResponse =
  | { type: 'progress'; jobId: number; fraction: number }
  /** The result's `hours` buffer is transferred, not copied. */
  | { type: 'done'; jobId: number; result: SunHoursResult }
  | { type: 'cancelled'; jobId: number }
  | { type: 'error'; jobId: number; message: string }
