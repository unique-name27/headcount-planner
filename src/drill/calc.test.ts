/**
 * Calculation cards (docs/PLAN.md 9.5 and 16.1): every worked example in PLAN 6 is a `CalcSpec`
 * whose last step equals its value, and whose value is the fixture's number. The values and the
 * step results come from the engines on the frozen fixtures (src/plan/engine/fixtures), never typed
 * twice; each step's arithmetic, as written, reads back to its result (`evaluateExpression`); a
 * counted card's rows number its value and a weighted one's "Counts as" column adds up to it
 * (`calcProblems`). Then the card's own rules, and `costCalc` under every guard mode, with the
 * amounts it may show and none it may not.
 */
import { describe, expect, it } from 'vitest'
import type { CostRow, GuardedFigure, ShownAmounts } from '@/cost/guard'
import { COST_STEP, roundCost, sumRounded } from '@/lib/costRounding'
import { BRIDGE_STEP_LABEL, BRIDGE_STEPS } from '@/plan/engine/bridge'
import { annualLocal, hrisRate, lineContext, positionLines, severanceOf } from '@/plan/engine/cost'
import { B1 } from '@/plan/engine/fixtures/bridge'
import { A1 } from '@/plan/engine/fixtures/budgetStatus'
import { fy27Working } from '@/plan/engine/fixtures/common'
import { C1, C2, C2B, C3, C4 } from '@/plan/engine/fixtures/cost'
import { F1, F2, F3 } from '@/plan/engine/fixtures/forecast'
import { X1, X2 } from '@/plan/engine/fixtures/fx'
import { H1, H2 } from '@/plan/engine/fixtures/heads'
import { A2, G1, G2, G3 } from '@/plan/engine/fixtures/targets'
import { H3, H4 } from '@/plan/engine/fixtures/versions'
import { type ForecastInput, forecast, forecastStart, monthlyRate } from '@/plan/engine/forecast'
import { fxEffect } from '@/plan/engine/fx'
import { averageFte, headsOn, toAssignments } from '@/plan/engine/heads'
import { activeFraction } from '@/plan/engine/proration'
import { reconcile } from '@/plan/engine/reconcile'
import { planHeadsAt } from '@/plan/engine/versions'
import type { Assignment, ForecastMonth } from '@/plan/types'
import {
  type CalcSpec,
  type CalcStep,
  calcInput,
  calcProblems,
  calcResult,
  calcStep,
  costCalc,
  evaluateExpression,
  isMoneyFormat,
  lastStep,
  sameResult,
} from './calc'
import { drillSpec } from './types'

/* ───────────── the PLAN 6 fixtures as cards ───────────── */

