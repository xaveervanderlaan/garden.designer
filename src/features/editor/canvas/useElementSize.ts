import { type RefObject, useLayoutEffect, useState } from 'react'
import type { Size } from '../../../geometry/viewport'

/** The element's content size in CSS pixels, kept up to date with a ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement | null>): Size | null {
  const [size, setSize] = useState<Size | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const width = Math.floor(element.clientWidth)
      const height = Math.floor(element.clientHeight)
      setSize((current) =>
        current && current.width === width && current.height === height
          ? current
          : { width, height },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}
