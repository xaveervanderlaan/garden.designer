import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bedFill } from '../../../model/vegRows'
import { createProject } from '../../../persistence/projects'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { editorActions } from '../actions'
import { FillPanel } from './FillPanel'

const store = () => useProjectStore.getState()

/** The panel as GardenCanvas mounts it: with the fill worked out from the stores. */
function Harness() {
  const project = useProjectStore((s) => s.project)
  const fill = useUiStore((s) => s.fill)
  if (!project || !fill) return null
  const result = bedFill(project, fill)
  return <FillPanel key={`${fill.plantId}:${result.rowMode}`} project={project} result={result} />
}

describe('FillPanel', () => {
  beforeEach(async () => {
    useUiStore.getState().reset()
    const project = await createProject('Moestuin')
    await store().open(project.id)
    act(() => {
      editorActions.drawBed('bed-vegetable')
      for (const p of [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 2 },
        { x: 0, y: 2 },
      ])
        editorActions.addDrawingPoint(p)
      editorActions.finishDrawing()
    })
  })

  afterEach(async () => {
    await store().close()
    useUiStore.getState().reset()
  })

  it('fills a vegetable bed in rows: spacings from the crop, a number of rows, Enter', async () => {
    const user = userEvent.setup()
    act(() => editorActions.startFill('lactuca-sativa'))
    render(<Harness />)
    expect(screen.getByLabelText('In-row spacing')).toHaveValue('0.3')
    expect(screen.getByLabelText('Row spacing')).toHaveValue('0.3')
    expect(screen.getByTestId('fill-rows')).toHaveTextContent('6 rows')

    await user.type(screen.getByLabelText('Rows'), '1,5')
    expect(screen.getByRole('alert')).toHaveTextContent('whole number of rows')
    await user.clear(screen.getByLabelText('Rows'))
    await user.type(screen.getByLabelText('Rows'), '2')
    expect(screen.getByTestId('fill-rows')).toHaveTextContent('2 rows')
    expect(screen.getByTestId('fill-count')).toHaveTextContent('26 plants')
    await user.keyboard('{Enter}')
    expect(store().project!.plantings).toHaveLength(26)
    expect(useUiStore.getState().tool).toBe('select')
  })

  it('accepts an in-row spacing of a few centimetres', async () => {
    const user = userEvent.setup()
    act(() => editorActions.startFill('daucus-carota-subsp-sativus'))
    render(<Harness />)
    const inRow = screen.getByLabelText('In-row spacing')
    await user.clear(inRow)
    await user.type(inRow, '0,04')
    expect(inRow).toHaveAttribute('aria-invalid', 'false')
    expect(useUiStore.getState().fill?.spacingM).toBe(0.04)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
