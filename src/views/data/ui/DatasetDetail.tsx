/**
 * One dataset's panels (the template app's DatasetDetail, for HCP's datasets): Raw (the original
 * sheet of an upload with its import log, or the rows as loaded for the sample, which is generated in
 * this browser), Mapping (which column filled each field, and confirming it), Quality (the tier, what
 * keeps it from the next one, every check and every field's coverage) and Certify (a local
 * attestation by the data owner for this exact version, with control totals). Pay and leave columns
 * stay hidden unless HR admin shows pay amounts (docs/PLAN.md 5.2, 7.5). Confirming and certifying
 * are HR admin's (`action:data.import`) and refuse in a tab that only reads.
 */
import { type ReactNode, useEffect, useState } from 'react'
import { type Column, DataTable } from '@/charts'
import { Section } from '@/components'
import { goTo } from '@/components/navigation'
import { TierBadge } from '@/components/tier/TierBadge'
import { Button, cx, Segmented, StatusPill } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { ISSUE_COLUMNS, issueTableRows, summarizeIssues } from '@/data/import/issues'
import { controlMetricsFor } from '@/data/quality/rules'
import type { RawRecord } from '@/data/quality/types'
import { isCertified } from '@/data/quality/versions'
import { type DatasetKey, datasetDef } from '@/data/schema'
import { useStore } from '@/data/store'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import { DATASET_PANELS, type DatasetPanel, datasetTab, PANEL_LABEL } from '../engine/links'
import type { ManifestRow } from '../engine/manifest'
import { FIELD_COLUMNS, fieldRows } from '../engine/quality'
import { ReplaceDataset } from './ReplaceDataset'

const PREVIEW_ROWS = 20

/** Fields of a dataset that hold one person's pay or leave: hidden unless pay amounts are shown. */
function hiddenFields(key: DatasetKey, showPay: boolean): Set<string> {
  if (showPay) return new Set()
  return new Set(
    datasetDef(key)
      .fields.filter((f) => f.pay || f.leave)
      .map((f) => f.key),
  )
}

function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="col-span-full rounded-sheet bg-sheet px-4 py-4 lg:px-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="cut-head text-title font-semibold">{title}</h3>
        {actions}
      </div>
      {children}
    </div>
  )
}

/* ───────────── Raw ───────────── */

