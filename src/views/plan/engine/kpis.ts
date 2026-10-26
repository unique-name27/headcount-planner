/**
 * The Plan view's tiles (docs/PLAN.md 9.4): Overview's six (approved heads, actual heads against the
 * comparison's plan heads, openings, openings past target start, average FTE year to date, loaded
 * cost year to date against the comparison), plus in HRBP and Leader mode the one leave count (7.7,
 * `plan.leave.onLeave`, last), and the strips of Positions, Openings and Transfers.
 * Counted tiles open exactly their rows, weighted ones rows whose "Counts as" adds up to the value,
 * and cost tiles their calculation card from the guard's output. Every tile has `metricId`, `uses`
 * and a `drill` or `calc`; every "vs" figure names its comparison. The mode's hidden metrics are left
 * out (`kpisInMode`), so the model holds what the strip shows. Pure.
 */
import { leaveCountOf } from '@/access/leaveScopes'
import { kpisInMode } from '@/access/numbers'
import type { Kpi } from '@/components/types'
import type { CostMember, GuardedFigure } from '@/cost/guard'
import { fyRange, monthEnd } from '@/data/fiscal'
import { calcInput, calcStep } from '@/drill/calc'
import { asOfLine, subtitleOf } from '@/drill/subtitle'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { emptyComparisonReason } from '@/plan/engine/variance'
import { ID } from '../metrics'
import { monthLabel, type Prep } from './base'
import { shownLines, versionLinesOf } from './core'
import { bandCard, costCard, differenceCard, planCost } from './cost'
import { assignmentsSpec, monthEndLine, positionsSpec, reqsSpec, workersSpec } from './drill'
import { tagKpis } from './drillUses'
import { guardFigure, membersOf } from './guarded'
import { actualOn, fteShare, planHeadsAt, seatsOnDay, ytdDays } from './heads'
import { hiresOf } from './hires'
import { FIGURE } from './lineage'
import { median, openingsOf } from './openings'
import { positionsGrid } from './positionsTab'
import { transfersOf, transfersSpec } from './transfers'

/** The money format of the mode: whole $0.1M steps in rounded modes, compact USD otherwise. */
export const moneyFormat = (p: Prep) => (p.env.mode === 'rounded' ? ('moneyM' as const) : ('money' as const))

const shown = (p: Prep, kpis: Kpi[]): Kpi[] => tagKpis(kpisInMode(p.ctx.access, kpis))

/**
 * Why a monthly or YTD "vs" tile has no change: a target has no monthly plan (9.2). "A target has no
 * monthly plan. Pick a version to compare." when the year has a locked version, "FY28 has no locked
 * version yet." when it has none; null under a version comparison. It goes on the change row
 * (`deltaEmpty`), never in place of the tile's own note.
 */
export function noMonthsReason(p: Prep): string | null {
  if (p.comparison) return null
  const locked = p.ctx.versions.some((x) => x.state === 'locked' && x.fiscalYear === p.fiscalYear)
  return emptyComparisonReason(p.fiscalYear, locked)
}

const pastStartNote = (frozen: number): string =>
  frozen ? `${fmt(frozen, 'int')} of them held by a freeze` : 'Target start before the as-of date'

/* ───────────── tiles ───────────── */

export function approvedTile(p: Prep): Kpi {
  const day = seatsOnDay(p, p.headsOn)
  const n = (s: string) => day.approved.filter((id) => day.states.get(id)?.status === s).length
  return {
    id: 'approved',
    metricId: ID.headsApproved,
    label: 'Approved heads',
    value: day.approved.length,
    format: 'int',
    goodDirection: null,
    note: `${fmt(n('Filled'), 'int')} Filled, ${fmt(n('Open'), 'int')} Open, ${fmt(n('Planned'), 'int')} Planned`,
    formula: `${fmt(n('Filled'), 'int')} Filled + ${fmt(n('Open'), 'int')} Open + ${fmt(n('Planned'), 'int')} Planned on ${p.headsOnLabel}.`,
    tab: 'positions',
    definition: p.text(ID.headsApproved),
    drill: () => positionsSpec(p, 'Approved heads', day.approved, { on: p.headsOn }),
    uses: p.uses(FIGURE.approved),
  }
}

