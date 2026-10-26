/**
 * The dataset manifest (the template app's Data room, for HCP's eight datasets; docs/PLAN.md 5.2):
 * one row per dataset with what it feeds, where it came from, how many rows are loaded, how well its
 * fields are filled, its tier and certification, and what keeps it from the next tier. Pure: built
 * from the analytics context (its sources, all datasets and quality index), never from the store.
 *
 * Readings taken here: a dataset's field coverage is the mean coverage of its required and
 * recommended fields (all its fields when it marks none), over the rows each field applies to; an
 * optional dataset with no rows and no file reads source 'none'; its issues are the quality index's
 * "what keeps it from the next tier" phrases.
 */
import type { Column } from '@/charts/types'
import type { Severity } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { TIER_LABEL, TIERS, type Tier } from '@/data/quality/tier'
import { isCertified } from '@/data/quality/versions'
import {
  DATASETS,
  type DatasetDef,
  type DatasetKey,
  VIEW_KEYS,
  VIEW_LABEL,
  type ViewKey,
} from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { DatasetManifestRow } from './index'

/** The four datasets every view needs (docs/PLAN.md 5.2); the other four are optional. */
export const REQUIRED_DATASETS: readonly DatasetKey[] = ['positions', 'workers', 'comp', 'assumptions']

