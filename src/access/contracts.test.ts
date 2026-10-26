/**
 * The M2 freeze's data (docs/CONTRACTS-M2.md): the per-mode tables cover every mode, the plan's grid
 * (docs/PLAN.md 8.3) is well formed and consistent with the id lists, the pay and leave tables, and
 * itself (a hidden view hides its tabs), the routing table names every item kind, the policy is
 * plain data with a decision for every action, and the copy the freeze wrote keeps the copy rules
 * (14.3). The access builder's policy, matrix and route tests check the real tables.
 */
import { describe, expect, it } from 'vitest'
import { differenceNote, OTHER_CHANGES } from '@/cost/differences'
import {
  FINANCE_FILTER_NOTE,
  NO_AMOUNTS_NOTE,
  ROUNDED_FILTER_NOTE,
  ROUNDED_PERIOD_NOTE,
  SWITCH_FILTER_NOTE,
} from '@/cost/fit'
import { ORG_COST_NOTE } from '@/cost/fold'
import {
  BAND_LINE_LABEL,
  centersLeftOutNote,
  componentsHiddenNote,
  hiddenNote,
  leftOutNote,
  SHOWS_IN_FINANCE_NOTE,
} from '@/cost/guard'
import { COMPARE_DEFAULT as CONTEXT_COMPARE_DEFAULT } from '@/data/context'
import { VIEW_KEYS } from '@/data/schema'
import {
  BANNED_HASH_WORDS,
  BANNED_MODE_WORDS,
  BANNED_WORDS_EXEMPT,
  FINANCE_EXPORT_LINE,
  FREE_TEXT_HINT,
  hiddenPageTitle,
  hiddenTabTitle,
  managerExportLine,
  modeExportLine,
  NOT_SECURITY_LONG,
  NOT_SECURITY_SHORT,
  openedInstead,
  openedTabInstead,
  ROUNDED_EXPORT_LINE,
} from './copy'
import {
  ACTION_IDS,
  ACTION_SURFACES,
  DRILL_KINDS,
  HOME_FIGURES,
  ITEM_KINDS,
  NAMED_SURFACES,
  PAGE_SURFACES,
  PLAN_GRID,
  TAB_SURFACES,
  VIEW_SURFACES,
  VIEW_TABS,
} from './ids'
import { ITEM_ROUTING } from './items'
import { LEAVE_FIT_NOTE, LEAVE_OF } from './leave'
import {
  COMPARE_DEFAULT,
  FILTER_DIMS_OF,
  HOME_LABEL,
  HOME_OF,
  HOME_SLUG,
  MODE_GROUPS,
  MODE_HINT,
  MODE_LABEL,
  MODE_NAME,
  MODE_SHORT,
  MODES,
  PICK_BLOCKS_READS,
  PICK_LABEL,
  SCOPE_OF,
  SHARED_HOME_FIGURES,
} from './modes'
import { guardModeIn, PAY_OF, showCostIn, showPayIn } from './pay'
import { ROLE_POLICY } from './policy'

const letter = (id: string, i: number): string => PLAN_GRID[id][i]

describe('the per-mode tables (PLAN 8.1)', () => {
  it('lists the modes in the order the grid letters use', () => {
    expect(MODES).toEqual(['manager', 'hrbp', 'leader', 'finance', 'hr-admin'])
  })

  it('names every mode in every table', () => {
    const tables = {
      MODE_LABEL,
      MODE_NAME,
      MODE_SHORT,
      MODE_HINT,
      HOME_OF,
      HOME_LABEL,
      HOME_SLUG,
      SCOPE_OF,
      PICK_LABEL,
      PICK_BLOCKS_READS,
      PAY_OF,
      LEAVE_OF,
      COMPARE_DEFAULT,
      FILTER_DIMS_OF,
    }
    for (const [name, table] of Object.entries(tables))
      expect(Object.keys(table).sort(), name).toEqual([...MODES].sort())
    expect(MODE_GROUPS.flatMap((g) => g.modes).sort()).toEqual([...MODES].sort())
    expect(CONTEXT_COMPARE_DEFAULT).toBe(COMPARE_DEFAULT)
  })

  it('reads the pay table as PLAN 7.1 does', () => {
    expect(MODES.map((m) => showCostIn(m, false))).toEqual([false, true, true, true, true])
    expect(MODES.map((m) => showPayIn(m, true))).toEqual([false, false, false, false, true])
    expect(MODES.map((m) => guardModeIn(m, false))).toEqual(['none', 'rounded', 'rounded', 'exact', 'exact'])
    expect(guardModeIn('hr-admin', true)).toBe('open')
    expect(guardModeIn('finance', true)).toBe('exact')
  })

  it("gives every role home's figures its own slug", () => {
    const slugs = Object.values(HOME_SLUG).filter((s): s is string => !!s)
    for (const f of HOME_FIGURES) {
      if (!f.id.startsWith('home-') || SHARED_HOME_FIGURES.includes(f.id)) continue
      expect(
        slugs.some((s) => f.id.startsWith(`home-${s}-`)),
        f.id,
      ).toBe(true)
    }
  })
})

