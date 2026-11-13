import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../persistence/db'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { sampleProjectWithAsset } from '../../test/fixtures'
import { NUDGE_SMALL_M, PASTE_OFFSET_M, editorActions } from './actions'

const project = () => useProjectStore.getState().project!
const selection = () => useUiStore.getState().selection
const select = (...ids: string[]) => useUiStore.getState().setSelection(ids)
const bed = () => project().objects.find((o) => o.id === 'bed-1')!
const firstPoint = (id: string) => {
  const shape = project().objects.find((o) => o.id === id)!.shape
  return shape.type === 'point' ? shape.position : shape.points[0]!
}

describe('editorActions', () => {
  beforeEach(async () => {
    const { project: sample, asset } = sampleProjectWithAsset()
    await db.projects.add(sample)
    await db.assets.add(asset)
    useUiStore.getState().reset()
    await useProjectStore.getState().open(sample.id)
  })

  afterEach(async () => {
    await useProjectStore.getState().close()
  })

  it('deletes the selection as one undoable step', () => {
    select('bed-1', 'p-1')
    editorActions.deleteSelection()
    expect(project().objects).toHaveLength(0)
    expect(project().plantings).toHaveLength(0)
    expect(selection()).toEqual([])

    editorActions.undo()
    expect(project().objects).toHaveLength(1)
    expect(project().plantings).toHaveLength(1)
  })

  it('pastes copies further away each time and selects them', () => {
    select('bed-1')
    editorActions.copy()
    editorActions.paste()
    const first = selection()
    expect(first).toHaveLength(1)
    expect(firstPoint(first[0]!)).toEqual({ x: 1 + PASTE_OFFSET_M, y: 1 + PASTE_OFFSET_M })

    editorActions.paste()
    expect(firstPoint(selection()[0]!)).toEqual({
      x: 1 + 2 * PASTE_OFFSET_M,
      y: 1 + 2 * PASTE_OFFSET_M,
    })
    expect(project().objects).toHaveLength(3)
  })

  it('duplicates the selection without touching the clipboard', () => {
    select('p-1')
    editorActions.copy()
    select('bed-1')
    editorActions.duplicate()
    expect(project().objects).toHaveLength(2)

    editorActions.paste() // still the planting from the clipboard
    expect(project().plantings).toHaveLength(2)
  })

  it('merges a burst of nudges into one undo step', () => {
    select('bed-1')
    editorActions.nudge(NUDGE_SMALL_M, 0)
    editorActions.nudge(NUDGE_SMALL_M, 0)
    editorActions.nudge(0, NUDGE_SMALL_M)
    const shape = bed().shape
    expect(shape.type === 'polygon' && shape.points[0]!.x).toBeCloseTo(1.2)
    expect(shape.type === 'polygon' && shape.points[0]!.y).toBeCloseTo(1.1)

    editorActions.undo()
    expect(firstPoint('bed-1')).toEqual({ x: 1, y: 1 })
  })

  it('selects all editable items and skips locked layers', () => {
    editorActions.selectAll()
    expect(selection().sort()).toEqual(['bed-1', 'p-1'])

    useProjectStore
      .getState()
      .update((p) => ({ ...p, layers: { ...p.layers, plants: { visible: true, locked: true } } }), {
        history: false,
      })
    editorActions.selectAll()
    expect(selection()).toEqual([])
  })

  it('drops selected items that disappear on undo', () => {
    select('bed-1')
    editorActions.duplicate()
    expect(selection()).toHaveLength(1)
    editorActions.undo()
    expect(selection()).toEqual([])
  })

  it('zooms around the centre of the canvas and fits the design', () => {
    const ui = useUiStore.getState()
    ui.setCanvasSize({ width: 1000, height: 500 })
    editorActions.zoomToFit()
    const fitted = useUiStore.getState().viewport

    editorActions.zoomIn()
    expect(useUiStore.getState().viewport.scale).toBeGreaterThan(fitted.scale)
    editorActions.zoomOut()
    expect(useUiStore.getState().viewport.scale).toBeCloseTo(fitted.scale)
  })
})
