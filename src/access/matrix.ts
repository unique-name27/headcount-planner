/**
 * The access matrix (docs/PLAN.md 8.3; the template app's matrix.ts): every surface with its decision
 * in each of the five modes, built from an inventory the caller passes (the policy never imports the
 * view registry; `./ids` lists everything the plan names). `matrix.test.ts` renders it as text files
 * and compares them with snapshots in src/access/__snapshots__/, so every change to who sees what
 * shows in review:
 *
 *  - `matrixText` (`access-matrix.txt`): a one-letter grid, surface then Adm, HRBP, Lead, Fin, Mgr,
 *    each S (shown), L (limited) or H (hidden);
 *  - `howText` (`access-how.txt`): for every limited or hidden decision, one line per mode: surface,
 *    mode, decision, how.
 *
 * Pure. Frozen in the M2 freeze (docs/CONTRACTS-M2.md); the access builder filled the functions.
 */
import { MODES, type Mode, PAGE_KEYS } from '@/data/schema'
import { decide, ROLE_POLICY } from './policy'
import type { Access, Decision } from './policy/types'
import { kindOf } from './surfaces'

/** A view with its tabs, as the registry lists them. */
export interface InventoryView {
  key: string
  label: string
  tabs: readonly { key: string; label: string }[]
}

/** Everything the matrix lists. Lists the caller does not have can be left empty. */
export interface AccessInventory {
  views: readonly InventoryView[]
  /** Parts of a tab picked by address (`finance.assumptions:trade-rates`), listed as `tab:<view>.<tab>:<part>`. */
  parts?: readonly string[]
  dataTabs: readonly string[]
  settings: readonly string[]
  articles: readonly string[]
  tours: readonly string[]
  drillKinds: readonly string[]
  datasets: readonly string[]
  /** Every other surface id to list (src/access/ids.ts `NAMED_SURFACES`). */
  surfaces: readonly string[]
  /** Figures to list with the page and tab they sit on: the homes' figures, so the matrix shows each home in each mode. */
  figures?: readonly { id: string; view: string; tab?: string }[]
  /**
   * The views each metric is listed on (the dictionary's `MetricDef.views`), so a metric row reads as
   * `ctx.access` decides it (an addition; without it only the hide lists apply).
   */
  metricViews?: (id: string) => readonly string[] | undefined
}

/** The matrix's column order: HR admin (the baseline), then HRBP, Leader, Finance, Manager. */
export const MATRIX_MODES: readonly Mode[] = ['hr-admin', 'hrbp', 'leader', 'finance', 'manager']

/** Each mode's column head in the grid. */
export const MODE_COLUMN: Readonly<Record<Mode, string>> = {
  'hr-admin': 'Adm',
  hrbp: 'HRBP',
  leader: 'Lead',
  finance: 'Fin',
  manager: 'Mgr',
}

export interface MatrixRow {
  surface: string
  /** The group the row belongs to: "view", "tab", "action", "masthead", "settings" … */
  kind: string
  /** The decision in every mode. */
  decisions: Readonly<Record<Mode, Decision>>
}

