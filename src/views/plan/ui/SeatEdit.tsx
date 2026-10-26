/**
 * HRBP Working edits on Plan > Positions (docs/PLAN.md 8.3 `position.edit`, 9.4, 10.1, C23, C24): pick
 * an Open, Planned or On hold seat the mode may edit, change its start, level, location, FTE or hold
 * with a required reason, or save an Elimination draft for it instead. Every choice and starting value
 * is the engine's (`seatEditsOf`, `seatEditOf`); the writes go through the app's write hook
 * (`usePlanWrite().run('editSeat' | 'requestElimination' | 'submitRequest')`), which checks the policy
 * and the person-level rules again and signs the audit as the Acting as person. A refusal shows beside
 * the buttons in the action's own words; a notice shows as a toast. No amount anywhere.
 */
import { useMemo, useState } from 'react'
import { FREE_TEXT_HINT } from '@/access/copy'
import { usePlanWrite } from '@/app/write/usePlanWrite'
import { WriteBlocked } from '@/app/write/WriteBlocked'
import { Button, Dialog, Switch, toast } from '@/components'
import { useAnalytics } from '@/data/context'
import { type ISODate, LEVEL_LABELS, type Level, type ReasonCode } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import {
  changedByHrbp,
  eliminationInputOf,
  requestIdIn,
  type SeatEditFacts,
  type SeatEdits,
  type SeatForm,
  seatChangesOf,
  seatEditInputOf,
  seatEditOf,
} from '../engine/edits'
import { Choice, Field, filterOptions, INPUT, Refusal, TEXTAREA } from './form'

/** The bar above the grid: "Change a seat", or why the mode makes no Working edits here. */
export function SeatEditBar({ edits }: { edits: SeatEdits }) {
  const write = usePlanWrite()
  const [open, setOpen] = useState(false)
  if (!edits.offered) return null
  const blocked = write.blocked
  return (
    <div className="col-span-full flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        size="sm"
        disabled={
          !!blocked || !!edits.why || !write.can('editSeat') || !(edits.seats.length + edits.others.length)
        }
        onClick={() => setOpen(true)}
      >
        Change a seat in Working
      </Button>
      <WriteBlocked blocked={blocked} />
      {!blocked && edits.why && <span className="text-meta text-ink-2">{edits.why}</span>}
      {!blocked && !edits.why && !edits.seats.length && (
        <span className="text-meta text-muted">No Open or Planned seat in this scope takes edits.</span>
      )}
      {open && <SeatEditDialog edits={edits} onClose={() => setOpen(false)} />}
    </div>
  )
}

