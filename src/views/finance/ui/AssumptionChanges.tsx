/**
 * Finance > Assumptions' changes (docs/PLAN.md 7.4, 9.4, 15.1 R18, R37; M3): change a value in
 * Working (Finance and HR admin: rates, bands, loads, drivers and accounts; an HRBP its own unit's
 * time to fill, fill rate and backfill settings) and set FX rates for a currency, rate set and months.
 * Finance's changes pass 7.4's edit rule in the action, which refuses one that moves cost for fewer
 * than 5 costed people; caps, dates and pay percentages are set by import and never offered outside
 * HR admin. Every choice and starting value comes from the model (`FinanceAssumptions.writes`).
 */
import { useMemo, useState } from 'react'
import { Button, Dialog } from '@/components'
import type { FxSet, Month } from '@/data/schema'
import { formatMonth } from '@/lib/dates'
import type { AssumptionWrites, EditableTable } from '../engine'
import { ChangeBar, Choice, Field, INPUT, Refusal, useSave } from './form'

const NEW = '__new'

const SET_LABEL: Readonly<Record<FxSet, string>> = {
  plan: 'Plan',
  actual: 'Actual (closed months)',
  forecast: 'Forecast (open months)',
}

export function AssumptionChanges({ writes }: { writes: AssumptionWrites }) {
  const [open, setOpen] = useState<'value' | 'fx' | null>(null)
  const { blocked } = useSave()
  const accesses = [writes.edit, writes.operational, writes.fx]
  if (!accesses.some((a) => a.shown)) return null
  const hrbp = writes.tables.some((t) => t.action === 'editOperational')
  return (
    <ChangeBar accesses={accesses}>
      {writes.note && !writes.versionId && <span className="text-meta text-ink-2">{writes.note}</span>}
      {writes.tables.length > 0 && (
        <Button size="sm" disabled={!!blocked} onClick={() => setOpen('value')}>
          {hrbp ? 'Change your unit’s settings' : 'Change a value'}
        </Button>
      )}
      {writes.fxForm && (
        <Button size="sm" disabled={!!blocked} onClick={() => setOpen('fx')}>
          Set FX rates
        </Button>
      )}
      {open === 'value' && <ValueDialog writes={writes} onClose={() => setOpen(null)} />}
      {open === 'fx' && <FxDialog writes={writes} onClose={() => setOpen(null)} />}
    </ChangeBar>
  )
}

/** "Company · P3", "Silicon Engineering · *". */
const valueLabel = (org: string | null, key: string): string => `${org ?? 'Company'} · ${key}`

