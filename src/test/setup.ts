// Must come first: gives Dexie an in-memory IndexedDB before the database module loads.
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import i18n from '../i18n'
import { db } from '../persistence/db'

beforeEach(async () => {
  window.localStorage.clear()
  window.location.hash = ''
  await i18n.changeLanguage('en')
  await Promise.all(db.tables.map((table) => table.clear()))
})

afterEach(() => {
  cleanup()
})
