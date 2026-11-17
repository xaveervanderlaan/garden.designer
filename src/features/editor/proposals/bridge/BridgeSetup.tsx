import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BridgeError,
  type BridgeFailure,
  normaliseBridgeAddress,
  normaliseBridgeCode,
} from '../../../../proposals/bridgeClient'
import controls from '../../../../styles/controls.module.css'
import { cx } from '../../../../styles/cx'
import panels from '../../panels/panels.module.css'
import styles from '../ideas.module.css'
import {
  DEFAULT_BRIDGE_ADDRESS,
  DEFAULT_BRIDGE_MODEL,
  forgetBridgeCode,
  isPaired,
  saveBridgeSettings,
  useBridgeSettings,
} from './bridgeSettings'
import { failureKey } from './bridgeText'
import { checkBridge } from './useBridgeStatus'

/** Pairing with the bridge: its address and the code it printed. Saved once the bridge accepts it. */
export function BridgeSetup() {
  const { t } = useTranslation()
  const settings = useBridgeSettings()
  const [address, setAddress] = useState(settings?.address || DEFAULT_BRIDGE_ADDRESS)
  const [code, setCode] = useState('')
  const [pairing, setPairing] = useState(false)
  const [failure, setFailure] = useState<BridgeFailure | null>(null)
  const addressId = useId()
  const codeId = useId()

  async function pair() {
    const pairWith = { address: normaliseBridgeAddress(address), code: normaliseBridgeCode(code) }
    if (!pairWith.code) {
      setFailure('notPaired')
      return
    }
    setPairing(true)
    setFailure(null)
    try {
      await checkBridge(pairWith)
      // Any answer that accepted the code pairs, even when Claude Code is not ready yet.
      saveBridgeSettings({ ...pairWith, model: settings?.model ?? DEFAULT_BRIDGE_MODEL })
      setCode('')
    } catch (error) {
      setFailure(error instanceof BridgeError ? error.failure : 'notRunning')
    } finally {
      setPairing(false)
    }
  }

  return (
    <form
      className={styles.bridgeSetup}
      onSubmit={(e) => {
        e.preventDefault()
        void pair()
      }}
    >
      <div className={styles.row}>
        <label htmlFor={addressId}>{t('proposals.bridge.address')}</label>
        <input
          id={addressId}
          className={cx(controls.input, styles.grow)}
          value={address}
          spellCheck={false}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      <div className={styles.row}>
        <label htmlFor={codeId}>{t('proposals.bridge.code')}</label>
        <input
          id={codeId}
          className={cx(controls.input, styles.codeInput)}
          value={code}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="submit" className={controls.button} disabled={pairing}>
          {pairing ? t('proposals.bridge.pairing') : t('proposals.bridge.pair')}
        </button>
        {isPaired(settings) && (
          <button
            type="button"
            className={cx(controls.button, controls.quiet)}
            onClick={forgetBridgeCode}
          >
            {t('proposals.bridge.forget')}
          </button>
        )}
      </div>
      {failure && (
        <p className={panels.warning} role="alert">
          {t(failureKey(failure))}
        </p>
      )}
    </form>
  )
}