export function actualTile(p: Prep): Kpi {
  const active = actualOn(p)
  const v = p.comparison
  const planIds = v ? planHeadsAt(versionLinesOf(p.ctx, v), p.planMonth, p.scope.ids) : null
  const notInPlan = [...active.values()].filter((e) => !e.assignment.positionId).length
  const at = monthLabel(p.planMonth)
  const empty = noMonthsReason(p)
  return {
    id: 'actual',
    metricId: ID.headsActual,
    label: 'Actual heads',
    value: active.size,
    format: 'int',
    delta: planIds ? active.size - planIds.length : null,
    deltaLabel: p.vs,
    ...(empty ? { deltaEmpty: empty } : {}),
    goodDirection: null,
    note: notInPlan
      ? `${plural(notInPlan, 'person', 'people')} not in the plan included`
      : v
        ? `Plan heads at the ${at} month-end: ${fmt(planIds?.length ?? 0, 'int')}`
        : `Employees on ${formatDate(p.ctx.asOf)}`,
    formula: v
      ? `${plural(active.size, 'employee')} on ${formatDate(p.ctx.asOf)} − ${plural(planIds?.length ?? 0, 'plan head')} in ${v.name} at the ${at} month-end.`
      : `${plural(active.size, 'employee')} on ${formatDate(p.ctx.asOf)}.`,
    tab: 'overview',
    definition: p.text(ID.headsActual),
    drill: () =>
      workersSpec(
        p,
        'Actual heads',
        [...active.values()].map((e) => e.worker),
      ),
    ...(v && planIds
      ? {
          deltaDrill: () =>
            positionsSpec(p, `Plan heads in ${v.name}`, planIds, {
              on: monthEnd(p.planMonth),
              subtitle: monthEndLine(p.ctx, p.planMonth, v.name),
            }),
        }
      : {}),
    uses: p.uses(FIGURE.actualVsPlan),
  }
}

export function openingsTile(p: Prep): Kpi {
  const o = openingsOf(p)
  const open = o.list.filter((x) => x.state.status === 'Open').length
  return {
    id: 'openings',
    metricId: ID.openingsCount,
    label: 'Openings',
    value: o.list.length,
    format: 'int',
    goodDirection: null,
    note: `${fmt(open, 'int')} Open, ${fmt(o.list.length - open, 'int')} Planned`,
    formula: `${fmt(open, 'int')} Open + ${fmt(o.list.length - open, 'int')} Planned: the seats nobody has started in.`,
    tab: 'openings',
    definition: p.text(ID.openingsCount),
    drill: () =>
      positionsSpec(
        p,
        'Openings',
        o.list.map((x) => x.positionId),
      ),
    uses: p.uses(FIGURE.openings),
  }
}

export function pastStartTile(p: Prep): Kpi {
  const o = openingsOf(p)
  return {
    id: 'past-start',
    metricId: ID.openingsPastStart,
    label: 'Openings past target start',
    value: o.pastStart.length,
    format: 'int',
    goodDirection: 'down',
    note: pastStartNote(o.pastStart.filter((x) => x.frozenBy != null).length),
    formula: `Openings whose target start is before ${p.onLabel}.`,
    tab: 'openings',
    definition: p.text(ID.openingsPastStart),
    drill: () =>
      positionsSpec(
        p,
        'Openings past target start',
        o.pastStart.map((x) => x.positionId),
      ),
    uses: p.uses(FIGURE.pastStart),
  }
}

