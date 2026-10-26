/**
 * Each role home's key figures list only the fields their models read (browser finding B4 follow-up,
 * CONTRACTS-M3 7.4.3): the homes re-link their producers' tiles (Plan, Forecast, Targets, Requests and
 * Finance) with the producers' lineage, read here on the Unit plan (HRBP), Rollup vs target (Leader)
 * and Plan vs actual (Finance) homes. For every field a tile lists, the field is blanked in every row
 * of its dataset and the homes are rebuilt (src/views/plan/engine/lineageProbe.testkit.ts). A field
 * whose blank moves the tile on no home must be explained in ./lineageNotes.ts, and every note must
 * hold: a 'together' note's fields blanked at once move the tile, and no note names only fields that
 * move. Unallocated is heads only, so it lists no target cost.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Mode } from '@/access/modes'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Sample } from '@/data/sample'
import { leakSample, sampleCtx } from '@/testkit/sample'
import {
  kpiProbe,
  movesTogether,
  type Probed,
  type ProbeResult,
  probeLineage,
} from '@/views/plan/engine/lineageProbe.testkit'
import { homeModel } from './index'
import { HOME_LINEAGE_NOTES } from './lineageNotes'

const MODES: readonly Mode[] = ['hrbp', 'leader', 'finance']

/** Every key figure of the three role homes. */
function readHomes(s: Sample): Probed[] {
  const out: Probed[] = []
  for (const mode of MODES) {
    const h = homeModel(sampleCtx(mode, { sample: s }))
    if (h) for (const k of h.kpis) out.push(kpiProbe(k, mode))
  }
  return out
}

let base: Sample
let result: ProbeResult

beforeAll(() => {
  base = leakSample()
  result = probeLineage(base, readHomes)
}, 1_200_000)

describe('every field a home tile lists is read (B4)', () => {
  it('blanking it moves the tile on some home, or a note says why it is read all the same', () => {
    expect(result.fields).toBeGreaterThan(40)
    expect(result.listed.size).toBeGreaterThanOrEqual(14)
    const unexplained: string[] = []
    for (const [id, still] of result.still) {
      const noted = new Set((HOME_LINEAGE_NOTES[id] ?? []).flatMap((n) => n.fields))
      for (const ref of still) if (!noted.has(ref)) unexplained.push(`${id}: ${ref}`)
    }
    expect(unexplained).toEqual([])
  })

  it('every note holds', () => {
    const problems: string[] = []
    for (const [id, notes] of Object.entries(HOME_LINEAGE_NOTES)) {
      const listed = new Set<FieldRef>(result.listed.get(id) ?? [])
      expect(listed.size, `${id} is read by the probe`).toBeGreaterThan(0)
      const still = new Set(result.still.get(id) ?? [])
      for (const n of notes) {
        const mine = n.fields.filter((f) => listed.has(f))
        if (!mine.some((f) => still.has(f)))
          problems.push(`${id}: stale ${n.kind} note (${n.fields.join(', ')})`)
        else if (n.kind === 'together' && !movesTogether(base, readHomes, id, mine))
          problems.push(`${id}: blanking ${mine.join(', ')} together moves nothing`)
      }
    }
    expect(problems).toEqual([])
  }, 1_200_000)

  it('Unallocated lists no target cost: the tile is heads', () => {
    const refs = result.listed.get('targets-unallocated') ?? []
    expect(refs.length).toBeGreaterThan(0)
    expect(refs).not.toContain('targets.targetCost')
  })
})
