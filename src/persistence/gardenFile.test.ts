import { describe, expect, it } from 'vitest'
import sampleFixture from '../../tests/e2e/fixtures/sample.garden.json?raw'
import { SCHEMA_VERSION } from '../model/schema'
import { sampleProjectWithAsset } from '../test/fixtures'
import { db } from './db'
import {
  GARDEN_FILE_FORMAT,
  type ImportErrorCode,
  ImportError,
  buildGardenFile,
  exportProject,
  gardenFileName,
  importGardenFile,
  parseGardenFile,
} from './gardenFile'
import { listAssets, listProjects, loadProject } from './projects'

async function storeSample() {
  const { project, asset } = sampleProjectWithAsset('Achtertuin – versie 2')
  await db.projects.add(project)
  await db.assets.add(asset)
  return { project, asset }
}

const codeOf = (fn: () => unknown): ImportErrorCode | string => {
  try {
    fn()
  } catch (error) {
    return error instanceof ImportError ? error.code : 'other'
  }
  return 'no error'
}

describe('export → import', () => {
  it('round-trips a project with all its content and assets', async () => {
    const { project, asset } = await storeSample()

    const { fileName, json } = await exportProject(project.id)
    expect(fileName).toBe('achtertuin-versie-2.garden.json')

    const imported = await importGardenFile(json)

    // Imported as a new project: new id, everything else identical.
    expect(imported.id).not.toBe(project.id)
    const { id: _a, updatedAt: _b, background: bgA, ...restImported } = imported
    const { id: _c, updatedAt: _d, background: bgO, ...restOriginal } = project
    expect(restImported).toEqual(restOriginal)
    expect({ ...bgA, assetId: 'x' }).toEqual({ ...bgO, assetId: 'x' })

    // The image comes back byte for byte, under a new asset id.
    const assets = await listAssets(imported.id)
    expect(assets).toHaveLength(1)
    expect(assets[0]!.id).toBe(imported.background?.assetId)
    expect(assets[0]!.id).not.toBe(asset.id)
    expect(assets[0]!.mimeType).toBe('image/png')
    expect(new Uint8Array(assets[0]!.data)).toEqual(new Uint8Array(asset.data))

    expect(await loadProject(imported.id)).toEqual(imported)
  })

  it('imports the same file twice as two separate projects', async () => {
    const { project } = await storeSample()
    const { json } = await exportProject(project.id)

    await importGardenFile(json)
    await importGardenFile(json)

    expect(await listProjects()).toHaveLength(3)
  })
})

describe('parseGardenFile', () => {
  const validFile = () => {
    const { project, asset } = sampleProjectWithAsset()
    return buildGardenFile(project, [asset])
  }
  const parse = (file: unknown) => () => parseGardenFile(JSON.stringify(file))

  it('accepts a valid file', () => {
    expect(codeOf(parse(validFile()))).toBe('no error')
  })

  it('rejects text that is not JSON', () => {
    expect(codeOf(() => parseGardenFile('{ not json'))).toBe('notJson')
  })

  it.each([[{}], [[]], [null], [{ format: 'something-else' }]])(
    'rejects %j as not a garden file',
    (file) => {
      expect(codeOf(parse(file))).toBe('notGardenFile')
    },
  )

  it('rejects files from a newer app version', () => {
    expect(codeOf(parse({ ...validFile(), schemaVersion: SCHEMA_VERSION + 1 }))).toBe(
      'newerVersion',
    )
    const file = validFile()
    expect(
      codeOf(parse({ ...file, project: { ...file.project, schemaVersion: SCHEMA_VERSION + 1 } })),
    ).toBe('newerVersion')
  })

  it('rejects damaged content', () => {
    const file = validFile()
    expect(codeOf(parse({ ...file, project: { ...file.project, objects: 'nope' } }))).toBe(
      'invalid',
    )
    expect(codeOf(parse({ ...file, project: { ...file.project, schemaVersion: undefined } }))).toBe(
      'invalid',
    )
    expect(codeOf(parse({ ...file, assets: {} }))).toBe('invalid') // background image missing
    expect(codeOf(parse({ format: GARDEN_FILE_FORMAT, schemaVersion: 1 }))).toBe('invalid')
  })

  it('rejects an asset that is not a valid data URL on import', async () => {
    const file = validFile()
    const [assetId] = Object.keys(file.assets)
    file.assets[assetId!] = { mimeType: 'image/png', dataUrl: 'data:image/png;base64,@@' }
    await expect(importGardenFile(JSON.stringify(file))).rejects.toMatchObject({ code: 'invalid' })
    expect(await listProjects()).toHaveLength(0) // nothing half-imported
  })
})

describe('e2e fixture', () => {
  it('is a valid garden file', () => {
    expect(codeOf(() => parseGardenFile(sampleFixture))).toBe('no error')
  })
})

describe('gardenFileName', () => {
  it.each([
    ['Achtertuin – versie 2', 'achtertuin-versie-2.garden.json'],
    ['Één tuin, géén gedoe', 'een-tuin-geen-gedoe.garden.json'],
    ['!!!', 'garden-design.garden.json'],
  ])('%j → %j', (name, expected) => {
    expect(gardenFileName(name)).toBe(expected)
  })
})
