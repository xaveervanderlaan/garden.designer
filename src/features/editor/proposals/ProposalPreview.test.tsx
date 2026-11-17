import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Project } from '../../../model/schema'
import { parseAnswer } from '../../../proposals/parse'
import { sampleProjectWithAsset } from '../../../test/fixtures'
import { galleryEntry } from './galleryData'
import { ProposalPreview } from './ProposalPreview'

// jsdom has no canvas: the plan only reports what it would draw.
vi.mock('../../viewer/ViewerPlan', () => ({
  ViewerPlan: ({ project, view }: { project: Project; view: { month: number | null } }) => (
    <div
      data-testid="viewer-plan"
      data-plants={String(project.layers.plants.visible)}
      data-month={String(view.month)}
    />
  ),
}))

const proposal = (id: string, title: string) => ({
  id,
  title,
  concept: `The ${title.toLowerCase()} idea.`,
  tags: ['calm'],
  highlights: [],
  elements: [{ type: 'object', kind: 'shed', rect: { c: [17, 3], w: 2, d: 2 } }],
})

function entries() {
  const { project } = sampleProjectWithAsset()
  const text =
    '```json\n' +
    JSON.stringify({
      format: 'garden-proposals/1',
      proposals: [proposal('A', 'First'), proposal('B', 'Second'), proposal('C', 'Third')],
    }) +
    '\n```\n'
  const parsed = parseAnswer(text)
  if (!parsed.ok) throw new Error('bad answer')
  return parsed.proposals.map((p) => galleryEntry(project, p, 2026))
}

function Harness({ onClose, onStar }: { onClose: () => void; onStar: (id: string) => void }) {
  const [index, setIndex] = useState(0)
  const [starred, setStarred] = useState<Set<string>>(new Set())
  return (
    <ProposalPreview
      entries={entries()}
      index={index}
      starred={starred}
      brief={undefined}
      onIndex={setIndex}
      onStar={(id) => {
        onStar(id)
        setStarred((s) => new Set(s).add(id))
      }}
      onUse={() => {}}
      onMoreLike={() => {}}
      onClose={onClose}
    />
  )
}

function setup() {
  const onClose = vi.fn()
  const onStar = vi.fn()
  const outer = vi.fn((event: KeyboardEvent) => {
    if (event.key === 'Escape' && !event.defaultPrevented) event.preventDefault()
  })
  window.addEventListener('keydown', outer)
  render(<Harness onClose={onClose} onStar={onStar} />)
  return { onClose, onStar, outer, cleanup: () => window.removeEventListener('keydown', outer) }
}

describe('ProposalPreview', () => {
  it('steps with the arrow keys', async () => {
    const { cleanup } = setup()
    const dialog = screen.getByRole('dialog', { name: 'First' })
    expect(screen.getByTestId('preview-position')).toHaveTextContent('1 of 3')
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(screen.getByRole('dialog', { name: 'Second' })).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
    expect(screen.getByRole('dialog', { name: 'Third' })).toBeInTheDocument()
    expect(screen.getByTestId('preview-position')).toHaveTextContent('3 of 3')
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('dialog', { name: 'First' })).toBeInTheDocument()
    cleanup()
  })

  it('escape closes only the preview', () => {
    const { onClose, outer, cleanup } = setup()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    // The outer dialog's handler saw the key already handled.
    expect(outer).toHaveBeenCalledTimes(1)
    expect(outer.mock.calls[0]![0].defaultPrevented).toBe(true)
    cleanup()
  })

  it('hides a layer', async () => {
    const { cleanup } = setup()
    expect(screen.getByTestId('viewer-plan')).toHaveAttribute('data-plants', 'true')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Beds & plants' }))
    expect(screen.getByTestId('viewer-plan')).toHaveAttribute('data-plants', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByTestId('viewer-plan')).toHaveAttribute('data-month', '1')
    cleanup()
  })

  it('stars from the preview', async () => {
    const { onStar, cleanup } = setup()
    const star = screen.getByRole('button', { name: 'Star First' })
    expect(star).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(star)
    expect(onStar).toHaveBeenCalledWith('A')
    expect(star).toHaveAttribute('aria-pressed', 'true')
    cleanup()
  })
})
