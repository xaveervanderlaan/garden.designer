import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { LANGUAGE_STORAGE_KEY } from './i18n'
import { createProject } from './persistence/projects'

function navigate(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

describe('App shell', () => {
  it('shows the (empty) project list in English by default', async () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your garden designs' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('No designs yet.')).toBeInTheDocument()
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

  it('opens a design in the editor and goes back', async () => {
    const project = await createProject('Back garden')
    render(<App />)

    navigate(`#/p/${project.id}`)
    expect(await screen.findByRole('textbox', { name: 'Design name' })).toHaveValue('Back garden')
    expect(screen.getByRole('status')).toHaveTextContent('All changes saved')

    navigate('#/')
    expect(await screen.findByRole('heading', { name: 'Your garden designs' })).toBeInTheDocument()
  })

  it('explains when a design does not exist', async () => {
    render(<App />)
    navigate('#/p/unknown-id')
    expect(await screen.findByText('This design doesn’t exist (any more).')).toBeInTheDocument()
  })

  it('shows a not-found page for unknown routes', async () => {
    render(<App />)
    navigate('#/does-not-exist')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
