import { z } from 'zod'
import { newId } from '../model/ids'
import { MigrationError, migrateProject } from '../model/migrations'
import { type Project, SCHEMA_VERSION, projectSchema } from '../model/schema'
import { fromDataUrl, toDataUrl } from './base64'
import { type AssetRecord, db } from './db'
import { listAssets, loadProject, requestPersistentStorage } from './projects'

/**
 * `.garden.json` — a complete, self-contained design: the project plus its assets (as data URLs).
 * Used for backups and to move a design between devices.
 */
export const GARDEN_FILE_FORMAT = 'garden-designer'
export const GARDEN_FILE_EXTENSION = '.garden.json'

const gardenFileSchema = z.object({
  format: z.literal(GARDEN_FILE_FORMAT),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  project: projectSchema,
  assets: z.record(
    z.string(),
    z.object({ mimeType: z.string().min(1), dataUrl: z.string().startsWith('data:') }),
  ),
})
export type GardenFile = z.infer<typeof gardenFileSchema>

export type ImportErrorCode = 'notJson' | 'notGardenFile' | 'newerVersion' | 'invalid'

export class ImportError extends Error {
  readonly code: ImportErrorCode

  constructor(code: ImportErrorCode, message: string) {
    super(message)
    this.name = 'ImportError'
    this.code = code
  }
}

// --- Export ---------------------------------------------------------------------------------

export function buildGardenFile(
  project: Project,
  assets: AssetRecord[],
  now = new Date(),
): GardenFile {
  return {
    format: GARDEN_FILE_FORMAT,
    schemaVersion: project.schemaVersion,
    exportedAt: now.toISOString(),
    project,
    assets: Object.fromEntries(
      assets.map((a) => [a.id, { mimeType: a.mimeType, dataUrl: toDataUrl(a.mimeType, a.data) }]),
    ),
  }
}

/** A safe, readable file name, e.g. "Achtertuin – versie 2" → "achtertuin-versie-2.garden.json". */
export function gardenFileName(projectName: string): string {
  const slug = projectName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'garden-design'}${GARDEN_FILE_EXTENSION}`
}

export async function exportProject(id: string): Promise<{ fileName: string; json: string }> {
  const project = await loadProject(id)
  if (!project) throw new Error(`Project ${id} not found`)
  const file = buildGardenFile(project, await listAssets(id))
  return { fileName: gardenFileName(project.name), json: JSON.stringify(file) }
}

// --- Import ---------------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Parses, migrates and validates a garden file. Throws ImportError with a user-facing code. */
export function parseGardenFile(text: string): GardenFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ImportError('notJson', 'File is not valid JSON')
  }
  if (!isRecord(raw) || raw.format !== GARDEN_FILE_FORMAT) {
    throw new ImportError('notGardenFile', 'File is not a Garden Designer file')
  }
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > SCHEMA_VERSION) {
    throw new ImportError('newerVersion', `File has schema version ${raw.schemaVersion}`)
  }

  let project: unknown
  try {
    project = migrateProject(raw.project)
  } catch (error) {
    if (error instanceof MigrationError && error.reason === 'newer-version') {
      throw new ImportError('newerVersion', error.message)
    }
    throw new ImportError('invalid', error instanceof Error ? error.message : String(error))
  }

  const result = gardenFileSchema.safeParse({ ...raw, schemaVersion: SCHEMA_VERSION, project })
  if (!result.success) {
    throw new ImportError('invalid', z.prettifyError(result.error))
  }

  const file = result.data
  const backgroundId = file.project.background?.assetId
  if (backgroundId && !file.assets[backgroundId]) {
    throw new ImportError('invalid', `Missing asset ${backgroundId}`)
  }
  return file
}

/**
 * Imports a garden file as a NEW project (new project and asset ids), so importing never
 * overwrites an existing design, even when the same file is imported twice.
 */
export async function importGardenFile(text: string): Promise<Project> {
  const file = parseGardenFile(text)
  const now = Date.now()
  const project: Project = { ...file.project, id: newId(), updatedAt: now }

  const assetIds = new Map<string, string>()
  const assets: AssetRecord[] = []
  for (const [oldId, asset] of Object.entries(file.assets)) {
    const decoded = fromDataUrl(asset.dataUrl)
    if (!decoded) throw new ImportError('invalid', `Asset ${oldId} is not a valid data URL`)
    const id = newId()
    assetIds.set(oldId, id)
    assets.push({
      id,
      projectId: project.id,
      mimeType: asset.mimeType,
      data: decoded.data,
      createdAt: now,
    })
  }
  if (project.background) {
    project.background = {
      ...project.background,
      assetId: assetIds.get(project.background.assetId)!,
    }
  }

  await db.transaction('rw', db.projects, db.assets, async () => {
    await db.assets.bulkAdd(assets)
    await db.projects.add(project)
  })
  void requestPersistentStorage()
  return project
}
