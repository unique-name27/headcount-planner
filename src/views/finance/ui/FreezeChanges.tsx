/**
 * Finance > Freezes' changes (docs/PLAN.md 8.3 `freeze.create`, `freeze.edit`, 10.4, R10; M3): set a
 * hiring freeze on a unit, department, cost center or leader's tree from a date, open-ended or to a
 * last day, with or without backfills, and change a freeze's dates, backfill rule or reason. A freeze
 * blocks new requests in its org, holds unstarted openings (the openings held list and the savings
 * follow) and honors accepted offers. The reason is shown with the freeze notice, so an amount in it
 * is refused. Every choice comes from the model (`FinanceFreezes.writes`).
 */
import { useMemo, useState } from 'react'
import { FREE_TEXT_HINT } from '@/access/copy'
import { Button, Dialog, Switch } from '@/components'
import type { FreezeRow, ISODate } from '@/data/schema'
import type { FreezeListRow, FreezeOrgOption, FreezeWrites } from '../engine'
import { ChangeBar, Choice, Field, INPUT, Refusal, TEXTAREA, useSave } from './form'

type Kind = FreezeOrgOption['kind']

const KIND_LABEL: Readonly<Record<Kind, string>> = {
  unit: 'Business unit',
  department: 'Department',
  costCenter: 'Cost center',
  leader: 'Leader’s org',
}

export function FreezeChanges({ writes, rows }: { writes: FreezeWrites; rows: readonly FreezeListRow[] }) {
  const [open, setOpen] = useState<'create' | 'edit' | null>(null)
  const { blocked } = useSave()
  return (
    <ChangeBar accesses={[writes.create.access, writes.edit.access]}>
      {writes.create.access.shown && (
        <Button
          size="sm"
          disabled={!!blocked || !writes.create.orgs.length}
          onClick={() => setOpen('create')}
        >
          New freeze
        </Button>
      )}
      {writes.edit.access.shown && (
        <Button
          size="sm"
          disabled={!!blocked || !writes.edit.freezeIds.length}
          onClick={() => setOpen('edit')}
        >
          Change a freeze
        </Button>
      )}
      {open === 'create' && <CreateDialog writes={writes} onClose={() => setOpen(null)} />}
      {open === 'edit' && <EditDialog writes={writes} rows={rows} onClose={() => setOpen(null)} />}
    </ChangeBar>
  )
}

/** A freeze row's org fields from a picked org. */
function orgFields(
  o: FreezeOrgOption,
): Pick<FreezeRow, 'businessUnit' | 'department' | 'costCenter' | 'leaderPositionId'> {
  return {
    businessUnit: o.businessUnit,
    department: o.kind === 'department' ? o.value : null,
    costCenter: o.kind === 'costCenter' ? o.value : null,
    leaderPositionId: o.kind === 'leader' ? o.value : null,
  }
}

