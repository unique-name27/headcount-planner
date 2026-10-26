/**
 * My team's model (docs/PLAN.md 6.9, 9.3, 11.4 and 11.5): Manager mode's home, one manager's tree in
 * heads only. The hero is Left to fill (Open + Planned seats in the allocation), split Open, requested
 * (Planned − Left to request) and left to request, the parts adding up to the hero; the seven key
 * figures (allocation, filled, open, planned, pending, left to request, budget status as a word with
 * its reason in heads); My list is the request tracker; the one other figure is heads by month to FY
 * end against the allocation. Standard heads show only as the Allocation tile's note, and the trade
 * credit of every giving org in the tree in Left to request's note. One model per analytics context
 * (`teamModel`, cached in a WeakMap).
 *
 * No amount of any kind (7.6): budget status reads band cost internally and shows words and heads;
 * this folder imports no cost or pay module (`rules.test.ts`). It raises no Action center items
 * (9.6): Needs attention is the Action center's split for Manager mode (`TEAM_NEEDS`).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md). The views-4 builder may add fields, never rename or
 * retype these. Added: the tracker's own row type (`TeamTrackerRow`, a `RequestRecord` with where it
 * is). The model carries only what the page shows: the engine inputs (`teamFacts`, with the plan of
 * record and band cost) stay out of it, so nothing that serializes the model can carry an amount
 * (tests read `teamFacts(ctx)` directly).
 */
import type { Column } from '@/charts/types'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { Month } from '@/data/schema'
import { holderNamesOf, seatStateOf } from '@/drill/seats'
import type { RequestRecord } from '@/drill/types'
import { formatMonthShort } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { linkLabel, tile } from '@/views/home/engine/kpis'
import type { HrbpChangeRow } from '@/views/plan/engine'
import { hiringOpenLabel, OPEN_TO_HIRE_NOTE, planHiringModel } from '@/views/plan/engine/hiringTab'
import { CHANGE_COLUMNS, changeRows } from '@/views/plan/engine/notes'
import type { FigureData, Headline, HeroModel } from '../../types'
import { HEADS_VS_ALLOCATION_USES, ID, TRACKER_USES } from '../metrics'
import { type TeamFacts, teamFacts } from './facts'
import { TEAM_FIGURES, TEAM_HIRING } from './figures'
import { teamHero, teamKpis, teamSubtitle } from './kpis'
import { TRACKER_COLUMNS, trackerRows } from './tracker'

export type { TeamFacts } from './facts'
export type { TeamTrackerRow } from './tracker'

/** Heads by month to FY end against the allocation (`team-heads-vs-allocation`). */
export interface AllocationMonthRow {
  month: Month
  label: string
  /** Staffed heads at the month-end (R32). */
  staffed: number
  /** Staffed plus the head effect of pending requests from their start (the crossing test). */
  withPending: number
  allocation: number
}

/** A giving org's trade credit (11.2), in basis points of a standard head (no amount). */
export interface TeamTradeCredit {
  orgPositionId: string
  org: string
  creditBp: number
}

export interface TeamModel {
  hero: HeroModel
  /** The seven key figures in 9.3's order (`TEAM_KEY_METRICS`). */
  kpis: Kpi[]
  /** My list: the request tracker (type, state, step, owner, days in step, then the req's dates). */
  tracker: FigureData<RequestRecord>
  headsVsAllocation: FigureData<AllocationMonthRow>
  /** The allocation in standard heads (`team.trade.standardHeads`), for the Allocation tile's note. */
  standardHeads: number | null
  tradeCredit: readonly TeamTradeCredit[]
  /**
   * "Changed by your HRBP" (9.4): the HRBP's Working edits of the tree's seats, newest first, each with
   * its reason (no amount: refused at entry, 8.4 rule 5). An addition of the plan-ui builder (M3).
   */
  hrbpChanges: FigureData<HrbpChangeRow>
  /**
   * Plan > Hiring's Open to hire tile for the tree, beside the hero (docs/PLAN.md 9.7; figures.ts
   * `TEAM_HIRING`): the tab's own tile, labelled "Open to hire, FY27", linking to Plan > Hiring, with
   * `OPEN_TO_HIRE_NOTE` after the tab's own note. Null with no tree to read (no Acting as pick).
   */
  openToHire?: Kpi | null
}

/** An org seat's name for the trade credit note: "Dana Ito's team", else the seat's title and ID. */
function orgNamer(ctx: AnalyticsContext): (positionId: string) => string {
  const holders = holderNamesOf(ctx)
  return (id) => {
    const who = holders.get(id)
    if (who) return `${who}’s team`
    const title = seatStateOf(ctx, id)?.position.title
    return title ? `${title} (${id})` : id
  }
}

const ALLOCATION_COLUMNS: readonly Column<AllocationMonthRow>[] = [
  { key: 'label', label: 'Month', sortValue: (r) => r.month },
  { key: 'staffed', label: 'Staffed heads', format: 'int' },
  { key: 'withPending', label: 'With pending requests', format: 'int' },
  { key: 'allocation', label: 'Allocation', format: 'int' },
]

