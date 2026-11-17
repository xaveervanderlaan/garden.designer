import { useEffect } from 'react'
import { type Route, replaceRoute } from '../../routing'

/** Replaces the current history entry with another route; renders nothing. */
export function Redirect({ to }: { to: Exclude<Route, { name: 'notFound' }> }) {
  const key = JSON.stringify(to)
  useEffect(() => {
    replaceRoute(JSON.parse(key) as typeof to)
  }, [key])
  return null
}
