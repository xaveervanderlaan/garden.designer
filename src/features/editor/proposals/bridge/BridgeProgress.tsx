import { useTranslation } from 'react-i18next'
import { useBridgeRunStore } from '../../../../store/bridgeRunStore'
import controls from '../../../../styles/controls.module.css'
import { cx } from '../../../../styles/cx'
import panels from '../../panels/panels.module.css'
import styles from '../ideas.module.css'
import { cancelBridgeRun, retryMissing } from './bridgeActions'
import { failureKey } from './bridgeText'

/** Progress of a generation through the bridge, with Cancel and "Retry missing". */
export function BridgeProgress({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const run = useBridgeRunStore()
  if (run.status === 'idle' || run.projectId !== projectId) return null
  const running = run.status === 'running'

  // Counts proposals, not requests: those are an internal step.
  const progress = t('proposals.bridge.progress', { ready: run.ready, total: run.wanted })
  const status = running
    ? `${
        run.kind === 'followUp'
          ? t('proposals.bridge.phase.followUp')
          : run.phase === 'concepts'
            ? t('proposals.bridge.phase.concepts')
            : t('proposals.bridge.phase.details')
      } ${progress}`
    : run.status === 'done'
      ? run.ready >= run.wanted
        ? t('proposals.bridge.done', { count: run.ready })
        : t('proposals.bridge.donePartly', { ready: run.ready, count: run.wanted })
      : run.status === 'cancelled'
        ? `${t('proposals.bridge.cancelled')} ${progress}`
        : ''

  return (
    <section className={styles.bridgeProgress} data-testid="bridge-progress">
      <div className={styles.actions}>
        <span className={styles.status} role="status" data-testid="bridge-status">
          {status}
        </span>
        {running && (
          <button
            type="button"
            className={cx(controls.button, controls.small)}
            onClick={cancelBridgeRun}
          >
            {t('proposals.bridge.cancel')}
          </button>
        )}
        {!running && run.kind === 'generate' && run.failedIds.length > 0 && (
          <button
            type="button"
            className={cx(controls.button, controls.small)}
            onClick={retryMissing}
          >
            {t('proposals.bridge.retryMissing')}
          </button>
        )}
      </div>
      {run.concepts.length > 0 && (
        <ul className={styles.conceptList}>
          {run.concepts.map((c) => (
            <li key={c.id} data-state={c.state}>
              <span>{c.title}</span>
              <span className={styles.conceptState}>
                {t(`proposals.bridge.conceptState.${c.state}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {run.failure && run.status !== 'cancelled' && (
        <div className={panels.warning} role="alert">
          {t(failureKey(run.failure))}
          {run.detail && <div className={panels.smallHint}>{run.detail}</div>}
        </div>
      )}
      {!running && run.failedIds.length > 0 && (
        <p className={panels.smallHint}>
          {t('proposals.bridge.failedIds', { count: run.failedIds.length })}
        </p>
      )}
    </section>
  )
}
