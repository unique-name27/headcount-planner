/**
 * Metric definitions (the template app's dictionary tab): every number Headcount Planner shows, with
 * its definition, formula, population, window, owner and calculation settings, each one editable in
 * HR admin (`ui:edit-definition`), and a change log; locked rules (the anonymity minimum, the cost
 * guard's minimums and rounding step, raise only) show their settings and accept only a raise. Edits
 * go through the dictionary's pure reducers (`@/metrics/overrides`) and the dictionary store
 * (src/app/dictionary.ts), so the analytics context, every engine and the exports follow at once.
 */
import { useState } from 'react'
import { useDictionary } from '@/app/dictionary'
import { Figure } from '@/charts'
import { Grid, Section } from '@/components'
import { goTo } from '@/components/navigation'
import { Button, Tag } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { useStore } from '@/data/store'
import { formatDate } from '@/lib/dates'
import { CATALOG } from '@/metrics/catalog'
import { applyEdit, resetMetric } from '@/metrics/overrides'
import { parseParamInput } from '@/metrics/params'
import { paramField } from '@/metrics/registry'
import { TEXT_FIELDS, type TextField } from '@/metrics/types'
import type { DataRoomModel } from '../engine'
import { type DefinitionRow, settingRows } from '../engine/definitions'
import { tabRoute } from '../engine/links'

const TEXT_LABEL: Readonly<Record<TextField, string>> = {
  definition: 'Definition',
  formula: 'Formula',
  population: 'Population',
  owner: 'Owner',
}

const INPUT = 'w-full rounded-control border border-rule-strong bg-sheet px-2 py-1 text-small text-ink'

function TextEditor({
  label,
  value,
  editable,
  onSave,
}: {
  label: string
  value: string
  editable: boolean
  onSave: (v: string) => string | null
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="border-t border-rule py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-meta font-semibold text-ink-2">{label}</dt>
        {editable && draft == null && (
          <Button size="sm" variant="ghost" onClick={() => setDraft(value)}>
            Edit
          </Button>
        )}
      </div>
      {draft == null ? (
        <dd className="mt-0.5 text-small text-ink">{value || '—'}</dd>
      ) : (
        <dd className="mt-1">
          <textarea
            className={INPUT}
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={label}
          />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const err = onSave(draft)
                setError(err)
                if (!err) setDraft(null)
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            {error && <span className="text-meta text-bad-text">{error}</span>}
          </div>
        </dd>
      )}
    </div>
  )
}

function SettingEditor({
  metricId,
  setting,
  editable,
  onSave,
}: {
  metricId: string
  setting: ReturnType<typeof settingRows>[number]
  editable: boolean
  onSave: (raw: string) => string | null
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <li className="border-t border-rule py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-small font-semibold text-ink">{setting.label}</span>
        <span className="flex items-center gap-2 text-small text-ink">
          {setting.value}
          {setting.changed && <span className="text-meta text-muted">default {setting.defaultValue}</span>}
          {setting.locked === 'raiseOnly' && <Tag>Raise only</Tag>}
          {setting.locked === true && <Tag>Locked</Tag>}
        </span>
      </div>
      <p className="mt-0.5 text-meta text-ink-2">{setting.description}</p>
      {editable && setting.locked !== true && (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {draft == null ? (
            <Button size="sm" variant="ghost" onClick={() => setDraft(setting.value)}>
              Change
            </Button>
          ) : (
            <>
              <input
                className={`${INPUT} w-40`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label={`${setting.label} for ${metricId}`}
              />
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  const err = onSave(draft)
                  setError(err)
                  if (!err) setDraft(null)
                }}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </>
          )}
          {error && <span className="text-meta text-bad-text">{error}</span>}
        </div>
      )}
    </li>
  )
}

