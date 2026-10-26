/**
 * My team's hero and key figures (docs/PLAN.md 9.3, 11.5): Left to fill split Open, requested and
 * left to request (the parts add up to the hero), then Allocation (its note in standard heads),
 * Filled, Open, Planned, Pending, Left to request (its note the trade credit held in the tree) and
 * Budget status (a word, its reason in heads). Each tile names its metric, its fields and the records
 * or calculation card behind it. No amount anywhere (7.6): budget status's card shows heads and
 * words only. Pure.
 */
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { CalcSpec } from '@/drill/calc'
import { type DrillSpec, drillSpec, type RequestRecord } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import type { Position } from '@/plan/types'
import type { HeroModel } from '../../types'
import { ID, PARAM } from '../metrics'
import { standardHeadsOf, type TeamFacts } from './facts'
import { TEAM_FIGURES } from './figures'

/** What the tiles read besides the facts. */
export interface TileInput {
  facts: TeamFacts
  /** The pending requests as the viewer's records (the Pending tile's rows). */
  pending: readonly RequestRecord[]
  /** "Sebastian Wagner's team held by …": each giving org's name for the Left to request note. */
  orgName: (positionId: string) => string
}

type Ctx = Pick<AnalyticsContext, 'asOf' | 'metrics'>

/** The words a tile's subtitle and records carry: "As of 30 Sep 2026 · Sebastian Wagner's team". */
export const teamSubtitle = (ctx: Pick<AnalyticsContext, 'asOf'>, facts: TeamFacts): string =>
  [`As of ${formatDate(ctx.asOf)}`, facts.scope?.label].filter(Boolean).join(' · ')

/** The positions behind a count. */
function seatsDrill(
  ctx: Ctx,
  facts: TeamFacts,
  title: string,
  rows: readonly Position[],
  metricId: string,
): () => DrillSpec<'positions'> {
  return () =>
    drillSpec({
      kind: 'positions',
      title,
      subtitle: teamSubtitle(ctx, facts),
      rows,
      uses: ctx.metrics.usesOf(metricId),
    })
}

/** A tile with its definition and fields from the dictionary. */
function tile(ctx: Ctx, metricId: string, k: Omit<Kpi, 'metricId' | 'definition' | 'uses'>): Kpi {
  return {
    ...k,
    metricId,
    definition: ctx.metrics.def(metricId)?.definition,
    uses: ctx.metrics.usesOf(metricId),
  }
}

/**
 * A tile whose value is a word (budget status, unit `text`): the strip prints a `text` value as it
 * is. `Kpi.value` is typed as a number, so the word is carried through that field here, in one
 * place (the shell and exports read it as text through `format: 'text'`).
 */
function wordValue(word: string | null): number | null {
  return word as unknown as number | null
}

/** Heads with their noun: "1 head", "7 heads". */
const heads = (n: number): string => plural(n, 'head')

/** The budget status card: heads and words only, no band cost (7.6). */
export function budgetStatusCard(ctx: Ctx, facts: TeamFacts): CalcSpec {
  const first = facts.months[0] ?? null
  const status = facts.status
  const most = facts.months.reduce<number | null>((max, m) => {
    const withPending = facts.effects.filter((e) => e.month <= m.month).reduce((n, e) => n + e.heads, m.heads)
    return max == null || withPending > max ? withPending : max
  }, null)
  const share = ctx.metrics.num(PARAM.atRiskShare.metricId, PARAM.atRiskShare.key)
  return {
    title: 'Budget status',
    subtitle: teamSubtitle(ctx, facts),
    metricId: ID.budgetStatus,
    value: null,
    format: 'text',
    inputs: [
      {
        label: 'Allocation',
        value: facts.allocation.heads,
        format: 'int',
        source: facts.planOfRecord
          ? `${facts.planOfRecord.name}, seats at fiscal year end, with changes approved since it locked`
          : 'No plan of record',
      },
      {
        label: 'Staffed at the as-of month-end',
        value: first?.heads ?? null,
        format: 'int',
        source: 'HRIS and accepted offers',
      },
      {
        label: 'Pending requests counted',
        value: facts.effects.length,
        format: 'int',
        source: 'Requests for your team that you can see',
      },
      { label: 'At risk within', value: share, format: 'pct', source: 'Metric definitions' },
    ],
    steps: [
      {
        label: 'Staffed heads at the as-of month-end, against the allocation',
        expression: first ? `${heads(first.heads)} of ${heads(facts.allocation.heads)}` : '—',
        result: first?.heads ?? null,
        format: 'int',
      },
      {
        label: 'Most heads at any month-end to fiscal year end, with pending requests',
        expression: most == null ? '—' : heads(most),
        result: most,
        format: 'int',
      },
      {
        label: 'Budget status',
        expression: status?.text ?? facts.empty ?? '—',
        result: null,
        format: 'text',
      },
    ],
    note: 'Band cost (band midpoint × FTE) is compared inside the status and never shown.',
    uses: ctx.metrics.usesOf(ID.budgetStatus),
  }
}