const eur = (v: number) => `€${v.toLocaleString('en-US', { maximumFractionDigits: 6 })}`
const usd = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 6 })}`
const n = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 10 })
const pct = (v: number) => `${n(v * 100)}%`

const c1Annual = annualLocal(C1.input)
const c1Lines = (p: 'daily' | 'half-month' | 'full-month') =>
  positionLines(C1.seat, fy27Working(p), lineContext(C1.context(p)))
const sepUsd = (p: 'daily' | 'half-month' | 'full-month') =>
  c1Lines(p)
    .filter((l) => l.month === C1.september.month)
    .reduce((s, l) => s + l.usd.loaded, 0)
const c1Monthly = (c1Annual.base + c1Annual.bonus + c1Annual.burden + c1Annual.benefits) / 12

/** A card from its steps: the value is the last step's result, as every producer builds them. */
function card(
  title: string,
  metricId: string,
  format: CalcSpec['format'],
  steps: CalcStep[],
  extra: Partial<CalcSpec> = {},
): CalcSpec {
  return {
    title,
    metricId,
    format,
    value: steps.at(-1)?.result ?? null,
    inputs: [],
    steps,
    uses: [],
    ...extra,
  }
}

const h1Assignments = toAssignments(H1.workers)
const h2Assignments = toAssignments(H2.workers)
const h1Fte = averageFte(h1Assignments, H1.averageFte.window)
const monthIn = (f: { months: readonly ForecastMonth[] }, m: string): ForecastMonth => {
  const found = f.months.find((x) => x.month === m)
  if (!found) throw new Error(`no forecast month ${m}`)
  return found
}
// F1 from the forecast engine's own months: the October and November HRIS cohort.
const f1Rate = monthlyRate(0.12)
const f1Forecast = forecast(F1.input)
const f1October = monthIn(f1Forecast, F1.october.month)
const f1November = monthIn(f1Forecast, F1.november.month)
const f1OctStart = f1October.cohorts.hris.headsAtStart
const f1Oct = f1October.modeledExits
const f1NovStart = f1November.cohorts.hris.headsAtStart
const f1Nov = f1November.modeledExits
// F2: the filled part over the grid, summed in integer cents, before and after moving the start.
const filledCents = (input: ForecastInput): number =>
  forecast(input).months.reduce((s, m) => s + Math.round(m.cost.filled.loaded * 100), 0)
const f2Before = filledCents(F2.base) / 100
const f2After = filledCents(F2.moved) / 100
const f2Change = (filledCents(F2.moved) - filledCents(F2.base)) / 100
// H4: the seat imported as Planned, and as Open (the reconcile control).
const h4PlanHeads = planHeadsAt([H4.planned.seat], H4.planned.at)
const h4Open = H4.onOpen.find((c) => c.status === 'Open') ?? H4.onOpen[0]
const h4OpenExceptions = reconcile({ positions: h4Open.rows, workers: h4Open.workers }, H4.asOf)
const f3Start = forecastStart(F3.opening, F3.asOf, F3.timeToFillDays)
const c4 = severanceOf(C4.severance[0].input)
const c2bNov = positionLines(C2B.seat, fy27Working('daily'), lineContext(C2B.context())).filter(
  (l) => l.month === C2B.november.month,
)
const c3a = hrisRate(C3[0].input)
const c3b = hrisRate(C3.find((c) => c.id === 'C3b')?.input ?? C3[0].input)
const b1Steps = BRIDGE_STEPS.map((k, i) => ({ key: k, label: BRIDGE_STEP_LABEL[k], value: B1.amounts[i] }))
const b1Cents = b1Steps.reduce((s, x) => s + Math.round(x.value * 100), 0)

interface Fixture {
  id: string
  card: CalcSpec
  /** The number PLAN 6 states for it. */
  plan: number
}

const FIXTURES: Fixture[] = [
  {
    id: 'H1 heads',
    plan: 1,
    card: card(
      'Heads at 30 Sep 2026, the 16 Sep hire',
      'plan.heads.actual',
      'int',
      [
        calcStep(
          'Employees active on 30 Sep (the last day counts)',
          '1',
          headsOn(h1Assignments, '2026-09-30'),
          'int',
        ),
      ],
      { rows: drillSpec({ kind: 'assignments', title: 'Active on 30 Sep', rows: h1Assignments }) },
    ),
  },
  {
    id: 'H1 average FTE',
    plan: 0.5,
    card: card(
      'Average FTE in September 2026',
      'plan.fte.average',
      'num2',
      [
        calcStep('FTE days: 1.0 FTE × 15 active days (16 to 30 Sep)', '1 × 15', 15, 'num1'),
        calcStep('Average FTE = FTE days ÷ days in the window', '15 ÷ 30', h1Fte, 'num2'),
      ],
      {
        rows: drillSpec({
          kind: 'assignments',
          title: 'Assignments in September',
          rows: h1Assignments,
          weight: (a: Assignment) => (a.fte * 15) / 30,
        }),
      },
    ),
  },
  {
    id: 'H2 heads on the last day',
    plan: 1,
    card: card('Heads at 30 Sep 2026, last day 30 Sep', 'plan.heads.actual', 'int', [
      calcStep('Active on the last day', '1', headsOn(h2Assignments, '2026-09-30'), 'int'),
    ]),
  },
  {
    id: 'H2 heads after the last day',
    plan: 0,
    card: card('Heads at 1 Oct 2026, last day 30 Sep', 'plan.heads.actual', 'int', [
      calcStep('Active on the day after the last day', '0', headsOn(h2Assignments, '2026-10-01'), 'int'),
    ]),
  },
  {
    id: 'H3 October share',
    plan: 15 / 31,
    card: card('October 2026 share of the leaver’s seat (daily proration)', 'plan.fte.average', 'num2', [
      calcStep(
        'Active days ÷ days in October (1 to 15 Oct)',
        '15 ÷ 31',
        activeFraction('daily', '2026-10', '2024-01-15', '2026-10-15'),
        'num2',
      ),
    ]),
  },
  {
    id: 'H3 plan heads at 31 Oct',
    plan: 0,
    card: card('Plan heads at 31 Oct 2026, the seat Open from 16 Oct', 'plan.heads.plan', 'int', [
      calcStep('Filled at the month-end, or planned to be', '0', H3.states[3].planHead ? 1 : 0, 'int'),
    ]),
  },
  {
    id: 'H4 plan heads at 30 Sep',
    plan: 1,
    card: card(
      'Plan heads at 30 Sep 2026, a seat imported as Planned with an assignment from 1 Sep',
      'plan.heads.plan',
      'int',
      [
        calcStep(
          'An Employee assignment is active on 30 Sep, so the seat reads Filled and is a plan head',
          '1',
          h4PlanHeads,
          'int',
        ),
      ],
    ),
  },
  {
    id: 'H4 imported as Open',
    plan: 1,
    card: card(
      'Reconciliation exceptions, the same seat imported as Open',
      'finance.recon.exceptions',
      'int',
      [
        calcStep(
          'An assignment on a seat imported as Open reports assignment-on-open',
          '1',
          h4OpenExceptions.length,
          'int',
        ),
      ],
      { rows: drillSpec({ kind: 'exceptions', title: 'Exceptions at 30 Sep', rows: h4OpenExceptions }) },
    ),
  },
  {
    id: 'C1 annual',
    plan: 140_026,
    card: card(
      'Munich P4, annual local cost',
      'plan.cost.bandEstimate',
      'num2',
      [
        calcStep(
          'Bonus = base × target % × funding %',
          `${eur(110_000)} × ${pct(0.1)} × ${pct(1)}`,
          c1Annual.bonus,
          'num2',
        ),
        calcStep(
          'Burden = rate × min(base + bonus, cap)',
          `${pct(0.21)} × ${eur(90_600)}`,
          c1Annual.burden,
          'num2',
        ),
        calcStep(
          'Annual = base + bonus + burden + benefits',
          `${eur(c1Annual.base)} + ${eur(c1Annual.bonus)} + ${eur(c1Annual.burden)} + ${eur(c1Annual.benefits)}`,
          c1Annual.base + c1Annual.bonus + c1Annual.burden + c1Annual.benefits,
          'num2',
        ),
      ],
      {
        inputs: [
          calcInput('Midpoint, P4 Munich', 110_000, 'num2', 'Assumptions · band · FY27', 'company'),
          calcInput('Target bonus', 0.1, 'pct', 'Assumptions · bonusTarget', 'company'),
          calcInput('Bonus funding', 1, 'pct', 'Assumptions · bonusFunding', 'company'),
          calcInput('Burden rate, social', 0.21, 'pct', 'Assumptions · burden · Germany', 'company'),
          calcInput('Burden cap, social', 90_600, 'num2', 'Assumptions · burdenCap · Germany', 'company'),
        ],
      },
    ),
  },
  {
    id: 'C1 September daily',
    plan: 6_301.17,
    card: card('Munich P4, September 2026 (daily proration)', 'plan.cost.bandEstimate', 'moneyFull', [
      calcStep('Monthly = annual ÷ 12', `${eur(140_026)} ÷ 12`, c1Monthly, 'num2'),
      calcStep(
        'September = monthly × active share (16 to 30 Sep)',
        `${eur(140_026)} ÷ 12 × 0.5`,
        c1Monthly * 0.5,
        'num2',
      ),
      calcStep('In USD at the plan rate', `${eur(140_026)} ÷ 12 × 0.5 × 1.08`, sepUsd('daily'), 'moneyFull'),
    ]),
  },
  {
    id: 'C1 September half-month',
    plan: 6_301.17,
    card: card('Munich P4, September 2026 (half-month proration)', 'plan.cost.bandEstimate', 'moneyFull', [
      calcStep(
        'A start after the 15th counts half the month',
        `${eur(140_026)} ÷ 12 × 0.5 × 1.08`,
        sepUsd('half-month'),
        'moneyFull',
      ),
    ]),
  },
  {
    id: 'C1 September full-month',
    plan: 12_602.34,
    card: card('Munich P4, September 2026 (full-month proration)', 'plan.cost.bandEstimate', 'moneyFull', [
      calcStep(
        'Active on the month’s last day counts the whole month',
        `${eur(140_026)} ÷ 12 × 1 × 1.08`,
        sepUsd('full-month'),
        'moneyFull',
      ),
    ]),
  },
  {
    id: 'C1 FY27 daily',
    plan: 81_915.21,
    card: card('Munich P4, FY27 (daily proration)', 'plan.cost.bandEstimate', 'moneyFull', [
      calcStep('Months costed: September half, October to March whole', '0.5 + 6', 6.5, 'num1'),
      calcStep('FY27 local = monthly × months', `${eur(140_026)} ÷ 12 × 6.5`, (140_026 / 12) * 6.5, 'num2'),
      calcStep(
        'FY27 in USD at 1.08',
        `${eur(140_026)} ÷ 12 × 6.5 × 1.08`,
        c1Lines('daily').reduce((s, l) => s + l.usd.loaded, 0),
        'moneyFull',
      ),
    ]),
  },
  {
    id: 'C2 base at 0.6 FTE',
    plan: 60_000,
    card: card('0.6 FTE at €100,000 full-time rate: base', 'plan.cost.component', 'num2', [
      calcStep('Base = full-time rate × FTE', `${eur(100_000)} × 0.6`, annualLocal(C2.input).base, 'num2'),
    ]),
  },
  {
    id: 'C2 burden cap not scaled',
    plan: 13_860,
    card: card('0.6 FTE: burden, the cap stays €90,600', 'plan.cost.component', 'num2', [
      calcStep('Base + bonus, under the unscaled cap', `${eur(60_000)} + ${eur(6_000)}`, 66_000, 'num2'),
      calcStep(
        'Burden = 21% × min(66,000, 90,600)',
        `${pct(0.21)} × ${eur(66_000)}`,
        annualLocal(C2.input).burden,
        'num2',
      ),
    ]),
  },
  {
    id: 'C2b offer base',
    plan: 60_000,
    card: card('Open 0.6 FTE seat with an accepted offer: base', 'plan.cost.component', 'num2', [
      calcStep(
        'November base, costed from the offer’s start (basis offer)',
        `${eur(100_000)} × 0.6 ÷ 12`,
        c2bNov[0]?.local.base ?? null,
        'num2',
      ),
      calcStep(
        'Annual base = offer full-time rate × FTE',
        `${eur(100_000)} × 0.6`,
        (c2bNov[0]?.local.base ?? 0) * 12,
        'num2',
      ),
    ]),
  },
  {
    id: 'C3 merit from 1 Apr 2027',
    plan: 107_640,
    card: card('HRIS rate on 15 Apr 2027, comp row dated 1 Mar 2027', 'plan.cost.component', 'num2', [
      calcStep(
        'Hired before the cutoff, latest row before the merit date: FY28 merit applies',
        `${n(c3a?.merit ?? 0)}`,
        c3a?.merit ?? null,
        'num2',
      ),
      calcStep(
        'Rate = the row’s full-time rate × (1 + merit %)',
        `104,000 × (1 + ${pct(0.035)})`,
        c3a?.rate ?? null,
        'num2',
      ),
    ]),
  },
  {
    id: 'C3 no merit on the merit date',
    plan: 1,
    card: card('Merit factor, comp row dated 1 Apr 2027', 'plan.cost.component', 'num2', [
      calcStep(
        'A row on or after the merit date already holds the merit: none added',
        '1',
        c3b?.merit ?? null,
        'num2',
      ),
    ]),
  },
  {
    id: 'C4 severance',
    plan: 30_000,
    card: card('Severance, last day 31 Dec 2026, booked in 2027-01', 'plan.cost.component', 'num2', [
      calcStep(
        'Severance = months × annual base ÷ 12',
        `3 × ${eur(120_000)} ÷ 12`,
        c4?.amountLocal ?? null,
        'num2',
      ),
    ]),
  },
  {
    id: 'X1 FX effect',
    plan: 8_400,
    card: card('FX effect, €120,000 in open months', 'forecast.fx.effect', 'moneyFull', [
      calcStep('At the plan rate', `${eur(120_000)} × 1.08`, X1.planUsd, 'moneyFull'),
      calcStep('At the forecast rate', `${eur(120_000)} × 1.15`, X1.forecastUsd, 'moneyFull'),
      calcStep(
        'FX effect = local × (forecast − plan)',
        `${eur(120_000)} × (1.15 − 1.08)`,
        fxEffect(X1.lines, X1.comparisonRates),
        'moneyFull',
      ),
    ]),
  },
  {
    id: 'X2 FX effect against the Budget',
    plan: 8_400,
    card: card(
      'FX effect against FY27 Budget (stored 1.08, not Working’s 1.10)',
      'forecast.fx.effect',
      'moneyFull',
      [
        calcStep(
          'FX effect = local × (forecast − Budget plan)',
          `${eur(120_000)} × (1.15 − 1.08)`,
          fxEffect(X2.lines, X2.budgetRates),
          'moneyFull',
        ),
      ],
    ),
  },
  {
    id: 'F1 monthly rate',
    plan: 0.0105962,
    card: card('Monthly attrition rate', 'forecast.exits.rate', 'pct2', [
      calcStep('Monthly = 1 − (1 − annual) to the power 1/12', '1 − (1 − 12%) ^ (1/12)', f1Rate, 'pct2'),
    ]),
  },
  {
    id: 'F1 October modeled exits',
    plan: 0.0596,
    card: card('Modeled exits, October 2026', 'forecast.exits.modeled', 'num2', [
      calcStep(
        'Expected = heads at the start × monthly rate',
        `${n(f1OctStart)} × ${n(f1Rate)}`,
        f1OctStart * f1Rate,
        'num2',
      ),
      calcStep(
        'Less the known exit (Dana, 15 Oct), never below 0',
        `${n(f1OctStart)} × ${n(f1Rate)} − ${f1October.knownExits}`,
        f1Oct,
        'num2',
      ),
    ]),
  },
  {
    id: 'F1 November modeled exits',
    plan: 1.0484,
    card: card('Modeled exits, November 2026', 'forecast.exits.modeled', 'num2', [
      calcStep('Heads at the start of November', `100 − 1 − ${n(f1Oct)}`, f1NovStart, 'num2'),
      calcStep('Expected = heads × monthly rate', `${n(f1NovStart)} × ${n(f1Rate)}`, f1Nov, 'num2'),
    ]),
  },
  {
    id: 'F2 filled part unchanged',
    plan: 0,
    card: card(
      'Filled part after moving a Planned start from 1 Jan 2027 to 1 Nov 2026',
      'forecast.cost.fullYear',
      'moneyFull',
      [
        calcStep('Filled part over the grid, start 1 Jan 2027', usd(f2Before), f2Before, 'moneyFull'),
        calcStep('Filled part over the grid, start 1 Nov 2026', usd(f2After), f2After, 'moneyFull'),
        calcStep(
          'Change in the filled part (the move reaches the band part only)',
          `${usd(f2After)} − ${usd(f2Before)}`,
          f2Change,
          'moneyFull',
        ),
      ],
    ),
  },
  {
    id: 'F3 days to start',
    plan: 20,
    card: card('Forecast start of P-F3, days after the as-of date', 'forecast.starts.expected', 'int', [
      calcStep('Days since opened (21 Aug to 30 Sep)', '40', 40, 'int'),
      calcStep('Time to fill left = max(0, 60 − 40)', '60 − 40', Math.max(0, 60 - 40), 'int'),
      calcStep(
        'Start = max(target start, as-of + days left): 20 Oct 2026',
        '20',
        (Date.parse(f3Start) - Date.parse(F3.asOf)) / 86_400_000,
        'int',
      ),
    ]),
  },
  {
    id: 'B1 bridge',
    plan: 600_000,
    card: card('Bridge, plan $10.0M to forecast $10.6M', 'forecast.bridge.step', 'money', [
      ...b1Steps.map((s) => calcStep(s.label, usd(s.value), s.value, 'money')),
      calcStep(
        'Steps add up to forecast − plan',
        b1Steps.map((s) => usd(s.value)).join(' + '),
        b1Cents / 100,
        'money',
      ),
    ]),
  },
  {
    id: 'G1 gap',
    plan: -18,
    card: card('FY28 gap in heads, Silicon Engineering', 'targets.gap.heads', 'int', [
      calcStep(
        'Asks = approved heads + pending asks',
        `${G1.b} + ${G1.asks.pendingHeads}`,
        G1.asks.heads,
        'int',
      ),
      calcStep('Gap = target − asks', `${G1.target.targetHeads} − ${G1.asks.heads}`, G1.gapHeads, 'int'),
    ]),
  },
  {
    id: 'G2 dated target',
    plan: 5,
    card: card('Asks at a target dated 30 Sep 2027', 'targets.asks.heads', 'int', [
      calcStep('1 Jan 2028 starts are after the target date and left out', '5', G2.dated.asks, 'int'),
    ]),
  },
  {
    id: 'G3 in-year asks cost',
    plan: -52_031.6,
    card: card('T1 pending: in-year effect on asks cost', 'targets.asks.cost', 'moneyFull', [
      calcStep(
        'Get seats from 1 Jan 2027: 8 × band estimate × 3/12',
        `8 × ${usd(33_859.2)} × 3 ÷ 12`,
        67_718.4,
        'moneyFull',
      ),
      calcStep(
        'Give seat from 1 Nov 2026: band estimate × 5/12',
        `${usd(287_400)} × 5 ÷ 12`,
        119_750,
        'moneyFull',
      ),
      calcStep('Band effect in FY27', `${usd(67_718.4)} − ${usd(119_750)}`, G3.bandEffect, 'moneyFull'),
    ]),
  },
  {
    id: 'A1 allocation band cost',
    plan: 480_000,
    card: card('Allocation band cost, 6 seats at $80,000', 'team.allocation.heads', 'moneyFull', [
      calcStep('Band cost = Σ midpoint × FTE', `6 × ${usd(80_000)}`, A1.allocation.bandCost, 'moneyFull'),
    ]),
  },
  {
    id: 'A1 staffed after a Level change',
    plan: 508_800,
    card: card('Staffed band cost after a Level change', 'team.budget.status', 'moneyFull', [
      calcStep(
        '5 seats at $80,000 + 1 at $108,800',
        `5 × ${usd(80_000)} + ${usd(108_800)}`,
        A1.cases[3].staffedAt[0].bandCost,
        'moneyFull',
      ),
    ]),
  },
  {
    id: 'A2 Backfill on an On hold seat',
    plan: 1,
    card: card('Head effect of a pending Backfill on an On hold seat', 'targets.asks.heads', 'int', [
      calcStep('The seat is On hold on the date, so approving adds it', '1', A2.onHold.headEffect, 'int'),
    ]),
  },
  {
    id: 'A2 Backfill on an Open seat',
    plan: 0,
    card: card('Head effect of a pending Backfill on an Open seat', 'targets.asks.heads', 'int', [
      calcStep('The seat already counts', '0', A2.onOpen.headEffect, 'int'),
    ]),
  },
]

describe('every PLAN 6 worked example as a calculation card', () => {
  it.each(FIXTURES.map((f) => [f.id, f] as const))(
    '%s: the last step is the value and the PLAN number',
    (_id, f) => {
      expect(calcProblems(f.card)).toEqual([])
      expect(lastStep(f.card)?.result).toBe(f.card.value)
      expect(f.card.value).not.toBeNull()
      expect(f.card.value as number).toBeCloseTo(f.plan, f.plan !== 0 && Math.abs(f.plan) < 1 ? 4 : 2)
    },
  )

  it.each(FIXTURES.map((f) => [f.id, f] as const))(
    '%s: each step’s arithmetic reads back to its result',
    (_id, f) => {
      for (const s of f.card.steps) {
        const v = evaluateExpression(s.expression)
        if (v == null || s.result == null) continue
        const tol = isMoneyFormat(s.format) ? 0.006 : Math.max(1e-6, Math.abs(s.result) * 1e-6)
        expect(
          Math.abs(v - s.result),
          `${f.id}: ${s.label}: ${s.expression} = ${v}, not ${s.result}`,
        ).toBeLessThanOrEqual(tol)
      }
    },
  )

  it('covers the fixtures PLAN 6 names', () => {
    const ids = new Set(FIXTURES.map((f) => f.id.split(' ')[0]))
    for (const id of [
      'H1',
      'H2',
      'H3',
      'H4',
      'C1',
      'C2',
      'C2b',
      'C3',
      'C4',
      'X1',
      'X2',
      'F1',
      'F2',
      'F3',
      'B1',
      'G1',
      'G2',
      'G3',
      'A1',
      'A2',
    ])
      expect(ids.has(id), id).toBe(true)
  })

  it('fails a card whose last step is not its value, and the negative controls', () => {
    const c1 = FIXTURES.find((f) => f.id === 'C1 September daily')?.card as CalcSpec
    expect(calcProblems({ ...c1, value: 6_301.18 })).toHaveLength(1)
    // X2: a build that reads Working's plan rate (1.10) gives $6,000.
    const x2 = FIXTURES.find((f) => f.id.startsWith('X2'))?.card as CalcSpec
    expect(calcProblems({ ...x2, value: X2.negativeControl })).toHaveLength(1)
    expect(fxEffect(X2.lines, X2.workingRates)).toBeCloseTo(X2.negativeControl, 2)
    // G3: adding the annual band estimate gives +$151,123.60 and must fail.
    const g3 = FIXTURES.find((f) => f.id.startsWith('G3'))?.card as CalcSpec
    expect(calcProblems({ ...g3, value: G3.negativeControl })).toHaveLength(1)
    // F1: modeling Dana as well as counting her known exit gives 1.0596 in October and must fail.
    const f1 = FIXTURES.find((f) => f.id === 'F1 October modeled exits')?.card as CalcSpec
    expect(calcProblems({ ...f1, value: F1.negativeControlOctober })).toHaveLength(1)
    // F2: the 0 is the filled part's; the band part does move, so the card is not empty arithmetic.
    const bandCents = (input: ForecastInput) =>
      forecast(input).months.reduce((s, m) => s + Math.round(m.cost.band.loaded * 100), 0)
    expect(bandCents(F2.moved)).not.toBe(bandCents(F2.base))
  })
})

/* ───────────── the card's rules ───────────── */

describe('calcProblems', () => {
  const steps = [calcStep('Total', '2 + 3', 5, 'int')]

  it('holds for a counted card whose rows number its value', () => {
    const rows = drillSpec({ kind: 'assignments', title: 'x', rows: toAssignments(H1.workers) })
    expect(
      calcProblems(
        card('One head', 'plan.heads.actual', 'int', [calcStep('Heads', '1', 1, 'int')], { rows }),
      ),
    ).toEqual([])
    expect(
      calcProblems(
        card('Two heads', 'plan.heads.actual', 'int', [calcStep('Heads', '2', 2, 'int')], { rows }),
      ),
    ).toHaveLength(1)
  })

  it('adds a weighted card’s weights, exactly', () => {
    const rows = drillSpec({
      kind: 'assignments',
      title: 'x',
      rows: [...toAssignments(H1.workers), ...toAssignments(H2.workers)],
      weight: () => 0.25,
    })
    expect(
      calcProblems(card('Half', 'plan.fte.average', 'num2', [calcStep('FTE', '0.5', 0.5, 'num2')], { rows })),
    ).toEqual([])
    expect(
      calcProblems(
        card('Not half', 'plan.fte.average', 'num2', [calcStep('FTE', '0.6', 0.6, 'num2')], { rows }),
      ),
    ).toHaveLength(1)
  })

  it('does not sum a cost card’s rows (no amount column outside HR admin with the switch)', () => {
    const rows = drillSpec({ kind: 'positions', title: 'x', rows: [] })
    expect(
      calcProblems(
        card('Cost', 'plan.cost.loaded', 'money', [calcStep('Cost', '1', 1_000_000, 'money')], { rows }),
      ),
    ).toEqual([])
  })

  it('needs steps, and finite ones', () => {
    expect(calcProblems({ ...card('Empty', 'x', 'int', steps), steps: [] })).toEqual([
      'Empty: the card has no steps.',
    ])
    expect(
      calcProblems(card('Bad', 'x', 'int', [calcStep('x', 'x', Number.POSITIVE_INFINITY, 'int')])),
    ).not.toEqual([])
  })

  it('treats a hidden card as consistent: null value, null last step', () => {
    expect(
      calcProblems(card('Hidden', 'plan.cost.loaded', 'money', [calcStep('Hidden', '—', null, 'money')])),
    ).toEqual([])
    expect(calcResult(card('Hidden', 'x', 'money', [calcStep('Hidden', '—', null, 'money')]))).toBeNull()
  })

  it('compares money to the half cent and other numbers to a billionth', () => {
    expect(sameResult(6_301.17, 6_301.174, 'moneyFull')).toBe(true)
    expect(sameResult(6_301.17, 6_301.18, 'moneyFull')).toBe(false)
    expect(sameResult(0.0105962, 0.0105963, 'pct2')).toBe(false)
    expect(sameResult(null, null, 'int')).toBe(true)
    expect(sameResult(null, 0, 'int')).toBe(false)
  })
})

describe('evaluateExpression', () => {
  it('reads plain arithmetic with money signs, thousands and percents', () => {
    expect(evaluateExpression('€110,000 × 10% × 100%')).toBeCloseTo(11_000, 9)
    expect(evaluateExpression('$287,400 × 5 ÷ 12')).toBeCloseTo(119_750, 9)
    expect(evaluateExpression('100 − 1 − 0.0596')).toBeCloseTo(98.9404, 9)
    expect(evaluateExpression('€120,000 × (1.15 − 1.08)')).toBeCloseTo(8_400, 6)
    expect(evaluateExpression('NT$4,175,000 + 25,000')).toBe(4_200_000)
    expect(evaluateExpression('-3 + 5')).toBe(2)
  })

  it('reads nothing into prose, a hidden amount or a power', () => {
    expect(evaluateExpression('Heads only')).toBeNull()
    expect(evaluateExpression('—')).toBeNull()
    expect(evaluateExpression('1 − (1 − 12%) ^ (1/12)')).toBeNull()
    expect(evaluateExpression('2 +')).toBeNull()
    expect(evaluateExpression('(2 + 3')).toBeNull()
    expect(evaluateExpression('')).toBeNull()
  })
})

/* ───────────── cost cards from the guard ───────────── */

const amounts = (o: Partial<Record<keyof ShownAmounts, number | null>>): ShownAmounts => ({
  base: null,
  bonus: null,
  burden: null,
  benefits: null,
  oneTime: null,
  vacancy: null,
  equity: null,
  loaded: null,
  ...o,
})

const row = (o: Partial<CostRow>): CostRow => ({
  key: 'total',
  label: 'Silicon Engineering',
  isOther: false,
  folded: 0,
  costed: 412,
  amounts: amounts({}),
  bandUsd: null,
  totalUsd: null,
  perHeadUsd: null,
  hidden: false,
  componentsHidden: false,
  reason: null,
  positionIds: [],
  ...o,
})

describe('costCalc', () => {
  it('rounded modes: each atom’s rounded parts, the sumRounded step and the Rounding step', () => {
    const parts = {
      'A-1|filled': roundCost(1_234_567),
      'A-1|band': roundCost(456_000),
      'A-2|filled': roundCost(2_345_678),
    }
    const rounded = Object.values(parts)
    const total = sumRounded(rounded)
    const plain = rounded.reduce((s, v) => s + v, 0)
    const figure: GuardedFigure = {
      mode: 'rounded',
      total: row({ totalUsd: total, parts: 3, added: total - plain, bandUsd: parts['A-1|band'] }),
      rows: [],
      note: '3 people in groups under 5 are left out',
      reason: null,
      parts,
    }
    const c = costCalc({ title: 'Loaded cost FY27', metricId: 'plan.cost.loaded', figure, uses: [] })
    expect(calcProblems(c)).toEqual([])
    expect(c.value).toBe(total)
    // Every amount on the card is a whole step: no exact sum, average or component.
    const amountsShown = [
      ...c.inputs.filter((i) => i.format === 'money').map((i) => i.value),
      ...c.steps.map((s) => s.result),
    ]
    for (const v of amountsShown) if (typeof v === 'number') expect(v % COST_STEP, String(v)).toBe(0)
    expect(c.steps.map((s) => s.label)).toEqual([
      'Each of the 3 parts rounded down to $0.1M, then added',
      'Rounding: one step for every two parts of $0.1M or more',
      'Loaded cost, rounded',
    ])
    expect(c.note).toContain('left out')
  })

  it('exact modes: components only when every one shows, else loaded only, plus the band part', () => {
    const full = row({
      amounts: amounts({
        base: 600_000,
        bonus: 60_000,
        burden: 90_000,
        benefits: 30_000,
        oneTime: 20_000,
        vacancy: -24_000,
        equity: 5_000,
        loaded: 776_000,
      }),
      bandUsd: 224_000,
      totalUsd: 1_000_000,
    })
    const exact = costCalc({
      title: 'Loaded cost',
      metricId: 'plan.cost.loaded',
      figure: { mode: 'exact', total: full, rows: [], note: null, reason: null },
      uses: [],
    })
    expect(calcProblems(exact)).toEqual([])
    expect(exact.steps.map((s) => s.result)).toEqual([776_000, 1_000_000])
    expect(exact.inputs.map((i) => i.label)).toContain('Base')
    // A component under its own minimum: the cell shows loaded only (7.2 rule 1).
    const partial = row({ ...full, componentsHidden: true, amounts: amounts({ loaded: 776_000 }) })
    const only = costCalc({
      title: 'Loaded cost',
      metricId: 'plan.cost.loaded',
      figure: { mode: 'exact', total: partial, rows: [], note: null, reason: null },
      uses: [],
    })
    expect(calcProblems(only)).toEqual([])
    expect(only.inputs.map((i) => i.label)).not.toContain('Base')
    expect(only.inputs.find((i) => i.label === 'Filled part, loaded')?.source).toMatch(/Components hidden/)
  })

  it('a hidden total reads "—" with the reason and no amount', () => {
    const c = costCalc({
      title: 'Loaded cost, 1550-HSZ',
      metricId: 'plan.cost.loaded',
      figure: {
        mode: 'exact',
        total: row({ costed: 3, hidden: true, reason: 'Hidden to protect anonymity (n < 5)' }),
        rows: [],
        note: null,
        reason: null,
      },
      uses: [],
    })
    expect(c.value).toBeNull()
    expect(calcProblems(c)).toEqual([])
    expect(c.steps[0]).toMatchObject({ label: 'Hidden to protect anonymity (n < 5)', result: null })
    expect(c.inputs.every((i) => i.format !== 'money')).toBe(true)
  })

  it('Manager mode: no amount of any kind, a card of heads', () => {
    const c = costCalc({
      title: 'Cost',
      metricId: 'plan.cost.loaded',
      figure: { mode: 'none', total: row({ totalUsd: 5_000_000 }), rows: [], note: null, reason: null },
      uses: [],
    })
    expect(c.value).toBeNull()
    expect(c.format).toBe('int')
    expect(calcProblems(c)).toEqual([])
    expect(JSON.stringify(c)).not.toMatch(/\$|5000000/)
  })

  it('the total of a breakdown lists its shown groups and Other, exactly as the figure shows them', () => {
    const shown = row({ key: '1110-SJC', label: '1110-SJC', costed: 40, totalUsd: 7_000_000 })
    const other = row({
      key: 'other',
      label: 'Other (3)',
      isOther: true,
      folded: 3,
      costed: 9,
      totalUsd: 1_000_000,
    })
    const total = row({ totalUsd: 8_000_000, amounts: amounts({ loaded: 8_000_000 }) })
    const c = costCalc({
      title: 'Loaded cost',
      metricId: 'plan.cost.loaded',
      figure: { mode: 'exact', total, rows: [shown, other], note: null, reason: null },
      uses: [],
    })
    expect(c.inputs.map((i) => [i.label, i.value])).toEqual(
      expect.arrayContaining([
        ['1110-SJC', 7_000_000],
        ['Other (3)', 1_000_000],
      ]),
    )
    expect(c.value).toBe(8_000_000)
  })
})