/** A manifest row with what the Data room shows beside the frozen fields. */
export interface ManifestRow extends DatasetManifestRow {
  description: string
  sheet: string
  required: boolean
  /** The views that read it, in folder-tab order. */
  feeds: readonly ViewKey[]
  /** "All eight views" or the view names. */
  feedsText: string
  /** The file it came from, for an upload. */
  fileName: string | null
  /** Mean coverage of its required and recommended fields; null with no rows. */
  coverage: number | null
  /** What keeps it from the next tier, one plain phrase each. */
  issues: readonly string[]
  status: Severity
  /** The dataset's tier in words ("Gold"). */
  tierLabel: string
  /** "Sample", or the file name and its date. */
  sourceText: string
  /** "Yes" or "No", for the table and exports. */
  certifiedText: string
  /** The issues as one sentence list, for the table and exports. */
  issuesText: string
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/** "All eight views", or the views named in folder-tab order. */
export function feedsText(views: readonly ViewKey[]): string {
  if (VIEW_KEYS.every((v) => views.includes(v)))
    return `All ${NUMBER_WORDS[VIEW_KEYS.length] ?? VIEW_KEYS.length} views`
  return VIEW_KEYS.filter((v) => views.includes(v))
    .map((v) => VIEW_LABEL[v])
    .join(', ')
}

/** Mean coverage of the fields that matter (required and recommended, else every field). */
function coverageOf(def: DatasetDef, ctx: Pick<AnalyticsContext, 'quality'>): number | null {
  const stats = ctx.quality.fields(def.key)
  const keyed = new Map(stats.map((s) => [s.ref, s]))
  const core = def.fields.filter((f) => f.required || f.recommended)
  const list = (core.length ? core : def.fields)
    .map((f) => keyed.get(`${def.key}.${f.key}` as (typeof stats)[number]['ref'])?.coverage)
    .filter((c): c is number => c != null)
  if (!list.length) return null
  return list.reduce((a, b) => a + b, 0) / list.length
}

/** One row per dataset, in schema order. */
export function manifestRows(ctx: Pick<AnalyticsContext, 'all' | 'sources' | 'quality'>): ManifestRow[] {
  return DATASETS.map((def) => {
    const rows = (ctx.all[def.key] as readonly object[]).length
    const meta = ctx.sources[def.key] ?? { kind: 'sample', rowCount: rows }
    const q = ctx.quality.dataset(def.key)
    const version = q.version
    const required = REQUIRED_DATASETS.includes(def.key)
    const source: DatasetManifestRow['source'] =
      meta.kind === 'upload' ? 'upload' : rows === 0 && !required ? 'none' : 'sample'
    const tier: Tier = ctx.quality.datasetTier(def.key)
    const issues = q.missing
    const status: Severity =
      tier === 'none'
        ? required
          ? 'critical'
          : 'info'
        : issues.length
          ? tier === 'bronze'
            ? 'warning'
            : 'info'
          : 'good'
    const importedAt = meta.kind === 'upload' ? (meta.importedAt ?? version?.importedAt ?? null) : null
    const fileName = meta.kind === 'upload' ? (meta.fileName ?? version?.fileName ?? null) : null
    return {
      key: def.key,
      label: def.label,
      source,
      rows,
      warnings: meta.warnings ?? 0,
      version: meta.kind === 'upload' ? 'Current version' : null,
      importedAt,
      tier,
      certified: isCertified(version),
      description: def.description,
      sheet: def.sheet,
      required,
      feeds: VIEW_KEYS.filter((v) => def.usedBy.includes(v)),
      feedsText: feedsText(def.usedBy),
      fileName,
      coverage: coverageOf(def, ctx),
      issues,
      status,
      tierLabel: TIER_LABEL[tier],
      sourceText:
        source === 'upload'
          ? [fileName ?? 'Uploaded file', importedAt ? formatDate(importedAt.slice(0, 10)) : null]
              .filter(Boolean)
              .join(' · ')
          : source === 'none'
            ? 'Not loaded'
            : 'Sample',
      certifiedText: isCertified(version) ? 'Yes' : 'No',
      issuesText: issues.join('; '),
    }
  })
}

export interface ManifestSummary {
  uploaded: number
  total: number
  totalRows: number
  tiers: Record<Tier, number>
  /** "18,402 rows across 8 datasets · 4 gold, 3 silver, 1 bronze". */
  text: string
}

/** "4 gold, 3 silver, 1 bronze", best first. */
export function tierMixText(counts: Record<Tier, number>): string {
  return [...TIERS]
    .reverse()
    .filter((t) => counts[t] > 0)
    .map((t) => `${counts[t]} ${t === 'none' ? 'with no data' : TIER_LABEL[t].toLowerCase()}`)
    .join(', ')
}

export function manifestSummary(rows: readonly ManifestRow[]): ManifestSummary {
  const tiers: Record<Tier, number> = { none: 0, bronze: 0, silver: 0, gold: 0 }
  for (const r of rows) tiers[r.tier]++
  const totalRows = rows.reduce((n, r) => n + r.rows, 0)
  const mix = tierMixText(tiers)
  return {
    uploaded: rows.filter((r) => r.source === 'upload').length,
    total: rows.length,
    totalRows,
    tiers,
    text: `${fmt(totalRows, 'int')} ${totalRows === 1 ? 'row' : 'rows'} across ${rows.length} datasets${mix ? ` · ${mix}` : ''}`,
  }
}

/** The manifest's table and export columns (a dataset's row count opens its rows, in the page). */
export const MANIFEST_COLUMNS: readonly Column<ManifestRow>[] = [
  { key: 'label', label: 'Dataset' },
  { key: 'feedsText', label: 'Feeds' },
  { key: 'sourceText', label: 'Source' },
  { key: 'tierLabel', label: 'Tier' },
  { key: 'rows', label: 'Rows', format: 'int' },
  { key: 'warnings', label: 'Rows with a warning', format: 'int' },
  { key: 'coverage', label: 'Field coverage', format: 'pct' },
  { key: 'certifiedText', label: 'Certified' },
  { key: 'issuesText', label: 'To reach the next tier' },
]

/** A dataset's tier mix as the Data room's header states it. */
export const datasetLine = (r: Pick<ManifestRow, 'label' | 'tierLabel' | 'rows'>): string =>
  `${r.label}: ${r.tierLabel}, ${fmt(r.rows, 'int')} ${r.rows === 1 ? 'row' : 'rows'}`
