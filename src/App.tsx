import { EditorPage } from './features/editor/EditorPage'
import { ProjectsPage } from './features/projects/ProjectsPage'
import { AppHeader } from './features/shell/AppHeader'
import { NotFoundPage } from './features/shell/NotFoundPage'
import { type Route, useRoute } from './routing'

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'projects':
      return <ProjectsPage />
    case 'editor':
      return <EditorPage projectId={route.projectId} />
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
