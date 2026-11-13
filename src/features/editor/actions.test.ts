import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../persistence/db'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { sampleProjectWithAsset } from '../../test/fixtures'
import { imageToWorld } from '../../geometry/calibration'
import { BACKGROUND_ID, removeBackground } from '../../model/background'
import { PLOT_ID } from '../../model/plot'
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

  describe('drawing the plot', () => {
    const drawing = () => useUiStore.getState().drawing
    const outline = () => project().plot.outline

    it('places corners by clicking and by typed lengths and angles', () => {
      editorActions.setTool('draw-plot')
      expect(selection()).toEqual([])
      editorActions.addDrawingPoint({ x: 2, y: 2 })
      expect(editorActions.addDrawingSegment(20, 0, null)).toBe(true) // right
      expect(editorActions.addDrawingSegment(15, 270, null)).toBe(true) // down
      // Without an angle: towards the cursor (here: to the left).
      expect(editorActions.addDrawingSegment(20, undefined, { x: -50, y: 17 })).toBe(true)
      expect(drawing()?.points).toEqual([
        { x: 2, y: 2 },
        { x: 22, y: 2 },
        { x: 22, y: 17 },
        { x: 2, y: 17 },
      ])

      expect(editorActions.finishDrawing()).toBe(true)
      expect(outline()).toHaveLength(4)
      expect(useUiStore.getState().tool).toBe('select')
      expect(selection()).toEqual([PLOT_ID])

      editorActions.undo() // one step: the whole outline
      expect(outline()).toHaveLength(4) // the sample already had a 20 × 15 plot at the origin
      expect(outline()[0]).toEqual({ x: 0, y: 0 })
    })

    it('finishes when the first corner is clicked again', () => {
      editorActions.setTool('draw-plot')
      for (const p of [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 0 },
      ])
        editorActions.addDrawingPoint(p)
      expect(drawing()).toBeNull()
      expect(outline()).toEqual([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
      ])
    })

    it('needs 3 corners, a start corner and a positive length', () => {
      editorActions.setTool('draw-plot')
      expect(editorActions.addDrawingSegment(5, 0, null)).toBe(false) // no start corner yet
      editorActions.addDrawingPoint({ x: 0, y: 0 })
      expect(editorActions.addDrawingSegment(0, 0, null)).toBe(false)
      editorActions.addDrawingSegment(5, 0, null)
      expect(editorActions.finishDrawing()).toBe(false)
      editorActions.removeLastDrawingPoint()
      expect(drawing()?.points).toHaveLength(1)
    })

    it('cancels with Escape without changing the plot', () => {
      const before = outline()
      editorActions.setTool('draw-plot')
      editorActions.addDrawingPoint({ x: 0, y: 0 })
      editorActions.escape()
      expect(drawing()).toBeNull()
      expect(useUiStore.getState().tool).toBe('select')
      expect(outline()).toBe(before)
    })

    it('creates a rectangular plot', () => {
      useUiStore.getState().setCanvasSize({ width: 800, height: 600 })
      editorActions.createRectanglePlot(12.5, 8)
      expect(outline()).toEqual([
        { x: 0, y: 0 },
        { x: 12.5, y: 0 },
        { x: 12.5, y: 8 },
        { x: 0, y: 8 },
      ])
      expect(selection()).toEqual([PLOT_ID])
    })

    it('removes the selected corner with Delete, but keeps at least 3', () => {
      editorActions.selectPlot()
      useUiStore.getState().setActiveCorner(1)
      editorActions.deleteSelection()
      expect(outline()).toHaveLength(3)
      useUiStore.getState().setActiveCorner(0)
      editorActions.deleteSelection()
      expect(outline()).toHaveLength(3)
    })
  })
  describe('the site plan', () => {
    const background = () => project().background!
    const calibration = () => useUiStore.getState().calibration
    const image = { assetId: 'new-image', widthPx: 400, heightPx: 300, fileName: 'plan.png' }

    beforeEach(() => {
      useUiStore.getState().setCanvasSize({ width: 800, height: 600 })
      editorActions.zoomToFit()
    })

    it('places an imported image, shows it and starts calibrating', () => {
      editorActions.hideSitePlan()
      editorActions.placeSitePlan(image)
      expect(background().assetId).toBe('new-image')
      expect(project().layers.background).toEqual({ visible: true, locked: false })
      expect(useUiStore.getState().tool).toBe('calibrate')
      expect(useUiStore.getState().snapToGrid).toBe(false) // corners go where you click
      expect(calibration()).toEqual({ points: [] })

      editorActions.undo() // the previous site plan comes back
      expect(background().assetId).not.toBe('new-image')
    })

    it('calibrates from two clicked points and a typed distance (one undo step)', () => {
      editorActions.placeSitePlan(image)
      // A line of 100 image pixels, clicked on the plan.
      const a = imageToWorld(background(), { x: 50, y: 280 })
      const b = imageToWorld(background(), { x: 150, y: 280 })
      expect(editorActions.applyCalibration(10)).toBe(false) // no points yet
      editorActions.addCalibrationPoint(a)
      editorActions.addCalibrationPoint(b)
      expect(editorActions.applyCalibration(10)).toBe(true)

      expect(background().metresPerPixel).toBeCloseTo(0.1)
      expect(background().calibration?.distanceM).toBe(10)
      expect(useUiStore.getState().tool).toBe('select')
      expect(selection()).toEqual([BACKGROUND_ID])

      editorActions.undo()
      expect(background().calibration).toBeUndefined()
    })

    it('stops calibrating when the site plan is undone or hidden', () => {
      const tool = () => useUiStore.getState().tool
      useProjectStore.getState().update(removeBackground) // a design without a site plan
      editorActions.placeSitePlan(image)
      expect(tool()).toBe('calibrate')
      editorActions.undo() // the import
      expect(project().background).toBeUndefined()
      expect(tool()).toBe('select')

      editorActions.redo()
      editorActions.startCalibration()
      expect(tool()).toBe('calibrate')
      editorActions.hideSitePlan()
      expect(tool()).toBe('select')
    })

    it('starts a new line on a third click, and steps back with Backspace', () => {
      editorActions.startCalibration()
      editorActions.addCalibrationPoint({ x: 0, y: 0 })
      editorActions.addCalibrationPoint({ x: 5, y: 0 })
      editorActions.addCalibrationPoint({ x: 1, y: 1 })
      expect(calibration()?.points).toEqual([{ x: 1, y: 1 }])
      editorActions.removeLastCalibrationPoint()
      expect(calibration()?.points).toEqual([])
      editorActions.escape()
      expect(calibration()).toBeNull()
      expect(useUiStore.getState().tool).toBe('select')
    })

    it('refuses a line that is too short', () => {
      editorActions.startCalibration()
      editorActions.addCalibrationPoint({ x: 3, y: 3 })
      editorActions.addCalibrationPoint({ x: 3, y: 3 })
      expect(editorActions.applyCalibration(10)).toBe(false)
      expect(background().calibration?.distanceM).toBe(10) // the sample's calibration is kept
    })

    it('moves with the arrow keys, turns, fades and is removed with Delete', () => {
      editorActions.selectSitePlan()
      expect(selection()).toEqual([BACKGROUND_ID])
      const { x, y } = background().offset
      editorActions.nudge(NUDGE_SMALL_M, 0)
      editorActions.nudge(NUDGE_SMALL_M, 0)
      expect(background().offset.x).toBeCloseTo(x + 2 * NUDGE_SMALL_M)
      expect(background().offset.y).toBeCloseTo(y)
      editorActions.undo() // both nudges were one step
      expect(background().offset.x).toBeCloseTo(x)

      editorActions.rotateSitePlan(90)
      expect(background().rotationDeg).toBe(270)

      editorActions.setSitePlanOpacity(0.25)
      expect(background().opacity).toBe(0.25)

      editorActions.deleteSelection()
      expect(project().background).toBeUndefined()
      expect(selection()).toEqual([])
      editorActions.undo()
      expect(project().background).toBeDefined()
    })

    it('can be locked, and "edit" unlocks it again', () => {
      editorActions.selectSitePlan()
      editorActions.lockSitePlan()
      expect(project().layers.background.locked).toBe(true)
      expect(selection()).toEqual([])
      editorActions.selectSitePlan()
      expect(project().layers.background.locked).toBe(false)
      expect(selection()).toEqual([BACKGROUND_ID])
    })

    it('only counts for zoom to fit when the design has nothing else', () => {
      editorActions.zoomToFit()
      const withPlot = useUiStore.getState().viewport
      useProjectStore
        .getState()
        .update((p) => ({ ...p, plot: { outline: [] }, objects: [], plantings: [] }))
      editorActions.zoomToFit()
      // The 24 × 16 m image is larger than the 20 × 15 m plot: zoomed out further.
      expect(useUiStore.getState().viewport.scale).toBeLessThan(withPlot.scale)
    })

    it('turns grid snapping off when a design with a site plan opens, and toggles it', () => {
      editorActions.designOpened()
      expect(useUiStore.getState().snapToGrid).toBe(false)
      editorActions.toggleSnapToGrid()
      expect(useUiStore.getState().snapToGrid).toBe(true)
      editorActions.hideSitePlan()
      editorActions.designOpened()
      expect(useUiStore.getState().snapToGrid).toBe(true)
    })
  })
})
