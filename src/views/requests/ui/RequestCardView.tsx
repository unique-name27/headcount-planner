/**
 * One request opened on Requests > Mine or Approvals (docs/PLAN.md 9.4, 10.1, 10.2, 8.4 rule 5): its
 * facts, the chain and each step, the changes an HRBP approved with and why, the send-back or reject
 * reason, a trade's card, the comments the viewer may read and a box to add one, and the buttons for
 * what the viewer may do now (the card's `can`): submit, withdraw, the freeze exception, approve,
 * approve with changes, send back and reject. Approvals add the band estimate and the gap after
 * approval outside Manager mode, and heads with the allocation and status after approval in it.
 * Every write is one action through the app's write hook; the refusal shows beside the buttons in the
 * action's own words. Every value is the card's (../engine/cards.ts); nothing is computed here.
 */
import { useState } from 'react'
import { WriteBlocked } from '@/app/write/WriteBlocked'
import { Dialog } from '@/components/Dialog'
import { Button } from '@/components/ui'
import type { Level } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import type { ChangeableField } from '@/plan/types'
import { headsCount } from '../engine'
import { commentAudienceOf, editPatchOf, type RequestCard, reasonRefusalOf } from '../engine/cards'
import { Choice, Facts, Field, INPUT, RadioChoice, Refusal, TEXTAREA } from './form'
import { useWriteSteps, type WriteStep } from './useWriteSteps'

