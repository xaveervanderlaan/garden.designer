import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import i18n from '../i18n'
import type { Updater } from './serviceWorker'
import { UpdatePrompt } from './UpdatePrompt'

/** An updater whose "new version waiting" state the test controls. */
function fakeUpdater(available = false) {
  const listeners = new Set<() => void>()
  const updater: Updater = {
    start: vi.fn(() => Promise.resolve()),
    getSnapshot: () => available,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    applyUpdate: vi.fn(() => Promise.resolve()),
  }
  const newVersion = () =>
    act(() => {
      available = true
      for (const listener of listeners) listener()
    })
  return { updater, newVersion }
}

describe('UpdatePrompt', () => {
  it('appears when a new version is waiting', () => {
    const { updater, newVersion } = fakeUpdater()
    render(<UpdatePrompt updater={updater} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    newVersion()
    expect(screen.getByRole('status')).toHaveTextContent('A new version of the app is available.')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeEnabled()
  })

  it('reloads into the new version', async () => {
    const { updater } = fakeUpdater(true)
    render(<UpdatePrompt updater={updater} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(updater.applyUpdate).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Reload' })).toBeDisabled()
  })

  it('can be put off until later', async () => {
    const { updater } = fakeUpdater(true)
    render(<UpdatePrompt updater={updater} />)
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(updater.applyUpdate).not.toHaveBeenCalled()
  })

  it('speaks Dutch', async () => {
    await i18n.changeLanguage('nl')
    const { updater } = fakeUpdater(true)
    render(<UpdatePrompt updater={updater} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Er is een nieuwe versie van de app beschikbaar.',
    )
    expect(screen.getByRole('button', { name: 'Opnieuw laden' })).toBeInTheDocument()
  })
})
