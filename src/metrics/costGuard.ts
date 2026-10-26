/**
 * The cost guard's rules, as locked dictionary entries (docs/PLAN.md 7.2, 7.3 and 12): the
 * minimum costed people behind a cost amount, the rounding step for HRBP and Leader, and the
 * minimum contributors to a displayed difference. Their wording and targets are locked; each
 * setting can be raised, never lowered. Ids and settings are frozen in `./rules`.
 *
 * The guard (`src/cost/`) and the engines' model builders read the values in force with
 * `costGuardOf(ctx.metrics)` or `ctx.metrics.num(MIN_COSTED.metricId, MIN_COSTED.key)`, never a
 * constant: "The minimum is read from `cost.guard.minCosted` (locked, raise-only)" (7.2 rule 1).
 */
import { ruleParam } from './privacy'
import { FLOOR_USD, MIN_CONTRIBUTORS, MIN_COSTED } from './rules'
import type { MetricDef, MetricsApi, MetricView } from './types'
import { OWNER } from './wording'

export { FLOOR_USD, MIN_CONTRIBUTORS, MIN_COSTED } from './rules'

/** Where cost shows. */
const COST_VIEWS: readonly MetricView[] = [
  'plan',
  'forecast',
  'targets',
  'whatif',
  'finance',
  'home',
  'requests',
]
/** Where rounded cost shows: the views HRBP and Leader read cost on. */
const ROUNDED_VIEWS: readonly MetricView[] = ['plan', 'forecast', 'targets', 'whatif', 'home']
/** Where displayed differences show. */
const DIFFERENCE_VIEWS: readonly MetricView[] = ['forecast', 'plan', 'targets', 'whatif', 'finance', 'home']

export const COST_GUARD_METRICS: readonly MetricDef[] = [
  {
    id: MIN_COSTED.metricId,
    name: 'Minimum costed people',
    views: COST_VIEWS,
    definition:
      'Every cost amount (a total, a variance, a bridge step, the FX effect, a gap, a per-head figure or an average) needs at least this many costed people, or it reads "—" with "Hidden to protect anonymity". Costed people are employees in Filled seats and accepted offers from their start date, counted over the figure’s own version and window. A component amount (base, bonus, burden, benefits, one-time or equity) also needs this many positions with an amount in it, or the cell shows loaded cost only.',
    formula: 'an amount shows only when costed people in its window ≥ smallest number of costed people',
    population: 'Costed people behind the amount, in its own version and window.',
    window: 'The window of the amount it applies to: a month, the quarter or year to date, or the year.',
    unit: 'int',
    goodDirection: null,
    uses: [],
    owner: OWNER.analytics,
    locked: true,
    kind: 'rule',
    params: [
      ruleParam(MIN_COSTED, {
        label: 'Smallest number of costed people',
        description:
          'Cost amounts over fewer costed people are hidden, and smaller groups fold into "Other". It can be raised, never lowered below 5.',
        min: MIN_COSTED.default as number,
        max: 50,
        step: 1,
        format: 'int',
      }),
    ],
  },
  {
    id: FLOOR_USD.metricId,
    name: 'Rounding step for HRBP and Leader',
    views: ROUNDED_VIEWS,
    definition:
      'In HRBP and Leader mode every cost amount is built from cost atoms, a director’s org or a VP’s own direct staff. Each atom’s filled part and band part are rounded down to a whole step on their own, and a larger row adds the rounded parts. Atoms under the minimum costed people are left out.',
    formula: 'each part rounded down to a whole step; a row is the sum of its atoms’ rounded parts',
    population: 'The cost atoms of the row, as stored with the last month close.',
    window: 'The full year, the year to date and the quarter to date, ending at the last closed month-end.',
    unit: 'money',
    goodDirection: null,
    uses: [],
    owner: OWNER.analytics,
    locked: true,
    kind: 'rule',
    params: [
      ruleParam(FLOOR_USD, {
        label: 'Rounding step',
        description:
          'Each atom’s cost is rounded down to a whole multiple of this, in US dollars. It can be raised, never lowered.',
        min: FLOOR_USD.default as number,
        max: 1_000_000,
        step: FLOOR_USD.default as number,
        format: 'moneyFull',
      }),
    ],
  },
  {
    id: MIN_CONTRIBUTORS.metricId,
    name: 'Minimum contributors to a difference',
    views: DIFFERENCE_VIEWS,
    definition:
      'A displayed difference (a variance, a bridge step, the FX effect, month over month, version against version, a What if change, a gap change or a change on a cost tile) needs at least this many contributors: costed positions whose amount differs between the two sides. Open and Planned seats at band estimate do not count, and a difference made only of band estimates is a band figure that shows without a count. A bridge step with fewer contributors folds into "Other changes". Which bridge steps fold is decided once for each mode, comparison and window, over the finest groups a scope can be narrowed to (business units in Finance and HR admin, the kept cost atoms in HRBP and Leader mode), and that one fold applies in every scope, so no filter or Acting as pick shows a step another folds.',
    formula: 'a difference shows only when contributors ≥ smallest number of contributors',
    population:
      'Costed positions whose amount differs between the two sides by more than half a cent; for the FX effect, only people paid in another currency than the US dollar.',
    window: 'The two sides of the difference it applies to.',
    unit: 'int',
    goodDirection: null,
    uses: [],
    owner: OWNER.analytics,
    locked: true,
    kind: 'rule',
    params: [
      ruleParam(MIN_CONTRIBUTORS, {
        label: 'Smallest number of contributors',
        description: 'Differences with fewer contributors read "—". It can be raised, never lowered below 5.',
        min: MIN_CONTRIBUTORS.default as number,
        max: 50,
        step: 1,
        format: 'int',
      }),
    ],
  },
]

/** The cost guard's settings in force. */
export interface CostGuardSettings {
  /** Smallest number of costed people behind a cost amount (5). */
  minCosted: number
  /** The step HRBP and Leader cost is rounded down to, USD (100,000). */
  floorUsd: number
  /** Smallest number of contributors behind a displayed difference (5). */
  minContributors: number
}

export const minCostedOf = (m: Pick<MetricsApi, 'num'>): number => m.num(MIN_COSTED.metricId, MIN_COSTED.key)
export const floorUsdOf = (m: Pick<MetricsApi, 'num'>): number => m.num(FLOOR_USD.metricId, FLOOR_USD.key)
export const minContributorsOf = (m: Pick<MetricsApi, 'num'>): number =>
  m.num(MIN_CONTRIBUTORS.metricId, MIN_CONTRIBUTORS.key)

const byApi = new WeakMap<object, CostGuardSettings>()

/**
 * The cost guard's settings the dictionary holds; one object per dictionary, so models memoized on
 * it stay put.
 */
export function costGuardOf(m: Pick<MetricsApi, 'num'>): CostGuardSettings {
  const hit = byApi.get(m)
  if (hit) return hit
  const out: CostGuardSettings = Object.freeze({
    minCosted: minCostedOf(m),
    floorUsd: floorUsdOf(m),
    minContributors: minContributorsOf(m),
  })
  byApi.set(m, out)
  return out
}