/** The seven key figures in 9.3's order (`TEAM_KEY_METRICS`). */
export function teamKpis(ctx: Ctx, input: TileInput): Kpi[] {
  const { facts } = input
  const a = facts.allocation
  const ready = !!facts.planOfRecord
  const v = (n: number): number | null => (ready ? n : null)
  const why = facts.empty ?? undefined
  const sh = facts.standardHeads
  const credit = facts.credit.map(
    (c) =>
      `${fmt(standardHeadsOf(c.creditBp), 'num2')} standard heads held by ${input.orgName(c.orgPositionId)}`,
  )
  return [
    tile(ctx, ID.allocationHeads, {
      id: 'team-allocation',
      label: 'Allocation',
      value: v(a.heads),
      format: 'int',
      note: ready
        ? sh != null
          ? `${heads(a.heads)}, ${fmt(sh, 'num2')} standard heads`
          : heads(a.heads)
        : why,
      formula: ready
        ? `${fmt(a.filled)} Filled + ${fmt(a.open)} Open + ${fmt(a.planned)} Planned.`
        : undefined,
      drill: seatsDrill(ctx, facts, 'Seats in your allocation', facts.seats.all, ID.allocationHeads),
    }),
    tile(ctx, ID.allocationFilled, {
      id: 'team-filled',
      label: 'Filled',
      value: v(a.filled),
      format: 'int',
      drill: seatsDrill(
        ctx,
        facts,
        'Filled seats in your allocation',
        facts.seats.filled,
        ID.allocationFilled,
      ),
    }),
    tile(ctx, ID.allocationOpen, {
      id: 'team-open',
      label: 'Open',
      value: v(a.open),
      format: 'int',
      drill: seatsDrill(ctx, facts, 'Open seats in your allocation', facts.seats.open, ID.allocationOpen),
    }),
    tile(ctx, ID.allocationPlanned, {
      id: 'team-planned',
      label: 'Planned',
      value: v(a.planned),
      format: 'int',
      drill: seatsDrill(
        ctx,
        facts,
        'Planned seats in your allocation',
        facts.seats.planned,
        ID.allocationPlanned,
      ),
    }),
    tile(ctx, ID.requestsPending, {
      id: 'team-pending',
      label: 'Pending requests',
      value: facts.scope ? input.pending.length : null,
      format: 'int',
      note: 'Not in the allocation until approved',
      drill: () =>
        drillSpec({
          kind: 'requests',
          title: 'Pending requests for your team',
          subtitle: teamSubtitle(ctx, facts),
          rows: input.pending,
          uses: ctx.metrics.usesOf(ID.requestsPending),
        }),
    }),
    tile(ctx, ID.allocationLeftToRequest, {
      id: 'team-left-to-request',
      label: 'Left to request',
      value: v(a.leftToRequest),
      format: 'int',
      note: credit.length ? `Trade credit: ${credit.join('; ')}` : undefined,
      drill: seatsDrill(
        ctx,
        facts,
        'Planned seats with no req or recruiting request',
        facts.leftToRequest,
        ID.allocationLeftToRequest,
      ),
    }),
    tile(ctx, ID.budgetStatus, {
      id: 'team-budget-status',
      label: 'Budget status',
      value: wordValue(facts.status?.status ?? null),
      format: 'text',
      note: facts.status
        ? (facts.status.reason ?? 'Staffed and pending requests stay within your allocation')
        : why,
      calc: () => budgetStatusCard(ctx, facts),
    }),
  ]
}

/** The hero: Left to fill, split Open, requested and left to request (the parts add up to it). */
export function teamHero(ctx: Ctx, facts: TeamFacts): HeroModel {
  const a = facts.allocation
  const ready = !!facts.planOfRecord
  return {
    id: TEAM_FIGURES.hero,
    metric: ID.allocationLeftToFill,
    title: 'Left to fill',
    subtitle: `Open and Planned seats in your ${facts.fiscalYear} allocation`,
    value: ready ? a.leftToFill : null,
    format: 'int',
    label: 'left to fill',
    parts: ready
      ? [
          {
            key: 'open',
            label: 'Open',
            count: a.open,
            drill: seatsDrill(
              ctx,
              facts,
              'Open seats in your allocation',
              facts.seats.open,
              ID.allocationOpen,
            ),
          },
          {
            key: 'requested',
            label: 'Requested',
            count: a.requested,
            // Requested reads the reqs and pending Start recruiting requests, as Left to request does.
            drill: seatsDrill(
              ctx,
              facts,
              'Planned seats with a req or a recruiting request',
              facts.requested,
              ID.allocationLeftToRequest,
            ),
          },
          {
            key: 'left-to-request',
            label: 'Left to request',
            count: a.leftToRequest,
            drill: seatsDrill(
              ctx,
              facts,
              'Planned seats with no req or recruiting request',
              facts.leftToRequest,
              ID.allocationLeftToRequest,
            ),
          },
        ]
      : [],
    comparison: null,
    drill: seatsDrill(
      ctx,
      facts,
      'Open and Planned seats in your allocation',
      [...facts.seats.open, ...facts.seats.planned],
      ID.allocationLeftToFill,
    ),
    note: ready ? 'Pending requests join the allocation once they are approved.' : null,
    reason: ready ? null : facts.empty,
    uses: ctx.metrics.usesOf(ID.allocationLeftToFill),
  }
}
