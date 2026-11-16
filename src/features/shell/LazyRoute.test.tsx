import { render, screen } from '@testing-library/react'
import { lazy } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LazyRoute } from './LazyRoute'

describe('LazyRoute', () => {
  it('shows a loading message, then the screen', async () => {
    const Screen = lazy(async () => ({ default: () => <p>The editor</p> }))
    render(
      <LazyRoute loading="Opening design…">
        <Screen />
      </LazyRoute>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Opening design…')
    expect(await screen.findByText('The editor')).toBeInTheDocument()
  })

  it('offers to reload when the screen’s code can’t be loaded', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Screen = lazy(() =>
      Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
    )
    render(
      <LazyRoute loading="Opening design…">
        <Screen />
      </LazyRoute>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This part of the app couldn’t be loaded.',
    )
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
