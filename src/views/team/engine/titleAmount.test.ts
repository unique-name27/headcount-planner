/**
 * A job title that arrives with an amount (an imported request, a merged workspace) never reaches
 * Manager mode as written (docs/PLAN.md 7.6, 8.4 rule 5; review PV-6): My team's tracker reads each
 * request through the one projection Manager mode reads requests through (src/drill/requestRecord.ts
 * `titleFor`), so the tracker's row, CSV and Shareable carry "an amount" in its place.
 */
import { describe, expect, it } from 'vitest'
import { AN_AMOUNT, hasAmount } from '@/access/visibility'
import { ctxAs, leakSample, personaOf, requestOf, withPlanRequests } from '@/testkit/sample'
import { teamModel } from './index'

describe('My team’s tracker in Manager mode (PV-6)', () => {
  it('shows a title’s amount as "an amount"', () => {
    const s = leakSample()
    const req = requestOf(s, 'R-1038')
    const changed = withPlanRequests(s, [{ ...req, jobTitle: 'Field Sales Engineer (budget €140,000)' }])
    const a = personaOf(changed, 'manager-a')
    const m = teamModel(ctxAs('manager', a.employeeId, { sample: changed }))
    const row = m.tracker.rows.find((r) => r.requestId === 'R-1038')
    expect(row).toBeDefined()
    expect(row?.jobTitle).toContain(AN_AMOUNT)
    expect(hasAmount(String(row?.jobTitle))).toBe(false)
    expect(JSON.stringify(m.tracker.rows)).not.toContain('140,000')
  })
})
