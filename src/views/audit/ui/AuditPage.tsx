/**
 * The Audit page (docs/PLAN.md 9.4, 10.7): the entries the viewer may see (`auditModel`, through
 * `auditView`), newest first, with filters by record type, record, person and date. HR admin sees the
 * chain check ("Chain checks out (n entries)") and each entry's place in the chain; every other mode
 * sees "n entries", counted over the rows it can see, and no row carries a chain field. Components
 * render the model: the filters' rows and count come from the engine's `auditShown`.
 *
 * Audit entries are plan state, not a dataset, so nothing on the page takes a data tier (M2 browser
 * finding B4): the page reads no dataset field, and it renders under its own current view with no
 * datasets, so a number with no fields of its own is not gated on the shell's fallback datasets.
 */
import { useMemo, useState } from 'react'
import { Figure } from '@/charts'
import { CurrentViewProvider, useCurrentView } from '@/components/currentView'
import { IconSearch } from '@/components/icons'
import { KpiStrip } from '@/components/KpiStrip'
import { MultiSelect } from '@/components/MultiSelect'
import { Section } from '@/components/Section'
import { Button, cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { ABOUT_THIS_PAGE } from '@/help/copy'
import { AboutViewLink } from '@/help/ui/AboutViewLink'
import { definitionOf } from '@/metrics/api'
import type { AuditObject } from '@/plan/types'
import { type AuditFilters, auditModel, auditShown, NO_AUDIT_FILTERS } from '../engine'
import { ID } from '../metrics'

const DATE_INPUT =
  'h-8 rounded-control bg-sheet px-2 text-small text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none'

/** The page as the shell mounts it, under a current view that names no datasets (see the module comment). */
export function AuditPage() {
  const view = useCurrentView()
  const own = useMemo(
    () =>
      view
        ? { ...view, datasets: [] }
        : { key: 'audit' as const, label: 'Audit', tabs: [], tab: '', datasets: [] },
    [view],
  )
  return (
    <CurrentViewProvider value={own}>
      <AuditBody />
    </CurrentViewProvider>
  )
}

function AuditBody() {
  const ctx = useAnalytics()
  const m = useMemo(() => auditModel(ctx), [ctx])
  const [filters, setFilters] = useState<AuditFilters>(NO_AUDIT_FILTERS)
  const shown = useMemo(() => auditShown(ctx, filters), [ctx, filters])
  const set = (patch: Partial<AuditFilters>) => setFilters({ ...filters, ...patch })
  const definition = definitionOf(ctx.metrics, ID.entriesCount)
  return (
    <div>
      <div className="pt-5">
        <h1 className="cut-head text-page-title leading-[1.1] font-[650] tracking-[-0.01em]">Audit</h1>
        <p className="mt-1.5 max-w-[72ch] text-small text-ink-2">
          Every change to positions, requests, versions, assumptions, targets, freezes, cycles and month
          closes, with who made it, in which mode and when.
        </p>
        <p
          className={cx(
            'mt-1.5 text-small',
            m.chainOk === false ? 'font-medium text-bad-text' : 'text-ink-2',
          )}
        >
          {m.chainStatus}
          {m.chainNote ? `. ${m.chainNote}` : ''}
        </p>
        <p className="mt-1.5">
          <AboutViewLink view="audit" label={ABOUT_THIS_PAGE} />
        </p>
        <div className="mt-4 border-b border-rule" />
      </div>
      <div className="mt-5">
        <Section
          title="Entries"
          dek="Filter by record type, record, person or dates. The count follows the filters."
        >
          <KpiStrip id="audit-kpis" kpis={shown.kpis} />
          <div className="col-span-full flex flex-wrap items-center gap-2">
            <MultiSelect
              label="Record type"
              options={m.options.objects.map((o) => ({ value: o.value, label: o.label, count: o.count }))}
              value={[...filters.objects]}
              onChange={(v) => set({ objects: v as AuditObject[] })}
            />
            <label className="relative flex h-8 min-w-0 basis-40 items-center sm:max-w-[200px]">
              <span className="sr-only">Record ID</span>
              <IconSearch className="pointer-events-none absolute left-2.5 size-3.5 text-muted" />
              <input
                type="search"
                value={filters.record ?? ''}
                onChange={(e) => set({ record: e.currentTarget.value })}
                placeholder="Record, such as P-2052"
                className="h-8 w-full rounded-control bg-sheet pr-2 pl-8 text-small text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none placeholder:text-muted"
              />
            </label>
            <MultiSelect
              label="Person"
              width={260}
              options={m.options.people.map((o) => ({ value: o.value, label: o.label, count: o.count }))}
              value={[...filters.people]}
              onChange={(v) => set({ people: v })}
            />
            <label className="flex items-center gap-1.5 text-meta text-ink-2">
              From
              <input
                type="date"
                className={DATE_INPUT}
                value={filters.from ?? ''}
                min={m.options.first ?? undefined}
                max={m.options.last ?? undefined}
                onChange={(e) => set({ from: e.currentTarget.value || null })}
              />
            </label>
            <label className="flex items-center gap-1.5 text-meta text-ink-2">
              To
              <input
                type="date"
                className={DATE_INPUT}
                value={filters.to ?? ''}
                min={m.options.first ?? undefined}
                max={m.options.last ?? undefined}
                onChange={(e) => set({ to: e.currentTarget.value || null })}
              />
            </label>
            {shown.filtering && (
              <Button size="sm" variant="ghost" onClick={() => setFilters(NO_AUDIT_FILTERS)}>
                Clear filters
              </Button>
            )}
          </div>
          <Figure
            id="audit-entries"
            metric={ID.entriesCount}
            uses={shown.entries.uses}
            title={shown.entries.title}
            subtitle={shown.entries.subtitle}
            data={shown.entries.rows}
            columns={shown.entries.columns}
            definitions={definition ? [definition] : []}
            note={shown.entries.note ?? undefined}
            tableOnly
            gate={false}
            empty={shown.entries.empty}
          />
        </Section>
      </div>
    </div>
  )
}
