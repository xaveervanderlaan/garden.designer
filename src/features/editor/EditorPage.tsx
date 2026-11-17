import { Suspense, lazy, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project } from '../../model/schema'
import { hrefFor } from '../../routing'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import controls from '../../styles/controls.module.css'
import page from '../../styles/page.module.css'
import { LibraryPanel } from '../library/LibraryPanel'
import { PlantFormDialog } from '../library/PlantFormDialog'
import { EditorToolbar } from './EditorToolbar'
import styles from './EditorPage.module.css'
import { AreasPanel } from './panels/AreasPanel'
import { LegendPanel } from './panels/LegendPanel'
import { SunMapPanel } from './sunmap/SunMapPanel'
import { LayersPanel } from './panels/LayersPanel'
import { PlantingListPanel } from './panels/PlantingListPanel'
import { PropertiesPanel } from './panels/PropertiesPanel'
import { RectangleDialog } from './panels/RectangleDialog'
import { SettingsDialog } from './panels/SettingsDialog'
import { ExportDialog } from './export/ExportDialog'
import { DesignIdeasDialog } from './proposals/DesignIdeasDialog'
import { ShortcutHelp } from './panels/ShortcutHelp'
import { StatusBar } from './panels/StatusBar'
import { WarningsPanel } from './panels/WarningsPanel'
import { useEditorShortcuts } from './shortcuts'
import { SitePlanImport } from './siteplan/SitePlanImport'
import { StorageErrorBanner } from './StorageErrorBanner'
import { BloomChartDialog } from './view/BloomChartDialog'
import { VegCalendarDialog } from './view/VegCalendarDialog'
import { ViewBar } from './view/ViewBar'

// Konva is large: load the canvas only when a design is opened.
const GardenCanvas = lazy(() => import('./canvas/GardenCanvas'))

type Props = { projectId: string }

export function EditorPage({ projectId }: Props) {
  const { t } = useTranslation()
  const project = useProjectStore((s) => s.project)
  const loadState = useProjectStore((s) => s.loadState)

  useEffect(() => {
    const { open, close } = useProjectStore.getState()
    useUiStore.getState().reset()
    void open(projectId)
    return () => void close()
  }, [projectId])

  // Write pending changes before the tab is hidden or closed.
  useEffect(() => {
    const flush = () => void useProjectStore.getState().flush()
    const onVisibility = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  // Changes that couldn't be saved are lost when the page closes: let the browser ask first.
  const unsaved = useProjectStore((s) => s.saveState === 'error')
  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  if (loadState !== 'ready' || !project) {
    const text =
      loadState === 'notFound'
        ? t('editor.notFound')
        : loadState === 'error'
          ? t('editor.loadError')
          : t('editor.loading')
    return (
      <section className={page.page}>
        <p className={loadState === 'error' ? controls.error : page.muted}>{text}</p>
        {(loadState === 'notFound' || loadState === 'error') && (
          <a className={page.link} href={hrefFor({ name: 'projects' })}>
            {t('editor.back')}
          </a>
        )}
      </section>
    )
  }

  return <Workspace project={project} />
}

function Workspace({ project }: { project: Project }) {
  const { t } = useTranslation()
  useEditorShortcuts()

  return (
    <div className={styles.editor}>
      <EditorToolbar project={project} />
      <aside className={styles.left}>
        <LibraryPanel project={project} />
      </aside>
      <div className={styles.canvasArea}>
        <StorageErrorBanner project={project} />
        <ViewBar project={project} />
        <div className={styles.plan}>
          <Suspense fallback={<p className={styles.canvasLoading}>{t('editor.loading')}</p>}>
            <GardenCanvas />
          </Suspense>
        </div>
      </div>
      <aside className={styles.right}>
        <PropertiesPanel project={project} />
        <WarningsPanel project={project} />
        <PlantingListPanel project={project} />
        <AreasPanel project={project} />
        <LegendPanel project={project} />
        <SunMapPanel project={project} />
        <LayersPanel project={project} />
      </aside>
      <div className={styles.status}>
        <StatusBar project={project} />
      </div>
      <ShortcutHelp />
      <RectangleDialog />
      <SettingsDialog />
      <ExportDialog />
      <DesignIdeasDialog />
      <SitePlanImport />
      <PlantFormDialog />
      <BloomChartDialog />
      <VegCalendarDialog />
    </div>
  )
}
