/**
 * Pay (docs/PLAN.md 5.2 `comp`, 6.3, 13.2): effective-dated base salaries in local currency, at
 * 1.0 FTE (the full-time rate), positioned against the band midpoint by a compa-ratio. Draws from the
 * `comp` stream only.
 *
 * - Someone hired before 1 Apr 2025 has a row on 1 Apr 2025 (FY26 pay), a row on 1 Oct 2025 if
 *   promoted then, and the FY27 merit row on 1 Apr 2026 when still employed then.
 * - Someone hired since has a row on the hire day, and the FY27 merit row when hired by the cutoff
 *   (1 Jan 2026) and employed on 1 Apr 2026.
 * - FY27 merit is recorded on its effective date, 1 Apr 2026, after the Budget lock: the Budget prices
 *   FY27 merit by the 3.5% assumption, and the HRIS rows carry what people got. Silicon Engineering
 *   and Go-to-Market averaged 5% (retention), every other unit 3.5%; that gap is part of their pay-rate
 *   variance against the Budget (stories 1 and 2).
 * - Base salaries round to a tenth of the band unit (USD 100, INR 1,000, VND 100,000), half up.
 * - targetBonusPct is blank: every bonus follows the level's target.
 */
import type { CompRow, ISODate, Level } from '../schema'
import { siteByLocation } from '../schema'
import { bandMidpoint, payUnit, roundHalfUp } from './assumptions'
import { FY27_START, HISTORY_START, iso, MERIT_CUTOFF_FY27, MERIT_FY27, PROMOTION_DAY } from './calendar'
import { GTM, SE } from './departments'
import type { Person, World } from './org'
import type { Rng } from './prng'

const MERIT_MEAN: Readonly<Record<string, number>> = { [SE]: 0.05, [GTM]: 0.05 }
const MERIT_DEFAULT = 0.035

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export interface CompOutput {
  rows: CompRow[]
  /** The day each row was recorded (its effective date), parallel to `rows`. */
  known: ISODate[]
  /** Each hire's base salary on the hire day (the accepted offer's base), by person index. */
  hireBase: Map<number, number>
}

/** The level a person's pay is set at: the seat's current level, or the person's own. */
function levelOf(w: World, p: Person): Level {
  return p.seat != null ? w.seats[p.seat].level : p.level
}

export function buildComp(w: World, rng: Rng): CompOutput {
  const rows: CompRow[] = []
  const known: ISODate[] = []
  const hireBase = new Map<number, number>()
  const people = w.people.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const p of people) {
    if (p.type !== 'Employee') continue
    const seat = p.seat != null ? w.seats[p.seat] : null
    const location = seat?.site ?? p.site
    const bu = seat?.bu ?? p.bu
    const currency = siteByLocation.get(location)!.currency
    const unit = payUnit(currency)
    const round = (x: number) => roundHalfUp(x, unit)
    const level = levelOf(w, p)
    const merit = clamp(rng.normal(MERIT_MEAN[bu] ?? MERIT_DEFAULT, 0.01), 0, 0.08)
    const employedOn = (d: number) => p.hire <= d && (p.term == null || p.term >= d)
    const push = (d: number, baseSalary: number) => {
      rows.push({ employeeId: p.id, effectiveDate: iso(d), currency, baseSalary, targetBonusPct: null })
      known.push(iso(d))
    }
    if (p.hire < HISTORY_START) {
      const compa = clamp(rng.normal(0.97, 0.07), 0.82, 1.18)
      const base27 = round(bandMidpoint(level, location, 'FY27') * compa)
      const beforeMerit = round(base27 / (1 + merit))
      if (p.promotedFrom) {
        const raise = rng.float(0.07, 0.12)
        push(HISTORY_START, round(beforeMerit / (1 + raise)))
        push(PROMOTION_DAY, beforeMerit)
      } else push(HISTORY_START, beforeMerit)
      if (employedOn(MERIT_FY27)) push(MERIT_FY27, base27)
    } else {
      // Silicon Engineering and Go-to-Market hire a little above midpoint (backfills and growth alike).
      const mean = bu === SE || bu === GTM ? 1.03 : 1
      const compa = clamp(rng.normal(mean, 0.05), 0.85, 1.15)
      const fy = p.hire < FY27_START ? 'FY26' : 'FY27'
      const base = round(bandMidpoint(level, location, fy) * compa)
      push(p.hire, base)
      hireBase.set(p.idx, base)
      if (p.hire <= MERIT_CUTOFF_FY27 && employedOn(MERIT_FY27)) push(MERIT_FY27, round(base * (1 + merit)))
    }
  }
  return { rows, known, hireBase }
}