function SeatEditDialog({ edits, onClose }: { edits: SeatEdits; onClose: () => void }) {
  const ctx = useAnalytics()
  const [picked, setPicked] = useState(edits.seats[0]?.positionId ?? edits.others[0]?.positionId ?? '')
  const [filter, setFilter] = useState('')
  // The seats that take Working edits first, then the scope's other seats, which say why they take
  // none and offer their Elimination instead.
  const options = useMemo(
    () => ({
      edit: filterOptions(
        edits.seats.map((s) => ({ value: s.positionId, label: `${s.label} (${s.status})` })),
        filter,
        picked,
      ),
      other: filterOptions(
        edits.others.map((s) => ({ value: s.positionId, label: `${s.label} (${s.status})` })),
        filter,
        picked,
      ),
    }),
    [edits.seats, edits.others, filter, picked],
  )
  const facts = useMemo(() => (picked ? seatEditOf(ctx, picked) : null), [ctx, picked])
  return (
    <Dialog
      title="Change a seat in Working"
      description="Changes are made in Working and audited with your name. The seat's manager sees each one with its reason."
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      width={620}
    >
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Find a seat">
            {(id) => (
              <input
                id={id}
                className={INPUT}
                value={filter}
                placeholder="Position ID or title"
                onChange={(e) => setFilter(e.currentTarget.value)}
              />
            )}
          </Field>
          <Field label="Seat">
            {(id) => (
              <select
                id={id}
                className={INPUT}
                value={picked}
                onChange={(e) => setPicked(e.currentTarget.value)}
              >
                <optgroup label="Takes Working edits">
                  {options.edit.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
                {options.other.length > 0 && (
                  <optgroup label="Changes go through a request">
                    {options.other.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
          </Field>
        </div>
        {facts && <SeatFormBody key={facts.positionId} facts={facts} onDone={onClose} />}
      </div>
    </Dialog>
  )
}

/** The form for one seat (keyed by the seat, so its state starts from the seat's values). */
function SeatFormBody({ facts, onDone }: { facts: SeatEditFacts; onDone: () => void }) {
  const ctx = useAnalytics()
  const write = usePlanWrite()
  const [form, setForm] = useState<SeatForm>({ ...facts.current })
  const [reason, setReason] = useState('')
  const [refused, setRefused] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [eliminating, setEliminating] = useState(false)
  const notes = useMemo(() => changedByHrbp(ctx, facts.positionId), [ctx, facts.positionId])
  const changed = Object.keys(seatChangesOf(facts.current, form)).length > 0
  // An On hold seat takes edits only as it comes off hold (the action's rule).
  const held = facts.current.onHold && form.onHold
  const set = (patch: Partial<SeatForm>) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    setBusy(true)
    setRefused(null)
    const out = await write.run('editSeat', seatEditInputOf(facts, form, reason))
    setBusy(false)
    if (out.ok) {
      toast(out.notice, { tone: 'good' })
      onDone()
    } else setRefused(out.refused)
  }

  return (
    <div className="flex flex-col gap-3 border-t border-rule pt-3">
      <p className="text-small text-ink">
        <span className="font-semibold">{facts.positionId}</span>
        {facts.title ? ` ${facts.title}` : ''}
        {facts.status ? <span className="text-ink-2"> · {facts.status}</span> : null}
      </p>
      {!facts.editable && facts.why && <p className="text-small text-ink-2">{facts.why}</p>}
      {facts.editable && (
        <>
          {held && (
            <p className="text-meta text-ink-2">This seat is On hold. Take it off hold to change it.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start">
              {(id) => (
                <input
                  id={id}
                  type="date"
                  className={INPUT}
                  disabled={held}
                  value={form.startDate ?? ''}
                  onChange={(e) => set({ startDate: (e.currentTarget.value || null) as ISODate | null })}
                />
              )}
            </Field>
            <Field label="Level">
              {(id) => (
                <Choice<Level>
                  id={id}
                  value={form.level}
                  disabled={held}
                  options={facts.levels.map((l) => ({ value: l, label: LEVEL_LABELS[l] ?? l }))}
                  onChange={(level) => set({ level })}
                />
              )}
            </Field>
            <Field label="Location">
              {(id) => (
                <Choice
                  id={id}
                  value={form.location}
                  disabled={held}
                  options={facts.locations.map((l) => ({ value: l, label: l }))}
                  onChange={(location) => set({ location })}
                />
              )}
            </Field>
            <Field label="FTE" hint="Above 0 and at most 1.">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={0.1}
                  max={1}
                  step={0.1}
                  className={INPUT}
                  disabled={held}
                  value={form.fte}
                  onChange={(e) => set({ fte: Number(e.currentTarget.value) })}
                />
              )}
            </Field>
          </div>
          <Switch checked={form.onHold} onChange={(onHold) => set({ onHold })} label="On hold" />
          <Field label="Reason" hint={FREE_TEXT_HINT}>
            {(id) => (
              <textarea
                id={id}
                className={TEXTAREA}
                value={reason}
                onChange={(e) => setReason(e.currentTarget.value)}
              />
            )}
          </Field>
          <p className="text-meta text-muted">Takes effect on {formatDate(facts.effectiveDate)}.</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Refusal text={refused} />
            <WriteBlocked blocked={write.blocked} />
            <Button
              variant="primary"
              size="sm"
              disabled={busy || !changed || !!write.blocked}
              onClick={() => void save()}
            >
              Save change
            </Button>
          </div>
        </>
      )}
      {notes.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-meta font-medium text-ink-2">Earlier changes</p>
          <ul className="flex flex-col gap-1 text-meta text-ink-2">
            {notes.map((n) => (
              <li key={n.at}>
                {n.text}
                {n.reason ? `. ${n.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {facts.eliminate.offered && (
        <div className="flex flex-col gap-2 border-t border-rule pt-3">
          {!eliminating ? (
            <div>
              <Button variant="ghost" size="sm" onClick={() => setEliminating(true)}>
                Eliminate this seat instead
              </Button>
            </div>
          ) : (
            <EliminateBody facts={facts} onDone={onDone} />
          )}
        </div>
      )}
    </div>
  )
}

/** An Elimination draft for the seat, saved or saved and submitted. */
function EliminateBody({ facts, onDone }: { facts: SeatEditFacts; onDone: () => void }) {
  const write = usePlanWrite()
  const [reasonCode, setReasonCode] = useState<ReasonCode>(facts.eliminate.reasonCodes[0] ?? 'Restructure')
  const [lastDay, setLastDay] = useState<ISODate | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(submit: boolean) {
    setBusy(true)
    setRefused(null)
    const draft = await write.run('requestElimination', eliminationInputOf(facts, reasonCode, lastDay, false))
    if (!draft.ok) {
      setBusy(false)
      setRefused(draft.refused)
      return
    }
    const requestId = requestIdIn(draft.notice)
    if (!submit || !requestId) {
      setBusy(false)
      toast(draft.notice, { tone: 'good' })
      onDone()
      return
    }
    const sent = await write.run('submitRequest', { requestId })
    setBusy(false)
    if (sent.ok) {
      toast(sent.notice, { tone: 'good' })
      onDone()
    } else setRefused(`${draft.notice} ${sent.refused}`)
  }

  return (
    <>
      <p className="text-small text-ink">
        An Elimination is a request: it goes through the approval chain before the seat ends.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Reason">
          {(id) => (
            <Choice<ReasonCode>
              id={id}
              value={reasonCode}
              options={facts.eliminate.reasonCodes.map((r) => ({ value: r, label: r }))}
              onChange={setReasonCode}
            />
          )}
        </Field>
        <Field label="Last day" hint="Blank: the day it is approved.">
          {(id) => (
            <input
              id={id}
              type="date"
              className={INPUT}
              value={lastDay ?? ''}
              onChange={(e) => setLastDay((e.currentTarget.value || null) as ISODate | null)}
            />
          )}
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Refusal text={refused} />
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || !!write.blocked}
          onClick={() => void save(false)}
        >
          Save draft
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={busy || !!write.blocked}
          onClick={() => void save(true)}
        >
          Save and submit
        </Button>
      </div>
    </>
  )
}