export function fteTile(p: Prep): Kpi {
  const window = ytdDays(p)
  const started = p.on >= window.start
  const list = started ? p.scope.assignments.filter((a) => fteShare(a, window) > 0) : []
  let value: number | null = started ? 0 : null
  for (const a of list) value = (value ?? 0) + fteShare(a, window)
  return {
    id: 'fte-ytd',
    metricId: ID.fteAverage,
    label: 'Average FTE YTD',
    value,
    format: 'num1',
    goodDirection: null,
    note: started
      ? `${formatDate(window.start)} to ${formatDate(window.end)}`
      : `${p.fiscalYear} has not started yet`,
    formula: `Σ over days of the active employees' FTE ÷ the days from ${formatDate(window.start)} to ${formatDate(window.end)}.`,
    definition: p.text(ID.fteAverage),
    drill: () =>
      assignmentsSpec(p, 'Average FTE year to date', list, (a) => fteShare(a, window), {
        subtitle: subtitleOf(`${formatDate(window.start)} – ${formatDate(window.end)}`, p.ctx.scopeLabel),
        note: 'Each assignment counts as its FTE times the share of the window it was active.',
      }),
    uses: p.uses(FIGURE.fte),
  }
}

export function costYtdTile(p: Prep): Kpi {
  const c = planCost(p)
  // Cost to date: in rounded modes it ends at the last close on or before the as-of date (7.3b).
  const ytd = p.costYtdMonths
  const fig = ytd.length ? (c.ytd?.figure ?? null) : null
  const value = fig?.total.totalUsd ?? null
  const delta = fig ? c.ytdDelta : null
  // A year that has started but has no close by the as-of date in a rounded mode says so; a year that
  // has not started (FY28 Working) has no closed month in any mode.
  const started = p.on >= fyRange(p.fiscalYear).start
  const reason = !ytd.length
    ? p.env.mode === 'rounded' && started
      ? `No month of ${p.fiscalYear} is closed by ${p.onLabel}. Cost to date shows to the last closed month-end in this mode.`
      : `${p.fiscalYear} has no closed month yet.`
    : (fig?.reason ?? fig?.total.reason ?? (fig ? null : 'No version to show.'))
  const window = ytd.length
    ? `${monthLabel(ytd[0])} to ${monthLabel(ytd[ytd.length - 1])}`
    : 'No closed month in this year yet'
  const label = 'Loaded cost YTD'
  const empty = c.noDelta
  return {
    id: 'cost-ytd',
    metricId: ID.costLoaded,
    label,
    value,
    format: moneyFormat(p),
    delta: delta?.value ?? null,
    deltaLabel: p.vs,
    ...(empty ? { deltaEmpty: empty } : {}),
    goodDirection: 'down',
    note: fig?.note ?? window,
    ...(value == null ? { suppressed: true, suppressedNote: reason ?? undefined } : {}),
    // With no closed month the formula is the period's own empty state (RC-7), not a window.
    formula: ytd.length
      ? `Loaded cost from ${window}${p.version?.state === 'working' ? ', closed months at actual (HRIS estimate)' : ''}.`
      : (reason ?? `${p.fiscalYear} has no closed month yet.`),
    definition: p.text(ID.costLoaded),
    ...(!fig
      ? {
          // No figure to card (no closed month, or no version): the card says why, as one step.
          calc: () => ({
            title: `${label}, ${p.version?.name ?? ''}`,
            subtitle: asOfLine(p.on, p.ctx.scopeLabel),
            metricId: ID.costLoaded,
            value: null,
            format: moneyFormat(p),
            inputs: [],
            steps: [{ label: reason ?? 'Hidden', expression: '—', result: null, format: moneyFormat(p) }],
            uses: p.uses(FIGURE.cost),
          }),
        }
      : {}),
    ...(fig
      ? {
          calc: () =>
            costCard(p, {
              title: `${label}, ${p.version?.name ?? ''}`,
              metricId: ID.costLoaded,
              figure: fig,
              ...(c.ytdComparison
                ? { comparison: { label: p.vs, value: c.ytdComparison.figure.total.totalUsd } }
                : {}),
              uses: p.uses(FIGURE.cost),
            }),
          deltaCalc: () =>
            differenceCard(p, {
              title: `${label} ${p.vs}`,
              metricId: ID.costLoaded,
              a: fig,
              b: c.ytdComparison?.figure ?? null,
              aLabel: p.version?.name ?? 'Shown',
              bLabel: p.comparison?.name ?? 'Comparison',
              delta,
              noDelta: c.noDelta,
              uses: p.uses(FIGURE.cost),
            }),
        }
      : {}),
    uses: p.uses(FIGURE.cost),
  }
}

