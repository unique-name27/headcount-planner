/**
 * The sample changes the leak tests perturb (docs/PLAN.md 16.1), shared so every test that holds a
 * surface to them reads the same list: one Filled salary or one accepted offer per position (the
 * positions leak test, src/access/leaks.positions.slow.test.ts), and 16.1's four leave changes (the
 * leave leak test, src/access/leaks.leave.slow.test.ts). Plan > Hiring is held to both lists too
 * (src/access/leaks.hiring.slow.test.ts): heads only, so nothing it shows may move.
 *
 * Every change is a copy made after generation (src/testkit/sample.ts `withSalaryDelta`, `withReq`,
 * `withWorker`, `withPlan`): the one row changes and nothing is regenerated. Test code only.
 */
import { atomOf } from '@/cost/atoms'
import type { Sample } from '@/data/sample'
import { actualLineRows } from '@/plan/engine/lineTable'
import type { ActualLine, Adjustment } from '@/plan/types'
import { costedIn, costedIndex } from './moves'
import {
  personaCtx,
  personaOf,
  withBackDatedComp,
  withPlan,
  withReq,
  withSalaryDelta,
  withWorker,
} from './sample'

/** A change of pay big enough to move every total it is in, in local currency. */
export const PAY_DELTA = 7_919
export const OFFER_FIELDS = ['offerBase', 'signOnBonus', 'relocation', 'agencyFee'] as const

export interface Perturbation {
  what: string
  /** The seat the change is about: its unit's HRBP and the nearest leader above it crawl it. */
  positionId: string
  sample: () => Sample
  oneTime: boolean
}

/**
 * 16.1's per-position amount changes, one at a time: each Filled seat's `baseSalary` in Manager B's
 * team and in story 8's 1550-HSZ; the `offerBase`, `signOnBonus`, `relocation` and `agencyFee` of
 * each of story 2's 6 Hsinchu offers, of story 4's honored Corporate offer and of one accepted offer
 * in an HRBP atom (Manager B's Open seat); one eliminated Filled seat's `baseSalary` (its severance);
 * and a back-dated comp row in a closed month.
 */
export function positionPerturbations(s: Sample): Perturbation[] {
  const d = s.datasets
  const out: Perturbation[] = []
  const holders = (filter: (positionId: string) => boolean) =>
    d.workers.filter(
      (w) =>
        w.workerType === 'Employee' &&
        !!w.positionId &&
        filter(w.positionId) &&
        !w.assignmentEnd &&
        !w.terminationDate,
    )
  const b = personaOf(s, 'manager-b')
  const bTeam = new Set(
    d.positions.filter((p) => p.managerPositionId === b.positionId).map((p) => p.positionId),
  )
  for (const w of holders((id) => bTeam.has(id)))
    out.push({
      what: `Manager B's ${w.positionId} baseSalary`,
      positionId: w.positionId as string,
      sample: () => withSalaryDelta(s, w.employeeId, PAY_DELTA),
      oneTime: false,
    })
  const hsz = new Set(d.positions.filter((p) => p.costCenter === '1550-HSZ').map((p) => p.positionId))
  for (const w of holders((id) => hsz.has(id)))
    out.push({
      what: `1550-HSZ ${w.positionId} baseSalary`,
      positionId: w.positionId as string,
      sample: () => withSalaryDelta(s, w.employeeId, PAY_DELTA * 30),
      oneTime: false,
    })
  const bOffer = d.reqs.find((r) => r.stage === 'Offer accepted' && bTeam.has(r.positionId ?? ''))
  const offers = [
    ...s.planted.hsinchuOffers.map((o) => ({ ...o, label: 'Hsinchu offer' })),
    { ...s.planted.corporateOffer, label: 'Corporate offer' },
    ...(bOffer
      ? [{ positionId: bOffer.positionId as string, reqId: bOffer.reqId, label: 'HRBP atom offer' }]
      : []),
  ]
  for (const o of offers) {
    const req = d.reqs.find((r) => r.reqId === o.reqId)
    if (!req) continue
    const scale = req.offerCurrency === 'TWD' ? 30 : 1
    for (const f of OFFER_FIELDS)
      out.push({
        what: `${o.label} ${o.reqId} ${f}`,
        positionId: o.positionId,
        sample: () => withReq(s, o.reqId, { [f]: (req[f] ?? 0) + PAY_DELTA * scale }),
        oneTime: f !== 'offerBase',
      })
  }
  const elim = s.planted.eliminatedFilled
  const leaver = d.workers.find((w) => w.positionId === elim)
  if (leaver)
    out.push({
      what: `eliminated ${elim} baseSalary (severance)`,
      positionId: elim,
      sample: () => withSalaryDelta(s, leaver.employeeId, PAY_DELTA),
      oneTime: true,
    })
  const se = personaOf(s, 'leader-dv-director')
  const dv = holders((id) =>
    d.positions.some((p) => p.positionId === id && p.managerPositionId === se.positionId),
  )[0]
  if (dv)
    out.push({
      what: `back-dated comp row for ${dv.positionId} in July`,
      positionId: dv.positionId as string,
      sample: () => withBackDatedComp(s, dv.employeeId, '2026-07-01', PAY_DELTA),
      oneTime: false,
    })
  return out
}

