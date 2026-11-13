import { useEffect, useRef } from 'react'

/**
 * Whether Alt is held (snapping off). A ref, not state: Konva's dragBoundFunc reads it during a
 * drag without re-rendering.
 */
export function useAltKey() {
  const held = useRef(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        held.current = true
        event.preventDefault() // keep Alt from focusing the browser menu bar
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') held.current = false
    }
    const release = () => (held.current = false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', release)
    }
  }, [])

  return held
}
