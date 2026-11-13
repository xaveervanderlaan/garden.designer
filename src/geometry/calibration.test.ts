import { describe, expect, it } from 'vitest'
import {
  type Placement,
  calibrate,
  displayRotation,
  imageBounds,
  imageCorners,
  imageToWorld,
  initialPlacement,
  movePlacement,
  rotateAbout,
  storedRotation,
  worldToImage,
} from './calibration'
import { distance } from './polygon'

const straight: Placement = { metresPerPixel: 0.1, offset: { x: 5, y: 2 }, rotationDeg: 0 }
const turned: Placement = { metresPerPixel: 0.05, offset: { x: -3, y: 7 }, rotationDeg: 30 }

function expectPoint(actual: { x: number; y: number }, expected: { x: number; y: number }) {
  expect(actual.x).toBeCloseTo(expected.x, 9)
  expect(actual.y).toBeCloseTo(expected.y, 9)
}

describe('image ↔ world', () => {
  it('scales and shifts an image that is not rotated', () => {
    expectPoint(imageToWorld(straight, { x: 0, y: 0 }), { x: 5, y: 2 })
    expectPoint(imageToWorld(straight, { x: 100, y: 50 }), { x: 15, y: 7 })
  })

  it('turns clockwise on screen for a positive rotation (y points down)', () => {
    const quarter: Placement = { metresPerPixel: 1, offset: { x: 0, y: 0 }, rotationDeg: 90 }
    // The image's x axis (to the right) now points down the screen.
    expectPoint(imageToWorld(quarter, { x: 10, y: 0 }), { x: 0, y: 10 })
  })

  it('converts back and forth, also when rotated', () => {
    for (const placement of [straight, turned]) {
      const pixel = { x: 123.4, y: 56.7 }
      expectPoint(worldToImage(placement, imageToWorld(placement, pixel)), pixel)
    }
  })

  it('gives the corners and bounds of a rotated image', () => {
    const quarter: Placement = { metresPerPixel: 0.1, offset: { x: 0, y: 0 }, rotationDeg: 90 }
    const corners = imageCorners(quarter, 200, 100)
    expectPoint(corners[1]!, { x: 0, y: 20 })
    expectPoint(corners[3]!, { x: -10, y: 0 })
    const bounds = imageBounds(quarter, 200, 100)
    expect(bounds.minX).toBeCloseTo(-10)
    expect(bounds.maxY).toBeCloseTo(20)
  })
})

describe('initialPlacement', () => {
  it('centres the image with its long side at the given length', () => {
    const placement = initialPlacement(400, 300, { x: 15, y: 10 }, 50)
    expect(placement.metresPerPixel).toBeCloseTo(0.125)
    expect(placement.rotationDeg).toBe(0)
    expectPoint(placement.offset, { x: -10, y: -8.75 })
  })
})

describe('calibrate', () => {
  it('sets the scale from two points and a known distance', () => {
    const result = calibrate(straight, { x: 10, y: 10 }, { x: 110, y: 10 }, 10)!
    expect(result.metresPerPixel).toBeCloseTo(0.1)
    const halved = calibrate(straight, { x: 10, y: 10 }, { x: 110, y: 10 }, 5)!
    expect(halved.metresPerPixel).toBeCloseTo(0.05)
  })

  it('works on a rotated image: the line gets the real length and its middle stays put', () => {
    const a = { x: 40, y: 80 }
    const b = { x: 340, y: 480 } // 500 px apart
    const before = imageToWorld(turned, { x: 190, y: 280 })
    const result = calibrate(turned, a, b, 12.5)!
    expect(result.metresPerPixel).toBeCloseTo(0.025)
    expect(result.rotationDeg).toBe(30)
    expect(distance(imageToWorld(result, a), imageToWorld(result, b))).toBeCloseTo(12.5, 9)
    expectPoint(imageToWorld(result, { x: 190, y: 280 }), before)
  })

  it('refuses points that are too close or a distance that is not positive', () => {
    expect(calibrate(straight, { x: 5, y: 5 }, { x: 5.2, y: 5 }, 10)).toBeNull()
    expect(calibrate(straight, { x: 0, y: 0 }, { x: 100, y: 0 }, 0)).toBeNull()
    expect(calibrate(straight, { x: 0, y: 0 }, { x: 100, y: 0 }, Number.NaN)).toBeNull()
  })
})

describe('rotateAbout', () => {
  it('turns the image about a pixel that stays in place', () => {
    const pivot = { x: 200, y: 150 }
    const before = imageToWorld(straight, pivot)
    const result = rotateAbout(straight, 45, pivot)
    expect(result.rotationDeg).toBe(45)
    expectPoint(imageToWorld(result, pivot), before)
    expect(rotateAbout(straight, -90, pivot).rotationDeg).toBe(270)
  })
})

describe('movePlacement', () => {
  it('shifts the offset', () => {
    expect(movePlacement(straight, 1, -2).offset).toEqual({ x: 6, y: 0 })
  })
})

describe('rotation as shown to the user', () => {
  it('is map-style: positive turns anticlockwise, within (-180, 180]', () => {
    expect(displayRotation(0)).toBe(0)
    expect(displayRotation(350)).toBeCloseTo(10)
    expect(displayRotation(10)).toBeCloseTo(-10)
    expect(displayRotation(180)).toBe(180)
    expect(storedRotation(10)).toBeCloseTo(350)
    expect(storedRotation(-10)).toBeCloseTo(10)
    expect(storedRotation(0)).toBe(0)
  })
})
