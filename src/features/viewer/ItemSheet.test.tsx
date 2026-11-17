import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { addObject } from '../../model/objects'
import type { Project } from '../../model/schema'
import { sampleProjectWithAsset, samplePlant } from '../../test/fixtures'
import { ItemSheet } from './ItemSheet'

const view = { year: 2026, month: null }
const square = (x: number, y: number, size: number) => ({
  type: 'polygon' as const,
  points: [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ],
})
const base = (): Project => ({
  ...sampleProjectWithAsset().project,
  plot: { outline: square(0, 0, 10).points },
  customPlants: [samplePlant],
  plantings: [],
  objects: [],
})
const show = (project: Project, hit: Parameters<typeof ItemSheet>[0]['hit']) =>
  render(<ItemSheet project={project} hit={hit} view={view} onClose={() => {}} />)

describe('ItemSheet', () => {
  it('shows a plant’s names, size, flowers, planted year and bed', () => {
    const { project: withBed, id: bedId } = addObject(base(), 'bed-ornamental', square(0, 0, 4))
    const project: Project = {
      ...withBed,
      plantings: [
        {
          id: 'p1',
          plantId: samplePlant.id,
          position: { x: 2, y: 2 },
          plantedYear: 2024,
          bedId,
          notes: 'Near the path',
        },
      ],
    }
    show(project, { type: 'planting', id: 'p1' })
    const dialog = screen.getByRole('dialog', { name: 'Lavender' })
    expect(within(dialog).getByText('Lavandula angustifolia')).toBeInTheDocument()
    expect(within(dialog).getByText(/0\.60\sm high, 0\.60\sm wide/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Jun.Aug/)).toBeInTheDocument()
    expect(within(dialog).getByText('2024')).toBeInTheDocument()
    expect(within(dialog).getByText(/bed/i, { selector: 'dd' })).toBeInTheDocument()
    expect(within(dialog).getByText('Near the path')).toBeInTheDocument()
  })

  it('says when the plant is unknown', () => {
    const project: Project = {
      ...base(),
      plantings: [{ id: 'p1', plantId: 'gone', position: { x: 1, y: 1 }, plantedYear: 2025 }],
    }
    show(project, { type: 'planting', id: 'p1' })
    expect(screen.getByRole('dialog', { name: 'Unknown plant' })).toBeInTheDocument()
  })

  it('shows a bed’s area and plant count', () => {
    const { project: withBed, id } = addObject(base(), 'bed-ornamental', square(0, 0, 4))
    const project: Project = {
      ...withBed,
      plantings: [
        {
          id: 'p1',
          plantId: samplePlant.id,
          position: { x: 1, y: 1 },
          plantedYear: 2025,
          bedId: id,
        },
      ],
    }
    show(project, { type: 'object', id })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/16\.00\sm²/)).toBeInTheDocument()
    expect(within(dialog).getByText('Plants').nextSibling).toHaveTextContent('1')
  })

  it('shows an object’s kind, area, height and material', () => {
    const { project, id } = addObject(base(), 'house', square(1, 1, 5))
    show(
      { ...project, objects: project.objects.map((o) => ({ ...o, label: 'Our house' })) },
      {
        type: 'object',
        id,
      },
    )
    const dialog = screen.getByRole('dialog', { name: 'Our house' })
    expect(within(dialog).getByText('Kind')).toBeInTheDocument()
    expect(within(dialog).getByText(/25\.00\sm²/)).toBeInTheDocument()
    expect(within(dialog).getByText('Height')).toBeInTheDocument()
  })

  it('shows the plot’s area and perimeter', () => {
    show(base(), { type: 'plot' })
    const dialog = screen.getByRole('dialog', { name: 'Plot' })
    expect(within(dialog).getByText(/100\.00\sm²/)).toBeInTheDocument()
    expect(within(dialog).getByText(/40\.00\sm/)).toBeInTheDocument()
  })
})
