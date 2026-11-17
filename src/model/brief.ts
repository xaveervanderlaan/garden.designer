import type { Brief, MustHaveKind, Point, Project } from './schema'

/** Whether a must-have's size is an area in m² or a number of items. */
export const MUST_HAVE_UNITS: Record<MustHaveKind, 'm2' | 'count'> = {
  terrace: 'm2',
  lawn: 'm2',
  'vegetable-beds': 'count',
  'fruit-trees': 'count',
  pond: 'm2',
  shed: 'm2',
  greenhouse: 'm2',
  'play-area': 'm2',
  compost: 'm2',
  paths: 'm2',
  seating: 'm2',
}

export function defaultBrief(): Brief {
  return {
    styles: [],
    mustHaves: [],
    screening: [],
    maintenance: 'medium',
    priorities: [],
    colours: [],
    includePlants: [],
    avoidPlants: [],
    avoidToxic: false,
    notes: '',
    count: 12,
    variety: 'varied',
    mayChange: [],
  }
}

export function setBrief(project: Project, brief: Brief): Project {
  return { ...project, brief }
}

/** Sets or clears (null) the design area, creating a default brief when there is none. */
export function setBriefArea(project: Project, area: Point[] | null): Project {
  const { area: _, ...rest } = project.brief ?? defaultBrief()
  return { ...project, brief: area ? { ...rest, area } : rest }
}

export type BaseRefs = {
  /** E1, E2, … → object id (dimensions are skipped). */
  objects: Map<string, string>
  /** P1, P2, … → planting id. */
  plantings: Map<string, string>
  refOf: Map<string, string>
}

/** Short references that stand in for ids in the prompt and in `remove` elements. */
export function baseRefs(project: Project): BaseRefs {
  const objects = new Map<string, string>()
  const plantings = new Map<string, string>()
  const refOf = new Map<string, string>()
  let e = 0
  for (const object of project.objects) {
    if (object.kind === 'dimension') continue
    const ref = `E${++e}`
    objects.set(ref, object.id)
    refOf.set(object.id, ref)
  }
  let p = 0
  for (const planting of project.plantings) {
    const ref = `P${++p}`
    plantings.set(ref, planting.id)
    refOf.set(planting.id, ref)
  }
  return { objects, plantings, refOf }
}
