import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultBrief } from '../../../model/brief'
import { db } from '../../../persistence/db'
import { hrefFor } from '../../../routing'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { sampleProjectWithAsset } from '../../../test/fixtures'
import { DesignIdeasDialog } from './DesignIdeasDialog'

// jsdom has no canvas: every thumbnail is "drawn" at once.
vi.mock('./thumbnails', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./thumbnails')>()),
  useThumbnail: (key: string) => `data:image/png;base64,${btoa(key)}`,
}))

const proposal = (id: string, title: string, elements: unknown[]) => ({
  id,
  title,
  concept: `The ${title.toLowerCase()} idea.`,
  tags: ['calm'],
  highlights: [],
  elements,
})
const shed = { type: 'object', kind: 'shed', rect: { c: [17, 3], w: 2, d: 2 } }
const terrace = { type: 'object', kind: 'terrace', rect: { c: [15, 10], w: 4, d: 3 } }
const answer = (...proposals: unknown[]) =>
  '```json\n' + JSON.stringify({ format: 'garden-proposals/1', proposals }) + '\n```\n'

async function openGallery() {
  const { project, asset } = sampleProjectWithAsset()
  project.brief = {
    ...defaultBrief(),
    mustHaves: [{ id: 'must-terrace', kind: 'terrace', size: 10 }],
  }
  await db.projects.add(project)
  await db.assets.add(asset)
  await act(async () => {
    await useProjectStore.getState().open(project.id)
    useUiStore.getState().setIdeasOpen(true, 'proposals')
  })
  render(<DesignIdeasDialog />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('textbox', { name: /Paste Claude/ }))
  await user.paste(
    answer(proposal('A', 'Garden shed', [shed]), proposal('B', 'Sunny terrace', [terrace])),
  )
  await user.click(screen.getByRole('button', { name: 'Read answer' }))
  await waitFor(() => expect(screen.getAllByTestId('proposal')).toHaveLength(2))
  return user
}

const titles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)

describe('ProposalGallery', () => {
  beforeEach(() => useUiStore.getState().reset())

  afterEach(async () => {
    useUiStore.getState().reset()
    await useProjectStore.getState().close()
  })

  it('shows figures and checklist per card', async () => {
    await openGallery()
    const [shedCard, terraceCard] = screen.getAllByTestId('proposal')
    expect(within(terraceCard!).getByTestId('proposal-thumb')).toHaveAttribute('data-ready', 'true')
    const figures = within(terraceCard!).getByTestId('proposal-figures')
    expect(figures).toHaveTextContent(/Paved\s*12\sm²/)
    expect(figures).toHaveTextContent('Months in bloom')
    expect(within(terraceCard!).getByTestId('proposal-checklist')).toHaveTextContent(
      /Met: Terrace · 12\sm² of 10\sm²/,
    )
    expect(within(shedCard!).getByTestId('proposal-checklist')).toHaveTextContent(
      /Missing: Terrace/,
    )
    expect(screen.getByRole('dialog')).toHaveClass(/wide/)
  })

  it('stars a proposal and keeps it after reopening', async () => {
    const user = await openGallery()
    const star = screen.getByRole('button', { name: 'Star Sunny terrace' })
    expect(star).toHaveAttribute('aria-pressed', 'false')
    await user.click(star)
    expect(star).toHaveAttribute('aria-pressed', 'true')
    await waitFor(async () => expect((await db.proposalSets.toArray())[0]?.starred).toEqual(['B']))

    cleanup()
    render(<DesignIdeasDialog />)
    expect(await screen.findByRole('button', { name: 'Star Sunny terrace' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Star Garden shed' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('shows starred only', async () => {
    const user = await openGallery()
    await user.click(screen.getByRole('checkbox', { name: 'Starred only' }))
    expect(screen.queryAllByTestId('proposal')).toHaveLength(0)
    expect(screen.getByText(/No starred proposals yet/)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Starred only' }))
    await user.click(screen.getByRole('button', { name: 'Star Garden shed' }))
    await user.click(screen.getByRole('checkbox', { name: 'Starred only' }))
    expect(titles()).toEqual(['Garden shed'])
  })

  it('sorts by a figure', async () => {
    const user = await openGallery()
    expect(titles()).toEqual(['Garden shed', 'Sunny terrace'])
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'paved')
    expect(titles()).toEqual(['Sunny terrace', 'Garden shed'])
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'order')
    expect(titles()).toEqual(['Garden shed', 'Sunny terrace'])
  })

  it('discards selected proposals', async () => {
    const user = await openGallery()
    const discard = screen.getByRole('button', { name: 'Discard selected' })
    expect(discard).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Select Garden shed' }))
    await user.click(discard)
    expect(titles()).toEqual(['Sunny terrace'])
    await waitFor(async () =>
      expect((await db.proposalSets.toArray())[0]?.proposals.map((p) => p.id)).toEqual(['B']),
    )
    await user.click(screen.getByRole('button', { name: 'Discard Sunny terrace' }))
    expect(screen.queryAllByTestId('proposal')).toHaveLength(0)
  })

  it('more like this shows a follow-up prompt', async () => {
    const user = await openGallery()
    await user.click(screen.getByRole('button', { name: 'More like Sunny terrace' }))
    expect(screen.getByRole('heading', { name: 'More like “Sunny terrace”' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toHaveFocus()
    const value = () => (screen.getByTestId('followup-prompt') as HTMLTextAreaElement).value
    expect(value()).toContain('Make 4 new variations')
    expect(value()).toContain('"id":"B"')
    expect(value()).toContain('not in this list: A, B')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Number of variations' }), '2')
    expect(value()).toContain('Make 2 new variations')
    await user.click(screen.getByRole('button', { name: 'Close the follow-up prompt' }))
    expect(screen.queryByTestId('followup-prompt')).not.toBeInTheDocument()
  })

  it('regenerate prompt lists the selected ids', async () => {
    const user = await openGallery()
    await user.click(screen.getByRole('checkbox', { name: 'Select Sunny terrace' }))
    await user.click(screen.getByRole('button', { name: 'Regenerate selected' }))
    expect(screen.getByRole('heading', { name: /New versions of 1 proposal/ })).toBeInTheDocument()
    const value = () => (screen.getByTestId('followup-prompt') as HTMLTextAreaElement).value
    expect(value()).toContain('using exactly these ids: B.')
    expect(value()).toContain('- Garden shed')
  })

  it('uses several, each as its own design', async () => {
    const user = await openGallery()
    await user.click(screen.getByRole('checkbox', { name: 'Select Garden shed' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Sunny terrace' }))
    await user.click(screen.getByRole('button', { name: 'Use selected (2)' }))
    await waitFor(() => expect(window.location.hash).toBe(hrefFor({ name: 'projects' })))
    const names = (await db.projects.toArray()).map((p) => p.name).sort()
    expect(names).toEqual([
      'Back garden',
      'Back garden — Garden shed',
      'Back garden — Sunny terrace',
    ])
  })
})