/** One of 16.1's leave changes: what it is, the seat it is about and the changed sample. */
export interface LeaveChange {
  what: string
  positionId: string
  sample: Sample
}

/**
 * 16.1's four leave changes: one `leavePaid` flipped from true to false inside a 5-head cost center,
 * a 5-person atom and a Finance row of 5 or more, and a back-dated unpaid leave in a closed month
 * (August), posted as an adjustment in the first open month.
 */
export function leaveChanges(s: Sample): LeaveChange[] {
  const active = s.datasets.workers.filter(
    (w) =>
      w.workerType === 'Employee' &&
      !!w.positionId &&
      (w.assignmentStart || w.hireDate) <= s.asOf &&
      !w.assignmentEnd &&
      !w.terminationDate,
  )
  const index = costedIndex(s.datasets, 'FY27')
  const ctx = personaCtx('finance-fpa', { sample: s })
  const managerOf = (id: string) => index.latest.get(id)?.managerPositionId ?? null
  const atom = (id: string) => atomOf(id, ctx.guard.atoms, managerOf)
  const list = active
    .filter((w) => w.onLeave === true && w.leavePaid !== false)
    .map((w) => {
      const cc = active.filter((x) => x.costCenter === w.costCenter).length
      const a = atom(w.positionId as string)
      const atomPeople = costedIn(
        index,
        [...index.latest.keys()].filter((id) => atom(id) === a),
        ['2026-09'],
      )
      return { w, cc, atomPeople }
    })
  const five = list.filter((x) => x.cc >= 5).sort((a, b) => a.cc - b.cc)[0]
  const inAtom = list
    .filter((x) => x.atomPeople >= 5 && x !== five)
    .sort((a, b) => a.atomPeople - b.atomPeople)[0]
  const row = list.filter((x) => x.cc >= 10 && x !== five && x !== inAtom).sort((a, b) => a.cc - b.cc)[0]
  const out: LeaveChange[] = [
    { what: `leavePaid in a ${five.cc}-head cost center (${five.w.costCenter})`, x: five },
    { what: `leavePaid in a ${inAtom.atomPeople}-person atom`, x: inAtom },
    { what: `leavePaid in a Finance row of ${row.cc} (${row.w.costCenter})`, x: row },
  ].map(({ what, x }) => ({
    what,
    positionId: x.w.positionId as string,
    sample: withWorker(s, x.w.employeeId, { leavePaid: false }),
  }))
  // A back-dated unpaid leave in August (closed): the close posts it in the first open month.
  const back = list.filter((x) => x.cc >= 10 && ![five, inAtom, row].includes(x))[0]
  const aug = s.plan.closes.find((c) => c.month === '2026-08')
  const line = aug
    ? [...actualLineRows(aug.lines)].find((l) => l.employeeId === back.w.employeeId)
    : undefined
  if (aug && line) {
    const neg = (o: Record<string, number>): Record<string, number> =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'oneTime' || k === 'vacancy' ? 0 : -v]))
    const usd = neg(line.usd as unknown as Record<string, number>)
    usd.loaded = -(line.usd.base + line.usd.bonus + line.usd.burden + line.usd.benefits)
    const delta: ActualLine = {
      ...line,
      heads: 0,
      fte: 0,
      active: 0,
      local: neg(line.local as unknown as Record<string, number>) as unknown as ActualLine['local'],
      usd: usd as unknown as ActualLine['usd'],
      leave: 'unpaid',
    }
    const adj: Adjustment = {
      id: `ADJ-2026-10-${back.w.employeeId}`,
      postedIn: '2026-10',
      forMonth: '2026-08',
      positionId: back.w.positionId ?? null,
      kind: 'other',
      delta,
      reason: 'Other HRIS change',
    }
    out.push({
      what: `back-dated unpaid leave for ${back.w.positionId} in August`,
      positionId: back.w.positionId as string,
      sample: withPlan(s, { adjustments: [...s.plan.adjustments, adj] }),
    })
  }
  return out
}
