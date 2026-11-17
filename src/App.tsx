import { lazy } from 'react'
import { useTranslation } from 'react-i18next'
import { ProjectsPage } from './features/projects/ProjectsPage'
import { AppHeader } from './features/shell/AppHeader'
import { usePhoneScreen } from './features/shell/phoneScreen'
import { Redirect } from './features/shell/Redirect'
import { LazyRoute } from './features/shell/LazyRoute'
import { NotFoundPage } from './features/shell/NotFoundPage'
import { type Route, useRoute } from './routing'

// The editor (with Konva, the plant library and its data) is loaded when a design is opened, so
// the project list starts quickly. The service worker stores it for offline use all the same.
const EditorPage = lazy(async () => ({
  default: (await import('./features/editor/EditorPage')).EditorPage,
}))

// The viewer is a separate chunk that never pulls in the editor, so a phone downloads no editing code.
const ViewerPage = lazy(() => import('./features/viewer/ViewerPage'))

function Screen({ route }: { route: Route }) {
  const { t } = useTranslation()
  const phone = usePhoneScreen()
  switch (route.name) {
    case 'projects':
      return <ProjectsPage />
    case 'editor':
      if (phone) return <Redirect to={{ name: 'viewer', projectId: route.projectId }} />
      return (
        <LazyRoute loading={t('editor.loading')}>
          <EditorPage projectId={route.projectId} />
        </LazyRoute>
      )
    case 'viewer':
      return (
        <LazyRoute loading={t('editor.loading')}>
          <ViewerPage projectId={route.projectId} />
        </LazyRoute>
      )
    case 'notFound':
      return <NotFoundPage />
  }
}

export default function App() {
  const route = useRoute()

  return (
    <>
      <AppHeader />
      <main>
        <Screen route={route} />
      </main>
    </>
  )
}