export function RequestCardView({
  card,
  money,
  gapCost = null,
}: {
  card: RequestCard
  money: 'moneyM' | 'moneyFull'
  /** The target org's gap after approval in cost, from the Approvals gaps figure (its org's row). */
  gapCost?: number | null
}) {
  const [refused, setRefused] = useState<string | null>(null)
  const { write, run, busy } = useWriteSteps((out) => setRefused(out.ok ? null : out.refused))
  const [dialog, setDialog] = useState<'send-back' | 'reject' | 'changes' | 'exception' | 'edit' | null>(null)
  const [moveTarget, setMoveTarget] = useState(card.moveTarget?.on ?? true)
  const id = card.requestId
  const blocked = write.blocked
  const one = (step: WriteStep) => {
    setRefused(null)
    run([step])
  }
  const can = card.can
  const any =
    can.submit ||
    can.withdraw ||
    can.exception ||
    can.approve ||
    can.sendBack ||
    can.reject ||
    card.editable.length > 0
  return (
    <div className="col-span-full flex flex-col gap-4 rounded-sheet bg-sheet px-5 py-4">
      <div>
        <h3 className="cut-head text-title font-semibold">{card.heading}</h3>
        {card.chain && <p className="mt-1 text-small text-ink-2">{card.chain}</p>}
      </div>
      <Facts items={card.facts} />
      {card.steps.length > 0 && (
        <ol aria-label="Approval steps" className="space-y-1 text-small">
          {card.steps.map((s) => (
            <li key={s.n} className="flex flex-wrap gap-x-2">
              <span className="font-medium text-ink">
                {s.n}. {s.role}
                {s.approver ? `, ${s.approver}` : ''}
              </span>
              <span className="text-ink-2">
                {s.status}
                {s.at ? ` ${formatDate(s.at)}` : ''}
                {s.why ? ` (${s.why})` : ''}
              </span>
              {s.note && <span className="w-full pl-4 text-ink-2">{s.note}</span>}
            </li>
          ))}
        </ol>
      )}
      {card.changes && (
        <div className="text-small">
          <p className="text-ink">{card.changes.text}</p>
          <p className="text-ink-2">Reason: {card.changes.reason}</p>
        </div>
      )}
      {card.notes.map((n) => (
        <p key={n.label} className="text-small">
          <span className="text-ink-2">{n.label}: </span>
          <span className="text-ink">{n.text}</span>
        </p>
      ))}
      {card.trade && (
        <div className="flex flex-col gap-1 text-small">
          {card.trade.lines.map((l) => (
            <p key={l} className="text-ink">
              {l}
            </p>
          ))}
          {card.trade.blocks.map((b) => (
            <Refusal
              key={`${b.positionId ?? ''}${b.text}`}
              text={b.positionId ? `${b.positionId}: ${b.text}` : b.text}
            />
          ))}
          {card.trade.bandUsd && (
            <p className="text-meta text-ink-2">
              Band estimates: give {fmt(card.trade.bandUsd.give, 'moneyFull')}, get{' '}
              {fmt(card.trade.bandUsd.get, 'moneyFull')}.
            </p>
          )}
        </div>
      )}
      {(card.bandEstimateUsd != null || card.gapAfter) && (
        <div className="text-small">
          {card.bandEstimateUsd != null && (
            <p>
              <span className="text-ink-2">Band estimate: </span>
              <span className="font-semibold">{fmt(card.bandEstimateUsd, 'moneyFull')}</span>
              <span className="text-ink-2"> a year, at plan rates</span>
            </p>
          )}
          {card.gapAfter && (
            <p>
              <span className="text-ink-2">Gap after approval for {card.gapAfter.org}: </span>
              <span className="font-semibold">
                {card.gapAfter.heads == null ? '—' : headsCount(card.gapAfter.heads)}
                {gapCost != null ? `, ${fmt(gapCost, money)}` : ''}
              </span>
              {card.gapAfter.note && <span className="block text-meta text-ink-2">{card.gapAfter.note}</span>}
            </p>
          )}
        </div>
      )}
      {card.managerAfter && (
        <div className="space-y-0.5 text-small text-ink">
          <p>{card.managerAfter.headsText}</p>
          {card.managerAfter.allocation && <p>{card.managerAfter.allocation}</p>}
          {card.managerAfter.status && <p>{card.managerAfter.status}</p>}
        </div>
      )}
      {card.freeze && (
        <p className="rounded-control bg-warning-wash px-3 py-2 text-small">{card.freeze.notice}</p>
      )}
      {any && (
        <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-3">
          {can.approve && card.moveTarget && (
            <label className="flex items-center gap-1.5 text-small">
              <input
                type="checkbox"
                checked={moveTarget}
                onChange={(e) => setMoveTarget(e.currentTarget.checked)}
              />
              Move target too
            </label>
          )}
          {can.approve && (
            <Button
              variant="primary"
              disabled={!!blocked || busy}
              onClick={() =>
                one((w) =>
                  w.run(
                    'approveRequest',
                    card.moveTarget ? { requestId: id, moveTarget } : { requestId: id },
                  ),
                )
              }
            >
              Approve
            </Button>
          )}
          {can.approveWithChanges && (
            <Button disabled={!!blocked || busy} onClick={() => setDialog('changes')}>
              Approve with changes
            </Button>
          )}
          {can.sendBack && (
            <Button disabled={!!blocked || busy} onClick={() => setDialog('send-back')}>
              Send back
            </Button>
          )}
          {can.reject && (
            <Button disabled={!!blocked || busy} onClick={() => setDialog('reject')}>
              Reject
            </Button>
          )}
          {can.exception && (
            <Button disabled={!!blocked || busy} onClick={() => setDialog('exception')}>
              Add the freeze exception
            </Button>
          )}
          {card.editable.length > 0 && (
            <Button disabled={!!blocked || busy} onClick={() => setDialog('edit')}>
              Change
            </Button>
          )}
          {can.submit && (
            <Button
              variant="primary"
              disabled={!!blocked || busy}
              onClick={() => one((w) => w.run('submitRequest', { requestId: id }))}
            >
              {card.state === 'Sent back' ? 'Submit again' : 'Submit'}
            </Button>
          )}
          {can.withdraw && (
            <Button
              variant="ghost"
              disabled={!!blocked || busy}
              onClick={() => one((w) => w.run('withdrawRequest', { requestId: id }))}
            >
              Withdraw
            </Button>
          )}
          <WriteBlocked blocked={blocked} />
        </div>
      )}
      <Refusal text={refused} />
      <Comments card={card} />
      {(dialog === 'send-back' || dialog === 'reject') && (
        <ReasonDialog
          title={dialog === 'reject' ? `Reject ${id}` : `Send ${id} back`}
          label={dialog === 'reject' ? 'Why it is rejected' : 'What to change'}
          hint={card.hint}
          onClose={() => setDialog(null)}
          onSave={(reason) => {
            setDialog(null)
            one((w) => w.run(dialog === 'reject' ? 'rejectRequest' : 'sendBack', { requestId: id, reason }))
          }}
        />
      )}
      {dialog === 'exception' && card.freeze && (
        <ReasonDialog
          title={`A freeze exception for ${id}`}
          label="Business reason"
          description={card.freeze.notice}
          hint={card.hint}
          onClose={() => setDialog(null)}
          onSave={(reason) => {
            const freezeId = card.freeze?.freezeId ?? ''
            setDialog(null)
            one((w) => w.run('setFreezeException', { requestId: id, freezeId, reason }))
          }}
        />
      )}
      {dialog === 'edit' && (
        <ChangesDialog
          card={card}
          fields={card.editable}
          title={`Change ${id}`}
          description="Saved to your request. Submit it when it is ready."
          withReason={false}
          onClose={() => setDialog(null)}
          onSave={(changes) => {
            setDialog(null)
            one((w) => w.run('editRequest', { requestId: id, patch: editPatchOf(card, changes) }))
          }}
        />
      )}
      {dialog === 'changes' && (
        <ChangesDialog
          card={card}
          fields={card.changeable}
          title={`Approve ${id} with changes`}
          description="The requester sees each change with your reason."
          withReason
          onClose={() => setDialog(null)}
          onSave={(changes, reason) => {
            setDialog(null)
            one((w) => w.run('approveWithChanges', { requestId: id, changes, reason }))
          }}
        />
      )}
    </div>
  )
}

