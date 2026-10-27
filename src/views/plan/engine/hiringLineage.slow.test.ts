/**
 * Plan > Hiring lists only the fields its model reads (browser finding B4, the probe of
 * ./lineage.slow.test.ts over the hiring tab; docs/CONTRACTS-HIRING.md 3): every tile and figure is
 * read in HR admin (switch off), HRBP and Manager mode; for every field it lists, the field is
 * blanked in every row of its dataset and the models are rebuilt. A field whose blank moves the
 * figure in no mode must be explained in ./lineageNotes.ts `HIRING_LINEAGE_NOTES`, and every note
 * must hold. The tab lists no pay, offer amount, band or leave field (heads only, 9.7).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Mode } from '@/access/modes'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Sample } from '@/data/sample'
import { F } from '@/metrics/fields'
import { sampleCtx } from '@/testkit/sample'
import { sample } from './fixtures'
import { planHiringModel } from './hiringTab'
import { HIRING_LINEAGE_NOTES } from './lineageNotes'
import {
  figureProbe,
  kpiProbe,
  movesTogether,
  type Probed,
  type ProbeResult,
  probeLineage,
} from './lineageProbe.testkit'

const MODES: readonly Mode[] = ['hr-admin', 'hrbp', 'manager']

/** Every tile and figure of Plan > Hiring, in each mode probed. */
function readHiring(s: Sample): Probed[] {
  const out: Probed[] = []
  for (const mode of MODES) {
    const m = planHiringModel(sampleCtx(mode, { sample: s }))
    for (const k of m.kpis) out.push(kpiProbe(k, mode))
    for (const f of [m.quarters, m.openByQuarter, m.velocity, m.recent])
      out.push(figureProbe(f as never, mode))
  }
  return out
}

let base: Sample
let result: ProbeResult

beforeAll(() => {
  base = sample()
  result = probeLineage(base, readHiring)
}, 600_000)

describe('every field Plan > Hiring lists is read (B4)', () => {
  it('blanking it moves the figure, or a note says why it is read all the same', () => {
    expect(result.fields).toBeGreaterThan(20)
    const unexplained: string[] = []
    for (const [id, still] of result.still) {
      const noted = new Set((HIRING_LINEAGE_NOTES[id] ?? []).flatMap((n) => n.fields))
      for (const ref of still) if (!noted.has(ref)) unexplained.push(`${id}: ${ref}`)
    }
    expect(unexplained).toEqual([])
  })

  it('every note holds: it names a field the figure lists that stays still, and a "together" note moves it', () => {
    const problems: string[] = []
    for (const [id, notes] of Object.entries(HIRING_LINEAGE_NOTES)) {
      const listed = new Set<FieldRef>(result.listed.get(id) ?? [])
      expect(listed.size, `${id} is read by the probe`).toBeGreaterThan(0)
      const still = new Set(result.still.get(id) ?? [])
      for (const n of notes) {
        const mine = n.fields.filter((f) => listed.has(f))
        if (!mine.some((f) => still.has(f)))
          problems.push(`${id}: stale ${n.kind} note (${n.fields.join(', ')})`)
        else if (n.kind === 'together' && !movesTogether(base, readHiring, id, mine))
          problems.push(`${id}: blanking ${mine.join(', ')} together moves nothing`)
      }
    }
    expect(problems).toEqual([])
  }, 600_000)

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
