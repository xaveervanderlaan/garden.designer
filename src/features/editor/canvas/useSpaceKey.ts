import { useEffect, useState } from 'react'
import { isTypingTarget } from '../shortcuts'

/** True while the space bar is held (outside text fields): temporary pan mode. */
export function useSpaceKey(): boolean {
  const [held, setHeld] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isTypingTarget(event.target)) return
      event.preventDefault() // no page scroll, no "click" on a focused button
      setHeld(true)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setHeld(false)
    }
    const release = () => setHeld(false)
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