/** Every surface of the inventory with its decision in each mode, in a stable order. */
export function accessMatrix(inv: AccessInventory): MatrixRow[] {
  const rows: MatrixRow[] = []
  const seen = new Set<string>()
  const add = (kind: string, surface: string, at?: { view: string; tab?: string }) => {
    if (seen.has(surface)) return
    seen.add(surface)
    const decisions = {} as Record<Mode, Decision>
    const info = kind === 'metric' && inv.metricViews ? { metricViews: inv.metricViews } : undefined
    for (const m of MODES) decisions[m] = decide(m, surface, at, info)
    rows.push({ surface, kind, decisions })
  }
  const tables = MODES.map((m) => ROLE_POLICY[m])
  for (const v of inv.views) add('view', `view:${v.key}`)
  for (const v of inv.views) for (const t of v.tabs) add('tab', `tab:${v.key}.${t.key}`)
  for (const p of inv.parts ?? []) add('tab', `tab:${p}`)
  for (const p of PAGE_KEYS) add('page', `page:${p}`)
  for (const t of inv.dataTabs) add('data', `data:${t}`)
  for (const s of inv.settings) add('settings', `settings:${s}`)
  for (const a of inv.articles) add('help', `help:article:${a}`)
  for (const t of inv.tours) add('help', `help:tour:${t}`)
  for (const k of inv.drillKinds) add('drill', `drill:${k}`)
  for (const d of inv.datasets) add('dataset', `dataset:${d}`)
  for (const s of inv.surfaces) add(kindOf(s), s)
  for (const f of inv.figures ?? []) add('figure', `figure:${f.id}`, { view: f.view, tab: f.tab })
  for (const t of tables) for (const f of t.hiddenFigures) add('figure', `figure:${f}`)
  for (const t of tables) for (const p of t.hiddenFigurePrefixes) add('figure', `figure:${p}*`)
  for (const t of tables) for (const m of t.metrics.hide) add('metric', `metric:${m}`)
  for (const t of tables) for (const p of t.metrics.hidePrefixes) add('metric', `metric:${p}*`)
  for (const t of tables) for (const p of t.hiddenItemPrefixes) add('item', `item:${p}`)
  for (const t of tables) for (const c of t.hiddenColumns ?? []) add('column', `column:${c}`)
  // Everything else a table names, so no explicit decision is left out of review.
  for (const t of tables) for (const s of Object.keys(t.surfaces)) add(kindOf(s), s)
  for (const t of tables) for (const a of Object.keys(t.actions)) add('action', `action:${a}`)
  return rows
}

const LETTER: Record<Access, string> = { shown: 'S', limited: 'L', hidden: 'H' }
const WORD: Record<Access, string> = { shown: 'Shown', limited: 'Limited', hidden: 'Hidden' }

/** The matrix as a fixed-width one-letter grid: surface, then a column per mode in `MATRIX_MODES` order. */
export function matrixText(rows: readonly MatrixRow[]): string {
  const w = Math.max('Surface'.length, ...rows.map((r) => r.surface.length))
  const widths = MATRIX_MODES.map((m) => MODE_COLUMN[m].length)
  const head = `${'Surface'.padEnd(w)}  ${MATRIX_MODES.map((m, i) => MODE_COLUMN[m].padEnd(widths[i])).join('  ')}`
  const lines = rows.map((r) =>
    `${r.surface.padEnd(w)}  ${MATRIX_MODES.map((m, i) => LETTER[r.decisions[m].access].padEnd(widths[i])).join('  ')}`.trimEnd(),
  )
  return `${[head.trimEnd(), '-'.repeat(head.trimEnd().length), ...lines].join('\n')}\n`
}

/** One line per limited or hidden decision: surface, mode, decision, how. */
export function howText(rows: readonly MatrixRow[]): string {
  const lines: string[][] = []
  for (const r of rows)
    for (const m of MATRIX_MODES) {
      const d = r.decisions[m]
      if (d.access !== 'shown') lines.push([r.surface, MODE_COLUMN[m], WORD[d.access], d.how ?? ''])
    }
  const w0 = Math.max('Surface'.length, ...lines.map((l) => l[0].length))
  const w1 = Math.max('Mode'.length, ...lines.map((l) => l[1].length))
  const w2 = 'Decision'.length
  const fmt = (l: readonly string[]) =>
    `${l[0].padEnd(w0)}  ${l[1].padEnd(w1)}  ${l[2].padEnd(w2)}  ${l[3]}`.trimEnd()
  const head = fmt(['Surface', 'Mode', 'Decision', 'How'])
  return `${[head, '-'.repeat(head.length), ...lines.map(fmt)].join('\n')}\n`
}

/** How many surfaces each mode shows, limits and hides. */
export function matrixCounts(rows: readonly MatrixRow[]): Record<Mode, Record<Access, number>> {
  const out = {} as Record<Mode, Record<Access, number>>
  for (const m of MODES) out[m] = { shown: 0, limited: 0, hidden: 0 }
  for (const r of rows) for (const m of MODES) out[m][r.decisions[m].access]++
  return out
}
