import { useMemo } from 'react'
import type { Project } from '../../../model/schema'
import { type CoarseSunMap, coarseSunMap } from '../../../proposals/sunGrid'
import { useSunMapStore } from '../../../store/sunMapStore'
import { sunMapInput, sunMapKey } from '../sunmap/sunMap'

/** The computed sun-hours map, coarsened for the prompt, or null when there is none or it is out of date. */
export function useCurrentSunMap(project: Project): CoarseSunMap | null {
  const result = useSunMapStore((s) => s.result)
  const key = useSunMapStore((s) => s.key)
  const request = useSunMapStore((s) => s.request)
  return useMemo(() => {
    if (!result || !key || !request) return null
    const input = sunMapInput(project, request)
    if (!input || sunMapKey(input) !== key) return null
    return coarseSunMap(result, project.settings.sunThresholds)
  }, [project, result, key, request])
}