/* ───────────── Openings strip ───────────── */

export function frozenTile(p: Prep): Kpi {
  const o = openingsOf(p)
  return {
    id: 'frozen',
    metricId: ID.openingsFrozen,
    label: 'Openings under a freeze',
    value: o.frozen.length,
    format: 'int',
    goodDirection: null,
    note: o.frozen.length ? 'Held by the forecast until the freeze ends' : 'No freeze holds an opening',
    formula: `Open and Planned seats with no accepted offer in an org frozen on ${p.onLabel}.`,
    tab: 'openings',
    definition: p.text(ID.openingsFrozen),
    drill: () =>
      positionsSpec(
        p,
        'Openings under a freeze',
        o.frozen.map((x) => x.positionId),
      ),
    uses: p.uses(FIGURE.frozen),
  }
}

export function noReqTile(p: Prep): Kpi {
  const o = openingsOf(p)
  const days = p.set.noReqDays
  return {
    id: 'no-req',
    metricId: ID.openingsNoReq,
    label: 'Planned seats near start with no req',
    value: o.nearNoReq.length,
    format: 'int',
    goodDirection: 'down',
    note: `Starting within ${plural(days, 'day')}`,
    formula: `Planned seats starting from ${p.onLabel} to ${p.onLabel} + ${plural(days, 'day')} with no req.`,
    tab: 'openings',
    definition: p.text(ID.openingsNoReq),
    drill: () =>
      positionsSpec(
        p,
        'Planned seats near start with no req',
        o.nearNoReq.map((x) => x.positionId),
      ),
    uses: p.uses(FIGURE.noReq),
  }
}

export function hiresTile(p: Prep): Kpi {
  const h = hiresOf(p)
  const window = h.months.length
    ? `${monthLabel(h.months[0])} to ${monthLabel(h.months[h.months.length - 1])}`
    : 'No closed month in this year yet'
  const empty = h.planned ? null : noMonthsReason(p)
  return {
    id: 'hires-ytd',
    metricId: ID.hiresYtd,
    label: 'Hires YTD',
    value: h.hired.length,
    format: 'int',
    delta: h.planned ? h.hired.length - h.planned.length : null,
    deltaLabel: p.vs,
    ...(empty ? { deltaEmpty: empty } : {}),
    goodDirection: null,
    note: h.planned ? `${fmt(h.planned.length, 'int')} planned in ${p.comparison?.name}` : window,
    formula: h.planned
      ? `${plural(h.hired.length, 'employee')} hired ${window} − ${plural(h.planned.length, 'planned hire')} in ${p.comparison?.name}.`
      : `${plural(h.hired.length, 'employee')} hired ${window}.`,
    tab: 'openings',
    definition: p.text(ID.hiresYtd),
    drill: () => {
      const subtitle = subtitleOf(window, p.ctx.scopeLabel)
      const note =
        'Employees hired in the window into a seat in scope; internal moves and transfers are not hires.'
      // A mode that lists no people (Manager) opens the seats they were hired into, when one each.
      const seats = [...new Set(h.hired.map((w) => w.positionId as string))]
      return !p.ctx.access.can('drill:workers') && seats.length === h.hired.length
        ? positionsSpec(p, 'Seats filled by hires year to date', seats.sort(), { subtitle, note })
        : workersSpec(p, 'Hires year to date', h.hired, { subtitle, note })
    },
    ...(h.planned
      ? {
          deltaDrill: () =>
            positionsSpec(p, `Planned hires in ${p.comparison?.name}`, h.planned ?? [], {
              subtitle: subtitleOf(window, p.ctx.scopeLabel, p.comparison?.name),
              note: 'Seats whose plan line first counts a head in the window, leaving out seats Filled at the year start and seats a transfer fills.',
              // These records read the transfers that keep a seat out (requests); the tile does not.
              uses: p.uses(FIGURE.hiresPlanned),
            }),
        }
      : {}),
    uses: p.uses(FIGURE.hiresVsPlanned),
  }
}

