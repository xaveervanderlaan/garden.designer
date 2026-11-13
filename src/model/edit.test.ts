import { describe, expect, it } from 'vitest'
import { rotation } from '../geometry/transform'
import { sampleProjectWithAsset } from '../test/fixtures'
import {
  copyItems,
  deleteItems,
  editableItemIds,
  moveItems,
  pasteItems,
  transformObjects,
  updateObject,
  validSelection,
} from './edit'
import type { GardenObject, Project } from './schema'

/** Sample: bed-1 (polygon) with planting p-1 in it, plus a fence and a bench. */
function sample(): Project {
  const { project } = sampleProjectWithAsset()
  const fence: GardenObject = {
    id: 'fence',
    kind: 'fence',
    shape: {
      type: 'polyline',
      points: [
        { x: 0, y: 15 },
        { x: 20, y: 15 },
      ],
      thicknessM: 0.1,
    },
    heightM: 1.8,
    layer: 'hardscape',
  }
  const bench: GardenObject = {
    id: 'bench',
    kind: 'furniture',
    shape: { type: 'point', position: { x: 10, y: 5 }, rotationDeg: 350 },
    layer: 'hardscape',
  }
  return { ...project, objects: [...project.objects, fence, bench] }
}

describe('moveItems', () => {
  it('moves objects of every shape type and plantings', () => {
    const moved = moveItems(sample(), new Set(['bed-1', 'fence', 'bench', 'p-1']), 1, -2)
    expect(moved.objects[0]!.shape).toMatchObject({
      points: [
        { x: 2, y: -1 },
        { x: 6, y: -1 },
        { x: 6, y: 1 },
      ],
    })
    expect(moved.objects[1]!.shape).toMatchObject({
      points: [
        { x: 1, y: 13 },
        { x: 21, y: 13 },
      ],
    })
    expect(moved.objects[2]!.shape).toMatchObject({ position: { x: 11, y: 3 } })
    expect(moved.plantings[0]!.position).toEqual({ x: 3, y: 0 })
  })

  it('leaves other items and zero moves alone', () => {
    const project = sample()
    expect(moveItems(project, new Set(['bed-1']), 0, 0)).toBe(project)
    expect(moveItems(project, new Set(['bed-1']), 1, 1).objects[1]).toBe(project.objects[1])
  })
})

describe('transformObjects', () => {
  it('bakes a rotation into points, and into the angle of point objects', () => {
    const transformed = transformObjects(
      sample(),
      new Map([
        ['fence', rotation(90, { x: 0, y: 15 })],
        ['bench', rotation(20, { x: 10, y: 5 })],
      ]),
    )
    const fence = transformed.objects[1]!.shape
    expect(fence.type === 'polyline' && fence.points[1]!.x).toBeCloseTo(0)
    expect(fence.type === 'polyline' && fence.points[1]!.y).toBeCloseTo(35)
    const bench = transformed.objects[2]!.shape
    expect(bench.type === 'point' && bench.rotationDeg).toBeCloseTo(10) // 350 + 20 → 10
  })
})

describe('deleteItems', () => {
  it('removes items and unlinks plantings from deleted beds', () => {
    const result = deleteItems(sample(), new Set(['bed-1', 'bench']))
    expect(result.objects.map((o) => o.id)).toEqual(['fence'])
    expect(result.plantings[0]!.bedId).toBeUndefined()
  })
})

describe('copy and paste', () => {
  it('pastes copies with new ids, shifted, keeping the link to a copied bed', () => {
    const project = sample()
    const clipboard = copyItems(project, new Set(['bed-1', 'p-1']))!
    const { project: pasted, ids } = pasteItems(project, clipboard, 1, 1)

    expect(ids).toHaveLength(2)
    expect(pasted.objects).toHaveLength(4)
    const [bedCopy] = pasted.objects.slice(-1)
    const [plantingCopy] = pasted.plantings.slice(-1)
    expect(bedCopy!.id).not.toBe('bed-1')
    expect(plantingCopy!.bedId).toBe(bedCopy!.id)
    expect(plantingCopy!.position).toEqual({ x: 3, y: 3 })
  })

  it('keeps the bed of a pasted planting only if that bed still exists', () => {
    const project = sample()
    const clipboard = copyItems(project, new Set(['p-1']))!
    expect(pasteItems(project, clipboard, 0, 0).project.plantings[1]!.bedId).toBe('bed-1')

    const withoutBed = deleteItems(project, new Set(['bed-1']))
    expect(pasteItems(withoutBed, clipboard, 0, 0).project.plantings[1]!.bedId).toBeUndefined()
  })

  it('copies nothing for an empty selection, and the clipboard is a snapshot', () => {
    const project = sample()
    expect(copyItems(project, new Set())).toBeNull()
    const clipboard = copyItems(project, new Set(['bed-1']))!
    clipboard.objects[0]!.label = 'changed'
    expect(project.objects[0]!.label).toBe('Border')
  })
})

describe('selection and layers', () => {
  it('only offers items on visible, unlocked layers', () => {
    const project = sample()
    expect(editableItemIds(project).sort()).toEqual(['bed-1', 'bench', 'fence', 'p-1'])

    const locked = {
      ...project,
      layers: { ...project.layers, hardscape: { visible: true, locked: true } },
    }
    expect(editableItemIds(locked).sort()).toEqual(['bed-1', 'p-1'])

    const hidden = {
      ...project,
      layers: { ...project.layers, plants: { visible: false, locked: false } },
    }
    expect(validSelection(hidden, ['bed-1', 'p-1', 'fence', 'gone'])).toEqual(['fence'])
  })
})

describe('updateObject', () => {
  it('sets and removes fields', () => {
    const project = sample()
    const labelled = updateObject(project, 'fence', { label: 'Back fence' })
    expect(labelled.objects[1]!.label).toBe('Back fence')
    expect('label' in updateObject(labelled, 'fence', { label: '' }).objects[1]!).toBe(false)
  })
})
