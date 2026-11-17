import type { BridgeFailure } from '../../../../proposals/bridgeClient'

/** The i18n key that explains a failure to the user. */
export function failureKey(failure: BridgeFailure) {
  return failure === 'cancelled'
    ? ('proposals.bridge.cancelled' as const)
    : (`proposals.bridge.errors.${failure}` as const)
}
