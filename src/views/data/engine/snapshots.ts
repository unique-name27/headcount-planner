/**
 * The figures a mode shows, as a Shareable file carries them (docs/PLAN.md 5.5: "amounts only as the
 * mode's model values (rounded, folded or absent exactly as on screen)"): every figure of every tab
 * the mode shows, read from the views' own models (already through the cost guard), each figure only
 * where the mode shows it (`figure:<id>` and its metric), with only the columns the mode keeps
 * (`visibleColumns`) and each cell as the model holds it. Nothing here reads the PlanStore or prices
 * anything: a file carries what the screen carries. Pure.
 *
 * Readings taken here (workspace-ui, M3):
 *  - The views are the ones the leak crawl reads (src/testkit/crawl.ts `MODELS`): Home, My team,
 *    Plan, Requests, Forecast, Targets and Finance. What if is left out: its levers live in this
 *    browser's session only (src/views/whatif/engine/session.ts), so a file carries the plan as it
 *    is, not a scenario someone was trying.
 *  - A view whose model throws is left out of the file and the rest still go in (the crawl's rule);
 *    the screen shows that view's error too.
 *  - A tab with a model of its own (src/views/tabModels.ts `TAB_MODELS`: Plan > Hiring's
 *    `planHiringModel`, no `PlanModel` field) is read from that model, as the crawl and the screen
 *    read it; one that throws is left out alone, and the view's other tabs still go in (hiring wave).
 *  - A figure drawn on two tabs goes in once, the first time it is found in tab order.
 *  - An object in a cell (a range, a pair) is written as its JSON text, a number that is not finite
 *    as null: the same reading the crawl's snapshot takes, so the leak tests read what files hold.
 */
import { VIEW_TABS } from '@/access/ids'
import type { Column } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import type { ViewKey } from '@/data/schema'
import { moneyOpts, moneyShown, visibleColumns } from '@/lib/export/columns'
import { financeModel } from '@/views/finance/engine'
import { forecastModel } from '@/views/forecast/engine'
import { homeModel } from '@/views/home/engine'
import { planModel } from '@/views/plan/engine'
import { requestsModel } from '@/views/requests/engine'
import { tabModelOf } from '@/views/tabModels'
import { targetsModel } from '@/views/targets/engine'
import { teamModel } from '@/views/team/engine'

/** A cell as a file holds it. */
export type SnapshotValue = string | number | boolean | null

/** A figure as the mode sees it: its words, the columns it keeps and every row's cells. */
export interface FigureSnapshot {
  id: string
  title: string
  subtitle: string | null
  note: string | null
  /**
   * `money`: an amount column (pay, cost or band); `band`: a band-estimate column; `pay`: a
   * per-person pay column (HR admin with Show pay amounts on), so an opener can drop it when the
   * switch is off.
   */
  columns: {
    key: string
    label: string
    money: boolean
    band: boolean
    pay: boolean
    format?: string | null
  }[]
  rows: Record<string, SnapshotValue>[]
}

/** The views a file reads, in folder-tab order (see the module comment). */
const MODELS: readonly [ViewKey, (ctx: AnalyticsContext) => unknown][] = [
  ['home', homeModel],
  ['team', teamModel],
  ['plan', planModel],
  ['requests', requestsModel],
  ['forecast', forecastModel],
  ['targets', targetsModel],
  ['finance', financeModel],
]

/** Views whose one tab is the whole model. */
const WHOLE_MODEL: ReadonlySet<ViewKey> = new Set(['home', 'team'])

/** Keys holding bookkeeping, records behind a number or calculation cards: never a figure. */
const SKIP: ReadonlySet<string> = new Set([
  'uses',
  'fingerprint',
  'markKey',
  'matter',
  'collected',
  'getSvg',
  'sortValue',
  'filter',
  'batch',
  'place',
  'ownerKey',
  'drill',
  'deltaDrill',
  'noteDrill',
  'itemsDrill',
  'subjectDrill',
  'calc',
  'deltaCalc',
])

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const isFigure = (v: Record<string, unknown>): boolean =>
  typeof v.id === 'string' &&
  typeof v.metric === 'string' &&
  typeof v.title === 'string' &&
  Array.isArray(v.rows) &&
  Array.isArray(v.columns)

