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
      editorActions.setTool('draw')
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
      editorActions.setTool('draw')
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
      editorActions.setTool('draw')
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
      editorActions.setTool('draw')
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
  describe('beds', () => {
    const beds = () => project().objects.filter((o) => o.kind.startsWith('bed-'))

    it('draws a bed with the polygon tool, links plants in it and selects it', () => {
      editorActions.drawBed('bed-vegetable')
      expect(useUiStore.getState().drawing?.target).toEqual({
        kind: 'bed',
        bedKind: 'bed-vegetable',
      })
      editorActions.addDrawingPoint({ x: 10, y: 10 })
      editorActions.addDrawingSegment(4, 0, null)
      editorActions.addDrawingSegment(2, 270, null)
      editorActions.addDrawingSegment(4, 180, null)
      expect(editorActions.finishDrawing()).toBe(true)
      const bed = beds().at(-1)!
      expect(bed).toMatchObject({ kind: 'bed-vegetable', layer: 'vegetables' })
      expect(selection()).toEqual([bed.id])
      expect(useUiStore.getState().tool).toBe('select')
      editorActions.undo()
      expect(beds()).toHaveLength(1)
    })

    it('shows a hidden layer when drawing a bed on it', () => {
      useProjectStore.getState().update((p) => ({
        ...p,
        layers: { ...p.layers, plants: { visible: false, locked: true } },
      }))
      editorActions.drawBed('bed-ornamental')
      expect(project().layers.plants).toEqual({ visible: true, locked: false })
    })

    it('removes the selected bed corner with Delete', () => {
      // Make bed-1 a square first: a triangle can't lose a corner.
      editorActions.drawBed('bed-ornamental')
      for (const p of [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ])
        editorActions.addDrawingPoint(p)
      editorActions.finishDrawing()
      const id = selection()[0]!
      useUiStore.getState().setActiveCorner(3)
      editorActions.deleteSelection()
      expect(beds().find((b) => b.id === id)?.shape).toMatchObject({ points: { length: 3 } })
      expect(selection()).toEqual([id])
    })
  })

  describe('placing plants', () => {
    const plantings = () => project().plantings

    it('places a dropped plant and selects it', () => {
      editorActions.placePlant('nepeta-faassenii', { x: 4, y: 1.5 })
      const placed = plantings().at(-1)!
      expect(placed).toMatchObject({ plantId: 'nepeta-faassenii', bedId: 'bed-1' })
      expect(placed.plantedYear).toBe(new Date().getFullYear())
      expect(selection()).toEqual([placed.id])
    })

    it('stamps a plant on every click until Escape, each an undo step', () => {
      editorActions.startStamp('nepeta-faassenii')
      expect(useUiStore.getState().tool).toBe('stamp')
      editorActions.stampAt({ x: 8, y: 8 })
      editorActions.stampAt({ x: 9, y: 8 })
      expect(plantings()).toHaveLength(3)
      expect(useUiStore.getState().stamp?.placed).toBe(2)
      editorActions.undo()
      expect(plantings()).toHaveLength(2)
      editorActions.escape()
      expect(useUiStore.getState().tool).toBe('select')
      expect(useUiStore.getState().stamp).toBeNull()
    })

    it('fills the selected bed in one undo step', () => {
      select('bed-1')
      editorActions.startFill('nepeta-faassenii')
      expect(useUiStore.getState().fill).toEqual({
        plantId: 'nepeta-faassenii',
        bedId: 'bed-1',
        spacingM: 0.5,
      })
      editorActions.setFillSpacing(0.4)
      const count = editorActions.applyFill()
      expect(count).toBeGreaterThan(3)
      expect(plantings()).toHaveLength(1 + count)
      expect(
        plantings()
          .slice(1)
          .every((p) => p.bedId === 'bed-1'),
      ).toBe(true)
      expect(selection()).toHaveLength(count)
      editorActions.undo()
      expect(plantings()).toHaveLength(1)
    })

    it('picks the bed to fill with a click', () => {
      editorActions.drawBed('bed-ornamental')
      for (const p of [
        { x: 10, y: 10 },
        { x: 12, y: 10 },
        { x: 12, y: 12 },
      ])
        editorActions.addDrawingPoint(p)
      editorActions.finishDrawing()
      const second = selection()[0]!
      editorActions.clearSelection()
      editorActions.startFill('nepeta-faassenii')
      expect(useUiStore.getState().fill?.bedId).toBeNull() // two beds: which one?
      editorActions.chooseFillBed({ x: 20, y: 20 }) // not on a bed
      expect(useUiStore.getState().fill?.bedId).toBeNull()
      editorActions.chooseFillBed({ x: 11.5, y: 10.5 })
      expect(useUiStore.getState().fill?.bedId).toBe(second)
    })

    it('plants a row along a drawn line', () => {
      editorActions.drawRow('carpinus-betulus')
      expect(useUiStore.getState().drawing?.target).toEqual({
        kind: 'row',
        plantId: 'carpinus-betulus',
        spacingM: 0.33,
      })
      editorActions.setRowSpacing(0.5)
      editorActions.addDrawingPoint({ x: 0, y: 14 })
      expect(editorActions.finishDrawing()).toBe(false) // a row needs two points
      editorActions.addDrawingSegment(5, 0, null)
      expect(editorActions.finishDrawing()).toBe(true)
      const row = plantings().slice(1)
      expect(row).toHaveLength(11)
      expect(row.map((p) => p.position.y)).toEqual(Array(11).fill(14))
      expect(selection()).toHaveLength(11)
    })

    it('swaps the species and the planting year of selected plants', () => {
      editorActions.swapSpecies(['p-1'], 'nepeta-faassenii')
      expect(plantings()[0]!.plantId).toBe('nepeta-faassenii')
      editorActions.setPlantedYear(['p-1'], 2030)
      expect(plantings()[0]!.plantedYear).toBe(2030)
      editorActions.undo()
      editorActions.undo()
      expect(plantings()[0]).toMatchObject({ plantId: 'custom-lavender', plantedYear: 2027 })
    })
  })

  it('keeps a measurement as a dimension on the measurements layer', () => {
    useProjectStore
      .getState()
      .update(
        (p) => ({ ...p, layers: { ...p.layers, measurements: { visible: false, locked: true } } }),
        { history: false },
      )
    editorActions.startMeasure()
    expect(useUiStore.getState().drawing?.target).toEqual({ kind: 'measure' })
    editorActions.addDrawingPoint({ x: 2, y: 5 })
    expect(editorActions.finishDrawing()).toBe(false) // one point is not a measurement
    editorActions.addDrawingPoint({ x: 2, y: 12 })
    editorActions.addDrawingPoint({ x: 6, y: 12 })
    const before = project().objects.length

    expect(editorActions.finishDrawing()).toBe(true)
    const dimension = project().objects.at(-1)!
    expect(project().objects).toHaveLength(before + 1)
    expect(dimension).toMatchObject({ kind: 'dimension', layer: 'measurements', status: 'new' })
    expect(dimension.shape).toMatchObject({
      type: 'polyline',
      points: [
        { x: 2, y: 5 },
        { x: 2, y: 12 },
        { x: 6, y: 12 },
      ],
    })
    expect(project().layers.measurements).toEqual({ visible: true, locked: false })
    expect(useUiStore.getState().tool).toBe('select')
    expect(selection()).toEqual([dimension.id])

    editorActions.undo()
    expect(project().objects).toHaveLength(before)
  })

  it('saves the design settings as one undo step', () => {
    const settings = { ...project().settings, soil: 'clay' as const, overlapThreshold: 0.3 }
    editorActions.saveSettings('Renamed', settings)
    expect(project()).toMatchObject({ name: 'Renamed', settings })
    editorActions.undo()
    expect(project().settings.soil).toBe('sand')
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
