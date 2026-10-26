/**
 * The privacy rules, as dictionary entries (docs/PLAN.md 7 and 12): the anonymity minimum, pay
 * amounts staying opt-in, and leave showing only as one count of 5 or more. Their wording and
 * targets are locked. The minimums can be raised, never lowered; pay amounts staying opt-in cannot
 * be changed at all. Ids and settings are frozen in `./rules`.
 *
 * Engines read the minimums with `minGroupOf(ctx.metrics)` and `minLeaveCountOf(ctx.metrics)` (or
 * `ctx.metrics.num(ANONYMITY.metricId, ANONYMITY.key)`), never `MIN_GROUP` or a literal 5.
 *
 * Ported from the template app; the survey, immigration and protected-field rules are not
 * HCP's, and the leave rule is new.
 */
import { ANONYMITY, LEAVE_COUNTS, PAY_AMOUNTS, type RuleSetting } from './rules'
import type { MetricDef, MetricsApi, MetricView, ParamDef } from './types'
import { OWNER } from './wording'

export { ANONYMITY, LEAVE_COUNTS, PAY_AMOUNTS } from './rules'

/** Where the anonymity minimum and the pay rule apply: every view and page that shows numbers. */
const RULE_VIEWS: readonly MetricView[] = [
  'plan',
  'team',
  'requests',
  'forecast',
  'targets',
  'whatif',
  'finance',
  'home',
  'actions',
]

/** A rule's setting as a dictionary setting: its key, default and lock come from `./rules`. */
export function ruleParam(
  rule: RuleSetting,
  rest: Omit<ParamDef, 'key' | 'default' | 'locked' | 'type'> & { type?: ParamDef['type'] },
): ParamDef {
  return {
    type: typeof rule.default === 'boolean' ? 'boolean' : 'number',
    ...rest,
    key: rule.key,
    default: rule.default,
    locked: rule.locked,
  }
}

/** A raise-only count of people: whole, from its default to 50. */
const minimum = (rule: RuleSetting, label: string, description: string): ParamDef =>
  ruleParam(rule, {
    label,
    description,
    min: rule.default as number,
    max: 50,
    step: 1,
    format: 'int',
  })

export const PRIVACY_METRICS: readonly MetricDef[] = [
  {
    id: ANONYMITY.metricId,
    name: 'Anonymity minimum',
    views: RULE_VIEWS,
    definition:
      'A rate, an average or a share over a group of people smaller than this is hidden and reads "—" with "Hidden to protect anonymity". Breakdown tables fold smaller groups into "Other", and a filter can never exclude just 1 to 4 people in Filled seats.',
    formula:
      'a rate or average shows only when people in the group ≥ smallest group shown; smaller breakdown groups fold into Other',
    population: 'People in the group the number describes.',
    window: 'The window of the number it applies to.',
    unit: 'int',
    goodDirection: null,
    uses: [],
    owner: OWNER.analytics,
    locked: true,
    kind: 'rule',
    params: [
      minimum(
        ANONYMITY,
        'Smallest group shown',
        'Groups with fewer people than this are hidden. It can be raised, never lowered below 5.',
      ),
    ],
  },
  {
    id: PAY_AMOUNTS.metricId,
    name: 'Pay amounts',
    views: RULE_VIEWS,
    definition:
      'Amounts tied to one person or one seat (base salary, an offer and its sign-on, relocation and agency fee, and the cost of a Filled seat) show and export only in HR admin mode while "Show pay amounts" is on. The switch lasts for the session and turns off on every mode change.',
    formula: 'per-person and per-position amounts show only while Show pay amounts is on',
    unit: 'text',
    goodDirection: null,
    uses: [],
    owner: OWNER.analytics,
    locked: true,
    kind: 'rule',
    params: [
      ruleParam(PAY_AMOUNTS, {
        label: 'Pay amounts are opt-in',
        description:
          'Pay amounts stay hidden until someone switches them on for the session. This rule is locked.',
      }),
    ],
  },
  {
    id: LEAVE_COUNTS.metricId,
    name: 'Leave counts',
    views: ['plan'],
    definition:
      'Leave shows only as one count of people on leave for the whole unit or the whole org at the as-of date, and only when it is this many or more. It has no filter, breakdown, series, change or list of people, and leave never changes who is costed.',
    formula: 'one count for the whole scope at the as-of date, shown when ≥ smallest leave count shown',
    population: 'Active employees in the whole unit or the whole org.',
    window: 'The as-of date.',
    unit: 'int',
    goodDirection: null,
    uses: [],
    owner: OWNER.analytics,
    locked: true,
    kind: 'rule',
    params: [
      minimum(
        LEAVE_COUNTS,
        'Smallest leave count shown',
        'A leave count under this is hidden. It can be raised, never lowered below 5.',
      ),
    ],
  },
]

/** The anonymity minimum in force: 5, or higher when someone raised it. */
export const minGroupOf = (m: Pick<MetricsApi, 'num'>): number => m.num(ANONYMITY.metricId, ANONYMITY.key)

/** The smallest leave count shown: 5, or higher when someone raised it. */
export const minLeaveCountOf = (m: Pick<MetricsApi, 'num'>): number =>
  m.num(LEAVE_COUNTS.metricId, LEAVE_COUNTS.key)

/** Pay amounts stay opt-in (always true: the rule is locked). */
export const payAmountsOptIn = (m: Pick<MetricsApi, 'flag'>): boolean =>
  m.flag(PAY_AMOUNTS.metricId, PAY_AMOUNTS.key)