const cellOf = (v: unknown): SnapshotValue => {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' || typeof v === 'boolean') return v
  if (typeof v === 'function') return null
  try {
    return JSON.stringify(v) ?? null
  } catch {
    return String(v)
  }
}

/** One figure as the mode keeps it. */
function snapshotOf(ctx: AnalyticsContext, f: Record<string, unknown>): FigureSnapshot {
  const cols = visibleColumns(f.columns as readonly Column[], moneyShown(moneyOpts(ctx))) as Column[]
  return {
    id: f.id as string,
    title: f.title as string,
    subtitle: typeof f.subtitle === 'string' ? f.subtitle : null,
    note: typeof f.note === 'string' ? f.note : null,
    columns: cols.map((c) => ({
      key: c.key,
      label: c.label,
      money: !!(c.pay || c.cost || c.band),
      band: !!c.band && !c.pay && !c.cost,
      pay: !!c.pay,
      // The column's one format, for an opener to show the cells as on screen (none for a per-row one).
      format: typeof c.format === 'string' ? c.format : null,
    })),
    rows: (f.rows as readonly Record<string, unknown>[]).map((r) => {
      const out: Record<string, SnapshotValue> = {}
      for (const c of cols) out[c.key] = cellOf(r[c.key])
      return out
    }),
  }
}

/** Every figure a tab's model holds, depth first, that the mode shows there. */
function collect(
  ctx: AnalyticsContext,
  v: unknown,
  at: { view: ViewKey; tab: string },
  out: Map<string, FigureSnapshot>,
  depth = 0,
): void {
  if (!isObj(v) || depth > 12 || ArrayBuffer.isView(v)) return
  if (Array.isArray(v)) {
    for (const x of v) collect(ctx, x, at, out, depth + 1)
    return
  }
  if (isFigure(v)) {
    const id = v.id as string
    if (out.has(id)) return
    if (!ctx.access.can(`figure:${id}`, at) || !ctx.access.can(`metric:${v.metric as string}`)) return
    out.set(id, snapshotOf(ctx, v))
    return
  }
  for (const [k, x] of Object.entries(v)) {
    if (SKIP.has(k) || typeof x === 'function') continue
    collect(ctx, x, at, out, depth + 1)
  }
}

/**
 * Every figure the context's mode shows, by figure id, as on screen (see the module comment). A
 * view the mode hides, or a tab it hides, is not read.
 */
export function figureSnapshots(ctx: AnalyticsContext): Record<string, FigureSnapshot> {
  const out = new Map<string, FigureSnapshot>()
  for (const [key, read] of MODELS) {
    if (!ctx.access.can(`view:${key}`)) continue
    // The view's model, read once, when a tab reads it (a tab with a model of its own does not).
    let model: unknown = null
    let failed = false
    const viewModel = (): unknown => {
      if (model == null && !failed) {
        try {
          model = read(ctx)
        } catch {
          failed = true
        }
      }
      return model
    }
    for (const t of VIEW_TABS[key]) {
      if (!WHOLE_MODEL.has(key) && !ctx.access.can(`tab:${key}.${t.key}`)) continue
      const own = WHOLE_MODEL.has(key) ? null : tabModelOf(key, t.key)
      let part: unknown
      if (own) {
        try {
          part = own(ctx)
        } catch {
          continue
        }
      } else {
        const m = viewModel()
        if (m == null) continue
        part = WHOLE_MODEL.has(key) ? m : (m as Record<string, unknown>)[t.key]
      }
      collect(ctx, part, { view: key, tab: t.key }, out)
      if (WHOLE_MODEL.has(key)) break
    }
  }
  return Object.fromEntries(out)
}
