import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'

// jsdom has no real <canvas>; the plan itself is covered by the Playwright tests.
vi.mock('../canvas/GardenCanvas', () => ({ default: () => null }))
import { addBed } from '../../../model/beds'
import { newProject } from '../../../model/defaults'
import { addPlantings } from '../../../model/plantings'
import type { Point, Project } from '../../../model/schema'
import { db } from '../../../persistence/db'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

/**
 * A 20 × 10 m plot with a front border (4 catmint, 1 astilbe, which doesn't suit sand) and
 * 2 catmint outside any bed, overlapping each other.
 */
function design(): Project {
  let project: Project = {
    ...newProject('Front garden', 0),
    plot: { outline: rect(0, 0, 20, 10) },
  }
  const bed = addBed(project, 'bed-ornamental', rect(0, 0, 4, 2))
  project = { ...bed.project, objects: [{ ...bed.project.objects[0]!, label: 'Front border' }] }
  project = addPlantings(project, 'nepeta-faassenii', rect(0.5, 0.5, 1, 1), 2027).project
  project = addPlantings(project, 'astilbe-arendsii', [{ x: 3, y: 1 }], 2027).project
  project = addPlantings(
    project,
    'nepeta-faassenii',
    [
      { x: 10, y: 5 },
      { x: 10.2, y: 5 },
    ],
    2027,
  ).project
  return project
}

async function openEditor(project = design()) {
  await db.projects.add(project)
  useUiStore.getState().reset()
  render(<App />)
  act(() => {
    window.location.hash = `#/p/${project.id}`
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  await screen.findByRole('textbox', { name: 'Design name' })
  return userEvent.setup()
}

const region = (name: RegExp) => screen.getByRole('region', { name })

afterEach(async () => {
  await useProjectStore.getState().close()
})

describe('planting list', () => {
  it('counts plants per species, in total and per bed, and copies the list', async () => {
    const user = await openEditor()
    const list = region(/^Planting list/)
    const rows = () =>
      within(list)
        .getAllByTestId('planting-row')
        .map((row) => row.textContent)
    expect(rows()).toEqual(['1Catmint6', '2Astilbe1'])
    expect(within(list).getByTestId('planting-total')).toHaveTextContent('7 plants in total')

    await user.click(within(list).getByRole('button', { name: 'Per bed' }))
    expect(within(list).getByRole('heading', { name: /Front border/ })).toHaveTextContent('5')
    expect(within(list).getByRole('heading', { name: /Not in a bed/ })).toHaveTextContent('2')
    expect(rows()).toEqual(['1Catmint4', '2Astilbe1', '1Catmint2'])

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await user.click(within(list).getByRole('button', { name: 'Copy as text' }))
    expect(writeText).toHaveBeenCalledWith(
      [
        'Planting list: Front garden',
        '',
        'Front border',
        '  1. Catmint (Nepeta × faassenii): 4',
        '  2. Astilbe (Astilbe × arendsii): 1',
        '',
        'Not in a bed',
        '  1. Catmint (Nepeta × faassenii): 2',
        '',
        '7 plants in total',
      ].join('\n'),
    )
    expect(await within(list).findByText('Copied to the clipboard.')).toBeInTheDocument()
  })

  it('selects the plants of a species with a click', async () => {
    const user = await openEditor()
    await user.click(within(region(/^Planting list/)).getByRole('button', { name: /Catmint/ }))
    expect(screen.getByTestId('selection-count')).toHaveTextContent('6 items selected')
    expect(screen.getByLabelText('Plant (for all 6)')).toHaveValue('nepeta-faassenii')
  })
})

describe('warnings', () => {
  it('lists warnings per kind and species, and selects the plants involved', async () => {
    const user = await openEditor()
    const warnings = region(/^Warnings/)
    const items = within(warnings).getAllByRole('button', { name: /overlap|too close|suit/ })
    expect(items.map((item) => item.textContent)).toEqual([
      'Astilbe doesn’t suit sand',
      'Catmint too close together',
    ])
    await user.click(items[1]!)
    expect(screen.getByTestId('selection-count')).toHaveTextContent('2 items selected')
  })

  it('follows the soil and overlap settings', async () => {
    const user = await openEditor()
    await user.click(screen.getByRole('button', { name: 'Design settings' }))
    const dialog = screen.getByRole('dialog', { name: 'Design settings' })
    await user.selectOptions(within(dialog).getByLabelText('Soil'), 'Clay')
    const overlap = within(dialog).getByLabelText('Overlap warning (%)')
    await user.clear(overlap)
    await user.type(overlap, '150')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('between 0 and 100')

    await user.clear(overlap)
    await user.type(overlap, '100')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useProjectStore.getState().project!.settings).toMatchObject({
      soil: 'clay',
      overlapThreshold: 1,
    })
    expect(within(region(/^Warnings/)).getByTestId('no-warnings')).toBeInTheDocument()
  })
  it('saves the sun thresholds; rejects part shade ≥ full sun', async () => {
    const user = await openEditor()
    await user.click(screen.getByRole('button', { name: 'Design settings' }))
    const dialog = screen.getByRole('dialog', { name: 'Design settings' })
    const full = within(dialog).getByLabelText('Full sun from (h)')
    const part = within(dialog).getByLabelText('Part shade from (h)')
    await user.clear(part)
    await user.type(part, '7')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Part shade must start below')

    await user.clear(full)
    await user.type(full, '5,5')
    await user.clear(part)
    await user.type(part, '2')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useProjectStore.getState().project!.settings.sunThresholds).toEqual({
      fullSunHours: 5.5,
      partShadeHours: 2,
    })
  })

  it('saves the location and north angle; rejects an out-of-range latitude', async () => {
    const user = await openEditor()
    await user.click(screen.getByRole('button', { name: 'Design settings' }))
    const dialog = screen.getByRole('dialog', { name: 'Design settings' })
    const lat = within(dialog).getByLabelText('Latitude (°)')
    await user.clear(lat)
    await user.type(lat, '95')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('between −90 and 90')

    await user.clear(lat)
    await user.type(lat, '51.5')
    const lng = within(dialog).getByLabelText('Longitude (°)')
    await user.clear(lng)
    await user.type(lng, '4,25')
    const north = within(dialog).getByLabelText('North (°)')
    await user.clear(north)
    await user.type(north, '-90')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useProjectStore.getState().project!.settings).toMatchObject({
      location: { lat: 51.5, lng: 4.25 },
      northAngleDeg: 270,
    })
  })
})

