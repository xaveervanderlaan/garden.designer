import { newProject, normaliseName } from '../model/defaults'
import { newId } from '../model/ids'
import { migrateProject } from '../model/migrations'
import { type Project, projectSchema } from '../model/schema'
import { type AssetRecord, db } from './db'

export type ProjectSummary = Pick<Project, 'id' | 'name' | 'createdAt' | 'updatedAt'>

/** All projects, most recently changed first. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const projects = await db.projects.orderBy('updatedAt').reverse().toArray()
  return projects.map(({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt, updatedAt }))
}

export async function createProject(name: string): Promise<Project> {
  const project = newProject(name)
  await db.projects.add(project)
  void requestPersistentStorage()
  return project
}

/**
 * Loads, migrates and validates a project. Returns undefined if it doesn't exist; throws if the
 * stored data is invalid. Migrated projects are written back.
 */
export async function loadProject(id: string): Promise<Project | undefined> {
  const stored = await db.projects.get(id)
  if (!stored) return undefined

  const project = projectSchema.parse(migrateProject(stored))
  if (stored.schemaVersion !== project.schemaVersion) await db.projects.put(project)
  return project
}

export async function saveProject(project: Project): Promise<void> {
  await db.projects.put(project)
}

export async function renameProject(id: string, name: string): Promise<void> {
  const cleanName = normaliseName(name)
  if (!cleanName) throw new Error('A project needs a name')
  await db.projects.update(id, { name: cleanName, updatedAt: Date.now() })
}

/**
 * Deep copy under a new id. Assets are copied too (with new ids), so the copy is fully independent
 * of the original.
 */
export async function duplicateProject(id: string, name: string): Promise<Project> {
  return db.transaction('rw', db.projects, db.assets, async () => {
    const original = await loadProject(id)
    if (!original) throw new Error(`Project ${id} not found`)

    const now = Date.now()
    const copy: Project = {
      ...structuredClone(original),
      id: newId(),
      name: normaliseName(name) || original.name,
      createdAt: now,
      updatedAt: now,
    }

    const assets = await db.assets.where('projectId').equals(id).toArray()
    const newAssetIds = new Map(assets.map((asset) => [asset.id, newId()]))
    await db.assets.bulkAdd(
      assets.map((asset): AssetRecord => ({
        ...asset,
        id: newAssetIds.get(asset.id)!,
        projectId: copy.id,
        data: asset.data.slice(0),
      })),
    )
    if (copy.background) {
      copy.background.assetId = newAssetIds.get(copy.background.assetId) ?? copy.background.assetId
    }

    await db.projects.add(copy)
    return copy
  })
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.assets, async () => {
    await db.assets.where('projectId').equals(id).delete()
    await db.projects.delete(id)
  })
}

export async function listAssets(projectId: string): Promise<AssetRecord[]> {
  return db.assets.where('projectId').equals(projectId).toArray()
}

/**
 * Asks the browser not to evict our data under storage pressure. Chrome decides silently; Firefox
 * may ask the user. Failure is harmless (data then stays "best effort").
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    // ignore
  }
}