export function offersTile(p: Prep): Kpi {
  const o = openingsOf(p)
  return {
    id: 'offers',
    metricId: ID.offersAccepted,
    label: 'Accepted offers not started',
    value: o.offers.length,
    format: 'int',
    goodDirection: null,
    note: 'Dates only: terms come from the recruiting system',
    formula: `Reqs at stage Offer accepted whose start is after ${formatDate(p.ctx.asOf)}.`,
    tab: 'openings',
    definition: p.text(ID.offersAccepted),
    drill: () =>
      positionsSpec(
        p,
        'Accepted offers not started',
        o.offers.map((x) => x.positionId),
      ),
    uses: p.uses(FIGURE.offers),
  }
}

export function reqsNotInPlanTile(p: Prep): Kpi {
  const o = openingsOf(p)
  return {
    id: 'reqs-not-in-plan',
    metricId: ID.reqsNotInPlan,
    label: 'Reqs not in plan',
    value: o.reqsNotInPlan.length,
    format: 'int',
    goodDirection: 'down',
    note: o.reqsNotInPlan.length
      ? 'Close them in the recruiting system'
      : 'Every open req has an approved head',
    formula: `Open and On hold reqs on ${formatDate(p.ctx.asOf)} with no approved head behind them.`,
    tab: 'openings',
    definition: p.text(ID.reqsNotInPlan),
    drill: () =>
      reqsSpec(p, 'Reqs not in plan', o.reqsNotInPlan, {
        note: 'The app never edits reqs: close them in the recruiting system.',
      }),
    uses: p.uses(FIGURE.reqsNotInPlan),
  }
}

export function ageTile(p: Prep): Kpi {
  const o = openingsOf(p)
  const open = o.list.filter((x) => x.age != null)
  const value = median(open.map((x) => x.age as number))
  return {
    id: 'age',
    metricId: ID.openingsAge,
    label: 'Opening age',
    value,
    format: 'days',
    goodDirection: 'down',
    note: `Median over ${plural(open.length, 'Open seat')}`,
    formula: `The median of the days from each Open seat's opening to ${p.onLabel}.`,
    tab: 'openings',
    definition: p.text(ID.openingsAge),
    calc: () => ({
      title: 'Opening age',
      subtitle: asOfLine(p.on, p.ctx.scopeLabel),
      metricId: ID.openingsAge,
      value,
      format: 'days',
      inputs: [calcInput('Open seats', open.length, 'int', 'Open seats with an opening date')],
      steps: [
        calcStep(
          'Median of the days since each seat opened',
          open.length ? `median of ${fmt(open.length, 'int')} ages` : 'No Open seat',
          value,
          'days',
        ),
      ],
      uses: p.uses(FIGURE.age),
    }),
    // The note's count: the Open seats the median is over.
    noteDrill: () =>
      positionsSpec(
        p,
        'Open seats behind the opening age',
        open.map((x) => x.positionId),
      ),
    uses: p.uses(FIGURE.age),
  }
}

/* ───────────── Positions strip ───────────── */

export function positionsCountTile(p: Prep): Kpi {
  const g = positionsGrid(p)
  return {
    id: 'positions',
    metricId: ID.positionsByStatus,
    label: 'Positions',
    value: g.rows.length,
    format: 'int',
    goodDirection: null,
    note: `In ${p.version?.name ?? 'the version'}'s grid`,
    formula: `Positions in scope that exist in some month of ${p.version?.name ?? 'the version'}.`,
    definition: p.text(ID.positionsByStatus),
    drill: () =>
      positionsSpec(
        p,
        'Positions in the grid',
        g.rows.map((r) => r.positionId),
      ),
    uses: p.uses(FIGURE.gridCount),
  }
}

