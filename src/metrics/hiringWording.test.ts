/**
 * Plan > Hiring's 18 metrics in each mode's own words (docs/PLAN.md 9.7 "Metrics" and "Privacy", 12,
 * 14.2; the hiring freeze, homes-help; C37 added Moves in by quarter end and Hires in the last 3
 * months): the module is heads only, so no hiring metric needs a
 * per-mode wording. Every mode shows all 18 and reads them exactly as the catalog writes them
 * (`metricsInMode` gives the catalog's own definition and formula), none carries a Guard class or a
 * money unit, none is hidden in Manager mode or by the rounded modes, and no word of theirs names a
 * pay field, an amount kind or leave (no "leave" in anything Manager or Finance mode reads).
 *
 * Plan > Recruiting summary's 3 metrics (docs/PLAN.md 9.8, change C38: projected starts, projected
 * heads and the gap to approved heads) keep the same rules, and their words are 9.8's: projected
 * starts are the forecast's model on Open and Planned seats with no signed offer (fill rate, time to
 * fill, backfills), one decimal, never a future start; projected heads are current heads plus future
 * starts, moves in and projected starts, less projected attrition; the gap reads "Short by" or "Over
 * by". Plan > Hiring's expected exits name the tab's "Projected attrition", and its future starts
 * never name a projected start (the two are always apart).
 */
import { describe, expect, it } from 'vitest'
import { accessFor } from '@/access/context'
import { MODES } from '@/access/modes'
import { copyProblems, sentenceCaseProblem } from '@/help/check'
import { HIRING_METRIC_IDS, ID, RECRUITING_METRIC_IDS } from '@/views/plan/metrics'
import { defaultMetrics } from './api'
import { CATALOG } from './catalog'
import { LEAVE_PREFIX, METRIC_GUARD, managerHides, roundedHides, showsMoney } from './guardClass'
import { METRIC_WORDING, metricsInMode, wordingIn } from './modeWording'

const metrics = defaultMetrics()
const ACCESS = Object.fromEntries(MODES.map((m) => [m, accessFor(m, null, metrics)]))

/** Words of pay, amounts and leave a heads-only metric never uses. */
const AMOUNT_WORDS =
  /\b(cost|costs|costed|salary|salaries|pay|band estimate|offer amount|sign-on|relocation|agency fee|bonus|usd|fx|leave)\b|[$€£¥₹₪]/i

describe('the hiring metrics in every mode', () => {
  it('are 18, every one in the catalog with a heads unit', () => {
    expect(HIRING_METRIC_IDS).toHaveLength(18)
    for (const id of HIRING_METRIC_IDS) {
      const d = CATALOG.byId.get(id)
      expect(d, id).toBeDefined()
      expect(['int', 'num1', 'pct'], id).toContain(d?.unit)
    }
  })

  it('need no per-mode wording: each mode reads the catalog’s own definition and formula', () => {
    for (const id of HIRING_METRIC_IDS) expect(METRIC_WORDING[id], id).toBeUndefined()
    for (const m of MODES) {
      const can = (s: string) => ACCESS[m].can(s)
      const worded = metricsInMode(metrics, can)
      for (const id of HIRING_METRIC_IDS) {
        expect(wordingIn(can, id), `${m} ${id}`).toBeNull()
        const d = worded.def(id)
        expect(d?.definition, `${m} ${id}`).toBe(CATALOG.byId.get(id)?.definition)
        expect(d?.formula, `${m} ${id}`).toBe(CATALOG.byId.get(id)?.formula)
      }
    }
  })

  it('show in every mode, with no Guard class and nothing the guard or Manager mode hides', () => {
    for (const id of HIRING_METRIC_IDS) {
      expect(METRIC_GUARD[id], id).toBeUndefined()
      expect(showsMoney(id), id).toBe(false)
      expect(managerHides(id), id).toBe(false)
      expect(roundedHides(id), id).toBe(false)
      expect(id.startsWith(LEAVE_PREFIX), id).toBe(false)
      for (const m of MODES) expect(ACCESS[m].can(`metric:${id}`), `${m} ${id}`).toBe(true)
    }
  })

  it('name no pay field, amount kind or leave in any word a mode reads', () => {
    for (const id of HIRING_METRIC_IDS) {
      const d = CATALOG.byId.get(id)
      const text = [d?.name, d?.definition, d?.formula, d?.population, d?.window].join('\n')
      expect(text.match(AMOUNT_WORDS)?.[0] ?? null, id).toBeNull()
      expect(text.toLowerCase(), id).not.toContain('headcount to hire')
    }
    // Not vacuous: the scan finds the words it bans.
    expect('Loaded cost of the open seats'.match(AMOUNT_WORDS)?.[0]).toBe('cost')
    expect('People on leave stay in current heads'.match(AMOUNT_WORDS)?.[0]).toBe('leave')
    expect('Open to hire, $1.2M'.match(AMOUNT_WORDS)?.[0]).toBe('$')
  })
})

