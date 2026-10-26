/**
 * Collecting every view's items (the template app's collect.test.ts, adapted): a failing view is
 * reported and the rest still show, the data standard tags items below it (counted, with the
 * reason), owners named only by name are matched to the people in the data, a scoped mode keeps the
 * items about its scope, and the key figures drill to exactly their items. The settings are read
 * through the dictionary.
 */
import { describe, expect, it } from 'vitest'
import { buildDrillTable, DRILLS_KEY, POSITION_KEY } from '@/drill/records'
import { type DrillSpec, resolveDrill } from '@/drill/types'
import { metricsApi } from '@/metrics/api'
import { CATALOG } from '@/metrics/catalog'
import { EMPTY_METRICS } from '@/metrics/overrides'
import { catalogOf } from '@/metrics/registry'
import { metricsWith, paramRef, recordParamReads } from '@/metrics/testing'
import { DEFAULTS, ID, metrics, PARAM } from '../metrics'
import { collectionOf, collectUncached } from './collect'
import { itemsDrill } from './rows'
import { settingsOf } from './settings'
import { actionKpis, countActions, ownerDueRows, viewRows } from './summary'
import { AS_OF, ctxOf, item, source } from './testkit'

/** The dictionary with the Action center's entries, whether or not the app's catalog holds them yet. */
const CATALOG_WITH = catalogOf([...CATALOG.list.filter((d) => !d.id.startsWith('actions.')), ...metrics])

