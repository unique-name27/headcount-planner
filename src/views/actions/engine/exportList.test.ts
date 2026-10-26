/**
 * The Action center's "Export list" workbook name (docs/PLAN.md 14.1 item 7, M4 review EX-7):
 * headcount-planner-<view>-<name>-<as-of>, the Action center whatever view the page was opened over.
 */
import { describe, expect, it } from 'vitest'
import type { ExportMeta } from '@/charts/types'
import { actionListFileName, actionListMeta } from './exportList'

const META: ExportMeta = {
  view: 'Plan',
  viewKey: 'plan',
  scope: 'Whole company',
  window: 'FY27',
  asOf: '2026-09-30',
  isSample: true,
  company: 'Northgate Semiconductor',
}

describe('the Action center list workbook', () => {
  it('is named for the page, the list and the as-of date', () => {
    expect(actionListFileName(META, 'needs')).toBe('headcount-planner-action-center-needs-2026-09-30')
    expect(actionListFileName(META, 'open')).toBe('headcount-planner-action-center-open-2026-09-30')
  })

  it('states the Action center as its view, whatever view the page was opened over', () => {
    const m = actionListMeta(META)
    expect([m.view, m.viewKey, m.asOf, m.scope]).toEqual([
      'Action center',
      'actions',
      '2026-09-30',
      'Whole company',
    ])
  })
})
