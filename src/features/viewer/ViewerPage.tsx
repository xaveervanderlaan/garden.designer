import { ArrowLeft, CalendarDays, Layers, Maximize, Pencil } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TAP_TOLERANCE_PX } from '../../geometry/gestures'
import { type HitItem, itemAt } from '../../model/hitTest'
import { PLOT_ID } from '../../model/plot'
import type { LayerId, Point, Project } from '../../model/schema'
import { loadProject } from '../../persistence/projects'
import { hrefFor } from '../../routing'
import controls from '../../styles/controls.module.css'
import { cx } from '../../styles/cx'
import page from '../../styles/page.module.css'
import type { PlantView } from '../../styles/plantAppearance'
import { usePhoneScreen } from '../shell/phoneScreen'
import { CalendarSheet } from './CalendarSheet'
import { ItemSheet } from './ItemSheet'
import { LayersSheet } from './LayersSheet'
import { ViewerPlan } from './ViewerPlan'
import { withLayerVisibility } from './viewerLayers'
import styles from './viewer.module.css'

/** The one sheet that is open. */
type Sheet = { kind: 'item'; hit: HitItem } | { kind: 'layers' } | { kind: 'calendar' } | null

type Loaded = { state: 'loading' | 'notFound' | 'error' } | { state: 'ready'; project: Project }

/** Read-only view of a design for a phone: it never writes the project. */
export default function ViewerPage({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const [loaded, setLoaded] = useState<{ projectId: string; result: Loaded } | null>(null)

  useEffect(() => {
    let cancelled = false
    loadProject(projectId).then(
      (project) => {
        if (cancelled) return
        setLoaded({
          projectId,
          result: project ? { state: 'ready', project } : { state: 'notFound' },
        })
      },
      (error: unknown) => {
        console.error('Could not load the design', error)
        if (!cancelled) setLoaded({ projectId, result: { state: 'error' } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [projectId])

  const result = loaded?.projectId === projectId ? loaded.result : { state: 'loading' as const }
  if (result.state === 'ready') return <Viewer project={result.project} />
  const text =
    result.state === 'notFound'
      ? t('editor.notFound')
      : result.state === 'error'
        ? t('editor.loadError')
        : t('editor.loading')
  return (
    <section className={page.page}>
      <p className={result.state === 'error' ? controls.error : page.muted}>{text}</p>
      {result.state !== 'loading' && (
        <a className={page.link} href={hrefFor({ name: 'projects' })}>
          {t('editor.back')}
        </a>
      )}
    </section>
  )
}

function Viewer({ project: saved }: { project: Project }) {
  const { t } = useTranslation()
  const phone = usePhoneScreen()
  const [fitRequest, setFitRequest] = useState(0)
  // This year's size in the usual colours; the viewer has no year or month controls.
  const [view] = useState<PlantView>(() => ({ year: new Date().getFullYear(), month: null }))
  const [sheet, setSheet] = useState<Sheet>(null)
  const [tapped, setTapped] = useState(false)
  // Layer toggles only change what is drawn; they are never saved.
  const [overrides, setOverrides] = useState<Partial<Record<LayerId, boolean>>>({})
  const project = useMemo(() => withLayerVisibility(saved, overrides), [saved, overrides])
  const toggleLayer = useCallback(
    (layer: LayerId) => setOverrides((o) => ({ ...o, [layer]: !project.layers[layer].visible })),
    [project],
  )
  const toggleSheet = (kind: 'layers' | 'calendar') =>
    setSheet((s) => (s?.kind === kind ? null : { kind }))

  // A tap on an item opens its sheet; a tap on nothing closes it.
  const onTap = useCallback(
    (world: Point, scale: number) => {
      setTapped(true)
      const hit = itemAt(project, world, { view, toleranceM: TAP_TOLERANCE_PX / scale })
      setSheet(hit ? { kind: 'item', hit } : null)
    },
    [project, view],
  )
  const closeSheet = useCallback(() => setSheet(null), [])
  const hit = sheet?.kind === 'item' ? sheet.hit : null
  const selection = useMemo<ReadonlySet<string>>(
    () => new Set(hit ? [hit.type === 'plot' ? PLOT_ID : hit.id] : []),
    [hit],
  )

  return (
    <div className={styles.viewer}>
      <header className={styles.bar}>
        <a
          className={styles.iconLink}
          href={hrefFor({ name: 'projects' })}
          aria-label={t('viewer.back')}
          title={t('viewer.back')}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </a>
        <h1 className={styles.name}>{project.name}</h1>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={t('viewer.fit')}
          title={t('viewer.fit')}
          onClick={() => setFitRequest((n) => n + 1)}
        >
          <Maximize size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={t('viewer.layers')}
          title={t('viewer.layers')}
          aria-pressed={sheet?.kind === 'layers'}
          onClick={() => toggleSheet('layers')}
        >
          <Layers size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={t('viewer.calendar')}
          title={t('viewer.calendar')}
          aria-pressed={sheet?.kind === 'calendar'}
          onClick={() => toggleSheet('calendar')}
        >
          <CalendarDays size={20} aria-hidden="true" />
        </button>
        {!phone && (
          <a
            className={cx(controls.button, controls.small)}
            href={hrefFor({ name: 'editor', projectId: project.id })}
          >
            <Pencil size={16} aria-hidden="true" /> {t('viewer.openInEditor')}
          </a>
        )}
      </header>
      <div className={styles.main}>
        <ViewerPlan
          project={project}
          view={view}
          selection={selection}
          fitRequest={fitRequest}
          onTap={onTap}
        />
        {!tapped && (
          <p className={styles.hint} role="status">
            {t('viewer.hint')}
          </p>
        )}
        {hit && <ItemSheet project={project} hit={hit} view={view} onClose={closeSheet} />}
        {sheet?.kind === 'layers' && (
          <LayersSheet
            project={project}
            visible={
              Object.fromEntries(
                Object.entries(project.layers).map(([id, l]) => [id, l.visible]),
              ) as Record<LayerId, boolean>
            }
            onToggle={toggleLayer}
            onClose={closeSheet}
          />
        )}
        {sheet?.kind === 'calendar' && <CalendarSheet project={project} onClose={closeSheet} />}
      </div>
    </div>
  )
}
