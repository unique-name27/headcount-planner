/**
 * File names and the context lines stamped on exports (title rows, slide footers, image footers).
 * `ExportMeta.asOf` may arrive as an ISO date ("2026-09-30") or already formatted ("30 Sep 2026");
 * both are accepted.
 */
import { APP_NAME, FILE_PREFIX } from '@/app/brand'
import type { ExportMeta } from '@/charts/types'
import { type DataStandard, STANDARD_LABEL, TIER_LABEL, type Tier } from '@/data/quality/tier'
import { formatDate, isValidDate } from '@/lib/dates'
import { definitionsChanged } from './definitions'

/**
 * The first line of every output made with Show pay amounts on, and of the unsuppressed load file
 * (docs/PLAN.md 14.1 item 6): ./exportHeader.ts `INDIVIDUAL_PAY_LINE` is this text. Kept here so the
 * image footer can state it without importing the header module, which imports this one.
 */
export const INDIVIDUAL_PAY_TEXT = 'Contains individual pay'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** ISO date for an as-of stamp given as "2026-09-30" or "30 Sep 2026"; null when neither. */
export function asOfIso(asOf: string): string | null {
  const s = asOf.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s) && isValidDate(s.slice(0, 10))) return s.slice(0, 10)
  const m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(s)
  if (!m) return null
  const month = MONTHS.indexOf(m[2].toLowerCase())
  if (month < 0) return null
  const iso = `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return isValidDate(iso) ? iso : null
}

/** "30 Sep 2026" whichever way the as-of date was given. */
export function asOfLabel(asOf: string): string {
  const iso = asOfIso(asOf)
  return iso ? formatDate(iso) : asOf
}

/** Lowercase, ASCII, dash-separated; safe in a file name on every OS. */
export function slug(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '')
}

/**
 * `headcount-planner-<view>-<name>-<as-of>` (docs/PLAN.md 14.1 item 7), e.g.
 * "headcount-planner-plan-openings-by-stage-2026-09-30". The view is named once: a name that starts
 * with the view (its label or its key, as figure ids do, e.g. "plan-openings-by-stage") drops that
 * prefix.
 */
export function fileStem(meta: Pick<ExportMeta, 'view' | 'viewKey' | 'asOf'>, name = ''): string {
  const stamp = asOfIso(meta.asOf) ?? slug(meta.asOf)
  const view = slug(meta.view)
  let part = slug(name)
  for (const prefix of [view, meta.viewKey ? slug(meta.viewKey) : ''])
    if (prefix && (part === prefix || part.startsWith(`${prefix}-`))) {
      part = part.slice(prefix.length + 1)
      break
    }
  return [FILE_PREFIX, view, part, stamp].filter(Boolean).join('-')
}

/**
 * Export context for a view that reads no plan data (the metric dictionary): no scope, window,
 * as-of date, data standard, mode lines, company or "Sample data" stamp, since none of them
 * describe what is exported. Every line built from the meta then leaves those parts out.
 */
export function withoutDataContext(meta: ExportMeta): ExportMeta {
  const { standard: _standard, modeLine: _mode, costLine: _cost, ...rest } = meta
  return { ...rest, scope: '', window: '', asOf: '', isSample: false, company: '' }
}

/** False for the meta of a view that reads no people data (see `withoutDataContext`). */
export const hasDataContext = (meta: Pick<ExportMeta, 'scope' | 'window' | 'asOf'>): boolean =>
  !!(meta.scope || meta.window || meta.asOf)

/** "As of 30 Sep 2026", or '' when there is no as-of date. */
const asOfPart = (asOf: string) => (asOf ? `As of ${asOfLabel(asOf)}` : '')

/**
 * "Whole company · 1 Oct 2025 – 30 Sep 2026 · As of 30 Sep 2026" ('' for a view with no data).
 * `asOf: false` leaves the as-of date out, for an output whose header states it as its own fact
 * ("As of: 30 Sep 2026"), so the date is stated once (M4 review CP-10).
 */
export function metaLine(
  meta: Pick<ExportMeta, 'scope' | 'window' | 'asOf'>,
  opts: { asOf?: boolean } = {},
): string {
  return [meta.scope, meta.window, opts.asOf === false ? '' : asOfPart(meta.asOf)].filter(Boolean).join(' · ')
}

/**
 * The mode lines of an export (docs/PLAN.md 14.1 and 14.3): "Made in HRBP mode for Silicon
 * Engineering." and the mode's cost line; "Made in HR admin mode." in HR admin (./modeMeta.ts).
 * Empty for a view that reads no data.
 */
export function modeLines(meta: Pick<ExportMeta, 'modeLine' | 'costLine'>): string[] {
  return [meta.modeLine ?? '', meta.costLine ?? ''].filter(Boolean)
}

/** "Company confidential · Sample data" */
export function stampLine(meta: Pick<ExportMeta, 'isSample'>): string {
  return meta.isSample ? 'Company confidential · Sample data' : 'Company confidential'
}

/** "Plan · Openings" */
export function viewLine(meta: Pick<ExportMeta, 'view' | 'tab'>): string {
  return [meta.view, meta.tab].filter(Boolean).join(' · ')
}

/**
 * Footer under exported chart images: "Whole company · FY27 Working · As of 30 Sep 2026 · Production
 * standard · Tier: Gold · Made in Finance mode · Headcount Planner · Sample data" (the version shown
 * and the as-of date, the header's image line, docs/PLAN.md 14.1 item 1 and `imageHeaderLine`; the
 * standard and the tier when known, "Definitions changed from defaults: 3" when someone changed the
 * metric dictionary, and the mode line), as sheets and slides state them. An image made with Show pay
 * amounts on (`individualPay`, ./exportHeader.ts `madeWithPay`) starts "Contains individual pay"
 * (lead decision D-PAYFILES).
 */
export function imageFooter(
  meta: Pick<ExportMeta, 'scope' | 'asOf' | 'isSample' | 'standard' | 'modeLine'> &
    Partial<Pick<ExportMeta, 'plan'>>,
  tier?: Tier | null,
  opts: { individualPay?: boolean } = {},
): string {
  return [
    opts.individualPay ? INDIVIDUAL_PAY_TEXT : '',
    meta.scope,
    meta.plan?.version.trim() ?? '',
    asOfPart(meta.asOf),
    meta.standard ? `${STANDARD_LABEL[meta.standard]} standard` : '',
    tier ? `Tier: ${TIER_LABEL[tier]}` : '',
    changedDefinitions(meta),
    // "Made in HRBP mode for Silicon Engineering", without its full stop inside the dotted line.
    meta.modeLine ? meta.modeLine.replace(/\.$/, '') : '',
    APP_NAME,
    meta.isSample ? 'Sample data' : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** "Definitions changed from defaults: 3" on an image footer, or '' (none changed, or no data context). */
function changedDefinitions(meta: Pick<ExportMeta, 'scope' | 'asOf'>): string {
  const n = meta.scope || meta.asOf ? definitionsChanged() : 0
  return n ? `Definitions changed from defaults: ${n.toLocaleString('en-US')}` : ''
}

const STANDARD_RANGE: Record<DataStandard, string> = {
  gold: 'gold only',
  silver: 'silver and up',
  bronze: 'bronze and up',
}

/** "Data standard: Validated (silver and up)". */
export function standardLine(standard: DataStandard): string {
  return `Data standard: ${STANDARD_LABEL[standard]} (${STANDARD_RANGE[standard]})`
}

/**
 * The data line of an export: the standard in force and the tier of what is exported, e.g.
 * "Data standard: Production (gold only) · Tier: Silver, not shown under this standard".
 * Null when neither is known (exports from outside the views).
 */
export function dataLine(
  standard: DataStandard | undefined,
  tier?: Tier | null,
  withheld?: boolean,
): string | null {
  const parts: string[] = []
  if (standard) parts.push(standardLine(standard))
  if (tier) parts.push(`Tier: ${TIER_LABEL[tier]}${withheld ? ', not shown under this standard' : ''}`)
  return parts.length ? parts.join(' · ') : null
}
