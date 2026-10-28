/**
 * Plan > Recruiting summary lists only the fields its model reads (browser finding B4, the probe of
 * ./lineage.slow.test.ts over the recruiting tab, as ./hiringLineage.slow.test.ts does for Plan >
 * Hiring; docs/PLAN.md 9.8, change C38): every tile and figure is read in HR admin (switch off), HRBP
 * and Manager mode; for every field it lists, the field is blanked in every row of its dataset and the
 * models are rebuilt. A field whose blank moves the figure in no mode must be explained in
 * ./lineageNotes.ts `RECRUITING_LINEAGE_NOTES`, and every note must hold. The tab lists no pay, offer
 * amount, band or leave field (heads only, 9.8).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { RECRUITING_FIGURE_IDS, RECRUITING_KPI_IDS } from '@/access/ids'
import type { Mode } from '@/access/modes'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Sample } from '@/data/sample'
import { F } from '@/metrics/fields'
import { sampleCtx } from '@/testkit/sample'
import { sample } from './fixtures'
import { RECRUITING_LINEAGE_NOTES } from './lineageNotes'
import {
  figureProbe,
  kpiProbe,
  movesTogether,
  type Probed,
  type ProbeResult,
  probeLineage,
} from './lineageProbe.testkit'
import { planRecruitingModel } from './recruitingTab'

const MODES: readonly Mode[] = ['hr-admin', 'hrbp', 'manager']

/** Every tile and figure of Plan > Recruiting summary, in each mode probed. */
function readRecruiting(s: Sample): Probed[] {
  const out: Probed[] = []
  for (const mode of MODES) {
    const m = planRecruitingModel(sampleCtx(mode, { sample: s }))
    for (const k of m.kpis) out.push(kpiProbe(k, mode))
    for (const f of [m.months, m.quarters, m.where]) out.push(figureProbe(f as never, mode))
  }
  return out
}

let base: Sample
let result: ProbeResult

beforeAll(() => {
  base = sample()
  result = probeLineage(base, readRecruiting)
}, 900_000)

describe('every field Plan > Recruiting summary lists is read (B4)', () => {
  it('probes all seven tiles and the three figures with a lineage of their own', () => {
    // The strip is no figure of its own: its tiles are probed one by one.
    const ids = [
      ...RECRUITING_KPI_IDS,
      ...RECRUITING_FIGURE_IDS.filter((id) => id !== 'plan-recruiting-kpis'),
    ]
    expect([...result.listed.keys()].sort()).toEqual([...ids].sort())
    for (const id of ids) expect(result.listed.get(id)?.length ?? 0, id).toBeGreaterThan(0)
  })

  it('blanking it moves the figure, or a note says why it is read all the same', () => {
    expect(result.fields).toBeGreaterThan(20)
    const unexplained: string[] = []
    for (const [id, still] of result.still) {
      const noted = new Set((RECRUITING_LINEAGE_NOTES[id] ?? []).flatMap((n) => n.fields))
      for (const ref of still) if (!noted.has(ref)) unexplained.push(`${id}: ${ref}`)
    }
    expect(unexplained).toEqual([])
  })

  it('every note holds: it names a field the figure lists that stays still, and a "together" note moves it', () => {
    const problems: string[] = []
    for (const [id, notes] of Object.entries(RECRUITING_LINEAGE_NOTES)) {
      const listed = new Set<FieldRef>(result.listed.get(id) ?? [])
      expect(listed.size, `${id} is read by the probe`).toBeGreaterThan(0)
      const still = new Set(result.still.get(id) ?? [])
      for (const n of notes) {
        const mine = n.fields.filter((f) => listed.has(f))
        if (!mine.some((f) => still.has(f)))
          problems.push(`${id}: stale ${n.kind} note (${n.fields.join(', ')})`)
        else if (n.kind === 'together' && !movesTogether(base, readRecruiting, id, mine))
          problems.push(`${id}: blanking ${mine.join(', ')} together moves nothing`)
      }
    }
    expect(problems).toEqual([])
  }, 900_000)

  it('lists no pay, offer amount, band or leave field (heads only)', () => {
    const money = new Set<FieldRef>([
      ...F.pay,
      ...F.offerPay,
      ...F.leave,
      'workers.leavePaid',
      ...F.targetCost,
    ])
    for (const [id, refs] of result.listed)
      expect(
        refs.filter((r) => money.has(r)),
        id,
      ).toEqual([])
  })
})
