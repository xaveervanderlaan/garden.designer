import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { bridgeRequestCount } from '../../../../proposals/bridgePrompts'
import { BRIDGE_MODELS, type BridgeModel } from '../../../../proposals/bridgeProtocol'
import type { PromptInput } from '../../../../proposals/prompt'
import { useBridgeRunStore } from '../../../../store/bridgeRunStore'
import controls from '../../../../styles/controls.module.css'
import { cx } from '../../../../styles/cx'
import panels from '../../panels/panels.module.css'
import styles from '../ideas.module.css'
import { startBridgeRun } from './bridgeActions'
import { forgetBridgeCode, saveBridgeSettings } from './bridgeSettings'
import { failureKey } from './bridgeText'
import { BridgeSetup } from './BridgeSetup'
import { useBridgeStatus } from './useBridgeStatus'

/**
 * One-click generation through the local bridge (M21), above the prompt: set up (pairing) when it
 * isn't, else the model choice and the Generate button once the bridge answers.
 */
export function BridgePanel({
  input,
  count,
  base,
  onStarted,
}: {
  input: PromptInput
  count: number
  base: { projectId: string; updatedAt: number }
  onStarted: () => void
}) {
  const { t } = useTranslation()
  const status = useBridgeStatus()
  const running = useBridgeRunStore((s) => s.status === 'running')
  const modelId = useId()
  const { settings } = status

  if (status.state === 'off' || !settings) {
    return (
      <details className={styles.bridge} data-testid="bridge-panel">
        <summary>{t('proposals.bridge.setUp')}</summary>
        <p className={panels.smallHint}>{t('proposals.bridge.intro')}</p>
        <BridgeSetup />
      </details>
    )
  }

  const generate = () => {
    startBridgeRun({ input, base, count, settings })
    onStarted()
  }

  return (
    <section className={styles.bridge} data-testid="bridge-panel">
      <div className={styles.groupTitle}>{t('proposals.bridge.title')}</div>
      {status.state === 'checking' && (
        <p className={panels.smallHint}>{t('proposals.bridge.checking')}</p>
      )}
      {status.state === 'error' && status.failure && (
        <>
          <p className={panels.warning} role="alert">
            {t(failureKey(status.failure))}
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={cx(controls.button, controls.small)}
              onClick={status.recheck}
            >
              {t('proposals.bridge.checkAgain')}
            </button>
          </div>
          <details>
            <summary>{t('proposals.bridge.change')}</summary>
            <BridgeSetup />
          </details>
        </>
      )}
      {status.state === 'ready' && (
        <>
          <p className={panels.smallHint}>
            {t('proposals.bridge.paired', { version: status.health?.claudeVersion ?? '' })}
          </p>
          <div className={styles.row}>
            <label htmlFor={modelId}>{t('proposals.bridge.model')}</label>
            <select
              id={modelId}
              className={controls.input}
              value={settings.model}
              onChange={(e) =>
                saveBridgeSettings({ ...settings, model: e.target.value as BridgeModel })
              }
            >
              {BRIDGE_MODELS.map((model) => (
                <option key={model} value={model}>
                  {t(`proposals.bridge.models.${model}`)}
                </option>
              ))}
            </select>
          </div>
          <p className={panels.smallHint}>
            {t('proposals.bridge.usageNote', { requests: bridgeRequestCount(count) })}
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={cx(controls.button, controls.primary)}
              disabled={running}
              onClick={generate}
            >
              {t('proposals.bridge.generate', { count })}
            </button>
            <button
              type="button"
              className={cx(controls.button, controls.quiet)}
              onClick={forgetBridgeCode}
            >
              {t('proposals.bridge.forget')}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
