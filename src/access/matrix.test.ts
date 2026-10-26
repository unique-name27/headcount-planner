/**
 * The access matrix (docs/PLAN.md 8.3 and 16.1): every surface in every one of the five modes,
 * rendered as text and compared with two reviewed files under `__snapshots__/` (`npx vitest run
 * src/access/matrix.test.ts -u` after an intended change):
 *
 *  - `access-matrix.txt`: the one-letter grid (Adm, HRBP, Lead, Fin, Mgr);
 *  - `access-how.txt`: the sentence of every limited or hidden decision, per mode.
 *
 * Then the invariants: the tables agree with the plan's grid letter by letter (`PLAN_GRID`, 8.3's
 * tables, the trade rows of 11.6 included); every limited or hidden decision says how, in one plain
 * sentence with no banned word, no em dash between words and no "!"; hidden figures and metrics
 * exist; the home figures sit on their homes; and HR admin differs from "everything shown" only where
 * the plan says.
 */
import { describe, expect, it } from 'vitest'
import { DATASET_KEYS, VIEW_KEYS, VIEW_LABEL } from '@/data/schema'
import { SETTINGS_SECTIONS } from '@/data/settings'
import { METRICS } from '@/metrics/catalog'
import {
  BANNED_HASH_WORDS,
  BANNED_MODE_WORDS,
  FINANCE_EXPORT_LINE,
  FINANCE_FILTERS_NOTE,
  financeLeftOut,
  hiddenPageTitle,
  hiddenTabTitle,
  leaderLeftOut,
  leftScopeDescription,
  managerExportLine,
  modeExportLine,
  NO_PICK_LABEL,
  NOT_SECURITY_LONG,
  NOT_SECURITY_SHORT,
  openedInstead,
  openedTabInstead,
  outsideLeftOut,
  PICK_BEFORE_CHANGES,
  PICKER_COPY,
  ROUNDED_EXPORT_LINE,
  reportModeLine,
  unitsLeftOut,
} from './copy'
import {
  DATA_TABS,
  DRILL_KINDS,
  HOME_FIGURES,
  METRIC_IDS,
  NAMED_SURFACES,
  PLAN_GRID,
  TAB_PARTS,
  VIEW_TABS,
} from './ids'
import {
  type AccessInventory,
  accessMatrix,
  howText,
  MATRIX_MODES,
  type MatrixRow,
  MODE_COLUMN,
  matrixCounts,
  matrixText,
} from './matrix'
import { MODE_HINT, MODE_LABEL, MODES, type Mode, modeButtonLabel } from './modes'
import { type Access, decide, ROLE_POLICY } from './policy'

const views = new Map(METRICS.map((m) => [m.id, m.views as readonly string[]]))

const inventory: AccessInventory = {
  views: VIEW_KEYS.map((key) => ({ key, label: VIEW_LABEL[key], tabs: VIEW_TABS[key] })),
  parts: TAB_PARTS.map((p) => `${p.view}.${p.tab}:${p.part}`),
  dataTabs: DATA_TABS.map((t) => t.key),
  settings: SETTINGS_SECTIONS,
  articles: [],
  tours: [],
  drillKinds: DRILL_KINDS,
  datasets: DATASET_KEYS,
  surfaces: NAMED_SURFACES,
  figures: HOME_FIGURES,
  metricViews: (id) => views.get(id),
}

const rows = accessMatrix(inventory)
const row = (s: string): MatrixRow => {
  const r = rows.find((x) => x.surface === s)
  if (!r) throw new Error(`No matrix row ${s}`)
  return r
}
const LETTER: Record<Access, string> = { shown: 'S', limited: 'L', hidden: 'H' }

describe('the matrix snapshots', () => {
  it('lists every surface once, the named ones and every table entry included', () => {
    expect(new Set(rows.map((r) => r.surface)).size).toBe(rows.length)
    for (const s of NAMED_SURFACES) row(s)
    for (const m of MODES) for (const s of Object.keys(ROLE_POLICY[m].surfaces)) row(s)
    for (const f of HOME_FIGURES) row(`figure:${f.id}`)
    expect(MATRIX_MODES).toEqual(['hr-admin', 'hrbp', 'leader', 'finance', 'manager'])
  })

  it('matches access-matrix.txt', async () => {
    const text = matrixText(rows)
    expect(text.split('\n')[0]).toMatch(/^Surface\s+Adm {2}HRBP {2}Lead {2}Fin {2}Mgr$/)
    await expect(text).toMatchFileSnapshot('./__snapshots__/access-matrix.txt')
  })

  it('matches access-how.txt', async () => {
    await expect(howText(rows)).toMatchFileSnapshot('./__snapshots__/access-how.txt')
  })

  it('counts what each mode shows, limits and hides', () => {
    const counts = matrixCounts(rows)
    for (const m of MODES) expect(counts[m].shown + counts[m].limited + counts[m].hidden, m).toBe(rows.length)
    // HR admin is the full mode: it shows the most and hides the least.
    for (const m of MODES.filter((x) => x !== 'hr-admin')) {
      expect(counts['hr-admin'].shown, m).toBeGreaterThan(counts[m].shown)
      expect(counts['hr-admin'].hidden, m).toBeLessThan(counts[m].hidden)
    }
    // Manager mode hides the most.
    for (const m of MODES.filter((x) => x !== 'manager'))
      expect(counts.manager.hidden, m).toBeGreaterThan(counts[m].hidden)
  })
})