describe('structure overlap', () => {
  it('lists a plant that grows over a structure', async () => {
    const base = design()
    const catmint = base.plantings.find((p) => p.position.x === 10)!
    const project: Project = {
      ...base,
      plantings: [catmint],
      objects: [
        {
          id: 'terrace',
          kind: 'terrace',
          shape: { type: 'polygon', points: rect(10.1, 3, 4, 4) },
          status: 'new',
          layer: 'hardscape',
        },
      ],
    }
    const user = await openEditor(project)
    const item = within(region(/^Warnings/)).getByRole('button', { name: /structure or paving/ })
    expect(item).toHaveTextContent('Catmint too close to a structure or paving (terrace)')
    await user.click(item)
    const properties = region(/^Properties/)
    expect(
      within(properties).getByText(/Grows \d+\s?% over a structure or paving \(terrace\)/),
    ).toBeInTheDocument()
  })
})

describe('planting properties', () => {
  it('shows the bed and warnings of a plant and swaps its species', async () => {
    const project = design()
    const user = await openEditor(project)
    const astilbe = project.plantings.find((p) => p.plantId === 'astilbe-arendsii')!
    act(() => useUiStore.getState().setSelection([astilbe.id]))
    const properties = region(/^Properties/)
    expect(within(properties).getByTestId('planting-bed')).toHaveTextContent('Front border')
    expect(within(properties).getByText('Doesn’t suit your soil (sand).')).toBeInTheDocument()

    await user.selectOptions(within(properties).getByLabelText('Plant'), 'Catmint')
    expect(within(properties).getByTestId('item-kind')).toHaveTextContent('Catmint')
    expect(within(properties).queryByText(/suit your soil/)).not.toBeInTheDocument()
  })
})
