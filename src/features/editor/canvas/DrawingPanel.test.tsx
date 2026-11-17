import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../../../persistence/projects'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { editorActions } from '../actions'
import { DrawingPanel } from './DrawingPanel'

const store = () => useProjectStore.getState()

describe('DrawingPanel', () => {
  beforeEach(async () => {
    useUiStore.getState().reset()
    const project = await createProject('Tuin')
    await store().open(project.id)
    // A 400 × 300 px plan at 20 px/m: its centre is (10, 7.5) m.
    useUiStore.getState().setCanvasSize({ width: 400, height: 300 })
    useUiStore.getState().setViewport({ x: 0, y: 0, scale: 20 })
  })

  afterEach(async () => {
    await store().close()
    useUiStore.getState().reset()
  })

  it('places a shed at its default size and selects it', async () => {
    const user = userEvent.setup()
    act(() => editorActions.drawObject('shed'))
    render(<DrawingPanel towards={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('Shed:')
    expect(screen.getByRole('status')).toHaveTextContent('drag to draw a rectangle')

    await user.click(screen.getByTestId('place-default-size'))

    const objects = store().project!.objects
    expect(objects).toHaveLength(1)
    const shed = objects[0]!
    expect(shed.kind).toBe('shed')
    expect(shed.status).toBe('new')
    const points = shed.shape.type === 'polygon' ? shed.shape.points : []
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(3)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2.5)
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(10)
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(7.5)
    expect(useUiStore.getState().tool).toBe('select')
    expect(useUiStore.getState().selection).toEqual([shed.id])
  })

  it('measure mode shows the total and keeps it', async () => {
    const user = userEvent.setup()
    act(() => editorActions.startMeasure())
    render(<DrawingPanel towards={null} />)
    expect(screen.getByTestId('drawing-panel')).toHaveTextContent('Measure:')
    expect(screen.getByTestId('measure-total')).toHaveTextContent(/^0\.00\sm$/)
    const keep = screen.getByRole('button', { name: 'Keep as dimension' })
    expect(keep).toBeDisabled()

    act(() => {
      editorActions.addDrawingPoint({ x: 2, y: 5 })
      editorActions.addDrawingPoint({ x: 2, y: 12 })
      editorActions.addDrawingPoint({ x: 6, y: 12 })
    })
    expect(screen.getByTestId('measure-total')).toHaveTextContent(/^11\.00\sm$/)
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()

    await user.click(keep)
    const objects = store().project!.objects
    expect(objects).toHaveLength(1)
    expect(objects[0]).toMatchObject({ kind: 'dimension', layer: 'measurements' })
    expect(useUiStore.getState().selection).toEqual([objects[0]!.id])
  })

  it('explains that an outline needs three corners', async () => {
    const user = userEvent.setup()
    act(() => editorActions.drawObject('house'))
    render(<DrawingPanel towards={null} />)
    expect(screen.getByTestId('place-default-size')).toHaveTextContent(/Place at \d/)

    act(() => {
      editorActions.addDrawingPoint({ x: 1, y: 1 })
      editorActions.addDrawingPoint({ x: 5, y: 1 })
    })
    expect(screen.queryByTestId('place-default-size')).toBeNull()
    await user.type(screen.getByLabelText('Length'), '{Enter}')

    expect(screen.getByRole('alert')).toHaveTextContent('An outline needs at least 3 corners.')
    expect(store().project!.objects).toHaveLength(0)
  })
})
