import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../i18n'
import { db } from '../../../persistence/db'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { sampleProjectWithAsset } from '../../../test/fixtures'
import { DesignIdeasDialog } from './DesignIdeasDialog'

// jsdom has no canvas: thumbnails are covered by the e2e tests.
vi.mock('./thumbnails', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./thumbnails')>()),
  useThumbnail: () => null,
}))

const proposal = (id: string, title: string, elements: unknown[]) => ({
  id,
  title,
  concept: `The ${title.toLowerCase()} idea.`,
  tags: ['calm'],
  highlights: [],
  elements,
})
const terrace = { type: 'object', kind: 'terrace', rect: { c: [15, 10], w: 4, d: 3 } }
const shed = { type: 'object', kind: 'shed', rect: { c: [17, 3], w: 2, d: 2 } }
const answer = (...proposals: unknown[]) =>
  'Here are my ideas.\n\n```json\n' +
  JSON.stringify({ format: 'garden-proposals/1', proposals }) +
  '\n```\n'

const project = () => useProjectStore.getState().project!

async function openDialog(tab?: 'brief' | 'prompt' | 'proposals') {
  const { project: sample, asset } = sampleProjectWithAsset()
  await db.projects.add(sample)
  await db.assets.add(asset)
  await act(async () => {
    await useProjectStore.getState().open(sample.id)
    useUiStore.getState().setIdeasOpen(true, tab ?? 'brief')
  })
  render(<DesignIdeasDialog />)
  return screen.getByRole('dialog')
}

async function pasteAnswer(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByRole('textbox', { name: /Paste Claude|Plak het antwoord/ }))
  await user.paste(text)
  await user.click(screen.getByRole('button', { name: /Read answer|Antwoord inlezen/ }))
}

describe('DesignIdeasDialog', () => {
  beforeEach(() => {
    useUiStore.getState().reset()
  })

  afterEach(async () => {
    useUiStore.getState().reset()
    await useProjectStore.getState().close()
    await act(() => i18n.changeLanguage('en'))
  })

  it('saves the brief as one undo step', async () => {
    const user = userEvent.setup()
    expect(await openDialog()).toHaveAccessibleName('Design ideas')
    await user.click(screen.getByRole('checkbox', { name: 'Natural' }))
    await user.click(screen.getByRole('radio', { name: 'Low' }))
    await user.click(screen.getByRole('button', { name: 'Add a must-have' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'What' }), 'pond')
    await user.type(screen.getByRole('textbox', { name: 'Size' }), '4,5')
    await user.click(screen.getByRole('checkbox', { name: /^E1 · / }))
    await user.type(screen.getByRole('textbox', { name: 'Other wishes' }), 'A bench')
    expect(project().brief).toBeUndefined()

    await user.click(screen.getByRole('button', { name: 'Save brief' }))
    expect(project().brief).toMatchObject({
      styles: ['natural'],
      maintenance: 'low',
      mustHaves: [{ kind: 'pond', size: 4.5 }],
      mayChange: ['bed-1'],
      notes: 'A bench',
    })
    expect(screen.getByRole('status')).toHaveTextContent('Saved')

    act(() => useProjectStore.getState().undo())
    expect(project().brief).toBeUndefined()
  })

  it('shows the prompt with its size and copies it', async () => {
    const user = userEvent.setup()
    await openDialog()
    await user.click(screen.getByRole('checkbox', { name: 'Japanese' }))
    await user.click(screen.getByRole('tab', { name: '2. Prompt' }))
    expect(project().brief?.styles).toEqual(['japanese'])

    const prompt = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Prompt' })
    expect(prompt.value).toContain('japanese')
    expect(prompt.value).not.toContain('Back garden')
    expect(screen.getByTestId('ideas-prompt-size')).toHaveTextContent(/about [\d,]+ tokens/)
    expect(screen.getByText(/compute a sun-hours map first/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Copy prompt' }))
    expect(await navigator.clipboard.readText()).toBe(prompt.value)
    expect(screen.getByRole('status')).toHaveTextContent('Copied')
  })

  it('reads a pasted answer and lists proposals', async () => {
    const user = userEvent.setup()
    await openDialog('proposals')
    const before = project()

    await pasteAnswer(user, 'Sorry, I can only describe it in words.')
    expect(screen.getByRole('alert')).toHaveTextContent('There is no JSON in this text')
    expect(await db.proposalSets.count()).toBe(0)
    expect(screen.queryByTestId('proposal-list')).not.toBeInTheDocument()

    await user.clear(screen.getByRole('textbox', { name: /Paste Claude/ }))
    await pasteAnswer(
      user,
      answer(proposal('A', 'Sunny terrace', [terrace]), proposal('B', 'Shed', [shed])),
    )
    const items = await screen.findAllByTestId('proposal')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByRole('heading')).toHaveTextContent('Sunny terrace')
    expect(items[0]).toHaveTextContent('1 objects · 0 plants · 0 species')
    expect(screen.getByTestId('answer-status')).toHaveTextContent('2 of 12 proposals')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(await db.proposalSets.count()).toBe(1)
    expect(project()).toBe(before)
  })

  it('shows problems in Dutch', async () => {
    const user = userEvent.setup()
    await act(() => i18n.changeLanguage('nl'))
    await openDialog('proposals')
    const bad = {
      type: 'object',
      kind: 'terrace',
      line: [
        [0, 0],
        [2, 2],
      ],
    }
    await pasteAnswer(
      user,
      answer(proposal('A', 'Terras', [terrace]), proposal('B', 'Fout', [bad])),
    )
    const problems = await screen.findByTestId('answer-problems')
    expect(problems).toHaveTextContent('Afgekeurde voorstellen')
    expect(problems).toHaveTextContent(/Fout: .*de vorm past niet bij deze soort/)
    expect(screen.getAllByTestId('proposal')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Vervolgprompt kopiëren' })).toBeInTheDocument()
  })

  it('merges a second paste', async () => {
    const user = userEvent.setup()
    await openDialog('proposals')
    await pasteAnswer(user, answer(proposal('A', 'Sunny terrace', [terrace])))
    await screen.findByTestId('proposal')
    await pasteAnswer(
      user,
      answer(proposal('A', 'Bigger terrace', [terrace]), proposal('B', 'Shed', [shed])),
    )
    await waitFor(() => expect(screen.getAllByTestId('proposal')).toHaveLength(2))
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Bigger terrace',
      'Shed',
    ])
    expect(await db.proposalSets.count()).toBe(1)

    await user.click(screen.getByRole('button', { name: 'New set' }))
    await pasteAnswer(user, answer(proposal('C', 'Pond', [shed])))
    await waitFor(() => expect(screen.getAllByTestId('proposal')).toHaveLength(1))
    expect(await db.proposalSets.count()).toBe(2)
  })

  it('use this design creates and opens a new design', async () => {
    const user = userEvent.setup()
    await openDialog('proposals')
    const baseId = project().id
    await pasteAnswer(user, answer(proposal('A', 'Sunny terrace', [terrace])))
    await user.click(await screen.findByRole('button', { name: /Use this design/ }))

    await waitFor(() => expect(window.location.hash).toMatch(/^#\/p\//))
    const id = decodeURIComponent(window.location.hash.slice('#/p/'.length))
    expect(id).not.toBe(baseId)
    const created = await db.projects.get(id)
    expect(created?.name).toBe('Back garden — Sunny terrace')
    expect(created?.objects.filter((o) => o.kind === 'terrace')).toEqual([
      expect.objectContaining({ status: 'new' }),
    ])
    expect((await db.projects.get(baseId))?.objects).toHaveLength(project().objects.length)
  })
})