describe("the plan's grid (docs/PLAN.md 8.3 and 11.6)", () => {
  it('agrees with every table, letter by letter', () => {
    const wrong: string[] = []
    for (const [id, letters] of Object.entries(PLAN_GRID)) {
      const got = MODES.map((m) => LETTER[decide(m, id).access]).join('')
      if (got !== letters) wrong.push(`${id}: plan ${letters}, tables ${got}`)
    }
    expect(wrong).toEqual([])
    expect(Object.keys(PLAN_GRID).length).toBeGreaterThan(100)
  })

  it('carries the reasons the plan gives on its L and H letters', () => {
    expect(decide('manager', 'view:home').how).toBe('Managers open on My team.')
    expect(decide('hr-admin', 'view:home').how).toBe(
      "HR admin opens on the Data room. Switch modes to see a role's home.",
    )
    expect(decide('finance', 'tab:plan.transfers').how).toBe(
      'Transfers move named people. Finance sees their effect in the bridge and in Targets.',
    )
    expect(decide('hrbp', 'tab:finance.export').how).toBe("Load files are Finance's and HR admin's.")
    expect(decide('leader', 'tab:finance.assumptions:trade-rates').how).toBe(
      'Leaders see weights on requests.',
    )
    expect(decide('hrbp', 'tab:finance.assumptions:trade-rates').how).toBe('Read only.')
    expect(decide('manager', 'cost:band').how).toBe('Managers see heads and standard heads, never amounts.')
    expect(decide('hrbp', 'pay:rounded').how).toBe(
      'Rounded down to $0.1M per team, at QTD, YTD and full year; groups under 5 left out.',
    )
    expect(decide('finance', 'pay:exact').how).toBe('Groups of 5 or more costed people.')
    expect(decide('hrbp', 'leave:counts').how).toBe(
      'One count for your whole unit at the as-of date, when 5 or more.',
    )
    expect(decide('leader', 'leave:counts').how).toBe(
      'One count for your whole org at the as-of date, when 5 or more.',
    )
    expect(decide('leader', 'metric:finance.trade.standardHead').how).toBe(
      'On trade cards in your org, beside the band estimates.',
    )
    expect(decide('finance', 'action:request.trade').how).toBe(
      'Finance approves trades; it does not start them.',
    )
    expect(decide('hr-admin', 'action:export.full').how).toBe('With Show pay amounts on.')
    expect(decide('hrbp', 'view:forecast').how).toBe(
      'Cost rounded down to $0.1M per team, at QTD, YTD and full year. Monthly cost shows as heads; exit run rate and cost incl. SBC show in Finance mode.',
    )
  })
})

