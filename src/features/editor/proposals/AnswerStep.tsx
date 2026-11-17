import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLanguage } from '../../../i18n'
import { formatDate } from '../../../i18n/format'
import { defaultBrief } from '../../../model/brief'
import type { Project } from '../../../model/schema'
import {
  type ProposalSetRecord,
  listProposalSets,
  saveProposalSet,
} from '../../../persistence/proposalSets'
import {
  type AnswerProblem,
  MAX_ANSWER_CHARS,
  buildContinuePrompt,
  parseAnswer,
} from '../../../proposals/parse'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import panels from '../panels/panels.module.css'
import styles from './ideas.module.css'
import type { FollowUpRequest } from '../../../proposals/followUp'
import { FollowUpPanel } from './FollowUpPanel'
import { ProposalGallery } from './ProposalGallery'
import { copyText } from './clipboard'
import { addAnswerToSet, nowMs } from './proposalSet'

type ErrorKey = 'empty' | 'noJson' | 'notProposals' | 'tooLarge' | 'readFailed' | 'saveFailed'

const FILE_TYPES = '.json,.txt,.md,application/json,text/plain,text/markdown'

/**
 * Reading Claude's answer: paste it, drop a file or choose one. Valid proposals are added to the
 * active set (saved per design) and listed below; rejected ones are listed with their problems.
 */
export function AnswerStep({ project }: { project: Project }) {
  const { t } = useTranslation()
  const [sets, setSets] = useState<ProposalSetRecord[]>([])
  /** The set new answers go into; null = start a new one with the next answer. */
  const [activeId, setActiveId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<ErrorKey | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [continueCopied, setContinueCopied] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [followUp, setFollowUp] = useState<FollowUpRequest | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const answerId = useId()
  const setId = useId()

  useEffect(() => {
    let cancelled = false
    void listProposalSets(project.id).then((list) => {
      if (cancelled) return
      setSets(list)
      setActiveId((id) => id ?? list[0]?.id ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [project.id])

  const active = sets.find((s) => s.id === activeId) ?? null

  async function read(answer: string) {
    setTruncated(false)
    setContinueCopied(false)
    const parsed = parseAnswer(answer)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    const next = addAnswerToSet(
      active,
      parsed,
      {
        projectId: project.id,
        updatedAt: project.updatedAt,
        requested: (project.brief ?? defaultBrief()).count,
      },
      nowMs(),
    )
    try {
      await saveProposalSet(next)
    } catch (e) {
      console.warn('Saving the proposals failed', e)
      setError('saveFailed')
      return
    }
    setError(null)
    setTruncated(parsed.truncated)
    setText('')
    setSets((list) => [next, ...list.filter((s) => s.id !== next.id)])
    setActiveId(next.id)
  }

  /** Shows a changed set (stars, discards) at once and saves it. */
  function changeSet(next: ProposalSetRecord) {
    setSets((list) => list.map((s) => (s.id === next.id ? next : s)))
    saveProposalSet(next).catch((e: unknown) => {
      console.warn('Saving the proposals failed', e)
      setError('saveFailed')
    })
  }

  async function readFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_ANSWER_CHARS) {
      setError('tooLarge')
      return
    }
    try {
      await read(await file.text())
    } catch {
      setError('readFailed')
    }
  }

  async function copyContinue() {
    if (!active) return
    const prompt = buildContinuePrompt({
      received: active.proposals.map((p) => p.id),
      invalid: active.problems.map((p) => p.proposalId).filter((id): id is string => !!id),
      requested: active.requested,
      language: currentLanguage(),
    })
    setContinueCopied(await copyText(prompt))
  }

  const count = active?.proposals.length ?? 0
  const incomplete = active !== null && (count < active.requested || active.problems.length > 0)

  return (
    <div>
      {sets.length > 0 && (
        <div className={styles.row}>
          <label htmlFor={setId}>{t('proposals.answer.set')}</label>
          <select
            id={setId}
            className={controls.input}
            value={activeId ?? ''}
            onChange={(e) => {
              setActiveId(e.target.value || null)
              setFollowUp(null)
            }}
          >
            {activeId === null && <option value="">{t('proposals.answer.newSetOption')}</option>}
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {t('proposals.answer.setOption', {
                  date: formatDate(s.createdAt),
                  count: s.proposals.length,
                })}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={cx(controls.button, controls.small)}
            disabled={activeId === null}
            onClick={() => {
              setActiveId(null)
              setFollowUp(null)
            }}
          >
            {t('proposals.answer.newSet')}
          </button>
        </div>
      )}

      {followUp && (
        <FollowUpPanel project={project} request={followUp} onClose={() => setFollowUp(null)} />
      )}

      <div
        className={cx(styles.drop, dragOver && styles.dropActive)}
        data-testid="answer-drop"
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (e.dataTransfer.files.length === 0) return
          e.preventDefault()
          setDragOver(false)
          void readFile(e.dataTransfer.files[0])
        }}
      >
        <label className={controls.label} htmlFor={answerId}>
          {t('proposals.answer.paste')}
        </label>
        <textarea
          id={answerId}
          className={cx(controls.input, styles.textarea)}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className={styles.actions}>
          <button
            type="button"
            className={cx(controls.button, controls.primary)}
            onClick={() => void read(text)}
          >
            {t('proposals.answer.read')}
          </button>
          <button
            type="button"
            className={cx(controls.button, controls.quiet)}
            onClick={() => fileInput.current?.click()}
          >
            {t('proposals.answer.chooseFile')}
          </button>
          <span className={panels.smallHint}>{t('proposals.answer.drop')}</span>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept={FILE_TYPES}
            data-testid="answer-file"
            onChange={(e) => {
              void readFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      </div>

      {error && (
        <p className={panels.warning} role="alert">
          {t(`proposals.answer.errors.${error}`)}
        </p>
      )}

      {active && (
        <>
          <div className={styles.actions}>
            <span className={styles.status} role="status" data-testid="answer-status">
              {t('proposals.answer.status', {
                count,
                requested: Math.max(active.requested, count),
              })}
            </span>
            {incomplete && (
              <button
                type="button"
                className={cx(controls.button, controls.small)}
                onClick={() => void copyContinue()}
              >
                {t('proposals.answer.continue')}
              </button>
            )}
            {continueCopied && (
              <span className={styles.status}>{t('proposals.prompt.copied')}</span>
            )}
          </div>
          {truncated && <p className={panels.smallHint}>{t('proposals.answer.truncated')}</p>}
          {active.baseUpdatedAt < project.updatedAt && (
            <p className={panels.smallHint}>{t('proposals.answer.changedSince')}</p>
          )}
          {active.problems.length > 0 && <Problems problems={active.problems} />}
          <ProposalGallery
            project={project}
            set={active}
            onSetChange={changeSet}
            onFollowUp={setFollowUp}
          />
        </>
      )}
    </div>
  )
}

function Problems({ problems }: { problems: AnswerProblem[] }) {
  const { t } = useTranslation()
  return (
    <div data-testid="answer-problems">
      <div className={styles.groupTitle}>{t('proposals.answer.problems')}</div>
      <ul className={styles.problems}>
        {problems.map((problem, i) => (
          <li key={`${problem.proposalId ?? ''}-${i}`}>
            {problem.title ||
              problem.proposalId ||
              t('proposals.answer.proposalN', { number: problem.index + 1 })}
            {': '}
            {problem.issues
              .map((issue) => t(`proposals.issues.${issue.code}`, { path: issue.path || '–' }))
              .join('; ')}
          </li>
        ))}
      </ul>
    </div>
  )
}
