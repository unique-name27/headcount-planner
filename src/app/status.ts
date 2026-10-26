/**
 * What the M1 status page lists: the eight datasets (docs/PLAN.md 5.2; `src/data/schema.ts` becomes
 * their source), the nine sample stories whose numbers `src/data/sample/sample.test.ts` asserts
 * (docs/PLAN.md 13.4), and `storyChecks`, which turns the stories computed from the generated
 * sample (`src/data/sample/stories.ts`) into one check line a story. Pure.
 */
import type { Stories } from '@/data/sample/stories'

export const STATUS_LINE = 'M1: data and engines are being built'

export interface PlannedDataset {
  key: string
  label: string
  required: boolean
  holds: string
}

export const PLANNED_DATASETS: readonly PlannedDataset[] = [
  {
    key: 'positions',
    label: 'Positions',
    required: true,
    holds: 'Effective-dated seats with status, level, org, cost center, location and FTE',
  },
  {
    key: 'workers',
    label: 'Workers',
    required: true,
    holds: 'One row per assignment: who sits in which position, from when to when',
  },
  {
    key: 'comp',
    label: 'Compensation',
    required: true,
    holds: 'Effective-dated base salary and target bonus per employee',
  },
  {
    key: 'reqs',
    label: 'Requisitions',
    required: false,
    holds: 'Reqs from the applicant tracking system, with stages and accepted offers',
  },
  {
    key: 'requests',
    label: 'Requests',
    required: false,
    holds: 'Headcount requests with their approval steps',
  },
  {
    key: 'targets',
    label: 'Targets',
    required: false,
    holds: 'Heads and loaded cost per org and fiscal year',
  },
  {
    key: 'freezes',
    label: 'Hiring freezes',
    required: false,
    holds: 'Freezes by org, with dates and whether backfills may go ahead',
  },
  {
    key: 'assumptions',
    label: 'Assumptions',
    required: true,
    holds: 'Bands, loads, FX rates and forecast drivers per version',
  },
]

export const PLANNED_STORIES: readonly string[] = [
  'Go-to-Market hired ahead of plan',
  'Silicon Engineering’s Bengaluru seats are late, and its Hsinchu offers beat midpoint',
  'Systems & Software backfills point at newly created positions',
  'A hiring freeze on Corporate holds 3 openings',
  'EUR and ILS rise against plan in Munich and Haifa',
  'Silicon Engineering’s FY28 asks exceed its target',
  'People not in the plan and cost-center mismatches',
  'A cost center with 3 costed people stays hidden',
  'A pending Systems & Software trade waits on the leader',
]

/** One story's check on the status page: whether the sample shows the story's exact number. */
export interface StoryCheck {
  story: string
  ok: boolean
  detail: string
}

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

/**
 * The nine story checks of docs/PLAN.md 13.4 on computed stories, in PLANNED_STORIES order. Each
 * detail states the number the sample shows; `ok` says it is the one the plan asks for.
 */
export function storyChecks(s: Stories): StoryCheck[] {
  const flagged = s.s3.flagged
  const ss = flagged['Systems & Software']?.length ?? 0
  const otherUnits = Object.keys(flagged).filter((u) => u !== 'Systems & Software').length
  const recon = Object.values(s.s7.exceptions).reduce((a, n) => a + n, 0)
  const costed = Object.values(s.s8.costedPeople)
  const q = s.s9.quote
  const roles = s.s9.routing.steps.map((x) => x.role).join(', ')
  const checks: [boolean, string][] = [
    [
      s.s1.headsDelta === 8 && s.s1.ytdActual > s.s1.ytdBudget && s.s1.fyForecast > s.s1.fyBudget,
      `${signed(s.s1.headsDelta)} heads against the Budget at 30 Sep, over on cost year to date and for the year`,
    ],
    [
      s.s2.headsDelta === -10 && s.s2.fyVariance > 0,
      `${signed(s.s2.headsDelta)} heads against the Budget, full-year forecast over the Budget`,
    ],
    [
      ss === 4 && otherUnits === 0,
      `${ss} Systems & Software backfills name a new position, ${otherUnits} other units have one`,
    ],
    [
      s.s4.frozen.length === 3 && s.s4.corporateOpenPlanned === 4 && s.s4.offerStart != null,
      `${s.s4.frozen.length} openings held, ${s.s4.corporateOpenPlanned} Corporate openings, the accepted offer starts`,
    ],
    [
      s.s5.munich.headsDelta === 0 &&
        s.s5.haifa.headsDelta === 0 &&
        s.s5.munich.fx > 0 &&
        s.s5.haifa.fx > 0 &&
        Object.values(s.s5.otherSitesFx).every((x) => x === 0),
      'Munich and Haifa heads flat, FX effect above 0 in both and 0 at every other site',
    ],
    [
      s.s6.gap === -18 && s.s6.cutAfter === 40 && s.s6.notSubmitted.length === 4,
      `Gap ${signed(s.s6.gap)}, cut line after ${s.s6.cutAfter} heads, ${s.s6.notSubmitted.length} managers not submitted`,
    ],
    [recon === 9 && Object.keys(s.s7.exceptions).length === 2, `${recon} reconciliation exceptions`],
    [costed.every((n) => n === 3), `${costed[0] ?? 0} costed people in every month`],
    [
      q.ok && q.get.length === 6 && q.headsDelta === 5 && roles === 'manager, hrbp, leader',
      `${q.get.length} seats for 1, heads ${signed(q.headsDelta)}, steps ${roles}`,
    ],
  ]
  return PLANNED_STORIES.map((story, i) => ({ story, ok: checks[i][0], detail: checks[i][1] }))
}