describe('collectActions', () => {
  it('lists every view, reports one that throws, and orders the most pressing first', () => {
    const late = item({ id: 'plan:past-start:A', severity: 'warning', due: '2026-09-01' })
    const crit = item({ id: 'requests:sent-back:R-1', view: 'requests', tab: 'mine', severity: 'critical' })
    const note = item({ id: 'plan:past-start:C', severity: 'info', due: null, closesWhen: 'When it starts' })
    const views = [
      source('plan', 'Plan', [note, late]),
      source('requests', 'Requests', [crit, crit]),
      source('finance', 'Finance', () => {
        throw new Error('no finance data')
      }),
    ]
    const c = collectUncached(ctxOf(), views)
    expect(c.items.map((a) => a.id)).toEqual([
      'requests:sent-back:R-1',
      'plan:past-start:A',
      'plan:past-start:C',
    ])
    expect(c.errors).toEqual([{ view: 'finance', label: 'Finance', message: 'no finance data' }])
    expect(c.sources).toBe(3)
    expect(c.items[0]).toMatchObject({ viewLabel: 'Requests', tabLabel: 'Mine', from: 'Requests · Mine' })
  })

  it('lists undated items of one severity about more records first', () => {
    const fin = { view: 'finance', tab: 'reconcile', due: null } as const
    const small = item({ id: 'finance:reconcile:a', ...fin, size: 5 })
    const large = item({ id: 'finance:reconcile:b', ...fin, size: 41 })
    const none = item({ id: 'finance:reconcile:c', ...fin })
    const c = collectUncached(ctxOf(), [source('finance', 'Finance', [none, small, large])])
    expect(c.items.map((a) => a.id)).toEqual([
      'finance:reconcile:b',
      'finance:reconcile:a',
      'finance:reconcile:c',
    ])
  })

  it('is cached per context', () => {
    const views = [source('plan', 'Plan', [item()])]
    const ctx = ctxOf()
    expect(collectionOf(ctx, views)).toBe(collectionOf(ctx, views))
  })

  it('matches owners named only by name to the people in the data, and tells owner groups from people', () => {
    const views = [
      source('plan', 'Plan', [
        item({ id: 'plan:past-start:X1', ownerId: 'E9', ownerName: 'Rita Rao' }),
        item({ id: 'plan:past-start:X2', ownerId: null, ownerName: 'Rita Rao' }),
        item({
          id: 'plan:past-start:X3',
          ownerRole: 'hrbp',
          ownerId: null,
          ownerName: 'HR business partners',
        }),
        item({ id: 'plan:past-start:X4', ownerId: null, ownerName: 'Someone Unknown' }),
      ]),
    ]
    const by = new Map(collectUncached(ctxOf(), views).items.map((a) => [a.id, a]))
    expect(by.get('plan:past-start:X2')).toMatchObject({ ownerId: 'E9', ownerKey: 'id:E9', isTeam: false })
    expect(by.get('plan:past-start:X1')?.ownerKey).toBe(by.get('plan:past-start:X2')?.ownerKey)
    expect(by.get('plan:past-start:X3')).toMatchObject({
      ownerId: null,
      ownerKey: 'name:hr business partners',
      isTeam: true,
    })
    // A name not in the data is still a person, not an owner group.
    expect(by.get('plan:past-start:X4')).toMatchObject({ ownerId: null, isTeam: false })
  })

  it('opens the position an item is about only when the data has it', () => {
    const views = [
      source('plan', 'Plan', [
        item({ id: 'plan:past-start:Y1' }),
        item({
          id: 'plan:past-start:Y2',
          subject: { kind: 'positions', id: 'P-99', label: 'Gone' },
          place: { positionId: 'P-99', businessUnit: 'Silicon Engineering', department: null },
        }),
      ]),
    ]
    const by = new Map(collectUncached(ctxOf(), views).items.map((a) => [a.id, a.positionId]))
    expect(Object.fromEntries(by)).toEqual({ 'plan:past-start:Y1': 'P-3', 'plan:past-start:Y2': null })
  })

  it('shows workflow items at every data standard, tagged with their tier, and counts the ones below it', () => {
    const views = [source('plan', 'Plan', [item(), item()])]
    const shown = collectUncached(ctxOf({ standard: 'bronze' }), views)
    expect(shown.items).toHaveLength(2)
    expect(shown.below.count).toBe(0)
    expect(shown.items.every((a) => a.below === null)).toBe(true)
    // Hand-built uploads are bronze: under Validated and Production both items still show, tagged.
    for (const standard of ['silver', 'gold'] as const) {
      const held = collectUncached(ctxOf({ standard }), views)
      expect(held.items, standard).toHaveLength(2)
      expect(held.below.count, standard).toBe(2)
      expect(held.below.reasons, standard).toEqual([
        expect.objectContaining({ dataset: 'positions', tier: 'bronze', count: 2 }),
      ])
      for (const a of held.items)
        expect(a.below, standard).toMatchObject({ tier: 'bronze', dataset: 'positions' })
    }
    // A field with no data still lists its item, tagged "No data", and counts it.
    const empty = collectUncached(ctxOf(), [source('plan', 'Plan', [item({ uses: ['reqs.reqId'] })])])
    expect(empty.items).toHaveLength(1)
    expect(empty.items[0].below).toMatchObject({ tier: 'none', dataset: 'reqs' })
    expect(empty.below.reasons[0]).toMatchObject({ tier: 'none', dataset: 'reqs', count: 1 })
  })

  it('keeps a scoped mode to the items about its scope and the person’s own, the scope’s own head seat included', () => {
    const inTree = item({ id: 'plan:past-start:T1' })
    const elsewhere = {
      subject: { kind: 'positions', id: 'P-10', label: 'P-10' },
      place: { positionId: 'P-10', businessUnit: 'Go-to-Market', department: null },
    } as const
    // About a seat outside the tree, owned by someone else: left out.
    const outside = item({ id: 'plan:past-start:T2', ownerId: 'E10', ownerName: 'Tom Fox', ...elsewhere })
    // Outside the tree but Sam's own (the template app's wide run, narrowed to the person): kept.
    const own = item({ id: 'plan:past-start:T3', ...elsewhere })
    const head = item({
      id: 'requests:not-submitted:c:E2',
      view: 'requests',
      tab: 'cycle',
      subject: { kind: 'none', label: "Sam Lee's team" },
      place: { positionId: 'P-2', businessUnit: 'Silicon Engineering', department: null },
    })
    const views = [source('plan', 'Plan', [inTree, outside, own]), source('requests', 'Requests', [head])]
    const sam = ctxOf({ mode: 'manager', picks: { manager: { personId: 'E2', name: 'Sam Lee' } } })
    expect(sam.access.scope?.kind).toBe('tree')
    expect(
      collectUncached(sam, views)
        .items.map((a) => a.id)
        .sort(),
    ).toEqual(['plan:past-start:T1', 'plan:past-start:T3', 'requests:not-submitted:c:E2'])
    // A pick still to be made holds nobody: nothing is listed.
    const nobody = ctxOf({ mode: 'manager' })
    expect(nobody.access.unset).toBe(true)
    expect(collectUncached(nobody, views).items).toEqual([])
  })
})

