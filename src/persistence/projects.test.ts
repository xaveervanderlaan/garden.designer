import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '../model/schema'
import { sampleProjectWithAsset } from '../test/fixtures'
import { db } from './db'
import {
  addAsset,
  createProject,
  deleteProject,
  duplicateProject,
  getAsset,
  listAssets,
  listProjects,
  loadProject,
  pruneUnusedAssets,
  renameProject,
  saveProject,
} from './projects'

async function storeSample(name?: string) {
  const { project, asset } = sampleProjectWithAsset(name)
  await db.projects.add(project)
  await db.assets.add(asset)
  return { project, asset }
}

describe('project repository', () => {
  it('creates projects and lists them, most recently changed first', async () => {
    const a = await createProject('Front garden')
    const b = await createProject('Back garden')
    await saveProject({ ...a, updatedAt: b.updatedAt + 1000 })

    expect((await listProjects()).map((p) => p.name)).toEqual(['Front garden', 'Back garden'])
    expect(await loadProject(b.id)).toEqual(b)
  })

  it('returns undefined for an unknown project', async () => {
    expect(await loadProject('nope')).toBeUndefined()
  })

  it('refuses to load invalid or newer stored data', async () => {
    const { project } = sampleProjectWithAsset()
    await db.projects.put({
      ...project,
      id: 'broken',
      settings: { ...project.settings, soil: 'x' as never },
    })
    await db.projects.put({
      ...project,
      id: 'future',
      schemaVersion: (SCHEMA_VERSION + 1) as never,
    })

    await expect(loadProject('broken')).rejects.toThrow()
    await expect(loadProject('future')).rejects.toThrow()
  })

  it('renames a project and bumps its change time', async () => {
    const project = await createProject('Tuin')
    await renameProject(project.id, '  Voortuin  ')

    const renamed = await loadProject(project.id)
    expect(renamed?.name).toBe('Voortuin')
    expect(renamed!.updatedAt).toBeGreaterThanOrEqual(project.updatedAt)
    await expect(renameProject(project.id, '   ')).rejects.toThrow()
  })

  it('duplicates a project, including its assets, as a fully independent copy', async () => {
    const { project: original, asset } = await storeSample('Back garden')

    const copy = await duplicateProject(original.id, 'Back garden (copy)')

    expect(copy.id).not.toBe(original.id)
    expect(copy.name).toBe('Back garden (copy)')
    expect(copy.objects).toEqual(original.objects)
    expect(copy.plantings).toEqual(original.plantings)
    expect(copy.customPlants).toEqual(original.customPlants)

    // The asset is copied under a new id and the background points to the copy.
    const copiedAssets = await listAssets(copy.id)
    expect(copiedAssets).toHaveLength(1)
    expect(copiedAssets[0]!.id).not.toBe(asset.id)
    expect(copy.background?.assetId).toBe(copiedAssets[0]!.id)
    expect(new Uint8Array(copiedAssets[0]!.data)).toEqual(new Uint8Array(asset.data))

    // Changing the copy leaves the original untouched.
    await saveProject({ ...copy, plot: { outline: [] }, objects: [] })
    await deleteProject(copy.id)
    const reloaded = await loadProject(original.id)
    expect(reloaded).toEqual(original)
    expect(await listAssets(original.id)).toHaveLength(1)
  })

  it('deletes a project together with its own assets only', async () => {
    const first = await storeSample('First')
    const second = await storeSample('Second')

    await deleteProject(first.project.id)

    expect(await loadProject(first.project.id)).toBeUndefined()
    expect(await listAssets(first.project.id)).toHaveLength(0)
    expect(await loadProject(second.project.id)).toEqual(second.project)
    expect(await listAssets(second.project.id)).toHaveLength(1)
  })

  it('stores assets and removes the ones a project no longer uses', async () => {
    const { project, asset } = await storeSample('Garden')
    const replaced = await addAsset(project.id, 'image/jpeg', new Uint8Array([1, 2, 3]).buffer)
    expect((await getAsset(replaced))?.mimeType).toBe('image/jpeg')
    expect(await listAssets(project.id)).toHaveLength(2)

    // Still using the original image: the new one goes.
    expect(await pruneUnusedAssets(project)).toBe(1)
    expect((await listAssets(project.id)).map((a) => a.id)).toEqual([asset.id])

    // Without a site plan, nothing is kept.
    const { background: _, ...withoutBackground } = project
    expect(await pruneUnusedAssets(withoutBackground)).toBe(1)
    expect(await listAssets(project.id)).toHaveLength(0)
  })
})
