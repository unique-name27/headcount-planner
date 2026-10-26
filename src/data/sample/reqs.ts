/**
 * Requisitions (docs/PLAN.md 5.2 `reqs`): the ATS rows behind every hire since 1 Apr 2025 (Filled,
 * Started) and every open search on 30 Sep 2026 (Req opened, Interviewing, Offer accepted). Their
 * dates come from the seat shapes in positions.ts; this module adds the hiring manager, recruiter and
 * offer amounts and writes the rows. Draws from the `reqs` stream only.
 *
 * - A hire's `offerBase` is the base salary on the hire day (comp.ts). A pending accepted offer's is
 *   midpoint × a factor near 1, at 1.0 FTE (the full-time rate, like baseSalary), in local currency.
 * - Story 2's 6 Hsinchu offers are 25.5% to 29.5% above midpoint and carry a sign-on bonus, relocation
 *   and an agency fee; story 4's honored Corporate offer carries a sign-on bonus and an agency fee.
 *   Other offers draw each one-time amount by chance.
 * - Reqs are numbered REQ-4001 up, in the order they were opened.
 */
import { fiscalYearOf } from '../fiscal'
import type { ReqRow } from '../schema'
import { siteByLocation } from '../schema'
import { bandMidpoint, payUnit, roundHalfUp } from './assumptions'
import { iso, isoOrNull } from './calendar'
import { managerOn, type ReqPlan, type World } from './org'
import type { Rng } from './prng'

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** The recruiter desk covering a seat (the first that matches), by name. */
function recruiterFor(w: World, r: ReqPlan): string | null {
  const s = w.seats[r.seat]
  const desk = w.recruiters.find((d) => d.covers(s.bu, s.dept, s.site))
  return desk ? w.people[desk.person].name : null
}

/** Offer amounts and one-time items for every req at an offer stage. */
export function priceReqs(w: World, rng: Rng, hireBase: ReadonlyMap<number, number>): void {
  for (const r of w.reqs) {
    if (r.stage !== 'Offer accepted' && r.stage !== 'Started') continue
    const s = w.seats[r.seat]
    const currency = siteByLocation.get(s.site)!.currency
    const unit = payUnit(currency)
    const round = (x: number) => roundHalfUp(x, unit)
    const fromHire = r.hire != null ? hireBase.get(r.hire) : undefined
    if (fromHire != null) r.offerBase = fromHire
    else {
      const fy = fiscalYearOf(iso(r.start!))
      const factor = r.offerFactor ?? clamp(rng.normal(1, 0.04), 0.9, 1.12)
      r.offerBase = round(bandMidpoint(s.level, s.site, fy) * factor)
    }
    const base = r.offerBase
    const signOn = () => round(base * rng.float(0.05, 0.12))
    const relocation = () => round(base * rng.float(0.04, 0.1))
    const agency = () => round(base * rng.float(0.15, 0.22))
    if (r.oneTime === 'all') {
      r.signOn = signOn()
      r.relocation = relocation()
      r.agencyFee = agency()
    } else if (r.oneTime === 'sign-on-agency') {
      r.signOn = signOn()
      r.relocation = null
      r.agencyFee = agency()
    } else {
      r.signOn = rng.chance(0.3) ? signOn() : null
      r.relocation = rng.chance(0.12) ? relocation() : null
      r.agencyFee = rng.chance(0.15) ? agency() : null
    }
  }
}

/** The rows, in req ID order (IDs assigned by base.ts in opened order). */
export function reqRows(w: World): ReqRow[] {
  const out: ReqRow[] = []
  for (const r of w.reqs.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const s = w.seats[r.seat]
    const offered = r.stage === 'Offer accepted' || r.stage === 'Started'
    const mgr = managerOn(w, s.idx, r.opened)
    out.push({
      reqId: r.id,
      positionId: s.id,
      status: r.status,
      stage: r.stage,
      reqType: r.type,
      openedDate: iso(r.opened),
      targetStartDate: isoOrNull(r.target),
      offerAcceptedDate: offered ? isoOrNull(r.accepted) : null,
      startDate: offered ? isoOrNull(r.start) : null,
      closedDate: isoOrNull(r.closed),
      hiringManagerId: mgr ? w.people[mgr.person].id : null,
      recruiter: recruiterFor(w, r),
      offerBase: offered ? r.offerBase : null,
      offerCurrency: offered ? siteByLocation.get(s.site)!.currency : null,
      signOnBonus: offered ? r.signOn : null,
      relocation: offered ? r.relocation : null,
      agencyFee: offered ? r.agencyFee : null,
    })
  }
  return out
}