describe('counts and drills', () => {
  const items = [
    item({ id: 'plan:past-start:K1', severity: 'critical', due: '2026-09-20' }),
    item({ id: 'plan:past-start:K2', severity: 'warning', due: '2026-10-02' }),
    item({
      id: 'plan:past-start:K3',
      severity: 'info',
      due: '2026-10-20',
      ownerRole: 'finance',
      ownerId: null,
      ownerName: 'Finance',
    }),
    item({ id: 'requests:sent-back:R-4', view: 'requests', tab: 'mine', severity: 'warning', due: null }),
  ]
  const views = [
    source(
      'plan',
      'Plan',
      items.filter((i) => i.view === 'plan'),
    ),
    source(
      'requests',
      'Requests',
      items.filter((i) => i.view === 'requests'),
    ),
  ]

  it('count open, overdue, critical, due soon and owners, each drilling to exactly its items', () => {
    const ctx = ctxOf()
    const open = collectUncached(ctx, views).items
    const kpis = actionKpis(open, ctx)
    const by = Object.fromEntries(kpis.map((k) => [k.id, k]))
    expect(Object.fromEntries(kpis.map((k) => [k.id, k.value]))).toEqual({
      open: 4,
      overdue: 1,
      critical: 1,
      'due-soon': 1,
      owners: 2,
    })
    expect(by.owners.note).toBe('1 person, 1 owner group')
    for (const k of kpis) {
      expect(Object.values(ID), k.id).toContain(k.metricId)
      expect(k.uses?.length, k.id).toBeGreaterThan(0)
      const spec = resolveDrill(k.drill)
      expect(spec?.kind, k.id).toBe(k.id === 'owners' ? 'actionOwners' : 'actionItems')
      expect(spec?.rows.length, k.id).toBe(k.value)
    }
    // Each owner's count opens exactly that owner's items, and together they are every open item.
    const owners = resolveDrill(by.owners.drill) as DrillSpec<'actionOwners'>
    let total = 0
    for (const o of owners.rows) {
      const its = resolveDrill(o.itemsDrill) as DrillSpec<'actionItems'> | null
      expect(its?.kind).toBe('actionItems')
      expect(its?.rows.length, o.owner).toBe(o.items)
      expect(new Set(its?.rows.map((r) => r.owner))).toEqual(new Set([o.owner]))
      total += o.items
    }
    expect(total).toBe(4)
    expect(countActions(open, ctx).bySeverity).toEqual({ critical: 1, warning: 2, info: 1, good: 0 })
  })

  it('read the look-ahead, the snooze length and the overdue limit through the dictionary, and change with them', () => {
    const rec = recordParamReads(metricsApi(EMPTY_METRICS, CATALOG_WITH))
    const ctx = ctxOf({ metrics: rec.metrics })
    actionKpis(collectUncached(ctx, views).items, ctx)
    settingsOf(ctx.metrics)
    expect([...rec.reads].filter((r) => r.startsWith('actions.')).sort()).toEqual(
      [
        paramRef(PARAM.snoozeDays.metricId, PARAM.snoozeDays.key),
        paramRef(PARAM.dueSoonDays.metricId, PARAM.dueSoonDays.key),
        paramRef(PARAM.blockedDays.metricId, PARAM.blockedDays.key),
      ].sort(),
    )
    const wider = ctxOf({
      metrics: metricsWith(
        { [ID.itemsDueSoon]: { days: 30 }, [ID.itemsOpen]: { snoozeDays: 14 } },
        CATALOG_WITH,
      ),
    })
    const soon = actionKpis(collectUncached(wider, views).items, wider).find((k) => k.id === 'due-soon')
    expect(soon?.value).toBe(2)
    expect(settingsOf(wider.metrics)).toEqual({ snoozeDays: 14, dueSoonDays: 30, blockedDays: 14 })
    // A dictionary without the entries answers with their registered defaults.
    expect(settingsOf({ num: () => 0, paramDef: () => undefined })).toEqual(DEFAULTS)
  })

  it('give each figure its rows: owner groups by due date, and views', () => {
    const ctx = ctxOf()
    const open = collectUncached(ctx, views).items
    expect(ownerDueRows(open, ctx)).toEqual([
      { group: 'Managers', due: 'Overdue', bucket: 'overdue', items: 1 },
      { group: 'Managers', due: 'Due within 7 d', bucket: 'soon', items: 1 },
      { group: 'Managers', due: 'No due date', bucket: 'none', items: 1 },
      { group: 'Finance', due: 'Due later', bucket: 'later', items: 1 },
    ])
    expect(viewRows(open, ctx).map((r) => [r.view, r.open, r.overdue, r.critical])).toEqual([
      ['Plan', 3, 1, 1],
      ['Requests', 1, 0, 0],
    ])
  })

  it('drill to item records whose About cell opens the item and whose row opens its position', () => {
    const ctx = ctxOf()
    const subjectSpec = () => null
    const open = collectUncached(ctx, [source('plan', 'Plan', [item({ drill: subjectSpec })])]).items
    const table = buildDrillTable(itemsDrill(ctx, 'Items', open), ctx)
    expect(table.columns.map((c) => c.label)).toEqual([
      'Severity',
      'What is open',
      'About',
      'Due date',
      'Due',
      'From',
    ])
    expect(table.rows[0][POSITION_KEY]).toBe('P-3')
    expect((table.rows[0][DRILLS_KEY] as Record<string, unknown>).subject).toBe(subjectSpec)
    // Item ids are never shown: a row keys by its place in the list.
    expect(JSON.stringify(table.rows)).not.toContain('plan:past-start')
    expect(AS_OF).toBe(ctx.asOf)
  })
})