/** Every sentence the modes add, for the copy rules. */
function sentences(): [string, string][] {
  const out: [string, string][] = []
  for (const r of rows)
    for (const m of MODES) {
      const d = r.decisions[m]
      if (d.how) out.push([`${r.surface} ${m}`, d.how])
    }
  for (const m of MODES) {
    const t = ROLE_POLICY[m]
    for (const tabs of Object.values(t.tabs))
      for (const x of tabs ?? []) if (x.decision.how) out.push([`tab ${x.key} ${m}`, x.decision.how])
    for (const [k, d] of Object.entries(t.actions)) if (d.how) out.push([`action ${k} ${m}`, d.how])
    out.push([`hint ${m}`, MODE_HINT[m]], [`no pick ${m}`, NO_PICK_LABEL[m]])
    out.push([`report ${m}`, reportModeLine(m, 'Silicon Engineering', true)])
    out.push([
      `button ${m}`,
      modeButtonLabel(m, { personId: 'E1', name: 'Dana Ito', unit: 'Silicon Engineering' }),
    ])
    out.push([`page ${m}`, `${hiddenPageTitle('Forecast', m)}. ${openedInstead(m)}`])
    out.push([`tab ${m}`, `${hiddenTabTitle('Finance', 'Export', m)}. ${openedTabInstead('Versions')}`])
    for (const [k, v] of Object.entries(PICKER_COPY[m]))
      out.push([`picker ${m} ${k}`, typeof v === 'function' ? v('Dana Ito') : v])
    out.push(
      [`left ${m}`, leaderLeftOut(m, 'your team', 'link')],
      [`units ${m}`, unitsLeftOut(m, 'X', 'view')],
    )
    out.push([`outside ${m}`, outsideLeftOut(m, 'X', 'link')], [`export ${m}`, modeExportLine(m, 'X')])
  }
  out.push(
    ['short', NOT_SECURITY_SHORT],
    ['long', NOT_SECURITY_LONG],
    ['finance filters', FINANCE_FILTERS_NOTE],
    ['finance left', financeLeftOut('link')],
    ['left scope', leftScopeDescription('Silicon Engineering')],
    ['pick first', PICK_BEFORE_CHANGES],
    ['finance export', FINANCE_EXPORT_LINE],
    ['rounded export', ROUNDED_EXPORT_LINE],
    ['manager export', managerExportLine('Priya Raman')],
  )
  return out
}

describe('the copy (docs/PLAN.md 14.3)', () => {
  it('gives every limited or hidden decision one plain sentence', () => {
    for (const r of rows)
      for (const m of MODES) {
        const d = r.decisions[m]
        if (d.access === 'shown') continue
        expect(d.how, `${r.surface} ${m}`).toBeTruthy()
        expect(d.how, `${r.surface} ${m}`).toMatch(/^["'0-9A-Z]/)
        expect(d.how, `${r.surface} ${m}`).toMatch(/[.)"]$/)
      }
  })

  it('uses no banned word, no em dash between words and no exclamation mark', () => {
    const all = sentences()
    expect(all.length).toBeGreaterThan(1000)
    for (const [where, text] of all) {
      const lower = text.toLowerCase()
      for (const w of [...BANNED_MODE_WORDS, ...BANNED_HASH_WORDS])
        expect(lower.includes(w), `${where}: ${w}`).toBe(false)
      expect(text, where).not.toMatch(/\w\s*—\s*\w/)
      expect(text, where).not.toContain('!')
    }
  })

  it('names the modes as the plan does', () => {
    expect(MODES.map((m) => MODE_LABEL[m])).toEqual(['Manager', 'HRBP', 'Leader', 'Finance', 'HR admin'])
    expect(MATRIX_MODES.map((m) => MODE_COLUMN[m])).toEqual(['Adm', 'HRBP', 'Lead', 'Fin', 'Mgr'])
  })
})

describe('what the tables name exists', () => {
  it('hides only figures and metrics that exist, and lists only known kinds and datasets', () => {
    // The catalog's ids, and the pages' ids the views builders register (src/access/ids.ts).
    const metricIds = new Set([...METRICS.map((m) => m.id), ...METRIC_IDS])
    for (const m of MODES) {
      const t = ROLE_POLICY[m]
      for (const id of t.metrics.hide) expect(metricIds.has(id), `${m} ${id}`).toBe(true)
      for (const p of t.metrics.hidePrefixes)
        expect(
          [...metricIds].some((id) => id.startsWith(p)),
          `${m} ${p}`,
        ).toBe(true)
      for (const k of t.drillKinds) expect(DRILL_KINDS, `${m} ${k}`).toContain(k)
      for (const d of t.datasets) expect(DATASET_KEYS, `${m} ${d}`).toContain(d)
      for (const f of t.hiddenFigures) expect(f, m).toMatch(/^[a-z]+-[a-z-]+$/)
    }
  })

  it('shows each home its own figures and no other', () => {
    const homeOfMode: Record<Mode, string | null> = {
      manager: 'team-',
      hrbp: 'home-unit-',
      leader: 'home-rollup-',
      finance: 'home-fin-',
      'hr-admin': null,
    }
    for (const f of HOME_FIGURES) {
      const r = row(`figure:${f.id}`)
      for (const m of MODES) {
        const own = homeOfMode[m]
        const shared =
          f.view === 'home' && ['home-attention', 'home-attention-wait', 'home-list'].includes(f.id)
        const expected = !!own && (f.id.startsWith(own) || (shared && m !== 'manager'))
        expect(r.decisions[m].access !== 'hidden', `${f.id} ${m}`).toBe(expected)
      }
    }
  })
})
