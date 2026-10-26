/**
 * Each Plan figure lists only the fields its model reads (browser finding B4: head-count tiles
 * listed `positions.startDate`, which no head count reads, and so took its Bronze tier). Every tile,
 * figure and the Unit plan hero is read in HR admin (switch off), HRBP and Manager mode; for every
 * field it lists, the field is blanked in every row of its dataset and the models are rebuilt. A
 * field whose blank moves the figure in no mode must be explained in ./lineageNotes.ts, and every
 * note must hold: a 'together' note's fields blanked at once move the figure, and no note names only
 * fields that move. The head-count tiles read no target start, no request and no req.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Mode } from '@/access/modes'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Sample } from '@/data/sample'
import { sampleCtx } from '@/testkit/sample'
import { homeModel } from '@/views/home/engine'
import { ID } from '../metrics'
import { planModel } from '.'
import { sample } from './fixtures'
import { LINEAGE_NOTES } from './lineageNotes'
import {
  figureProbe,
  heroProbe,
  kpiProbe,
  movesTogether,
  type Probed,
  type ProbeResult,
  probeLineage,
} from './lineageProbe.testkit'

const MODES: readonly Mode[] = ['hr-admin', 'hrbp', 'manager']

/** Every tile, figure and the Unit plan hero, in each mode probed. */
function readPlan(s: Sample): Probed[] {
  const out: Probed[] = []
  for (const mode of MODES) {
    const ctx = sampleCtx(mode, { sample: s })
    const m = planModel(ctx)
    for (const list of [m.overview.kpis, m.positions.kpis, m.openings.kpis, m.transfers.kpis])
      for (const k of list) out.push(kpiProbe(k, mode))
    for (const f of [
      m.overview.headsByMonth,
      m.overview.headsByUnit,
      m.overview.positionsByStatus,
      m.overview.costByUnit,
      m.overview.openingsByStage,
      m.positions.grid,
      m.positions.changes,
      m.openings.byStage,
      m.openings.byAge,
      m.openings.table,
      m.transfers.table,
      m.transfers.drafts,
    ])
      out.push(figureProbe(f as never, mode))
    const h = homeModel(ctx)
    if (h) out.push(heroProbe(h.hero, mode))
  }
  return out
}

let base: Sample
let result: ProbeResult

beforeAll(() => {
  base = sample()
  result = probeLineage(base, readPlan)
}, 600_000)

describe('every listed field is read (B4)', () => {
  it('blanking it moves the figure, or a note says why it is read all the same', () => {
    expect(result.fields).toBeGreaterThan(50)
    const unexplained: string[] = []
    for (const [id, still] of result.still) {
      const noted = new Set((LINEAGE_NOTES[id] ?? []).flatMap((n) => n.fields))
      for (const ref of still) if (!noted.has(ref)) unexplained.push(`${id}: ${ref}`)
    }
    expect(unexplained).toEqual([])
  })

  it('every note holds: it names a field the figure lists that stays still, and a "together" note moves it', () => {
    const problems: string[] = []
    for (const [id, notes] of Object.entries(LINEAGE_NOTES)) {
      const listed = new Set<FieldRef>(result.listed.get(id) ?? [])
      expect(listed.size, `${id} is read by the probe`).toBeGreaterThan(0)
      const still = new Set(result.still.get(id) ?? [])
      for (const n of notes) {
        const mine = n.fields.filter((f) => listed.has(f))
        if (!mine.some((f) => still.has(f)))
          problems.push(`${id}: stale ${n.kind} note (${n.fields.join(', ')})`)
        else if (n.kind === 'together' && !movesTogether(base, readPlan, id, mine))
          problems.push(`${id}: blanking ${mine.join(', ')} together moves nothing`)
      }
    }
    expect(problems).toEqual([])
  }, 600_000)

  it('the head-count tiles read no target start, request or req (B3, B4)', () => {
    for (const id of ['actual', 'hires-ytd', 'openings', 'home-unit-heads-vs-plan']) {
      const refs = result.listed.get(id) ?? []
      expect(refs.length, id).toBeGreaterThan(0)
      expect(
        refs.filter((r) => r === 'positions.startDate' || r.startsWith('requests.') || r.startsWith('reqs.')),
        id,
      ).toEqual([])
    }
    const actual = planModel(sampleCtx('hrbp')).overview.kpis.find((k) => k.metricId === ID.headsActual)
    expect([...new Set((actual?.uses ?? []).map((r) => r.split('.')[0]))].sort()).toEqual([
      'positions',
      'workers',
    ])
  })
})
