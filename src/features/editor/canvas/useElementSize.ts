import { type RefObject, useLayoutEffect, useState } from 'react'
import type { Size } from '../../../geometry/viewport'

/**
 * The element's size in whole CSS pixels, rounded down from its layout box, so the stage never
 * overhangs it. Not `clientWidth`/`clientHeight`: those round to the nearest pixel, and a
 * fractional height (e.g. from font metrics in a bar above the plan) would then round up on some
 * machines and down on others. The element must have no padding or border.
 */
export function elementSize(element: HTMLElement): Size {
  const rect = element.getBoundingClientRect()
  return { width: Math.floor(rect.width), height: Math.floor(rect.height) }
}

/** The element's size (see `elementSize`), kept up to date with a ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement | null>): Size | null {
  const [size, setSize] = useState<Size | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const { width, height } = elementSize(element)
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