describe('the recruiting summary metrics in every mode (9.8, C38)', () => {
  const def = (id: string) => {
    const d = CATALOG.byId.get(id)
    if (!d) throw new Error(`${id} is not in the catalog`)
    return d
  }
  const wordsOf = (id: string) => {
    const d = def(id)
    return [d.name, d.definition, d.formula ?? '', d.population ?? '', d.window ?? '']
  }

  it('are 3, after Plan > Hiring’s, each one decimal under Plan, owned by HR business partners', () => {
    expect([...RECRUITING_METRIC_IDS]).toEqual([
      'plan.recruiting.projectedStarts',
      'plan.recruiting.projectedHeads',
      'plan.recruiting.gapToApproved',
    ])
    for (const id of RECRUITING_METRIC_IDS) {
      const d = def(id)
      expect(d.unit, id).toBe('num1')
      expect(d.views, id).toEqual(['plan'])
      expect(d.owner, id).toBe('HR business partners')
      expect(d.goodDirection, id).toBeNull()
      expect(d.params, id).toEqual([])
      expect(d.dependsOn, id).toBeUndefined()
      for (const w of wordsOf(id).slice(1)) expect(w.trim(), id).toBeTruthy()
    }
    expect(RECRUITING_METRIC_IDS.some((id) => HIRING_METRIC_IDS.includes(id))).toBe(false)
  })

  it('need no per-mode wording and show in every mode, with no Guard class', () => {
    for (const id of RECRUITING_METRIC_IDS) {
      expect(METRIC_WORDING[id], id).toBeUndefined()
      expect(METRIC_GUARD[id], id).toBeUndefined()
      expect(showsMoney(id), id).toBe(false)
      expect(managerHides(id), id).toBe(false)
      expect(roundedHides(id), id).toBe(false)
    }
    for (const m of MODES) {
      const can = (s: string) => ACCESS[m].can(s)
      const worded = metricsInMode(metrics, can)
      for (const id of RECRUITING_METRIC_IDS) {
        expect(ACCESS[m].can(`metric:${id}`), `${m} ${id}`).toBe(true)
        expect(wordingIn(can, id), `${m} ${id}`).toBeNull()
        expect(worded.def(id)?.definition, `${m} ${id}`).toBe(def(id).definition)
        expect(worded.def(id)?.formula, `${m} ${id}`).toBe(def(id).formula)
      }
    }
  })

  it('name no pay field, amount kind or leave, and keep the copy rules and sentence case', () => {
    for (const id of RECRUITING_METRIC_IDS) {
      const text = wordsOf(id).join('\n')
      expect(text.match(AMOUNT_WORDS)?.[0] ?? null, id).toBeNull()
      for (const w of wordsOf(id)) expect(copyProblems(w), `${id}: ${w}`).toEqual([])
      expect(sentenceCaseProblem(def(id).name), id).toBeNull()
      // Plain counts: never "1 heads" or "3 hire".
      expect(text, id).not.toMatch(
        /\b1 (heads|starts|seats|exits)\b|\b([02-9]|\d{2,}) (head|start|seat|exit)\b/,
      )
    }
  })

  it('word projected starts as 9.8 does: the forecast’s model, apart from future starts', () => {
    const p = def(ID.recruitingProjectedStarts)
    expect(p.name).toBe('Projected starts')
    for (const w of [
      'model',
      'Open and Planned seats with no signed offer',
      'fill rate',
      'time to fill',
      'backfills',
      'one decimal',
      'A signed offer is a future start, never a projected one',
      'never count toward open to hire',
    ])
      expect(p.definition, w).toContain(w)
    expect(p.formula).toContain('fill rate')
    expect(p.formula).toContain('modeled backfills')
    // Future starts (signed offers) never name a projected start or the model.
    const f = def(ID.hiringAcceptedStarts)
    expect(f.name).toBe('Future starts')
    expect([f.definition, f.formula].join(' ')).not.toMatch(/projected|fill rate|backfill/i)
  })

  it('word projected heads and the gap as 9.8 does, and name the tab’s projected attrition', () => {
    const h = def(ID.recruitingProjectedHeads)
    expect(h.name).toBe('Projected heads')
    expect(h.formula).toBe(
      'current heads + future starts + moves in + projected starts − projected attrition',
    )
    expect(h.definition).toContain('known and modeled exits')
    // The rare terms of PLAN R134, as the card counts them (finish audit AD-4).
    expect(h.definition).toContain('people whose last day is the as-of date')
    expect(h.definition).toContain('signed offers past their start date that the HRIS has not recorded')
    expect(h.definition).toContain('pre-hires the HRIS holds')
    const g = def(ID.recruitingGap)
    expect(g.name).toBe('Gap to approved heads')
    expect(g.formula).toBe('projected heads at quarter end − approved heads by quarter end')
    expect(g.definition).toContain('"Short by"')
    expect(g.definition).toContain('"Over by"')
    expect(g.definition).toContain('never a hiring target')
    // 9.8 Words: "Projected attrition" for expected exits on the tab.
    expect(def(ID.hiringExpectedExits).definition).toContain(
      'Plan > Recruiting summary shows them as projected attrition',
    )
    for (const id of [ID.recruitingProjectedStarts, ID.recruitingProjectedHeads])
      expect(def(id).window, id).toContain('Each month end and each quarter end after the as-of date')
    expect(def(ID.recruitingGap).window).toBe(def(ID.hiringOpenByQuarter).window)
  })
})