function headsVsAllocation(ctx: AnalyticsContext, facts: TeamFacts): FigureData<AllocationMonthRow> {
  const rows: AllocationMonthRow[] = facts.months.map((m) => ({
    month: m.month,
    label: formatMonthShort(m.month, true),
    staffed: m.heads,
    withPending: facts.effects.filter((e) => e.month <= m.month).reduce((n, e) => n + e.heads, m.heads),
    allocation: facts.allocation.heads,
  }))
  return {
    id: TEAM_FIGURES.headsVsAllocation,
    metric: ID.allocationHeads,
    title: 'Heads by month against your allocation',
    subtitle: `Staffed heads at each month-end to ${facts.fiscalYear} year end, with and without pending requests`,
    rows,
    columns: ALLOCATION_COLUMNS,
    note: rows.length ? teamSubtitle(ctx, facts) : null,
    empty: facts.empty ?? (rows.length ? null : 'No month-ends left in this fiscal year.'),
    // Heads only (B4): the band cost behind budget status is not drawn here.
    uses: HEADS_VS_ALLOCATION_USES,
  }
}

/** The HRBP's Working edits of the tree's seats (src/views/plan/engine/notes.ts), as My team lists them. */
function hrbpChanges(ctx: AnalyticsContext, facts: TeamFacts): FigureData<HrbpChangeRow> {
  const ids = facts.scope?.positionIds ?? new Set<string>()
  const rows = changeRows(ctx, ids, (id) => seatStateOf(ctx, id)?.position.title ?? null)
  return {
    id: TEAM_FIGURES.hrbpChanges,
    metric: ID.allocationHeads,
    title: 'Changed by your HRBP',
    subtitle: 'Start, level, location, FTE and hold changes your HRBP made to your Open and Planned seats',
    rows,
    columns: CHANGE_COLUMNS,
    note: rows.length ? teamSubtitle(ctx, facts) : null,
    empty: rows.length ? null : facts.scope ? 'Your HRBP has not changed any of your seats.' : facts.empty,
    // Audit entries are plan state with no dataset tier: the rows name the tree's seats and their titles.
    uses: ['positions.positionId', 'positions.managerPositionId', 'positions.title'],
  }
}

/** "Over by 1." then the note on the two counts, or the note alone. */
const withNote = (own: string | undefined, note: string): string =>
  own ? `${own.replace(/[\s.]+$/, '')}. ${note}` : note

/**
 * My team's Open to hire (9.7 Homes): Plan > Hiring's headline tile for the tree, re-linked to Plan >
 * Hiring under 9.7's label, with the note that sets it against Left to fill. Plan > Hiring is its own
 * model (reading H10), read only once a manager is picked (an unset pick holds an empty tree); the
 * tile is the tab's, never recomputed here.
 */
function openToHireTile(ctx: AnalyticsContext, facts: TeamFacts): Kpi | null {
  if (!facts.scope || ctx.access.unset) return null
  const m = planHiringModel(ctx)
  const [t] = tile(m.kpis, TEAM_HIRING.metricId, {
    view: TEAM_HIRING.view,
    tab: TEAM_HIRING.tab,
    label: linkLabel(TEAM_HIRING.view, TEAM_HIRING.tab),
  })
  if (!t) return null
  return { ...t, label: hiringOpenLabel(m.fiscalYear), note: withNote(t.note, OPEN_TO_HIRE_NOTE) }
}

function computeTeam(ctx: AnalyticsContext): TeamModel {
  const facts = teamFacts(ctx)
  const tracker = trackerRows(facts.requests, ctx)
  const pending = tracker.filter(
    (r) => r.state === 'Submitted' || r.state === 'In review' || r.state === 'Sent back',
  )
  const orgName = orgNamer(ctx)
  const trackerFigure: FigureData<RequestRecord> = {
    id: TEAM_FIGURES.tracker,
    metric: ID.requestsPending,
    title: 'Request tracker',
    subtitle:
      'Your team’s requests: where each one is and who it waits on, then the req’s dates once approved',
    rows: tracker,
    columns: TRACKER_COLUMNS,
    note: tracker.length ? teamSubtitle(ctx, facts) : null,
    empty: tracker.length ? null : facts.scope ? 'No requests for your team yet.' : facts.empty,
    uses: TRACKER_USES,
  }
  return {
    hero: teamHero(ctx, facts),
    kpis: teamKpis(ctx, { facts, pending, orgName }),
    tracker: trackerFigure,
    headsVsAllocation: headsVsAllocation(ctx, facts),
    standardHeads: facts.standardHeads,
    tradeCredit: facts.credit.map((c) => ({
      orgPositionId: c.orgPositionId,
      org: orgName(c.orgPositionId),
      creditBp: c.creditBp,
    })),
    hrbpChanges: hrbpChanges(ctx, facts),
    openToHire: openToHireTile(ctx, facts),
  }
}

const cache = new WeakMap<AnalyticsContext, TeamModel>()

/** My team's model for a context (cached per context). */
export function teamModel(ctx: AnalyticsContext): TeamModel {
  const hit = cache.get(ctx)
  if (hit) return hit
  const model = computeTeam(ctx)
  cache.set(ctx, model)
  return model
}

/** The folder tab's number: left to fill, in heads (9.1). */
export function teamHeadline(ctx: AnalyticsContext): Headline {
  const { hero } = teamModel(ctx)
  return {
    value: fmt(hero.value, 'int'),
    label: 'left to fill',
    metricId: ID.allocationLeftToFill,
    uses: hero.uses,
  }
}
