/**
 * The Action center's charts (the template app's charts.test.ts): when items fall due (band by
 * severity), who has the most waiting (by owner) and what is waiting (by kind and due bucket). Each
 * count is a recount of the items' own due dates, severities and owners, each mark opens exactly the
 * items it counts, and every item on the sample has a named kind of work.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { MODES } from '@/access/modes'
import { can } from '@/access/policy'
import type { AnalyticsContext } from '@/data/context'
import { addDays } from '@/lib/dates'
import { VIEWS } from '@/views/registry'
import { dueTimeline, kindRows, OTHER, ownersNote, topOwners } from './charts'
import { type Collected, collectUncached } from './collect'
import { DUE_BANDS, daysToDue, dueBand } from './due'
import { ACTIONS_FIGURES } from './figures'
import { idKind, KIND_LABEL, kindFromId, kindOf } from './kind'
import { sampleCtx } from './roleKit'
import { itemsDrill } from './rows'
import { AS_OF, ctxOf, open } from './testkit'

describe('due bands', () => {
  it('bands days from the as-of date, stalest first', () => {
    const band = (days: number | null) => dueBand(days == null ? null : addDays(AS_OF, days), AS_OF)
    expect([-90, -56, -55, -28, -27, -14, -13, -7, -6, -1].map(band)).toEqual([
      'over8w',
      'over8w',
      'over4w',
      'over4w',
      'over2w',
      'over2w',
      'over1w',
      'over1w',
      'overDays',
      'overDays',
    ])
    expect([0, 6, 7, 13, 14, 27, 28, 200].map(band)).toEqual([
      'next7',
      'next7',
      'next14',
      'next14',
      'next28',
      'next28',
      'later',
      'later',
    ])
    expect(band(null)).toBe('none')
    expect(dueBand('not a date', AS_OF)).toBe('none')
  })
})

describe('the chart rows on hand-built items', () => {
  const ctx = ctxOf()
  const items = [
    open({ due: addDays(AS_OF, -60), severity: 'critical' }),
    open({ due: addDays(AS_OF, -60), severity: 'warning' }),
    open({ due: addDays(AS_OF, -3), severity: 'critical', ownerId: 'E9', ownerName: 'Rita Rao' }),
    open({ due: addDays(AS_OF, 2), severity: 'info' }),
    open(
      { due: null, severity: 'warning', ownerRole: 'finance', ownerId: null, ownerName: 'Finance' },
      { isTeam: true, ownerKey: 'name:finance' },
    ),
  ]

  it('when items fall due: segments by band and severity, a table row per band, empty bands kept', () => {
    const t = dueTimeline(items, AS_OF)
    expect(t.rows.map((r) => [r.band, r.severityLabel, r.items])).toEqual([
      ['over8w', 'Critical', 1],
      ['over8w', 'Watch', 1],
      ['over4w', 'Critical', 0],
      ['over2w', 'Critical', 0],
      ['over1w', 'Critical', 0],
      ['overDays', 'Critical', 1],
      ['next7', 'Note', 1],
      ['next14', 'Critical', 0],
      ['next28', 'Critical', 0],
      ['later', 'Critical', 0],
      ['none', 'Watch', 1],
    ])
    expect(t.table.map((r) => [r.band, r.open, r.critical, r.watch, r.note])).toEqual([
      ['over8w', 2, 1, 1, 0],
      ['over4w', 0, 0, 0, 0],
      ['over2w', 0, 0, 0, 0],
      ['over1w', 0, 0, 0, 0],
      ['overDays', 1, 1, 0, 0],
      ['next7', 1, 0, 0, 1],
      ['next14', 0, 0, 0, 0],
      ['next28', 0, 0, 0, 0],
      ['later', 0, 0, 0, 0],
      ['none', 1, 0, 1, 0],
    ])
    expect(dueTimeline(items.slice(0, 4), AS_OF).table.some((r) => r.band === 'none')).toBe(false)
    expect(dueTimeline([], AS_OF).rows).toEqual([])
    expect(t.severities).toEqual(['Critical', 'Watch', 'Note'])
    for (const r of t.rows) expect(itemsDrill(ctx, 'x', r.list).rows).toHaveLength(r.items)
    expect(t.rows.reduce((n, r) => n + r.items, 0)).toBe(items.length)
  })

  it('who has the most waiting: one row per owner with overdue and critical counts', () => {
    const rows = topOwners(items, ctx)
    expect(rows.map((r) => [r.owner, r.items, r.overdue, r.critical, r.isTeam])).toEqual([
      ['Sam Lee', 3, 2, 1, false],
      ['Rita Rao', 1, 1, 1, false],
      ['Finance', 1, 0, 0, true],
    ])
    expect(rows[2].personId).toBeNull()
    for (const r of rows) expect(itemsDrill(ctx, 'x', r.list).rows).toHaveLength(r.items)
    expect(ownersNote(3, 1)).toBe('3 owners, 1 of them an owner group')
    expect(ownersNote(2, 2)).toBe('2 owners, both owner groups')
  })

  it('what is waiting by kind: the view’s kind, the id’s, else the view label', () => {
    const kinds = [
      open({ id: 'requests:approve:R-1', kind: 'Request to decide' }),
      open({ id: 'plan:past-start:P-1' }),
      open({ id: 'plan:past-start:P-2' }),
      open({ id: 'newview:something:1' }, { viewLabel: 'Plan' }),
    ]
    const k = kindRows(kinds, ctx)
    expect(k.kinds).toEqual(['Opening past target start', 'Plan', 'Request to decide'])
    expect(k.table.map((r) => [r.kind, r.open])).toEqual([
      ['Opening past target start', 2],
      ['Plan', 1],
      ['Request to decide', 1],
    ])
    expect(k.rows.reduce((n, r) => n + r.items, 0)).toBe(kinds.length)
  })

  it('folds kinds past the top into Other', () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      Array.from({ length: 14 - i }, (_x, j) => open({ id: `x:k${i}:${j}`, kind: `Kind ${i}` })),
    ).flat()
    const k = kindRows(many, ctx, 12)
    expect(k.kinds).toHaveLength(12)
    expect(k.kinds.at(-1)).toBe(OTHER)
    const other = k.table.find((r) => r.kind === OTHER)
    expect(other?.folded).toBe(3)
    expect(other?.open).toBe(3 + 2 + 1)
    expect(k.table.reduce((n, r) => n + r.open, 0)).toBe(many.length)
  })

  it('reads kinds from ids, one label per Action center kind, in sentence case', () => {
    expect(idKind('requests:not-submitted:cycle-fy28:E1')).toBe('requests:not-submitted')
    expect(kindFromId('requests:waiting:R-1029')).toBe('Request waiting on a step')
    expect(kindFromId('unknown')).toBeNull()
    expect(kindOf({ id: 'zz:yy:1' }, 'Plan')).toBe('Plan')
    for (const label of Object.values(KIND_LABEL)) expect(label[0]).toBe(label[0].toUpperCase())
  })
})

describe('on the sample company', () => {
  let ctx: AnalyticsContext
  let all: Collected
  beforeAll(() => {
    ctx = sampleCtx('hr-admin')
    all = collectUncached(ctx, VIEWS)
  }, 120_000)

  it('every item has a named kind of work', () => {
    for (const a of all.items) expect(kindOf(a.item, a.viewLabel), a.id).not.toBe(a.viewLabel)
  })

  it('the due timeline recounts every open item from its due date', () => {
    const t = dueTimeline(all.items, ctx.asOf)
    expect(t.rows.reduce((n, r) => n + r.items, 0)).toBe(all.items.length)
    for (const band of DUE_BANDS) {
      const raw = all.items.filter((a) => {
        const d = daysToDue(a.item.due, ctx.asOf)
        if (band === 'none') return d == null
        if (d == null) return false
        return dueBand(a.item.due, ctx.asOf) === band
      })
      expect(t.table.find((r) => r.band === band)?.open ?? 0, band).toBe(raw.length)
    }
  })

  it('owners and kinds account for every item once', () => {
    const owners = topOwners(all.items, ctx)
    expect(owners.reduce((n, r) => n + r.items, 0)).toBe(all.items.length)
    expect(new Set(owners.map((r) => r.list[0].ownerKey)).size).toBe(owners.length)
    const k = kindRows(all.items, ctx)
    expect(k.table.reduce((n, r) => n + r.open, 0)).toBe(all.items.length)
    expect(k.kinds.length).toBeLessThanOrEqual(12)
  })
})

describe('modes', () => {
  it('shows the charts in every mode, over the items the mode lists', () => {
    for (const id of [ACTIONS_FIGURES.dueTimeline, ACTIONS_FIGURES.topOwners, ACTIONS_FIGURES.byKind])
      for (const mode of MODES)
        expect(can(mode, `figure:${id}`, { view: 'actions' }), `${mode} ${id}`).toBe(true)
  })
})