function CreateDialog({ writes, onClose }: { writes: FreezeWrites; onClose: () => void }) {
  const orgs = writes.create.orgs
  const kinds = useMemo(() => [...new Set(orgs.map((o) => o.kind))], [orgs])
  const [kind, setKind] = useState<Kind>(kinds[0] ?? 'unit')
  const ofKind = orgs.filter((o) => o.kind === kind)
  const [pick, setPick] = useState(0)
  const [start, setStart] = useState<string>(writes.create.defaultStart)
  const [end, setEnd] = useState('')
  const [allowBackfill, setAllowBackfill] = useState(true)
  const [reason, setReason] = useState('')
  const { save, busy, refused, blocked } = useSave()
  const org = ofKind[pick] ?? ofKind[0]
  return (
    <Dialog
      title="New freeze"
      description="A freeze blocks new requests in its org, holds openings that have not started and honors accepted offers. An exception adds a Finance step."
      open
      width={620}
      onOpenChange={(o) => !o && onClose()}
      footer={
        <>
          <Refusal text={refused} />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!!blocked || busy || !org || !start}
            onClick={() =>
              void save(
                'createFreeze',
                {
                  ...orgFields(org as FreezeOrgOption),
                  startDate: start as ISODate,
                  endDate: (end || null) as ISODate | null,
                  allowBackfill,
                  reason: reason.trim() || null,
                },
                onClose,
              )
            }
          >
            {busy ? 'Saving' : 'Save freeze'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Freeze">
          {(id) => (
            <Choice<Kind>
              id={id}
              value={kind}
              options={kinds.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              onChange={(k) => {
                setKind(k)
                setPick(0)
              }}
            />
          )}
        </Field>
        <Field label="Org">
          {(id) => (
            <Choice
              id={id}
              value={String(pick)}
              options={ofKind.map((o, i) => ({ value: String(i), label: o.label }))}
              onChange={(v) => setPick(Number(v))}
            />
          )}
        </Field>
        <Field label="From">
          {(id) => (
            <input
              id={id}
              type="date"
              className={INPUT}
              value={start}
              onChange={(e) => setStart(e.currentTarget.value)}
            />
          )}
        </Field>
        <Field label="To" hint="Leave blank for a freeze with no end yet.">
          {(id) => (
            <input
              id={id}
              type="date"
              className={INPUT}
              value={end}
              onChange={(e) => setEnd(e.currentTarget.value)}
            />
          )}
        </Field>
        <div className="sm:col-span-2">
          <Switch checked={allowBackfill} onChange={setAllowBackfill} label="Backfills allowed" />
        </div>
        <Field label="Reason" hint={FREE_TEXT_HINT} className="sm:col-span-2">
          {(id) => (
            <textarea
              id={id}
              className={TEXTAREA}
              value={reason}
              maxLength={240}
              onChange={(e) => setReason(e.currentTarget.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}

function EditDialog({
  writes,
  rows,
  onClose,
}: {
  writes: FreezeWrites
  rows: readonly FreezeListRow[]
  onClose: () => void
}) {
  const ids = writes.edit.freezeIds
  const [freezeId, setFreezeId] = useState(ids[0] ?? '')
  const row = rows.find((r) => r.freezeId === freezeId)
  return (
    <Dialog
      title="Change a freeze"
      description="Change its dates, whether backfills are allowed, or its reason. Its org stays: end it and set another to move it."
      open
      width={620}
      onOpenChange={(o) => !o && onClose()}
    >
      <div className="flex flex-col gap-3">
        <Field label="Freeze">
          {(id) => (
            <Choice
              id={id}
              value={freezeId}
              options={ids.map((f) => {
                const r = rows.find((x) => x.freezeId === f)
                return { value: f, label: r ? `${f} · ${r.org}` : f }
              })}
              onChange={setFreezeId}
            />
          )}
        </Field>
        {row && <EditBody key={row.freezeId} row={row} onClose={onClose} />}
      </div>
    </Dialog>
  )
}

/** The form for one freeze (keyed by it, so its state starts from the freeze's values). */
function EditBody({ row, onClose }: { row: FreezeListRow; onClose: () => void }) {
  const [start, setStart] = useState<string>(row.startDate)
  const [end, setEnd] = useState<string>(row.endDate ?? '')
  const [allowBackfill, setAllowBackfill] = useState(row.allowBackfill)
  const [reason, setReason] = useState('')
  const { save, busy, refused, blocked } = useSave()
  const patch = {
    ...(start !== row.startDate ? { startDate: start as ISODate } : {}),
    ...(end !== (row.endDate ?? '') ? { endDate: (end || null) as ISODate | null } : {}),
    ...(allowBackfill !== row.allowBackfill ? { allowBackfill } : {}),
    ...(reason.trim() ? { reason: reason.trim() } : {}),
  }
  return (
    <div className="flex flex-col gap-3 border-t border-rule pt-3">
      <p className="text-small text-ink-2">
        {row.openingsHeld} {row.openingsHeld === 1 ? 'opening' : 'openings'} held, {row.exceptions}{' '}
        {row.exceptions === 1 ? 'exception' : 'exceptions'}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From">
          {(id) => (
            <input
              id={id}
              type="date"
              className={INPUT}
              value={start}
              onChange={(e) => setStart(e.currentTarget.value)}
            />
          )}
        </Field>
        <Field label="To" hint="Blank: no end yet. Ending a freeze early is a change of its end.">
          {(id) => (
            <input
              id={id}
              type="date"
              className={INPUT}
              value={end}
              onChange={(e) => setEnd(e.currentTarget.value)}
            />
          )}
        </Field>
      </div>
      <Switch checked={allowBackfill} onChange={setAllowBackfill} label="Backfills allowed" />
      <Field label="New reason" hint={FREE_TEXT_HINT}>
        {(id) => (
          <textarea
            id={id}
            className={TEXTAREA}
            value={reason}
            maxLength={240}
            onChange={(e) => setReason(e.currentTarget.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Refusal text={refused} />
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!!blocked || busy || !Object.keys(patch).length}
          onClick={() => void save('editFreeze', { freezeId: row.freezeId, patch }, onClose)}
        >
          {busy ? 'Saving' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}
