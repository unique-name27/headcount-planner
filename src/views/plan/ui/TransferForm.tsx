/**
 * Processing a transfer on Plan > Transfers (docs/PLAN.md 8.3 `transfer.process`,
 * `transfer.move-budget`, 10.5): a position move (the seat and its person under a new manager
 * position) or an internal move (the person fills an Open seat; the old seat is held), its first day,
 * its reason and "Move budget too?", saved as a draft and, at once or later, submitted. The choices
 * are the engine's (`transferOptions`); the writes go through the app's write hook
 * (`processTransfer`, `submitRequest`, `withdrawRequest`), which checks the policy again and signs the
 * audit as the Acting as person. Names show; amounts never do.
 */
import { useMemo, useState } from 'react'
import { usePlanWrite } from '@/app/write/usePlanWrite'
import { WriteBlocked } from '@/app/write/WriteBlocked'
import { Button, Dialog, Segmented, Switch, toast } from '@/components'
import type { ISODate, ReasonCode } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import type { TransferDraftRow } from '../engine'
import { requestIdIn, type TransferForm, type TransferOptions, transferInputOf } from '../engine/edits'
import { Choice, Field, filterOptions, INPUT, Refusal } from './form'

/** The bar above the transfers: "Process a transfer", or nothing where the mode does not process them. */
export function TransferBar({ options }: { options: TransferOptions }) {
  const write = usePlanWrite()
  const [open, setOpen] = useState(false)
  if (!options.offered) return null
  return (
    <div className="col-span-full flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        size="sm"
        disabled={!!write.blocked || !options.people.length}
        onClick={() => setOpen(true)}
      >
        Process a transfer
      </Button>
      <WriteBlocked blocked={write.blocked} />
      {open && <TransferDialog options={options} onClose={() => setOpen(false)} />}
    </div>
  )
}

