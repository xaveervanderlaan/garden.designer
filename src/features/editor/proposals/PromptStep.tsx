import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLanguage } from '../../../i18n'
import { formatNumber } from '../../../i18n/units'
import { defaultBrief } from '../../../model/brief'
import { hasPlot } from '../../../model/plot'
import type { Project } from '../../../model/schema'
import { type PromptInput, buildPrompt, promptSize } from '../../../proposals/prompt'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import panels from '../panels/panels.module.css'
import { BridgePanel } from './bridge/BridgePanel'
import { copyText } from './clipboard'
import styles from './ideas.module.css'
import { plantingYear } from './proposalSet'
import { useCurrentSunMap } from './useCurrentSunMap'

/** The prompt for Claude, made from the saved design and brief, with its size and a Copy button. */
export function PromptStep({ project, onNext }: { project: Project; onNext: () => void }) {
  const { t } = useTranslation()
  const language = currentLanguage()
  const sunMap = useCurrentSunMap(project)
  const plot = hasPlot(project)
  const input = useMemo<PromptInput>(
    () => ({
      project,
      brief: project.brief ?? defaultBrief(),
      language,
      sunMap,
      year: plantingYear(),
    }),
    [project, language, sunMap],
  )
  const prompt = useMemo(() => (plot ? buildPrompt(input) : ''), [input, plot])
  const size = promptSize(prompt)
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null)
  const text = useRef<HTMLTextAreaElement>(null)

  if (!plot) {
    return (
      <p className={panels.warning} role="alert">
        {t('proposals.prompt.noPlot')}
      </p>
    )
  }

  async function copy() {
    const ok = await copyText(prompt)
    setCopied(ok ? 'yes' : 'failed')
    if (!ok) text.current?.select()
  }

  return (
    <div>
      <BridgePanel
        input={input}
        count={input.brief.count}
        base={{ projectId: project.id, updatedAt: project.updatedAt }}
        onStarted={onNext}
      />
      <p className={styles.intro}>{t('proposals.prompt.intro')}</p>
      <textarea
        ref={text}
        className={cx(controls.input, styles.promptText)}
        aria-label={t('proposals.prompt.label')}
        data-testid="ideas-prompt"
        readOnly
        value={prompt}
      />
      <div className={styles.actions}>
        <span className={styles.status} data-testid="ideas-prompt-size">
          {t('proposals.prompt.size', {
            chars: formatNumber(size.chars, 0),
            tokens: formatNumber(size.tokens, 0),
          })}
        </span>
        <button type="button" className={cx(controls.button, controls.primary)} onClick={copy}>
          {t('proposals.prompt.copy')}
        </button>
        <span className={styles.status} role="status">
          {copied === 'yes'
            ? t('proposals.prompt.copied')
            : copied === 'failed'
              ? t('proposals.prompt.copyFailed')
              : ''}
        </span>
      </div>
      <p className={panels.smallHint}>
        {sunMap ? t('proposals.prompt.sunMapIncluded') : t('proposals.prompt.sunMapHint')}
      </p>
      <div className={panels.dialogActions}>
        <button type="button" className={cx(controls.button, controls.primary)} onClick={onNext}>
          {t('proposals.prompt.next')}
        </button>
      </div>
    </div>
  )
}
