import { X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addAsset } from '../../../persistence/projects'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { editorActions } from '../actions'
import styles from '../panels/panels.module.css'
import type { PdfDocument } from './pdf'
import { pickSitePlanFile, registerSitePlanPicker } from './picker'
import {
  MAX_FILE_BYTES,
  SITE_PLAN_ACCEPT,
  SitePlanError,
  type SitePlanErrorCode,
  type SitePlanImage,
  readImage,
  sitePlanKind,
} from './sitePlanFile'

/** Pages beyond this only get a number in the page chooser, no preview. */
const MAX_THUMBNAILS = 24
const THUMBNAIL_PX = 160

type State =
  | { step: 'idle' }
  | { step: 'reading'; fileName: string }
  | { step: 'pages'; fileName: string; pdf: PdfDocument }
  | { step: 'rendering'; fileName: string; page: number }
  | { step: 'error'; code: SitePlanErrorCode }

const codeOf = (error: unknown): SitePlanErrorCode =>
  error instanceof SitePlanError ? error.code : 'unreadable'

/**
 * Imports a site plan: owns the (hidden) file input, reads the chosen image or PDF, lets you pick
 * the page of a multi-page PDF, stores the image and puts it on the plan.
 */
export function SitePlanImport() {
  const input = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>({ step: 'idle' })
  /** Increased by every import and by cancelling, so a stale import can't finish. */
  const run = useRef(0)
  const pdf = useRef<PdfDocument | null>(null)

  useEffect(() => registerSitePlanPicker(() => input.current?.click()), [])

  useEffect(() => {
    useUiStore.getState().setSitePlanDialogOpen(state.step !== 'idle')
  }, [state.step])

  const closePdf = useCallback(() => {
    pdf.current?.destroy()
    pdf.current = null
  }, [])

  // Free the PDF when the editor closes.
  useEffect(() => closePdf, [closePdf])

  /** Cancels or closes the dialog; an import still running is ignored when it finishes. */
  const close = useCallback(() => {
    run.current += 1
    closePdf()
    setState({ step: 'idle' })
  }, [closePdf])

  function fail(error: unknown) {
    if (!(error instanceof SitePlanError)) console.error('Site plan import failed', error)
    closePdf()
    setState({ step: 'error', code: codeOf(error) })
  }

  /** Stores the image and puts it on the plan of the design it was imported into. */
  async function place(myRun: number, image: SitePlanImage, fileName: string, page?: number) {
    const projectId = useProjectStore.getState().project?.id
    if (!projectId) return
    let assetId: string
    try {
      assetId = await addAsset(projectId, image.mimeType, image.data)
    } catch (error) {
      throw new SitePlanError('saveFailed', String(error))
    }
    // Cancelled, or another design opened meanwhile: the stored file is cleaned up later.
    if (run.current !== myRun || useProjectStore.getState().project?.id !== projectId) return
    editorActions.placeSitePlan({
      assetId,
      widthPx: image.widthPx,
      heightPx: image.heightPx,
      fileName: fileName.slice(0, 255),
      ...(page !== undefined && { page }),
    })
    setState({ step: 'idle' })
  }

  async function importFile(file: File) {
    const myRun = ++run.current
    closePdf()
    const kind = sitePlanKind(file)
    if (!kind) return fail(new SitePlanError('unsupported', file.type || file.name))
    if (file.size > MAX_FILE_BYTES) return fail(new SitePlanError('tooLarge', `${file.size}`))

    setState({ step: 'reading', fileName: file.name })
    try {
      if (kind.type === 'image') {
        const image = await readImage(file, kind.mimeType)
        if (run.current === myRun) await place(myRun, image, file.name)
        return
      }
      const { openPdf } = await import('./pdf')
      const doc = await openPdf(await file.arrayBuffer())
      if (run.current !== myRun) return doc.destroy()
      pdf.current = doc
      if (doc.pageCount === 1) await renderPage(myRun, file.name, 1)
      else setState({ step: 'pages', fileName: file.name, pdf: doc })
    } catch (error) {
      if (run.current === myRun) fail(error)
    }
  }

  async function renderPage(myRun: number, fileName: string, page: number) {
    const doc = pdf.current
    if (!doc) return
    setState({ step: 'rendering', fileName, page })
    try {
      const image = await doc.render(page)
      closePdf()
      if (run.current === myRun) await place(myRun, image, fileName, page)
    } catch (error) {
      if (run.current === myRun) fail(error)
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={SITE_PLAN_ACCEPT}
        hidden
        data-testid="site-plan-input"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = '' // so choosing the same file again still imports it
          if (file) void importFile(file)
        }}
      />
      {state.step !== 'idle' && (
        <ImportDialog
          state={state}
          onClose={close}
          onChoosePage={(page) =>
            state.step === 'pages' && void renderPage(run.current, state.fileName, page)
          }
        />
      )}
    </>
  )
}