/** The comments the viewer may read, and a box to add one (an amount makes it Approvers only). */
function Comments({ card }: { card: RequestCard }) {
  const { write, run, busy } = useWriteSteps((out) => {
    if (out.ok) setText('')
  })
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<'everyone' | 'approvers'>('everyone')
  const audience = commentAudienceOf(text, picked)
  if (!card.comments.length && !card.can.comment) return null
  return (
    <div className="flex flex-col gap-2 border-t border-rule pt-3">
      <h4 className="text-small font-semibold">Comments</h4>
      {card.comments.length === 0 && <p className="text-small text-muted">No comment yet.</p>}
      <ul className="space-y-1.5 text-small">
        {card.comments.map((c) => (
          <li key={c.id}>
            <span className="font-medium">{c.by}</span>
            <span className="text-ink-2">
              {' '}
              {formatDate(c.at)} · {c.audience}
            </span>
            <p className="text-ink">{c.text}</p>
          </li>
        ))}
      </ul>
      {card.can.comment && (
        <>
          <Field label="Add a comment" hint={card.hint}>
            {(fieldId) => (
              <textarea
                id={fieldId}
                className={TEXTAREA}
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
              />
            )}
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <RadioChoice
              legend="Who sees it"
              value={audience.audience}
              disabled={audience.forced}
              onChange={(v) => setPicked(v)}
              options={[
                { value: 'everyone', label: 'Everyone on the request' },
                { value: 'approvers', label: 'Approvers only' },
              ]}
            />
            <Button
              disabled={!text.trim() || !!write.blocked || busy}
              onClick={() =>
                run([
                  (w) =>
                    w.run('commentOnRequest', {
                      requestId: card.requestId,
                      text,
                      audience: audience.audience,
                    }),
                ])
              }
            >
              Add comment
            </Button>
          </div>
          {audience.note && <p className="text-meta text-ink-2">{audience.note}</p>}
        </>
      )}
    </div>
  )
}

/** A required reason a manager reads; refused at entry with an amount (8.4 rule 5). */
function ReasonDialog({
  title,
  label,
  description,
  hint,
  onClose,
  onSave,
}: {
  title: string
  label: string
  description?: string
  hint: string
  onClose: () => void
  onSave: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const refusal = reasonRefusalOf(reason)
  return (
    <Dialog
      title={title}
      description={description}
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTried(true)
              if (!refusal) onSave(reason.trim())
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <Field label={label} hint={hint}>
        {(fieldId) => (
          <textarea
            id={fieldId}
            className={TEXTAREA}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
          />
        )}
      </Field>
      {(tried || (refusal && reason.trim())) && <Refusal text={refusal} />}
    </Dialog>
  )
}

/** Approve with changes: the fields the HRBP step may change, and the reason the manager reads. */
function ChangesDialog({
  card,
  fields,
  title,
  description,
  withReason,
  onClose,
  onSave,
}: {
  card: RequestCard
  fields: RequestCard['changeable']
  title: string
  description: string
  withReason: boolean
  onClose: () => void
  onSave: (
    changes: { field: ChangeableField; old: string | number | null; new: string | number | null }[],
    reason: string,
  ) => void
}) {
  const [values, setValues] = useState<Partial<Record<ChangeableField, string>>>({})
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const changes = fields
    .filter(
      (f) => values[f.field] != null && values[f.field] !== '' && values[f.field] !== String(f.value ?? ''),
    )
    .map((f) => {
      const v = values[f.field] as string
      const value: string | number =
        f.field === 'fte' || f.field === 'count' ? Number(v) : (v as Level | string)
      return { field: f.field, old: f.value, new: value }
    })
  const refusal =
    (withReason ? reasonRefusalOf(reason) : null) ?? (changes.length ? null : 'Pick at least one change.')
  return (
    <Dialog
      title={title}
      description={description}
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTried(true)
              if (!refusal) onSave(changes, reason.trim())
            }}
          >
            {withReason ? 'Approve with changes' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {fields.map((f) => (
          <Field key={f.field} label={`${f.label} (now ${f.value ?? 'none'})`}>
            {(fieldId) =>
              f.options ? (
                <Choice
                  id={fieldId}
                  value={values[f.field] ?? ''}
                  placeholder="Keep as it is"
                  options={f.options.map((o) => ({ value: o, label: o }))}
                  onChange={(v) => setValues((x) => ({ ...x, [f.field]: v }))}
                />
              ) : (
                <input
                  id={fieldId}
                  className={INPUT}
                  type={f.field === 'startDate' ? 'date' : 'number'}
                  step={f.field === 'fte' ? 0.1 : 1}
                  value={values[f.field] ?? ''}
                  onChange={(e) => setValues((x) => ({ ...x, [f.field]: e.currentTarget.value }))}
                />
              )
            }
          </Field>
        ))}
        {withReason && (
          <Field label="Reason" hint={card.hint}>
            {(fieldId) => (
              <textarea
                id={fieldId}
                className={TEXTAREA}
                value={reason}
                onChange={(e) => setReason(e.currentTarget.value)}
              />
            )}
          </Field>
        )}
        {tried && <Refusal text={refusal} />}
      </div>
    </Dialog>
  )
}