describe("the plan's grid (PLAN 8.3)", () => {
  it('holds one S, L or H per mode for each surface, every one a named surface', () => {
    const named = new Set<string>(NAMED_SURFACES)
    for (const [id, letters] of Object.entries(PLAN_GRID)) {
      expect(letters, id).toMatch(/^[SLH]{5}$/)
      expect(named.has(id), id).toBe(true)
    }
    expect(new Set(NAMED_SURFACES).size).toBe(NAMED_SURFACES.length)
  })

  it('decides every view, tab, page and action', () => {
    for (const id of [...VIEW_SURFACES, ...TAB_SURFACES, ...PAGE_SURFACES, ...ACTION_SURFACES])
      expect(PLAN_GRID[id], id).toBeDefined()
    const actions = Object.keys(PLAN_GRID).filter((k) => k.startsWith('action:'))
    expect(actions).toEqual(ACTION_IDS.map((a) => `action:${a}`))
    expect(new Set(ACTION_IDS).size).toBe(ACTION_IDS.length)
  })

  it('hides a tab wherever its view is hidden', () => {
    for (const v of VIEW_KEYS)
      for (const t of VIEW_TABS[v])
        MODES.forEach((m, i) => {
          if (letter(`view:${v}`, i) === 'H')
            expect(letter(`tab:${v}.${t.key}`, i), `${v}.${t.key} ${m}`).toBe('H')
        })
  })

  it('shows the pay and leave surfaces as the pay and leave views say', () => {
    MODES.forEach((m, i) => {
      expect(letter('pay:switch', i) !== 'H', m).toBe(PAY_OF[m] === 'switch')
      expect(letter('pay:rounded', i) !== 'H', m).toBe(PAY_OF[m] === 'rounded')
      expect(letter('pay:exact', i) !== 'H', m).toBe(PAY_OF[m] === 'exact' || PAY_OF[m] === 'switch')
      expect(letter('cost:band', i) !== 'H', m).toBe(PAY_OF[m] !== 'none')
      expect(letter('leave:counts', i) !== 'H', m).toBe(LEAVE_OF[m] !== 'none')
      expect(letter('leave:people', i) !== 'H', m).toBe(LEAVE_OF[m] === 'switch')
    })
  })

  it('lists the views in folder-tab order', () => {
    expect(Object.keys(VIEW_TABS)).toEqual(VIEW_KEYS)
  })
})

describe('the policy and the item routing', () => {
  it('is plain data, with a decision for every action in every mode', () => {
    expect(JSON.parse(JSON.stringify(ROLE_POLICY))).toEqual(ROLE_POLICY)
    for (const m of MODES) {
      expect(ROLE_POLICY[m].mode).toBe(m)
      expect(Object.keys(ROLE_POLICY[m].actions)).toEqual([...ACTION_IDS])
      // The freeze's placeholder hid every action with a sentence; the five tables say how on every
      // limited or hidden one (docs/PLAN.md 8.3).
      for (const d of Object.values(ROLE_POLICY[m].actions))
        if (d.access !== 'shown') expect(d.how, m).toBeTruthy()
    }
  })

  it('routes every item kind, and only known kinds', () => {
    expect(Object.keys(ITEM_ROUTING).sort()).toEqual([...ITEM_KINDS].sort())
    expect(new Set(DRILL_KINDS).size).toBe(DRILL_KINDS.length)
  })
})

describe('the copy the freeze wrote (PLAN 14.3)', () => {
  const lines: Record<string, string> = {
    NOT_SECURITY_SHORT,
    NOT_SECURITY_LONG,
    FINANCE_EXPORT_LINE,
    ROUNDED_EXPORT_LINE,
    FREE_TEXT_HINT,
    managerExportLine: managerExportLine('Priya Raman'),
    modeExportLine: modeExportLine('hrbp', 'Silicon Engineering'),
    hiddenPageTitle: hiddenPageTitle('Forecast', 'manager'),
    hiddenTabTitle: hiddenTabTitle('Finance', 'Export', 'hrbp'),
    openedInstead: openedInstead('hr-admin'),
    openedTabInstead: openedTabInstead('Gap'),
    LEAVE_FIT_NOTE,
    ROUNDED_FILTER_NOTE,
    ROUNDED_PERIOD_NOTE,
    FINANCE_FILTER_NOTE,
    SWITCH_FILTER_NOTE,
    NO_AMOUNTS_NOTE,
    ORG_COST_NOTE,
    hiddenNote: hiddenNote(5),
    leftOutNote: leftOutNote(12, 5),
    centersLeftOutNote: centersLeftOutNote(3, 5),
    componentsHiddenNote: componentsHiddenNote(5),
    BAND_LINE_LABEL,
    SHOWS_IN_FINANCE_NOTE,
    OTHER_CHANGES,
    differenceNote: differenceNote(5),
  }

  it("keeps PLAN's wording", () => {
    expect(NOT_SECURITY_SHORT).toBe(
      'Modes, Acting as and approvals change what Headcount Planner shows, not who can see the data.',
    )
    expect(managerExportLine('Priya Raman')).toBe(
      "Made in Manager mode for Priya Raman's team. No amounts are included.",
    )
    expect(modeExportLine('hrbp', 'Silicon Engineering')).toBe('Made in HRBP mode for Silicon Engineering.')
    expect(`${hiddenPageTitle('Forecast', 'manager')}. ${openedInstead('manager')}`).toBe(
      'Forecast is not shown in Manager mode. Headcount Planner opened My team instead.',
    )
    expect(hiddenNote(5)).toBe('Hidden to protect anonymity (n < 5)')
    expect(leftOutNote(12, 5)).toBe('12 people in groups under 5 are left out')
    expect(componentsHiddenNote(5)).toBe('Components hidden (fewer than 5 in a component)')
    expect(BANNED_WORDS_EXEMPT.articles).toEqual(['about-server'])
  })

  it('uses no banned word, no em dash between words and no exclamation mark', () => {
    for (const [name, text] of Object.entries(lines)) {
      const lower = text.toLowerCase()
      for (const w of [...BANNED_MODE_WORDS, ...BANNED_HASH_WORDS])
        expect(lower.includes(w), `${name}: ${w}`).toBe(false)
      expect(text, name).not.toMatch(/\w\s*—\s*\w/)
      expect(text, name).not.toContain('!')
    }
  })
})
