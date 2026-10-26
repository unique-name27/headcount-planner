/**
 * Each My team figure lists only the fields its model reads (browser finding B4). The hero, every
 * key figure, Plan > Hiring's Open to hire tile beside the hero (9.7) and every figure is read for
 * Managers A, B and C; for every field it lists, the field is
 * blanked in every row of its dataset and the models are rebuilt. A field whose blank moves the
 * figure for no manager must be explained in ./lineageNotes.ts, and every note must hold: a
 * 'together' note's fields blanked at once move the figure, and no note names only fields that move.
 * The allocation's counts read no request, and none of them reads a seat's level or location (only
 * Allocation's standard heads note does).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Sample } from '@/data/sample'
import { ctxAs, leakSample, personaOf } from '@/testkit/sample'
import {
  figureProbe,
  heroProbe,
  kpiProbe,
  movesTogether,
  type Probed,
  type ProbeResult,
  probeLineage,
} from '@/views/plan/engine/lineageProbe.testkit'
import { teamModel } from '.'
import { TEAM_LINEAGE_NOTES } from './lineageNotes'

const MANAGERS = ['manager-a', 'manager-b', 'manager-c'] as const

function readTeam(s: Sample): Probed[] {
  const out: Probed[] = []
  for (const key of MANAGERS) {
    const m = teamModel(ctxAs('manager', personaOf(s, key).employeeId, { sample: s }))
    out.push(heroProbe(m.hero, key))
    for (const k of m.kpis) out.push(kpiProbe(k, key))
    if (m.openToHire) out.push(kpiProbe(m.openToHire, key))
    for (const f of [m.tracker, m.headsVsAllocation, m.hrbpChanges]) out.push(figureProbe(f as never, key))
  }
  return out
}

let base: Sample
let result: ProbeResult

beforeAll(() => {
  base = leakSample()
  result = probeLineage(base, readTeam)
}, 300_000)

describe('every listed field is read (B4)', () => {
  it('blanking it moves the figure for some manager, or a note says why it is read all the same', () => {
    expect(result.fields).toBeGreaterThan(30)
    const unexplained: string[] = []
    for (const [id, still] of result.still) {
      const noted = new Set((TEAM_LINEAGE_NOTES[id] ?? []).flatMap((n) => n.fields))
      for (const ref of still) if (!noted.has(ref)) unexplained.push(`${id}: ${ref}`)
    }
    expect(unexplained).toEqual([])
  })

  it('every note holds', () => {
    const problems: string[] = []
    for (const [id, notes] of Object.entries(TEAM_LINEAGE_NOTES)) {
      const listed = new Set<FieldRef>(result.listed.get(id) ?? [])
      expect(listed.size, `${id} is read by the probe`).toBeGreaterThan(0)
      const still = new Set(result.still.get(id) ?? [])
      for (const n of notes) {
        const mine = n.fields.filter((f) => listed.has(f))
        if (!mine.some((f) => still.has(f)))
          problems.push(`${id}: stale ${n.kind} note (${n.fields.join(', ')})`)
        else if (n.kind === 'together' && !movesTogether(base, readTeam, id, mine))
          problems.push(`${id}: blanking ${mine.join(', ')} together moves nothing`)
      }
    }
    expect(problems).toEqual([])
  }, 300_000)

  it('the allocation’s counts read no request and no seat level or location', () => {
    for (const id of ['team-left-to-fill', 'team-filled', 'team-open', 'team-planned', 'team-allocation']) {
      const refs = result.listed.get(id) ?? []
      expect(refs.length, id).toBeGreaterThan(0)
      expect(
        refs.filter((r) => r.startsWith('requests.')),
        id,
      ).toEqual([])
      if (id !== 'team-allocation')
        expect(
          refs.filter((r) => r === 'positions.level' || r === 'positions.location'),
          id,
        ).toEqual([])
    }
  })
})
