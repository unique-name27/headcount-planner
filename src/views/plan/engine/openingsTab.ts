/**
 * Plan > Openings' figures (docs/PLAN.md 9.4): openings by stage and by age, and the table with days
 * in stage, target start, past start, frozen and no req. An accepted offer shows its date only (no
 * offer amount anywhere). Pure.
 */
import type { Column } from '@/charts/types'
import type { FigureData } from '../../types'
import { ID } from '../metrics'
import type { OpeningRow, OpeningsAgeRow } from '.'
import type { Prep } from './base'
import { positionsSpec } from './drill'
import { PLAN_FIGURES } from './figures'
import { FIGURE } from './lineage'
import { AGE_BANDS, NOT_OPEN_BAND, type Opening, openingsOf } from './openings'

const bandOf = (o: Opening): string => {
  if (o.age == null) return NOT_OPEN_BAND.key
  return AGE_BANDS.find((b) => o.age != null && o.age >= b.min && o.age <= b.max)?.key ?? NOT_OPEN_BAND.key
}

export function openingsByAge(p: Prep): FigureData<OpeningsAgeRow> {
  const o = openingsOf(p)
  const bands = [...AGE_BANDS.map((b) => ({ key: b.key, label: b.label })), NOT_OPEN_BAND]
  const inBand = (key: string) => o.list.filter((x) => bandOf(x) === key)
  const rows: OpeningsAgeRow[] = bands.map((b) => ({
    key: b.key,
    label: b.label,
    count: inBand(b.key).length,
  }))
  const columns: Column<OpeningsAgeRow>[] = [
    { key: 'label', label: 'Days since the seat opened' },
    {
      key: 'count',
      label: 'Openings',
      format: 'int',
      drill: (r) => () =>
        positionsSpec(
          p,
          `Openings ${r.key === NOT_OPEN_BAND.key ? 'not open yet' : `open ${r.label}`}`,
          inBand(r.key).map((x) => x.positionId),
        ),
    },
  ]
  return {
    id: PLAN_FIGURES.openingsAge,
    metric: ID.openingsAge,
    title: 'Openings by age',
    subtitle: `Days from the day each seat opened to ${p.onLabel}. Planned seats are not open yet.`,
    rows,
    columns,
    note: null,
    empty: o.list.length ? null : 'No openings in this scope.',
    uses: p.uses(FIGURE.age),
  }
}

export function openingsTable(p: Prep): FigureData<OpeningRow> {
  const o = openingsOf(p)
  const yes = (v: boolean) => (v ? 'Yes' : '')
  const rows: (OpeningRow & { pastStartText: string; frozenText: string; noReqText: string })[] = o.list.map(
    (x) => ({
      positionId: x.positionId,
      title: x.position.title,
      level: x.position.level,
      businessUnit: x.position.businessUnit,
      department: x.position.department,
      location: x.position.location,
      status: x.state.status,
      stage: x.stage,
      reqId: x.req?.reqId ?? null,
      daysInStage: x.daysInStage,
      targetStart: x.targetStart,
      pastStart: x.pastStart,
      frozen: x.frozenBy != null,
      noReq: x.noReq,
      offerAccepted: x.offerAccepted,
      // The flags as words, for tables and exports.
      pastStartText: yes(x.pastStart),
      frozenText: yes(x.frozenBy != null),
      noReqText: yes(x.noReq),
    }),
  )
  const columns: Column<OpeningRow>[] = [
    {
      key: 'positionId',
      label: 'Position ID',
      drill: (r) => () => positionsSpec(p, `Position ${r.positionId}`, [r.positionId]),
    },
    { key: 'title', label: 'Title', freeText: true },
    { key: 'level', label: 'Level' },
    { key: 'businessUnit', label: 'Business unit' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' },
    { key: 'status', label: 'Status' },
    { key: 'stage', label: 'Stage' },
    { key: 'reqId', label: 'Req' },
    { key: 'daysInStage', label: 'Days in stage', format: 'int' },
    { key: 'targetStart', label: 'Target start', format: 'date' },
    { key: 'pastStartText', label: 'Past start', format: 'text', sortValue: (r) => (r.pastStart ? 1 : 0) },
    { key: 'frozenText', label: 'Frozen', format: 'text', sortValue: (r) => (r.frozen ? 1 : 0) },
    { key: 'noReqText', label: 'No req', format: 'text', sortValue: (r) => (r.noReq ? 1 : 0) },
    { key: 'offerAccepted', label: 'Offer accepted', format: 'date' },
  ]
  return {
    id: PLAN_FIGURES.openingsTable,
    metric: ID.openingsCount,
    title: 'Openings',
    subtitle: `Every Open and Planned seat on ${p.onLabel}. An accepted offer shows its date only.`,
    rows,
    columns,
    note: null,
    empty: rows.length ? null : 'No openings in this scope.',
    uses: p.uses(FIGURE.openingsTable),
  }
}