function TransferDialog({ options, onClose }: { options: TransferOptions; onClose: () => void }) {
  const write = usePlanWrite()
  const [form, setForm] = useState<TransferForm>({
    kind: 'internal',
    personId: options.people[0]?.personId ?? '',
    toId: '',
    effectiveDate: options.effectiveDate,
    moveBudget: false,
    reasonCode: options.reasonCodes[0] ?? 'Restructure',
  })
  const [personFilter, setPersonFilter] = useState('')
  const [toFilter, setToFilter] = useState('')
  const [refused, setRefused] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<TransferForm>) => setForm((f) => ({ ...f, ...patch }))

  const people = useMemo(
    () =>
      filterOptions(
        options.people.map((p) => ({ value: p.personId, label: `${p.name}, ${p.positionId}` })),
        personFilter,
        form.personId,
      ),
    [options.people, personFilter, form.personId],
  )
  const targets = useMemo(
    () =>
      filterOptions(
        (form.kind === 'position' ? options.managers : options.openSeats).map((s) => ({
          value: s.positionId,
          label: s.label,
        })),
        toFilter,
        form.toId,
      ),
    [form.kind, options.managers, options.openSeats, toFilter, form.toId],
  )
  const input = transferInputOf(options, form)

  async function save(submit: boolean) {
    if (!input) return
    setBusy(true)
    setRefused(null)
    const draft = await write.run('processTransfer', input)
    if (!draft.ok) {
      setBusy(false)
      setRefused(draft.refused)
      return
    }
    const requestId = requestIdIn(draft.notice)
    if (!submit || !requestId) {
      setBusy(false)
      toast(draft.notice, { tone: 'good' })
      onClose()
      return
    }
    const sent = await write.run('submitRequest', { requestId })
    setBusy(false)
    if (sent.ok) {
      toast(sent.notice, { tone: 'good' })
      onClose()
    } else setRefused(`${draft.notice} ${sent.refused}`)
  }

  return (
    <Dialog
      title="Process a transfer"
      description="Saved as a draft for you to submit. It goes to the person's manager, both HRBPs and, across units, both leaders."
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      width={640}
      footer={
        <>
          <Refusal text={refused} />
          <WriteBlocked blocked={write.blocked} />
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || !input || !!write.blocked}
            onClick={() => void save(false)}
          >
            Save draft
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !input || !!write.blocked}
            onClick={() => void save(true)}
          >
            Save and submit
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Segmented<'position' | 'internal'>
          label="Kind of move"
          value={form.kind}
          onChange={(kind) => set({ kind, toId: '' })}
          options={[
            { value: 'internal', label: 'Internal move' },
            { value: 'position', label: 'Position move' },
          ]}
        />
        <p className="text-meta text-muted">
          {form.kind === 'internal'
            ? 'The person fills an Open seat. Their old seat is held On hold until it is backfilled or eliminated.'
            : 'The seat and its person move under a new manager position. The seat keeps its plan.'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Find the person">
            {(id) => (
              <input
                id={id}
                className={INPUT}
                value={personFilter}
                placeholder="Name or position ID"
                onChange={(e) => setPersonFilter(e.currentTarget.value)}
              />
            )}
          </Field>
          <Field label="Person">
            {(id) => (
              <Choice
                id={id}
                value={form.personId}
                options={people}
                onChange={(personId) => set({ personId })}
              />
            )}
          </Field>
          <Field label={form.kind === 'internal' ? 'Find the Open seat' : 'Find the manager position'}>
            {(id) => (
              <input
                id={id}
                className={INPUT}
                value={toFilter}
                placeholder="Position ID, title or org"
                onChange={(e) => setToFilter(e.currentTarget.value)}
              />
            )}
          </Field>
          <Field label={form.kind === 'internal' ? 'Open seat' : 'New manager position'}>
            {(id) => (
              <Choice
                id={id}
                value={form.toId}
                options={targets}
                placeholder="Pick one"
                onChange={(toId) => set({ toId })}
              />
            )}
          </Field>
          <Field label="First day in the new place">
            {(id) => (
              <input
                id={id}
                type="date"
                className={INPUT}
                value={form.effectiveDate}
                onChange={(e) => set({ effectiveDate: e.currentTarget.value as ISODate })}
              />
            )}
          </Field>
          <Field label="Reason">
            {(id) => (
              <Choice<ReasonCode>
                id={id}
                value={form.reasonCode}
                options={options.reasonCodes.map((r) => ({ value: r, label: r }))}
                onChange={(reasonCode) => set({ reasonCode })}
              />
            )}
          </Field>
        </div>
        {options.moveBudget && (
          <div className="flex flex-col gap-1">
            <Switch
              checked={form.moveBudget}
              onChange={(moveBudget) => set({ moveBudget })}
              label="Move budget too?"
            />
            <p className="text-meta text-muted">
              Shifts both orgs’ targets by one head and the seat’s band estimate for the months that move,
              once the transfer is approved. Finance sees the target change in Targets.
            </p>
          </div>
        )}
      </div>
    </Dialog>
  )
}

/** One of your transfer drafts: submit it, or withdraw it. */
export function DraftDialog({ draft, onClose }: { draft: TransferDraftRow; onClose: () => void }) {
  const write = usePlanWrite()
  const [refused, setRefused] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function act(name: 'submitRequest' | 'withdrawRequest') {
    setBusy(true)
    setRefused(null)
    const out = await write.run(name, { requestId: draft.requestId })
    setBusy(false)
    if (out.ok) {
      toast(out.notice, { tone: 'good' })
      onClose()
    } else setRefused(out.refused)
  }
  return (
    <Dialog
      title={`Transfer ${draft.requestId}`}
      description={`${draft.kind === 'position' ? 'Position move' : 'Internal move'}${draft.personName ? ` of ${draft.personName}` : ''} from ${draft.fromPositionId}${draft.toPositionId ? ` to ${draft.toPositionId}` : ''}, from ${formatDate(draft.effectiveDate)}.`}
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      footer={
        <>
          <Refusal text={refused} />
          <WriteBlocked blocked={write.blocked} />
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || !!write.blocked}
            onClick={() => void act('withdrawRequest')}
          >
            Withdraw
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !!write.blocked}
            onClick={() => void act('submitRequest')}
          >
            Submit
          </Button>
        </>
      }
    />
  )
}