function ValueDialog({ writes, onClose }: { writes: AssumptionWrites; onClose: () => void }) {
  const tables = writes.tables
  const [tableId, setTableId] = useState(tables[0]?.table ?? '')
  const table = tables.find((t) => t.table === tableId) ?? (tables[0] as EditableTable)
  const [pick, setPick] = useState(table?.values[0] ? '0' : NEW)
  const [org, setOrg] = useState(table?.orgs[0] ?? '')
  const [key, setKey] = useState(table?.keys[0] ?? '*')
  const current = pick === NEW ? null : (table?.values[Number(pick)] ?? null)
  const [value, setValue] = useState(current ? String(current.value) : '')
  const { save, busy, refused, blocked, setRefused } = useSave()
  const options = useMemo(
    () => [
      ...(table?.values ?? []).map((v, i) => ({
        value: String(i),
        label: `${valueLabel(v.org, v.key)} (${v.value})`,
      })),
      ...(table?.orgs.length ? [{ value: NEW, label: 'A new value for an org' }] : []),
    ],
    [table],
  )
  if (!table || !writes.versionId) return null
  const versionId = writes.versionId
  const note = current?.note ?? null
  const n = Number(value)
  const ready = value.trim() !== '' && Number.isFinite(n) && !note
  const row =
    pick === NEW
      ? { version: versionId, table: table.table, org: org || null, key, value: n }
      : {
          version: versionId,
          table: table.table,
          org: current?.org ?? null,
          key: current?.key ?? key,
          value: n,
        }
  return (
    <Dialog
      title={table.action === 'editOperational' ? 'Change your unit’s settings' : 'Change a value'}
      description={`In ${writes.versionName}. Each change is audited with your name.${writes.rule ? ` ${writes.rule}` : ''}`}
      open
      width={620}
      onOpenChange={(o) => !o && onClose()}
      footer={
        <>
          <Refusal text={refused} />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {current?.parent && current.org && (
            <Button
              disabled={!!blocked || busy || !!note}
              onClick={() =>
                void save(
                  'removeOverride',
                  { versionId, table: table.table, org: current.org as string, key: current.key },
                  onClose,
                )
              }
            >
              Remove override
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!!blocked || busy || !ready}
            onClick={() => void save(table.action, { versionId, rows: [row] }, onClose)}
          >
            {busy ? 'Checking' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Table" hint={table.hint} className="sm:col-span-2">
          {(id) => (
            <Choice
              id={id}
              value={table.table}
              options={tables.map((t) => ({ value: t.table, label: t.label }))}
              onChange={(v) => {
                const t = tables.find((x) => x.table === v)
                setTableId(v)
                setPick(t?.values[0] ? '0' : NEW)
                setValue(t?.values[0] ? String(t.values[0].value) : '')
                setOrg(t?.orgs[0] ?? '')
                setKey(t?.keys[0] ?? '*')
                setRefused(null)
              }}
            />
          )}
        </Field>
        <Field label="Value to change" className="sm:col-span-2">
          {(id) => (
            <Choice
              id={id}
              value={pick}
              options={options}
              onChange={(v) => {
                setPick(v)
                const x = v === NEW ? null : table.values[Number(v)]
                setValue(x ? String(x.value) : '')
                setRefused(null)
              }}
            />
          )}
        </Field>
        {pick === NEW && (
          <>
            <Field label="Org">
              {(id) => (
                <Choice
                  id={id}
                  value={org}
                  options={table.orgs.map((o) => ({ value: o, label: o }))}
                  onChange={setOrg}
                />
              )}
            </Field>
            <Field label="Key">
              {(id) => (
                <Choice
                  id={id}
                  value={key}
                  options={table.keys.map((k) => ({ value: k, label: k }))}
                  onChange={setKey}
                />
              )}
            </Field>
          </>
        )}
        {current?.parent && <p className="text-small text-ink-2 sm:col-span-2">{current.parent.note}</p>}
        <Field label="New value" hint={note ?? undefined}>
          {(id) => (
            <input
              id={id}
              type="number"
              step="any"
              className={INPUT}
              disabled={!!note}
              value={value}
              onChange={(e) => {
                setValue(e.currentTarget.value)
                setRefused(null)
              }}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}

function FxDialog({ writes, onClose }: { writes: AssumptionWrites; onClose: () => void }) {
  const form = writes.fxForm
  const [currency, setCurrency] = useState(form?.currencies[0] ?? '')
  const [set, setSet] = useState<FxSet>('plan')
  const [from, setFrom] = useState<Month>(form?.months[0] as Month)
  const [to, setTo] = useState<Month>(form?.months[form.months.length - 1] as Month)
  const [rate, setRate] = useState('')
  const { save, busy, refused, blocked, setRefused } = useSave()
  if (!form || !writes.versionId) return null
  const versionId = writes.versionId
  const months = form.months.filter((m) => m >= from && m <= to)
  const n = Number(rate)
  const ready = rate.trim() !== '' && Number.isFinite(n) && n > 0 && months.length > 0
  const monthOptions = form.months.map((m) => ({ value: m, label: formatMonth(`${m}-01`) }))
  return (
    <Dialog
      title="Set FX rates"
      description={`USD per 1 unit of the currency, in ${writes.versionName}. Locked versions keep their own rates.${writes.rule ? ` ${writes.rule}` : ''}`}
      open
      onOpenChange={(o) => !o && onClose()}
      footer={
        <>
          <Refusal text={refused} />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!!blocked || busy || !ready}
            onClick={() =>
              void save(
                'setFx',
                { versionId, rates: months.map((month) => ({ currency, set, month, usdPerLocal: n })) },
                onClose,
              )
            }
          >
            {busy ? 'Checking' : `Save ${months.length} ${months.length === 1 ? 'rate' : 'rates'}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Currency">
          {(id) => (
            <Choice
              id={id}
              value={currency}
              options={form.currencies.map((c) => ({ value: c, label: c }))}
              onChange={(v) => {
                setCurrency(v)
                setRefused(null)
              }}
            />
          )}
        </Field>
        <Field label="Rate set">
          {(id) => (
            <Choice<FxSet>
              id={id}
              value={set}
              options={form.sets.map((s) => ({ value: s, label: SET_LABEL[s] }))}
              onChange={setSet}
            />
          )}
        </Field>
        <Field label="From">
          {(id) => <Choice<Month> id={id} value={from} options={monthOptions} onChange={setFrom} />}
        </Field>
        <Field label="To">
          {(id) => <Choice<Month> id={id} value={to} options={monthOptions} onChange={setTo} />}
        </Field>
        <Field label="USD per 1 unit" className="sm:col-span-2">
          {(id) => (
            <input
              id={id}
              type="number"
              step="any"
              min={0}
              className={INPUT}
              value={rate}
              onChange={(e) => {
                setRate(e.currentTarget.value)
                setRefused(null)
              }}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}