function MetricDetail({ row }: { row: DefinitionRow }) {
  const ctx = useAnalytics()
  const state = useDictionary((s) => s.state)
  const commit = useDictionary((s) => s.commit)
  const readOnly = useStore((s) => s.readOnly)
  const def = ctx.metrics.def(row.metricId)
  if (!def) return null
  const editable = ctx.access.can('ui:edit-definition') && !readOnly
  const by = ctx.access.actingAs?.name ?? null
  const save = (field: Parameters<typeof applyEdit>[2]['field'], value: unknown): string | null => {
    const r = applyEdit(state, CATALOG, { metricId: row.metricId, field, value }, { by })
    if (!r.ok) return r.error
    commit(r.state)
    return null
  }
  const settings = settingRows(ctx, row.metricId)
  const log = state.log.filter((c) => c.metricId === row.metricId).slice(0, 10)
  return (
    <Section
      title={def.name}
      id="metric-detail"
      dek={`${row.viewLabel} · ${row.metricId}${row.tierLabel ? ` · ${row.tierLabel}` : ''}`}
      actions={
        editable && row.changed ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => commit(resetMetric(state, CATALOG, row.metricId, { by }))}
          >
            Reset to defaults
          </Button>
        ) : undefined
      }
    >
      <div className="col-span-full rounded-sheet bg-sheet px-4 py-3 lg:col-span-7 lg:px-5">
        <dl>
          {TEXT_FIELDS.map((f) => (
            <TextEditor
              key={f}
              label={TEXT_LABEL[f]}
              value={(def[f] as string | undefined) ?? ''}
              editable={editable && !def.locked}
              onSave={(v) => save(f, v)}
            />
          ))}
          <div className="border-t border-rule py-2.5">
            <dt className="text-meta font-semibold text-ink-2">Window</dt>
            <dd className="mt-0.5 text-small text-ink">{def.window ?? '—'}</dd>
          </div>
          <div className="border-t border-rule py-2.5">
            <dt className="text-meta font-semibold text-ink-2">Data used</dt>
            <dd className="mt-0.5 text-small text-ink">{def.uses.length ? def.uses.join(', ') : 'None'}</dd>
          </div>
        </dl>
      </div>
      <div className="col-span-full rounded-sheet bg-sheet px-4 py-3 lg:col-span-5 lg:px-5">
        <h3 className="cut-head text-title font-semibold">Settings</h3>
        {settings.length ? (
          <ul className="mt-1">
            {settings.map((s) => (
              <SettingEditor
                key={s.key}
                metricId={row.metricId}
                setting={s}
                editable={editable}
                onSave={(raw) => {
                  const p = def.params.find((x) => x.key === s.key)
                  if (!p) return 'No such setting.'
                  const parsed = parseParamInput(p, raw)
                  if (!parsed.ok) return parsed.error
                  return save(paramField(s.key), parsed.value)
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-small text-ink-2">This entry has no calculation settings.</p>
        )}
        <h3 className="cut-head mt-5 text-title font-semibold">Changes</h3>
        {log.length ? (
          <ul className="mt-1 space-y-1 text-meta text-ink-2">
            {log.map((c) => (
              <li key={c.id}>
                {formatDate(c.at.slice(0, 10))}: {c.field} {c.kind === 'reset' ? 'reset' : 'changed'}
                {c.by ? ` by ${c.by}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-small text-ink-2">Unchanged since the defaults.</p>
        )}
      </div>
    </Section>
  )
}

export function MetricsTab({ model, selected }: { model: DataRoomModel; selected: string | null }) {
  const fig = model.metrics.definitions
  const rows = fig.rows as readonly DefinitionRow[]
  const row = selected ? rows.find((r) => r.metricId === selected) : undefined
  return (
    <>
      <Grid>
        <Figure
          id="data-metric-definitions"
          metric={fig.metric}
          uses={fig.uses}
          title={fig.title}
          subtitle={fig.subtitle}
          data={rows}
          columns={fig.columns}
          note={fig.note ?? undefined}
          gate={false}
          tableOnly
          table={{
            search: 'Find a metric',
            maxRows: 25,
            onRowClick: (r) => goTo('data', tabRoute('metrics', r.metricId)),
          }}
          empty={fig.empty}
        />
      </Grid>
      {row && <MetricDetail key={row.metricId} row={row} />}
    </>
  )
}