function ImportDialog({
  state,
  onClose,
  onChoosePage,
}: {
  state: Exclude<State, { step: 'idle' }>
  onClose: () => void
  onChoosePage: (page: number) => void
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const title =
    state.step === 'pages' ? t('editor.sitePlan.choosePage') : t('editor.sitePlan.import')

  return (
    <div className={styles.backdrop}>
      <div
        className={cx(styles.dialog, state.step !== 'pages' && styles.dialogNarrow)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={state.step === 'reading' || state.step === 'rendering'}
      >
        <div className={styles.dialogHeader}>
          <h2 id={titleId} className={styles.dialogTitle}>
            {title}
          </h2>
          <button
            ref={closeButton}
            type="button"
            className={styles.iconButton}
            aria-label={t('common.cancel')}
            onClick={onClose}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {state.step === 'reading' && (
          <p className={styles.text} role="status">
            {t('editor.sitePlan.reading', { file: state.fileName })}
          </p>
        )}
        {state.step === 'rendering' && (
          <p className={styles.text} role="status">
            {t('editor.sitePlan.rendering', { file: state.fileName, page: state.page })}
          </p>
        )}
        {state.step === 'error' && (
          <p className={styles.warning} role="alert">
            {t(`editor.sitePlan.errors.${state.code}`)}
          </p>
        )}
        {state.step === 'pages' && (
          <>
            <p className={styles.hint}>
              {t('editor.sitePlan.pagesHint', { count: state.pdf.pageCount, file: state.fileName })}
            </p>
            <PageChooser pdf={state.pdf} onChoose={onChoosePage} />
          </>
        )}

        <div className={styles.dialogActions}>
          {state.step === 'error' && (
            <button
              type="button"
              className={cx(controls.button, controls.primary)}
              onClick={() => {
                onClose()
                pickSitePlanFile()
              }}
            >
              {t('editor.sitePlan.chooseAnother')}
            </button>
          )}
          <button type="button" className={cx(controls.button, controls.quiet)} onClick={onClose}>
            {state.step === 'error' ? t('editor.sitePlan.close') : t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** A button per page, with a small preview of the first pages (rendered one by one). */
function PageChooser({ pdf, onChoose }: { pdf: PdfDocument; onChoose: (page: number) => void }) {
  const { t } = useTranslation()
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({})

  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (let page = 1; page <= Math.min(pdf.pageCount, MAX_THUMBNAILS); page++) {
        try {
          const url = await pdf.thumbnail(page, THUMBNAIL_PX)
          if (cancelled) return
          setThumbnails((current) => ({ ...current, [page]: url }))
        } catch {
          if (cancelled) return // closed meanwhile; otherwise this page just gets no preview
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdf])

  const pages = Array.from({ length: pdf.pageCount }, (_, i) => i + 1)
  return (
    <ul className={styles.pageGrid}>
      {pages.map((page) => (
        <li key={page}>
          <button
            type="button"
            className={styles.pageButton}
            aria-label={t('editor.sitePlan.page', { page })}
            onClick={() => onChoose(page)}
          >
            {thumbnails[page] ? (
              <img className={styles.pageThumbnail} src={thumbnails[page]} alt="" />
            ) : (
              <span className={styles.pageThumbnail} />
            )}
            <span aria-hidden>{page}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
