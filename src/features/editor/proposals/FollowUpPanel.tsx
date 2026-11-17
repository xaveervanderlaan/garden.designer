import { X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLanguage } from '../../../i18n'
import { formatNumber } from '../../../i18n/units'
import { defaultBrief } from '../../../model/brief'
import type { Project } from '../../../model/schema'
import { type FollowUpRequest, buildFollowUpPrompt } from '../../../proposals/followUp'
import { promptSize } from '../../../proposals/prompt'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import panels from '../panels/panels.module.css'
import { copyText } from './clipboard'
import styles from './ideas.module.css'
import { MORE_LIKE_COUNTS, plantingYear } from './proposalSet'
import { useCurrentSunMap } from './useCurrentSunMap'

/**
 * A follow-up prompt (variations of one proposal, or new versions of some) to copy into Claude.
 * The answer goes into the paste box below it, like the first one.
 */
export function FollowUpPanel({
  project,
  request,
  onClose,
}: {
  project: Project
  request: FollowUpRequest
  onClose: () => void
}) {
  const { t } = useTranslation()
  const language = currentLanguage()
  const sunMap = useCurrentSunMap(project)
  const [count, setCount] = useState(request.kind === 'moreLike' ? request.count : 0)
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null)
  const text = useRef<HTMLTextAreaElement>(null)
  const copyButton = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const countId = useId()
  const prompt = useMemo(
    () =>
      buildFollowUpPrompt(
        {
          project,
          brief: project.brief ?? defaultBrief(),
          language,
          sunMap,
          year: plantingYear(),
        },
        request.kind === 'moreLike' ? { ...request, count } : request,
      ),
    [project, language, sunMap, request, count],
  )
  const size = promptSize(prompt)

  // The panel opens above the paste box, far from the button that asked for it: bring it into view.
  useEffect(() => {
    copyButton.current?.focus()
  }, [request])

  async function copy() {
    const ok = await copyText(prompt)
    setCopied(ok ? 'yes' : 'failed')
    if (!ok) text.current?.select()
  }

  return (
    <section className={styles.followUp} aria-labelledby={titleId} data-testid="followup">
      <div className={styles.followUpHeader}>
        <h3 id={titleId}>
          {request.kind === 'moreLike'
            ? t('proposals.followUp.titleMore', { title: request.proposal.title })
            : t('proposals.followUp.titleRegenerate', { count: request.proposals.length })}
        </h3>
        <button
          type="button"
          className={panels.iconButton}
          aria-label={t('proposals.followUp.close')}
          onClick={onClose}
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      <p className={panels.smallHint}>{t('proposals.followUp.intro')}</p>
      {request.kind === 'moreLike' && (
        <div className={styles.row}>
          <label htmlFor={countId}>{t('proposals.followUp.count')}</label>
          <select
            id={countId}
            className={controls.input}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {MORE_LIKE_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}
      <textarea
        ref={text}
        className={cx(controls.input, styles.followUpText)}
        aria-label={t('proposals.prompt.label')}
        data-testid="followup-prompt"
        readOnly
        value={prompt}
      />
      <div className={styles.actions}>
        <span className={styles.status}>
          {t('proposals.prompt.size', {
            chars: formatNumber(size.chars, 0),
            tokens: formatNumber(size.tokens, 0),
          })}
        </span>
        <button
          ref={copyButton}
          type="button"
          className={cx(controls.button, controls.primary)}
          onClick={() => void copy()}
        >
          {t('proposals.followUp.copy')}
        </button>
        <span className={styles.status} role="status">
          {copied === 'yes'
            ? t('proposals.followUp.copied')
            : copied === 'failed'
              ? t('proposals.prompt.copyFailed')
              : ''}
        </span>
      </div>
    </section>
  )
}