export function yearEndPlanTile(p: Prep): Kpi {
  const v = p.version
  const last = p.fyMonths[p.fyMonths.length - 1]
  const ids = v ? planHeadsAt(versionLinesOf(p.ctx, v), last, p.scope.ids) : []
  return {
    id: 'plan-year-end',
    metricId: ID.headsPlan,
    label: 'Plan heads at year end',
    value: v ? ids.length : null,
    format: 'int',
    goodDirection: null,
    note: `${monthLabel(last)} month-end, ${v?.name ?? ''}`,
    formula: `Positions whose plan line in ${v?.name ?? 'the version'} is Filled at ${formatDate(fyRange(p.fiscalYear).end)}.`,
    definition: p.text(ID.headsPlan),
    drill: () =>
      positionsSpec(p, `Plan heads at year end, ${v?.name ?? ''}`, ids, {
        on: monthEnd(last),
        subtitle: monthEndLine(p.ctx, last, v?.name),
      }),
    uses: p.uses(FIGURE.plan),
  }
}

export function standardHeadsTile(p: Prep): Kpi {
  const g = positionsGrid(p)
  const rows = g.rows.filter((r) => r.approvedHead && r.standardHeads != null)
  let value = 0
  for (const r of rows) value += r.standardHeads as number
  const any = g.rows.some((r) => r.standardHeads != null)
  return {
    id: 'standard-heads',
    metricId: ID.tradeWeight,
    label: 'Standard heads',
    value: any ? value : null,
    format: 'num2',
    goodDirection: null,
    note: `${plural(rows.length, 'approved head')}, weighted by band`,
    // Manager mode shows no band estimate (7.6): its formula names the weight, as its definition
    // does (M4 recheck HL-8-a).
    formula: p.ctx.access.can('cost:band')
      ? `Σ weight of the approved heads on ${p.headsOnLabel} (band estimate ÷ standard head).`
      : `Σ weight of the approved heads on ${p.headsOnLabel} (what each seat’s level and location are worth at its FTE, in standard heads).`,
    definition: p.text(ID.tradeWeight),
    drill: () =>
      positionsSpec(
        p,
        'Standard heads of the approved heads',
        rows.map((r) => r.positionId),
        {
          weight: (pos) => rows.find((r) => r.positionId === pos.positionId)?.standardHeads ?? 0,
          note: 'Each seat counts as its weight in standard heads.',
        },
      ),
    uses: p.uses(FIGURE.weight),
  }
}

export function openBandTile(p: Prep): Kpi {
  const v = p.version
  const band = v ? fyBand(p) : null
  const fig = band?.figure ?? null
  const value = fig?.total.bandUsd ?? null
  return {
    id: 'open-band',
    metricId: ID.costOpenBand,
    label: 'Open and Planned at band estimate',
    value,
    format: moneyFormat(p),
    goodDirection: null,
    note: `${p.fiscalYear}, ${v?.name ?? ''}`,
    ...(value == null
      ? { suppressed: true, suppressedNote: fig?.reason ?? fig?.total.reason ?? 'No version to show.' }
      : {}),
    formula: `Σ band estimate ÷ 12 × active fraction over Open and Planned seats in ${p.fiscalYear}.`,
    definition: p.text(ID.costOpenBand),
    ...(band
      ? {
          // The band part alone: the filled part beside it moves with pay and leave (7.2 rule 3).
          calc: () =>
            bandCard(p, {
              title: `Open and Planned at band estimate, ${p.fiscalYear}`,
              metricId: ID.costOpenBand,
              figure: band.figure,
              members: band.members,
              version: v,
              uses: p.uses(FIGURE.band),
            }),
        }
      : {}),
    uses: p.uses(FIGURE.band),
  }
}

