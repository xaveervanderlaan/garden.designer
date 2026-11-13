import { describe, expect, it } from 'vitest'
import { imageToWorld } from '../geometry/calibration'
import { distance } from '../geometry/polygon'
import {
  BACKGROUND_ID,
  DEFAULT_BACKGROUND_OPACITY,
  assetIdsInUse,
  backgroundBounds,
  calibrateBackground,
  moveBackground,
  placeBackground,
  removeBackground,
  rotateBackground,
  setBackground,
  setBackgroundOpacity,
} from './background'
import { newProject } from './defaults'
import { isBackgroundSelected, setLayerState, validSelection } from './edit'
import { projectSchema } from './schema'

const image = { assetId: 'img-1', widthPx: 400, heightPx: 300, fileName: 'plan.png' }
const withImage = () => setBackground(newProject('Garden'), image, { x: 15, y: 10 })

describe('setBackground', () => {
  it('centres a new image, 50 m along its long side, half transparent', () => {
    const project = withImage()
    const bg = project.background!
    expect(bg.metresPerPixel).toBeCloseTo(0.125)
    expect(bg.offset).toEqual({ x: -10, y: -8.75 })
    expect(bg.rotationDeg).toBe(0)
    expect(bg.opacity).toBe(DEFAULT_BACKGROUND_OPACITY)
    expect(bg.fileName).toBe('plan.png')
    expect(projectSchema.safeParse(project).success).toBe(true)
  })

  it('keeps the opacity when the image is replaced, but not the calibration', () => {
    const calibrated = calibrateBackground(
      setBackgroundOpacity(withImage(), 0.3),
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      10,
    )
    const replaced = setBackground(calibrated, { ...image, assetId: 'img-2' }, { x: 0, y: 0 })
    expect(replaced.background?.opacity).toBe(0.3)
    expect(replaced.background?.calibration).toBeUndefined()
    expect(assetIdsInUse(replaced)).toEqual(new Set(['img-2']))
  })
})

describe('calibrateBackground', () => {
  it('stores the line and sets the scale', () => {
    const project = calibrateBackground(withImage(), { x: 50, y: 280 }, { x: 150, y: 280 }, 10)
    const bg = project.background!
    expect(bg.metresPerPixel).toBeCloseTo(0.1)
    expect(bg.calibration).toEqual({ a: { x: 50, y: 280 }, b: { x: 150, y: 280 }, distanceM: 10 })
    // The middle of the line (pixel 100, 280) stayed at (2.5, 26.25).
    expect(imageToWorld(bg, { x: 100, y: 280 }).x).toBeCloseTo(2.5)
    expect(imageToWorld(bg, { x: 100, y: 280 }).y).toBeCloseTo(26.25)
  })

  it('works on a rotated image', () => {
    const rotated = rotateBackground(withImage(), 20)
    const project = calibrateBackground(rotated, { x: 10, y: 20 }, { x: 310, y: 420 }, 25)
    const bg = project.background!
    expect(bg.rotationDeg).toBeCloseTo(340)
    const length = distance(
      imageToWorld(bg, { x: 10, y: 20 }),
      imageToWorld(bg, { x: 310, y: 420 }),
    )
    expect(length).toBeCloseTo(25, 5)
  })

  it('ignores points that are too close together', () => {
    const project = withImage()
    expect(calibrateBackground(project, { x: 5, y: 5 }, { x: 5, y: 5 }, 10)).toBe(project)
  })
})

describe('moving and turning', () => {
  it('moves, turns about the centre and places the image', () => {
    const project = withImage()
    expect(moveBackground(project, 1, 2).background?.offset).toEqual({ x: -9, y: -6.75 })
    expect(moveBackground(project, 0, 0)).toBe(project)

    const centre = () => {
      const b = backgroundBounds(turned)!
      return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
    }
    const turned = rotateBackground(project, 90) // a quarter turn anticlockwise
    expect(turned.background?.rotationDeg).toBe(270)
    expect(centre().x).toBeCloseTo(15)
    expect(centre().y).toBeCloseTo(10)
    // Turned a quarter, the 50 × 37.5 m image is 37.5 m wide.
    const bounds = backgroundBounds(turned)!
    expect(bounds.maxX - bounds.minX).toBeCloseTo(37.5)

    const placed = placeBackground(project, { x: 3, y: 4 }, 12)
    expect(placed.background).toMatchObject({ offset: { x: 3, y: 4 }, rotationDeg: 12 })
  })

  it('clamps the opacity', () => {
    expect(setBackgroundOpacity(withImage(), 1.4).background?.opacity).toBe(1)
    expect(setBackgroundOpacity(withImage(), -1).background?.opacity).toBe(0)
  })
})

describe('selection and removal', () => {
  it('is selectable while its layer is visible and unlocked', () => {
    const project = withImage()
    expect(validSelection(project, [BACKGROUND_ID])).toEqual([BACKGROUND_ID])
    expect(isBackgroundSelected(project, [BACKGROUND_ID])).toBe(true)
    const locked = setLayerState(project, 'background', { locked: true })
    expect(validSelection(locked, [BACKGROUND_ID])).toEqual([])
    const hidden = setLayerState(project, 'background', { visible: false })
    expect(validSelection(hidden, [BACKGROUND_ID])).toEqual([])
    expect(validSelection(removeBackground(project), [BACKGROUND_ID])).toEqual([])
  })

  it('setLayerState returns the same project when nothing changes', () => {
    const project = withImage()
    expect(setLayerState(project, 'background', { visible: true })).toBe(project)
  })

  it('removes the image', () => {
    const project = removeBackground(withImage())
    expect(project.background).toBeUndefined()
    expect('background' in project).toBe(false)
    expect(assetIdsInUse(project).size).toBe(0)
  })
})
