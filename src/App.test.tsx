import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { LANGUAGE_STORAGE_KEY } from './i18n'

function navigate(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

describe('App shell', () => {
  it('shows the project list in English by default', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your garden designs' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.lang).toBe('en')
  })

  it('switches to Dutch and remembers the choice', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'NL' }))

    expect(
      screen.getByRole('heading', { level: 1, name: 'Jouw tuinontwerpen' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'NL' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.lang).toBe('nl')
    expect(document.title).toBe('Tuinontwerper')
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('nl')
  })

  it('routes to the editor and back', async () => {
    render(<App />)
    navigate('#/p/demo')
    expect(await screen.findByRole('heading', { name: 'Garden editor' })).toBeInTheDocument()
    expect(screen.getByText(/Design “demo”/)).toBeInTheDocument()

    navigate('#/')
    expect(await screen.findByRole('heading', { name: 'Your garden designs' })).toBeInTheDocument()
  })

  it('shows a not-found page for unknown routes', async () => {
    render(<App />)
    navigate('#/does-not-exist')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