const bandMemo = new WeakMap<Prep, { members: CostMember[]; figure: GuardedFigure } | null>()
/** The fiscal year's guarded figure (its band part is the "Open and Planned at band estimate" line). */
function fyBand(p: Prep): { members: CostMember[]; figure: GuardedFigure } | null {
  if (bandMemo.has(p)) return bandMemo.get(p) ?? null
  const v = p.version
  let out: { members: CostMember[]; figure: GuardedFigure } | null = null
  if (v) {
    const members = membersOf(p.ctx, shownLines(p.ctx, v), p.fyMonths)
    out = { members, figure: guardFigure(p.ctx, { members, version: v }) }
  }
  bandMemo.set(p, out)
  return out
}

/* ───────────── leave (7.7) ───────────── */

/**
 * "On leave": one count for the mode's whole scope at the as-of date, only when it is 5 or more and
 * every class of people across the HRBP and Leader scopes holds 0 or 5 or more on leave
 * (src/access/leaveScopes.ts). No breakdown, series, delta, comparison or drill to people: its card
 * holds the count only. Null in modes with no leave count.
 */
export function leaveTile(p: Prep): Kpi | null {
  const c = leaveCountOf(p.ctx)
  if (!c) return null
  const on = formatDate(c.asOf)
  return {
    id: 'on-leave',
    metricId: ID.leaveOnLeave,
    label: 'On leave',
    value: c.value,
    format: 'int',
    goodDirection: null,
    note: `${c.scopeLabel}, ${on}`,
    ...(c.value == null ? { suppressed: true, suppressedNote: c.reason ?? undefined } : {}),
    formula: `Active employees on a leave of absence on ${on}, in ${c.scopeLabel}, shown at ${fmt(c.min, 'int')} or more.`,
    tab: 'overview',
    definition: p.text(ID.leaveOnLeave),
    calc: () => ({
      title: 'On leave',
      subtitle: `${c.scopeLabel} · ${on}`,
      metricId: ID.leaveOnLeave,
      value: c.value,
      format: 'int',
      inputs: [],
      steps: [
        c.value == null
          ? { label: c.reason ?? 'Hidden', expression: '—', result: null, format: 'int' }
          : {
              label: `People on leave on ${on}, in ${c.scopeLabel}`,
              expression: fmt(c.value, 'int'),
              result: c.value,
              format: 'int',
            },
      ],
      uses: p.uses(FIGURE.leave),
    }),
    uses: p.uses(FIGURE.leave),
  }
}

/* ───────────── Transfers strip ───────────── */

export function transfersTile(p: Prep): Kpi {
  const list = transfersOf(p)
  const open = list.filter((x) => x.inProgress)
  return {
    id: 'transfers-open',
    metricId: ID.transfersOpen,
    label: 'Transfers in progress',
    value: open.length,
    format: 'int',
    goodDirection: null,
    note: `${fmt(list.length - open.length, 'int')} done`,
    formula: `Pending transfers + approved transfers effective after ${formatDate(p.ctx.asOf)}.`,
    tab: 'transfers',
    definition: p.text(ID.transfersOpen),
    drill: () => transfersSpec(p, 'Transfers in progress', open),
    uses: p.uses(FIGURE.transfers),
  }
}

/* ───────────── strips ───────────── */

export const overviewKpis = (p: Prep): Kpi[] => {
  const leave = leaveTile(p)
  return shown(p, [
    approvedTile(p),
    actualTile(p),
    openingsTile(p),
    pastStartTile(p),
    fteTile(p),
    costYtdTile(p),
    ...(leave ? [leave] : []),
  ])
}

export const positionsKpis = (p: Prep): Kpi[] =>
  shown(p, [
    positionsCountTile(p),
    approvedTile(p),
    yearEndPlanTile(p),
    standardHeadsTile(p),
    openBandTile(p),
  ])

export const openingsKpis = (p: Prep): Kpi[] =>
  shown(p, [
    pastStartTile(p),
    frozenTile(p),
    noReqTile(p),
    hiresTile(p),
    offersTile(p),
    reqsNotInPlanTile(p),
    ageTile(p),
  ])

export const transfersKpis = (p: Prep): Kpi[] => shown(p, [transfersTile(p)])
