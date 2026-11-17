import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addObject } from '../../../model/objects'
import type { Point, Project } from '../../../model/schema'
import { createProject } from '../../../persistence/projects'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { ObjectProperties } from './ObjectProperties'

const store = () => useProjectStore.getState()
const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

function add(kind: Parameters<typeof addObject>[1], shape: Parameters<typeof addObject>[2]) {
  let id = ''
  act(() =>
    store().update((p) => {
      const r = addObject(p, kind, shape)
      id = r.id
      return r.project
    }),
  )
  return id
}

function Panel({ id }: { id: string }) {
  const project = useProjectStore((s) => s.project) as Project | null
  const object = project?.objects.find((o) => o.id === id)
  if (!project || !object) return null
  return <ObjectProperties project={project} object={object} />
}

describe('ObjectProperties (surfaces and boundaries)', () => {
  beforeEach(async () => {
    useUiStore.getState().reset()
    const project = await createProject('Tuin')
    await store().open(project.id)
  })

  afterEach(async () => {
    await store().close()
    useUiStore.getState().reset()
  })

  it('chooses a terrace material in one undo step', async () => {
    const user = userEvent.setup()
    const id = add('terrace', { type: 'polygon', points: rect(0, 0, 4, 3) })
    render(<Panel id={id} />)
    await user.selectOptions(screen.getByTestId('object-material'), 'wood')
    expect(store().project!.objects[0]!.material).toBe('wood')
    act(() => store().undo())
    expect(store().project!.objects[0]!.material).not.toBe('wood')
  })

  it('shows gross and net area of a lawn under a terrace', () => {
    const lawn = add('lawn', { type: 'polygon', points: rect(0, 0, 10, 4) })
    add('terrace', { type: 'polygon', points: rect(0, 0, 2, 3) })
    render(<Panel id={lawn} />)
    expect(screen.getByTestId('object-area').textContent).toMatch(/^40\.00\sm²/)
    expect(screen.getByTestId('object-net-area').textContent).toMatch(/^34\.00\sm²/)
  })

  it('links a hedge to a hedging species and counts the plants', async () => {
    const user = userEvent.setup()
    const id = add('hedge', {
      type: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      thicknessM: 0.6,
    })
    render(<Panel id={id} />)
    const select = screen.getByTestId('hedge-plant') as HTMLSelectElement
    expect(select.options.length).toBeGreaterThan(1)
    await user.selectOptions(select, select.options[1]!.value)
    expect(store().project!.objects[0]!.plantId).toBe(select.options[1]!.value)
    expect(screen.getByTestId('hedge-plant-count').textContent).toMatch(/^\d+ plants, .* apart/)
  })
})
