import { describe, expect, it } from 'vitest'
import { defaultBrief } from '../model/brief'
import sampleFixture from '../../tests/e2e/fixtures/sample.garden.json?raw'
import answerFixture from '../../tests/e2e/fixtures/sample-answer.md?raw'
import { migrateProject } from '../model/migrations'
import { projectSchema } from '../model/schema'
import { expandProposal } from './expand'
import { parseAnswer } from './parse'

const answer = parseAnswer(answerFixture)
const sample = projectSchema.parse(
  migrateProject((JSON.parse(sampleFixture) as { project: unknown }).project),
)
const base = { ...sample, brief: { ...defaultBrief(), mayChange: [] } }

describe('the sample answer', () => {
  it('has 12 valid proposals', () => {
    expect(answer.ok).toBe(true)
    if (!answer.ok) return
    expect(answer.problems).toEqual([])
    expect(answer.truncated).toBe(false)
    expect(answer.proposals).toHaveLength(12)
  })

  it('each expands on the sample garden without unknown plants', () => {
    if (!answer.ok) throw new Error('unreadable')
    for (const proposal of answer.proposals) {
      const { project, report } = expandProposal(base, proposal, { year: 2027 })
      expect(report.dropped.filter((d) => d.reason === 'unknownPlant')).toEqual([])
      expect(project.objects.length + project.plantings.length).toBeGreaterThan(
        base.objects.length + base.plantings.length,
      )
    }
  })
})