function RawPanel({ row }: { row: ManifestRow }) {
  const ctx = useAnalytics()
  const getRaw = useStore((s) => s.getRaw)
  const version = useStore((s) => s.versions[row.key])
  const [raw, setRaw] = useState<RawRecord | null | 'loading'>(row.source === 'upload' ? 'loading' : null)
  useEffect(() => {
    if (row.source !== 'upload') return
    let live = true
    getRaw(row.key).then(
      (r) => live && setRaw(r),
      () => live && setRaw(null),
    )
    return () => {
      live = false
    }
  }, [row.key, row.source, getRaw])
  const hide = hiddenFields(row.key, ctx.showPay)
  if (row.source === 'upload') {
    if (raw === 'loading') return <p className="text-small text-muted">Reading the original sheet.</p>
    if (!raw)
      return (
        <p className="text-small text-ink-2">
          The original sheet of this version is not kept in this browser.
        </p>
      )
    // A source column that filled a pay or leave field stays hidden with it.
    const mapped = version?.mapping ?? {}
    const hiddenHeaders = new Set(
      Object.entries(mapped)
        .filter(([field, m]) => hide.has(field) && m.header)
        .map(([, m]) => m.header as string),
    )
    const headers = raw.sheet.headers.filter((h) => !hiddenHeaders.has(h))
    const columns: Column<Record<string, unknown>>[] = headers.map((h) => ({ key: h, label: h }))
    const summary = summarizeIssues(raw.issues)
    return (
      <>
        <p className="mb-3 text-small text-ink-2">
          {raw.sheet.name}: {plural(raw.sheet.rows.length, 'row')}. The first {PREVIEW_ROWS} as they came in.
          {hiddenHeaders.size > 0 && ' Pay and leave columns are hidden while pay amounts are off.'}
        </p>
        <DataTable
          columns={columns}
          rows={raw.sheet.rows.slice(0, PREVIEW_ROWS)}
          caption="The original sheet"
          density="compact"
        />
        <h4 className="mt-5 mb-2 text-small font-semibold">What the import changed</h4>
        {summary.length ? (
          <ul className="space-y-1 text-small text-ink-2">
            {summary.map((s) => (
              <li key={`${s.code}|${s.field}|${s.action}`}>
                {s.message} ({fmt(s.count, 'int')})
                {hide.has(s.field) ? '' : s.examples.length ? `: ${s.examples.join(', ')}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-ink-2">Nothing was changed on the way in.</p>
        )}
        {raw.issues.length > 0 && (
          <div className="mt-3">
            <DataTable
              columns={ISSUE_COLUMNS}
              rows={issueTableRows(raw.issues).filter((i) => !hide.has(String(i.field)))}
              caption="The import log"
              density="compact"
              maxRows={20}
            />
          </div>
        )}
      </>
    )
  }
  const def = datasetDef(row.key)
  const columns: Column<Record<string, unknown>>[] = def.fields
    .filter((f) => !hide.has(f.key))
    .map((f) => ({ key: f.key, label: f.label }))
  const rows = (ctx.all[row.key] as unknown as readonly Record<string, unknown>[]).slice(0, PREVIEW_ROWS)
  return (
    <>
      <p className="mb-3 text-small text-ink-2">
        {row.source === 'none'
          ? 'Nothing is loaded for this dataset. It is optional: the views run without it and say what is missing.'
          : `The sample is generated in this browser on every load, so there is no file behind it. The first ${PREVIEW_ROWS} of its ${plural(row.rows, 'row')} as loaded.`}
        {hide.size > 0 && ' Pay and leave columns are hidden while pay amounts are off.'}
      </p>
      {rows.length > 0 && (
        <DataTable columns={columns} rows={rows} caption={`${def.label} as loaded`} density="compact" />
      )}
    </>
  )
}

/* ───────────── Mapping ───────────── */

function MappingPanel({ row }: { row: ManifestRow }) {
  const ctx = useAnalytics()
  const version = useStore((s) => s.versions[row.key])
  const readOnly = useStore((s) => s.readOnly)
  const confirmMapping = useStore((s) => s.confirmMapping)
  const [note, setNote] = useState<string | null>(null)
  const mapping = version?.mapping ?? {}
  const def = datasetDef(row.key)
  const entries = def.fields.map((f) => ({
    field: f.label,
    requirement: f.required ? 'Required' : f.recommended ? 'Recommended' : 'Optional',
    header: mapping[f.key]?.header ?? '',
    confidence: mapping[f.key]?.confidence ?? '',
    confirmed: mapping[f.key]?.confirmed ? 'Yes' : '',
  }))
  if (!Object.keys(mapping).length)
    return (
      <p className="text-small text-ink-2">
        {row.source === 'upload'
          ? 'This version was loaded without a record of its columns.'
          : 'The sample is generated with the dataset’s own fields, so there is no column mapping to review.'}
      </p>
    )
  const can = ctx.access.can('action:data.import') && !readOnly
  const by = ctx.access.actingAs?.name ?? 'HR admin'
  return (
    <>
      <p className="mb-3 text-small text-ink-2">
        {version?.mappingConfirmedAt
          ? `Mapping confirmed ${formatDate(version.mappingConfirmedAt.slice(0, 10))}${version.mappingConfirmedBy ? ` by ${version.mappingConfirmedBy}` : ''}.`
          : 'The mapping has not been reviewed yet. A dataset reaches silver once a person confirms it and its checks pass.'}
      </p>
      <DataTable
        columns={[
          { key: 'field', label: 'Field' },
          { key: 'requirement', label: 'Requirement' },
          { key: 'header', label: 'Column in the file' },
          { key: 'confidence', label: 'Match' },
          { key: 'confirmed', label: 'Reviewed' },
        ]}
        rows={entries}
        caption="Column mapping"
        density="compact"
      />
      {can && !version?.mappingConfirmedAt && (
        <div className="mt-3 flex items-center gap-3">
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              confirmMapping(row.key, by).then(
                () => setNote('Mapping confirmed.'),
                (e: unknown) =>
                  setNote(e instanceof Error ? e.message : 'The mapping could not be confirmed.'),
              )
            }
          >
            Confirm mapping
          </Button>
          {note && <span className="text-meta text-ink-2">{note}</span>}
        </div>
      )}
    </>
  )
}

/* ───────────── Quality ───────────── */

function QualityPanel({ row }: { row: ManifestRow }) {
  const ctx = useAnalytics()
  const q = ctx.quality.dataset(row.key)
  const checks = ctx.quality.checks(row.key)
  const fields = fieldRows(ctx).filter((f) => f.dataset === row.key)
  return (
    <>
      <p className="mb-3 text-small text-ink-2">{ctx.quality.explain(row.key)}</p>
      {q.missing.length > 0 && (
        <p className="mb-3 text-small text-ink-2">To reach the next tier: {q.missing.join('; ')}.</p>
      )}
      <ul className="mb-4 space-y-1.5" aria-label="Checks">
        {checks.map((c) => (
          <li key={c.id} className="flex flex-wrap items-baseline gap-2 text-small">
            <StatusPill
              severity={c.pass ? 'good' : c.gate ? 'warning' : 'info'}
              quiet
              label={c.pass ? 'Passes' : 'Fails'}
            />
            <span className="font-medium text-ink">{c.label}</span>
            <span className="text-ink-2">{c.detail}</span>
          </li>
        ))}
      </ul>
      <DataTable
        columns={FIELD_COLUMNS.filter((c) => c.key !== 'datasetLabel')}
        rows={fields}
        caption="Fields"
        density="compact"
      />
    </>
  )
}

/* ───────────── Certify ───────────── */

function CertifyPanel({ row }: { row: ManifestRow }) {
  const ctx = useAnalytics()
  const version = useStore((s) => s.versions[row.key])
  const readOnly = useStore((s) => s.readOnly)
  const certify = useStore((s) => s.certify)
  const revoke = useStore((s) => s.revokeCertification)
  const [note, setNote] = useState('')
  const [metric, setMetric] = useState('')
  const [expected, setExpected] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const certified = isCertified(version)
  const cert = certified ? version?.certification : null
  const can = ctx.access.can('action:data.import') && !readOnly
  const metrics = controlMetricsFor(row.key).filter((m) => ctx.showPay || !m.pay)
  const by = ctx.access.actingAs?.name ?? 'HR admin'
  const done = (text: string) => () => setMessage(text)
  const failed = (e: unknown) => setMessage(e instanceof Error ? e.message : 'That did not work.')
  return (
    <>
      {cert ? (
        <div className="mb-3 text-small text-ink-2">
          <p>
            Certified {formatDate(cert.at.slice(0, 10))} by {cert.by} for this version.
            {cert.note ? ` ${cert.note}` : ''}
          </p>
          {(cert.controlTotals ?? []).length > 0 && (
            <ul className="mt-2 space-y-1">
              {(cert.controlTotals ?? []).map((t) => (
                <li key={`${t.metric}-${t.label}`}>
                  {t.label}: expected {fmt(t.expected, 'int')}, found {fmt(t.actual ?? null, 'int')}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mb-3 text-small text-ink-2">
          Not certified. Certifying is a local attestation by the data owner that this exact version is right:
          it is kept in this browser and is not a sign-in. Gold also needs the mapping confirmed, the checks
          passing and fresh data.
        </p>
      )}
      {can && version && (
        <div className="flex flex-col gap-3">
          {!cert && (
            <>
              <label className="flex flex-col gap-1 text-meta text-ink-2">
                Note (optional)
                <input
                  className="h-8 max-w-md rounded-control border border-rule-strong bg-sheet px-2 text-small text-ink"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Do not include pay, performance or health details."
                />
              </label>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-meta text-ink-2">
                  Control total (optional)
                  <select
                    className="h-8 rounded-control border border-rule-strong bg-sheet px-2 text-small text-ink"
                    value={metric}
                    onChange={(e) => setMetric(e.target.value)}
                  >
                    <option value="">None</option>
                    {metrics.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                {metric && (
                  <label className="flex flex-col gap-1 text-meta text-ink-2">
                    Expected
                    <input
                      inputMode="numeric"
                      className="h-8 w-32 rounded-control border border-rule-strong bg-sheet px-2 text-small text-ink"
                      value={expected}
                      onChange={(e) => setExpected(e.target.value)}
                    />
                  </label>
                )}
              </div>
            </>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {cert ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => revoke(row.key).then(done('Certification removed.'), failed)}
              >
                Remove certification
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  const m = metrics.find((x) => x.id === metric)
                  const n = Number(expected.replace(/,/g, ''))
                  certify(row.key, {
                    by,
                    ...(note.trim() ? { note: note.trim() } : {}),
                    ...(m && Number.isFinite(n) && expected.trim()
                      ? { controlTotals: [{ label: m.label, metric: m.id, expected: n, tolerance: 0.005 }] }
                      : {}),
                  }).then(done('Certified.'), failed)
                }}
              >
                Certify this version
              </Button>
            )}
            {message && <span className="text-meta text-ink-2">{message}</span>}
          </div>
        </div>
      )}
    </>
  )
}

/* ───────────── the detail ───────────── */

const BODY: Readonly<Record<DatasetPanel, (p: { row: ManifestRow }) => ReactNode>> = {
  raw: RawPanel,
  mapping: MappingPanel,
  quality: QualityPanel,
  certify: CertifyPanel,
}

export function DatasetDetail({ row, panel }: { row: ManifestRow; panel: DatasetPanel }) {
  const ctx = useAnalytics()
  const Body = BODY[panel]
  return (
    <Section
      data-tour="dataset-detail"
      title={row.label}
      id={`dataset-${row.key}`}
      dek={row.description}
      actions={
        <span className="flex flex-wrap items-center gap-3">
          <ReplaceDataset row={row} />
          <TierBadge
            tier={row.tier}
            explain={ctx.quality.explain(row.key)}
            onOpen={() => goTo('data', datasetTab(row.key, 'quality'))}
          />
          <Segmented<DatasetPanel>
            label={`${row.label} panels`}
            value={panel}
            onChange={(p) => goTo('data', datasetTab(row.key, p))}
            options={DATASET_PANELS.map((p) => ({ value: p, label: PANEL_LABEL[p] }))}
          />
        </span>
      }
    >
      <Panel title={PANEL_LABEL[panel]}>
        <div className={cx('min-w-0')}>
          <Body row={row} />
        </div>
      </Panel>
    </Section>
  )
}
