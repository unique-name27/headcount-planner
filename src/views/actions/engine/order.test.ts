/**
 * Order and severity (the template app's order.test.ts): items sort by severity, then the most
 * overdue, then the larger first among undated ones; one rubric rates a request waiting on a step
 * (critical past the overdue limit, Watch when overdue, a Note before), and an overdue item is never
 * only a Note. On the sample, in every mode, the collection and each Needs attention list keep the order.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { compareActions } from './collect'
import { everyMode } from './roleKit'
import { severityOf } from './severity'
import { open } from './testkit'

const AS_OF = '2026-09-30'
const RANK = { critical: 0, warning: 1, info: 2, good: 3 } as const

describe('the order', () => {
  it('puts exposure first, then severity, then the most overdue, then the larger undated item', () => {
    const breach = open({ id: 'plan:x:1', severity: 'warning', exposure: true, due: '2026-10-12' })
    const critical = open({ id: 'requests:waiting:R-1', severity: 'critical', due: '2026-06-01' })
    const older = open({ id: 'plan:past-start:P-1', severity: 'warning', due: '2026-07-01' })
    const newer = open({ id: 'plan:past-start:P-2', severity: 'warning', due: '2026-09-01' })
    const small = open({ id: 'finance:reconcile:a', severity: 'warning', due: null, size: 2 })
    const large = open({ id: 'finance:reconcile:b', severity: 'warning', due: null, size: 9 })
    const sorted = [small, newer, critical, large, older, breach].sort(compareActions).map((a) => a.id)
    expect(sorted).toEqual([
      'plan:x:1',
      'requests:waiting:R-1',
      'plan:past-start:P-1',
      'plan:past-start:P-2',
      'finance:reconcile:b',
      'finance:reconcile:a',
    ])
  })
})

describe('the severity rubric', () => {
  const r = (patch: Parameters<typeof severityOf>[0]) => severityOf(patch, AS_OF, 14)
  it('makes exposure critical whatever the view says', () => {
    expect(r({ id: 'plan:x:1', severity: 'info', due: null, exposure: true })).toBe('critical')
  })
  it('makes a request waiting on a step critical only past the overdue limit', () => {
    const id = 'requests:waiting:R-1'
    expect(r({ id, severity: 'warning', due: '2026-09-10' })).toBe('critical')
    expect(r({ id, severity: 'critical', due: '2026-09-20' })).toBe('warning')
    // Not overdue yet: a Note, whatever the view's rating.
    expect(r({ id, severity: 'warning', due: '2026-10-05' })).toBe('info')
    expect(r({ id: 'requests:approve:R-2', severity: 'warning', due: AS_OF })).toBe('info')
    // The limit is a setting.
    expect(severityOf({ id, severity: 'warning', due: '2026-09-20' }, AS_OF, 5)).toBe('critical')
  })
  it('keeps the view rating for items about a group or a record, and never leaves an overdue item a Note', () => {
    expect(r({ id: 'targets:suborg-over:P-1', severity: 'critical', due: null })).toBe('critical')
    expect(r({ id: 'plan:past-start:P-1', severity: 'info', due: '2026-09-01' })).toBe('warning')
    expect(r({ id: 'plan:past-start:P-1', severity: 'info', due: '2026-10-09' })).toBe('info')
  })
})

describe('on the sample, in every mode', () => {
  let modes: ReturnType<typeof everyMode>
  beforeAll(() => {
    modes = everyMode()
  }, 300_000)

  it('lists the collection in order and every critical item of Needs attention first', () => {
    let items = 0
    for (const { mode, collected, lists } of modes) {
      for (let i = 1; i < collected.items.length; i++)
        expect(
          compareActions(collected.items[i - 1], collected.items[i]),
          `${mode} ${i}`,
        ).toBeLessThanOrEqual(0)
      const firstCalm = lists.needs.findIndex((a) => a.item.severity !== 'critical')
      const lastCritical = lists.needs.map((a) => a.item.severity === 'critical').lastIndexOf(true)
      if (lastCritical >= 0 && firstCalm >= 0) expect(lastCritical, mode).toBeLessThan(firstCalm)
      items += collected.items.length
    }
    expect(items).toBeGreaterThan(0)
  })

  it('rates a request critical only when its step is past the overdue limit', () => {
    for (const { mode, ctx, collected } of modes)
      for (const a of collected.items) {
        if (!a.id.startsWith('requests:waiting:') && !a.id.startsWith('requests:approve:')) continue
        const late = (Date.parse(ctx.asOf) - Date.parse(a.item.due as string)) / 86_400_000
        if (a.item.severity === 'critical') expect(late, `${mode} ${a.id}`).toBeGreaterThan(14)
        else expect(RANK[a.item.severity], `${mode} ${a.id}`).toBeGreaterThanOrEqual(1)
      }
  })
})
