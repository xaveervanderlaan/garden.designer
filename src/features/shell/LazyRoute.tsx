import { Component, type ReactNode, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import controls from '../../styles/controls.module.css'
import { cx } from '../../styles/cx'
import page from '../../styles/page.module.css'

/**
 * A screen whose code is loaded on demand (React.lazy), with a loading message meanwhile. If its
 * code can't be loaded (offline before the app was stored for offline use, or an old tab after a
 * new version was published), it says so and offers to reload, instead of a blank page.
 */
export function LazyRoute({ loading, children }: { loading: string; children: ReactNode }) {
  return (
    <LoadErrorBoundary>
      <Suspense
        fallback={
          <section className={page.page}>
            <p className={page.muted} role="status">
              {loading}
            </p>
          </section>
        }
      >
        {children}
      </Suspense>
    </LoadErrorBoundary>
  )
}

class LoadErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Could not show this screen', error)
  }

  render() {
    return this.state.failed ? <LoadFailed /> : this.props.children
  }
}

function LoadFailed() {
  const { t } = useTranslation()
  return (
    <section className={page.page}>
      <div className={controls.error} role="alert">
        <span>{t('app.loadError')}</span>
        <button
          type="button"
          className={cx(controls.button, controls.small)}
          onClick={() => window.location.reload()}
        >
          {t('app.reload')}
        </button>
      </div>
    </section>
  )
}
