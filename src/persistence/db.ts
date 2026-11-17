import Dexie, { type EntityTable } from 'dexie'
import type { Project } from '../model/schema'
import type { ProposalSetRecord } from './proposalSets'

/**
 * Binary files belonging to a project (e.g. the site-plan image). Kept out of the project record
 * so autosaving a project stays cheap. Bytes are stored as an ArrayBuffer, which every browser's
 * IndexedDB can store reliably.
 */
export type AssetRecord = {
  id: string
  projectId: string
  mimeType: string
  data: ArrayBuffer
  createdAt: number
}

/** Projects as stored. Records may have an older schemaVersion: always load via loadProject(). */
export type StoredProject = Project

export class GardenDatabase extends Dexie {
  projects!: EntityTable<StoredProject, 'id'>
  assets!: EntityTable<AssetRecord, 'id'>
  proposalSets!: EntityTable<ProposalSetRecord, 'id'>

  constructor(name = 'garden-designer') {
    super(name)
    this.version(1).stores({
      projects: 'id, updatedAt',
      assets: 'id, projectId',
    })
    this.version(2).stores({ proposalSets: 'id, projectId, updatedAt' })
  }
}

export const db = new GardenDatabase()
