/**
 * Version names in Manager mode (docs/PLAN.md 7.6, 8.4 rule 5; M3 review UI-3, read side): a name
 * with an amount that came with a Full file's Replace or Merge (no entry check) reads "an amount"
 * wherever Manager mode reads versions: the context's versions, the plan model's labels and every
 * file Manager mode writes. HR admin reads the name as stored (control). With no amount in any name,
 * Manager mode reads the plan state's own array.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { hasAmount } from '@/access/visibility'
import type { Sample } from '@/data/sample'
import { planOfRecord } from '@/plan/engine/versions'
import { leakSample, personaCtx, sampleCtx, withPlan } from '@/testkit/sample'
import { requestsFile, shareableFile } from '@/views/data/engine/workspace'
import { planModel } from '@/views/plan/engine'

const NAME = 'FY27 Q1 Reforecast, cut to $57.1M'
const AT = '2026-09-30T12:00:00.000Z'

let s: Sample
let named: Sample
let id: string

beforeAll(() => {
  s = leakSample()
  const por = planOfRecord(s.plan.versions, 'FY27')
  if (!por) throw new Error('The sample has no FY27 plan of record.')
  id = por.versionId
  named = withPlan(s, {
    versions: s.plan.versions.map((v) => (v.versionId === id ? { ...v, name: NAME } : v)),
  })
}, 120_000)

describe('a version name with an amount (UI-3)', () => {
  it('reads "an amount" in Manager mode: versions, the plan model and the files', () => {
    const ctx = personaCtx('manager-a', { sample: named })
    expect(ctx.versions.find((v) => v.versionId === id)?.name).toBe('FY27 Q1 Reforecast, cut to an amount')
    expect(ctx.versions.some((v) => hasAmount(v.name))).toBe(false)
    const shareable = shareableFile(ctx, AT)
    const requests = requestsFile(ctx, AT)
    if (!shareable.ok || !requests.ok) throw new Error('Manager mode saves both files.')
    for (const text of [shareable.out.text, requests.out.text, JSON.stringify(planModel(ctx))]) {
      expect(text).not.toContain('57.1M')
      expect(text).not.toContain('$')
    }
    expect(shareable.out.text).toContain('FY27 Q1 Reforecast, cut to an amount')
  })

  it('control: HR admin reads the name as stored', () => {
    const ctx = sampleCtx('hr-admin', { sample: named })
    expect(ctx.versions.find((v) => v.versionId === id)?.name).toBe(NAME)
  })

  it('with no amount in any name, Manager mode reads the plan state’s own versions', () => {
    expect(personaCtx('manager-a', { sample: s }).versions).toBe(s.plan.versions)
  })
})
