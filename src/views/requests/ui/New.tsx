/**
 * Requests > New (docs/PLAN.md 9.4, 10.1 to 10.5, 11.4, 11.5, 8.4 rule 5): pick a type, fill in its
 * form, and read the preview beside it: what the form still needs, the freeze notice and the
 * exception's business reason, the approval chain the request would store, the band estimate and the
 * target org's gap after approval (not in Manager mode), and for a trade the quote card in weights.
 * "Save draft" runs the type's action; "Submit" saves it, adds the freeze exception where the org is
 * frozen, and submits it (on behalf of a manager where the HRBP picks one), one write after another
 * through the app's write hook. Every number and sentence is the model's (`requestsNewOf`,
 * `newRequestPreview`); this component lays them out and computes nothing.
 */
import { type ReactNode, useMemo, useState } from 'react'
import { WriteBlocked } from '@/app/write/WriteBlocked'
import { Figure } from '@/charts'
import { EmptyState } from '@/components/EmptyState'
import { Grid } from '@/components/Section'
import { Button, cx, Segmented, Switch } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import type { ISODate, Level, ReasonCode, RequestType } from '@/data/schema'
import { fmt } from '@/lib/format'
import {
  emptyForm,
  headsCount,
  NEW_FIGURE_METRICS,
  type NewRequestForm,
  type NewRequestPreview,
  newRequestPreview,
  type RequestsNew,
} from '../engine'
import { CHAIN_COLUMNS, QUOTE_COLUMNS } from '../engine/columns'
import { canGetText, creditText } from '../engine/quoteCard'
import { ID } from '../metrics'
import { Choice, Field, filterOptions, INPUT, Missing, type Option, Refusal, TEXTAREA } from './form'
import { defsOf, useRequests } from './model'
import { requestIdIn, useWriteSteps, type WriteStep } from './useWriteSteps'

/** The lists the placeholder points to, named only when the mode shows them. */
export function listsLine(queueShown: boolean): string {
  return `${queueShown ? 'Mine, Approvals and the Queue list' : 'Mine and Approvals list'} the requests this mode shows.`
}

export function NewRequest() {
  const queueShown = useAnalytics().access.can('tab:requests.queue')
  const model = useRequests().new
  if (!model)
    return (
      <Grid>
        <EmptyState title="New requests are not raised in this mode" body={<p>{listsLine(queueShown)}</p>} />
      </Grid>
    )
  return <NewForm model={model} queueShown={queueShown} />
}

function NewForm({ model, queueShown }: { model: RequestsNew; queueShown: boolean }) {
  const ctx = useAnalytics()
  const offered = model.types.filter((t) => t.shown)
  const [form, setForm] = useState<NewRequestForm>(() => emptyForm(offered[0]?.type ?? 'New role'))
  const preview = useMemo(() => newRequestPreview(ctx, form), [ctx, form])
  const { write, run, busy } = useWriteSteps((out) => {
    if (out.ok) setForm(emptyForm(form.type))
  })
  const set = (patch: Partial<NewRequestForm>) => setForm((f) => ({ ...f, ...patch }))
  const pickType = (type: RequestType) => setForm({ ...emptyForm(type), onBehalfOf: form.onBehalfOf ?? null })
  const blocked = write.blocked ?? model.blocked

  const steps = (submit: boolean): WriteStep[] => {
    const action = preview.action
    if (!action) return []
    const out: WriteStep[] = [(w) => w.run(action.name, action.input as never)]
    if (!submit) return out
    const reason = form.exceptionReason.trim()
    if (preview.freezeId && reason) {
      const freezeId = preview.freezeId
      out.push((w, last) => {
        const id = last?.ok ? requestIdIn(last.notice) : null
        return id ? w.run('setFreezeException', { requestId: id, freezeId, reason }) : null
      })
    }
    const behalf = form.onBehalfOf ?? null
    out.push((w, last) => {
      const id = last?.ok ? requestIdIn(last.notice) : null
      if (!id) return null
      return behalf
        ? w.run('submitOnBehalf', { requestId: id, requesterId: behalf })
        : w.run('submitRequest', { requestId: id })
    })
    return out
  }

  const canSave = !!preview.action && !preview.saveRefusal && !blocked && !busy
  const canSubmit = canSave && !preview.refusal

  return (
    <Grid>
      <div className="col-span-full flex flex-col gap-4 rounded-sheet bg-sheet px-5 py-4 lg:col-span-7">
        <div>
          <h2 className="cut-head text-title font-semibold">New request</h2>
          <p className="mt-1 text-small text-ink-2">
            Drafts are yours until you submit them. {listsLine(queueShown)}
          </p>
        </div>
        <Field data-tour="requests-type" label="Type">
          {(id) => (
            <Choice
              id={id}
              value={form.type}
              options={offered.map((t) => ({ value: t.type, label: t.label }))}
              onChange={(v) => pickType(v as RequestType)}
            />
          )}
        </Field>
        {model.types.some((t) => !t.shown) && (
          <ul className="space-y-0.5 text-meta text-muted">
            {model.types
              .filter((t) => !t.shown)
              .map((t) => (
                <li key={t.type}>
                  {t.label}: {t.why}
                </li>
              ))}
          </ul>
        )}
        <TypeFields model={model} form={form} set={set} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Reason">
            {(id) => (
              <Choice
                id={id}
                value={form.reasonCode}
                placeholder="Pick a reason"
                options={(model.reasons[form.type] ?? []).map((r) => ({ value: r, label: r }))}
                onChange={(v) => set({ reasonCode: (v || null) as ReasonCode | null })}
              />
            )}
          </Field>
          {(form.type === 'New role' || form.type === 'Trade') && (
            <Field label="Job title" hint={model.hint}>
              {(id) => (
                <input
                  id={id}
                  className={INPUT}
                  value={form.jobTitle}
                  onChange={(e) => set({ jobTitle: e.currentTarget.value })}
                />
              )}
            </Field>
          )}
        </div>
        {model.cycle &&
          (form.type === 'New role' || form.type === 'Level change' || form.type === 'Trade') && (
            <div className="flex flex-wrap items-end gap-3">
              <Switch
                checked={form.cycleId === model.cycle.cycleId}
                onChange={(on) =>
                  set({ cycleId: on ? (model.cycle?.cycleId ?? null) : null, priority: on ? 1 : null })
                }
                label={`Send as a ranked ask for ${model.cycle.fiscalYear}`}
              />
              {form.cycleId && (
                <Field label="Your rank" className="w-28">
                  {(id) => (
                    <input
                      id={id}
                      type="number"
                      min={1}
                      step={1}
                      className={INPUT}
                      value={form.priority ?? ''}
                      onChange={(e) =>
                        set({ priority: e.currentTarget.value ? Number(e.currentTarget.value) : null })
                      }
                    />
                  )}
                </Field>
              )}
            </div>
          )}
        {model.onBehalf && form.type !== 'Transfer' && !form.cycleId && (
          <Field label="Submit for" hint={model.onBehalfHint ?? undefined}>
            {(id) => (
              <Choice
                id={id}
                value={form.onBehalfOf ?? ''}
                placeholder="Myself"
                options={(model.onBehalf ?? []).map((m) => ({ value: m.personId, label: m.name }))}
                onChange={(v) => set({ onBehalfOf: v || null })}
              />
            )}
          </Field>
        )}
        {preview.freeze && (
          <div className="flex flex-col gap-2 rounded-control bg-warning-wash px-3 py-2">
            <p className="text-small text-ink">{preview.freeze}</p>
            <Field label="Business reason for the exception" hint={model.hint}>
              {(id) => (
                <textarea
                  id={id}
                  className={TEXTAREA}
                  value={form.exceptionReason}
                  onChange={(e) => set({ exceptionReason: e.currentTarget.value })}
                />
              )}
            </Field>
          </div>
        )}
        <Missing items={preview.missing} />
        <Refusal text={preview.refusal} />
        <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-3">
          <Button variant="primary" disabled={!canSubmit} onClick={() => run(steps(true))}>
            {form.onBehalfOf ? 'Submit for the manager' : 'Submit'}
          </Button>
          <Button disabled={!canSave} onClick={() => run(steps(false))}>
            Save draft
          </Button>
          <WriteBlocked blocked={blocked} />
          {busy && <span className="text-meta text-ink-2">Saving</span>}
        </div>
        <p className="text-meta text-muted">{model.hint}</p>
      </div>
      <div className="col-span-full flex flex-col gap-4 lg:col-span-5">
        <PreviewPanel model={model} preview={preview} />
      </div>
      <Figure
        id="requests-new-seats"
        metric={NEW_FIGURE_METRICS.seats}
        uses={model.seats.uses}
        title={model.seats.title}
        subtitle={model.seats.subtitle}
        data={model.seats.rows}
        columns={model.seats.columns}
        definitions={defsOf(ctx, NEW_FIGURE_METRICS.seats, ID.tradeRatio)}
        note={model.seats.note ?? undefined}
        empty={model.seats.empty}
        table={{
          search: true,
          maxRows: 50,
          onRowClick: (r) => {
            if (!r.types.includes(form.type)) return
            if (form.type === 'Trade' && form.trade) {
              const give = form.trade.give.includes(r.positionId)
                ? form.trade.give.filter((x) => x !== r.positionId)
                : [...form.trade.give, r.positionId]
              set({ trade: { ...form.trade, give } })
            } else if (form.type === 'Transfer' && form.transfer)
              set({ transfer: { ...form.transfer, personId: r.holderId, fromPositionId: r.positionId } })
            else set({ positionId: r.positionId })
          },
        }}
        tableOnly
      />
    </Grid>
  )
}

/** The preview beside the form: chain, band estimate, gap after approval and the trade's quote card. */
function PreviewPanel({ model, preview }: { model: RequestsNew; preview: NewRequestPreview }) {
  const ctx = useAnalytics()
  const chain = preview.chain
  const quote = preview.quote
  const gap = preview.gapAfter
  return (
    <>
      <Figure
        id="requests-new-chain"
        metric={NEW_FIGURE_METRICS.chain}
        uses={['requests.steps', 'requests.type', 'requests.businessUnit']}
        title="Approval chain"
        subtitle={chain?.text}
        data={chain?.rows ?? []}
        columns={CHAIN_COLUMNS}
        definitions={defsOf(ctx, ID.queueOpen)}
        note="The steps submit stores on the request. Every viewer reads the same chain."
        empty={chain ? null : 'The chain shows once the form is complete.'}
        emptyHeight={120}
        tableOnly
        tableToggle={false}
      />
      {(preview.bandEstimateUsd != null || gap) && (
        <div className="rounded-sheet bg-sheet px-5 py-4 text-small">
          {preview.bandEstimateUsd != null && (
            <p>
              <span className="text-ink-2">Band estimate: </span>
              <span className="font-semibold text-ink">{fmt(preview.bandEstimateUsd, 'moneyFull')}</span>
              <span className="text-ink-2"> a year, at plan rates</span>
            </p>
          )}
          {gap && (
            <p className="mt-1">
              <span className="text-ink-2">Gap after approval{gap.org ? ` for ${gap.org}` : ''}: </span>
              <span className="font-semibold text-ink">
                {gap.heads == null ? '—' : headsCount(gap.heads)}
                {gap.cost != null ? `, ${fmt(gap.cost, model.money)}` : ''}
              </span>
              {gap.note && <span className="block text-meta text-ink-2">{gap.note}</span>}
            </p>
          )}
        </div>
      )}
      {quote && (
        <Figure
          id="requests-new-quote"
          metric={NEW_FIGURE_METRICS.quote}
          uses={['requests.givePositionIds', 'requests.level', 'requests.location', 'requests.fte']}
          title="Trade quote"
          subtitle={canGetText(quote)}
          data={quote.lines.map((line) => ({ line }))}
          columns={QUOTE_COLUMNS}
          definitions={defsOf(ctx, ID.tradeRatio, ID.tradeCredit)}
          note="Weights are standard heads: band estimates at the plan of record's rates. Nothing rounds up."
          empty={null}
          image={false}
          tableToggle={false}
        >
          <div className="flex flex-col gap-2 text-small">
            {quote.lines.map((l) => (
              <p key={l} className="text-ink">
                {l}
              </p>
            ))}
            {quote.blocks.map((b) => (
              <Refusal
                key={`${b.positionId ?? ''}${b.text}`}
                text={b.positionId ? `${b.positionId}: ${b.text}` : b.text}
              />
            ))}
            {quote.bandUsd && (
              <p className="text-meta text-ink-2">
                Band estimates: give {fmt(quote.bandUsd.give, 'moneyFull')}, get{' '}
                {fmt(quote.bandUsd.get, 'moneyFull')}.
              </p>
            )}
          </div>
        </Figure>
      )}
    </>
  )
}

/** The fields each type's form adds. */
function TypeFields({
  model,
  form,
  set,
}: {
  model: RequestsNew
  form: NewRequestForm
  set: (p: Partial<NewRequestForm>) => void
}) {
  const [filter, setFilter] = useState('')
  const seats = model.seats.rows.filter((r) => r.types.includes(form.type))
  const seatOptions: Option[] = filterOptions(
    seats.map((r) => ({
      value: r.positionId,
      label: `${r.positionId} ${r.title ?? ''}, ${r.level} ${r.location} (${r.status})`,
    })),
    filter,
    form.positionId,
  )
  const levels = model.levels.map((l) => ({ value: l, label: l }))
  const locations = model.locations.map((l) => ({ value: l, label: l }))
  const managers = model.managers.map((m) => ({ value: m.positionId, label: m.label }))
  const date = (
    label: string,
    value: ISODate | null,
    onChange: (d: ISODate | null) => void,
    hint?: string,
  ) => (
    <Field label={label} hint={hint}>
      {(id) => (
        <input
          id={id}
          type="date"
          className={INPUT}
          value={value ?? ''}
          onChange={(e) => onChange((e.currentTarget.value || null) as ISODate | null)}
        />
      )}
    </Field>
  )
  const seatPicker = (
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
      <Field label="Seat" hint={seats.length ? undefined : 'No seat in scope takes this type.'}>
        {(id) => (
          <Choice
            id={id}
            value={form.positionId}
            placeholder="Pick a seat"
            options={seatOptions}
            onChange={(v) => set({ positionId: v || null })}
          />
        )}
      </Field>
    </div>
  )
  switch (form.type) {
    case 'New role':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Reports to" className="sm:col-span-2">
            {(id) => (
              <Choice
                id={id}
                value={form.managerPositionId}
                placeholder="Pick a manager seat"
                options={managers}
                onChange={(v) => set({ managerPositionId: v || null })}
              />
            )}
          </Field>
          <Field label="Level">
            {(id) => (
              <Choice
                id={id}
                value={form.level}
                placeholder="Pick a level"
                options={levels}
                onChange={(v) => set({ level: (v || null) as Level | null })}
              />
            )}
          </Field>
          <Field label="Location">
            {(id) => (
              <Choice
                id={id}
                value={form.location}
                placeholder="Pick a location"
                options={locations}
                onChange={(v) => set({ location: v || null })}
              />
            )}
          </Field>
          <Field label="FTE">
            {(id) => (
              <input
                id={id}
                type="number"
                min={0.1}
                max={1}
                step={0.1}
                className={INPUT}
                value={form.fte ?? ''}
                onChange={(e) => set({ fte: e.currentTarget.value ? Number(e.currentTarget.value) : null })}
              />
            )}
          </Field>
          {date('Proposed start', form.startDate, (d) => set({ startDate: d }))}
        </div>
      )
    case 'Backfill':
      return (
        <>
          {seatPicker}
          {date('Target start', form.startDate, (d) => set({ startDate: d }), 'Optional.')}
        </>
      )
    case 'Level change':
      return (
        <>
          {seatPicker}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="New level">
              {(id) => (
                <Choice
                  id={id}
                  value={form.level}
                  placeholder="Pick a level"
                  options={levels}
                  onChange={(v) => set({ level: (v || null) as Level | null })}
                />
              )}
            </Field>
            {date('Effective date', form.startDate, (d) => set({ startDate: d }))}
          </div>
        </>
      )
    case 'Location change':
      return (
        <>
          {seatPicker}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="New location">
              {(id) => (
                <Choice
                  id={id}
                  value={form.location}
                  placeholder="Pick a location"
                  options={locations}
                  onChange={(v) => set({ location: v || null })}
                />
              )}
            </Field>
            {date('Effective date', form.startDate, (d) => set({ startDate: d }))}
          </div>
        </>
      )
    case 'Elimination':
      return (
        <>
          {seatPicker}
          {date('Last day', form.startDate, (d) => set({ startDate: d }), 'Blank: the day it is approved.')}
          <Switch
            checked={form.confidential}
            onChange={(v) => set({ confidential: v })}
            label="Confidential: the people in this seat and below see nothing of it"
          />
        </>
      )
    case 'Start recruiting':
      return seatPicker
    case 'Start date':
      return (
        <>
          {seatPicker}
          {date('New start', form.startDate, (d) => set({ startDate: d }))}
        </>
      )
    case 'Transfer':
      return <TransferFields model={model} form={form} set={set} date={date} managers={managers} />
    case 'Trade':
      return (
        <TradeFields
          model={model}
          form={form}
          set={set}
          date={date}
          managers={managers}
          levels={levels}
          locations={locations}
        />
      )
  }
}

type DateField = (
  label: string,
  value: ISODate | null,
  onChange: (d: ISODate | null) => void,
  hint?: string,
) => ReactNode

function TransferFields({
  model,
  form,
  set,
  date,
  managers,
}: {
  model: RequestsNew
  form: NewRequestForm
  set: (p: Partial<NewRequestForm>) => void
  date: DateField
  managers: Option[]
}) {
  const moveBudgetShown = useAnalytics().access.can('action:transfer.move-budget')
  const t = form.transfer
  if (!t) return null
  const people = model.seats.rows
    .filter((r) => r.types.includes('Transfer') && r.holderId)
    .map((r) => ({
      value: r.positionId,
      label: `${r.holderName ?? r.holderId} (${r.positionId}, ${r.title ?? r.level})`,
    }))
  const open = model.seats.rows
    .filter((r) => r.status === 'Open' && !r.acceptedOffer)
    .map((r) => ({
      value: r.positionId,
      label: `${r.positionId} ${r.title ?? ''}, ${r.level} ${r.location}`,
    }))
  const setT = (patch: Partial<NonNullable<NewRequestForm['transfer']>>) =>
    set({ transfer: { ...t, ...patch } })
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Kind of move"
        value={t.kind}
        onChange={(v) => setT({ kind: v, toManagerPositionId: null, toPositionId: null })}
        options={[
          { value: 'internal', label: 'Internal move: fills an Open seat' },
          { value: 'position', label: 'Position move: the seat moves too' },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Who moves">
          {(id) => (
            <Choice
              id={id}
              value={t.fromPositionId}
              placeholder="Pick the person"
              options={people}
              onChange={(v) => {
                const seat = model.seats.rows.find((r) => r.positionId === v)
                setT({ fromPositionId: v || null, personId: seat?.holderId ?? null })
              }}
            />
          )}
        </Field>
        {t.kind === 'internal' ? (
          <Field label="Into the Open seat">
            {(id) => (
              <Choice
                id={id}
                value={t.toPositionId}
                placeholder="Pick an Open seat"
                options={open}
                onChange={(v) => setT({ toPositionId: v || null })}
              />
            )}
          </Field>
        ) : (
          <Field label="Under the manager seat">
            {(id) => (
              <Choice
                id={id}
                value={t.toManagerPositionId}
                placeholder="Pick a manager seat"
                options={managers}
                onChange={(v) => setT({ toManagerPositionId: v || null })}
              />
            )}
          </Field>
        )}
        {date('First day in the new place', t.effectiveDate, (d) => setT({ effectiveDate: d }))}
      </div>
      {moveBudgetShown && (
        <Switch
          checked={t.moveBudget}
          onChange={(v) => setT({ moveBudget: v })}
          label="Move budget too: both orgs' targets shift by one head and the seat's band estimate"
        />
      )}
    </div>
  )
}

function TradeFields({
  model,
  form,
  set,
  date,
  managers,
  levels,
  locations,
}: {
  model: RequestsNew
  form: NewRequestForm
  set: (p: Partial<NewRequestForm>) => void
  date: DateField
  managers: Option[]
  levels: Option[]
  locations: Option[]
}) {
  const [filter, setFilter] = useState('')
  const t = form.trade
  if (!t) return null
  const setT = (patch: Partial<NonNullable<NewRequestForm['trade']>>) => set({ trade: { ...t, ...patch } })
  const text = filter.trim().toLowerCase()
  // Tradable seats first; Filled and accepted-offer seats are listed too, disabled with their reason (11.5).
  const list = [...model.seats.rows]
    .sort((a, b) => Number(b.types.includes('Trade')) - Number(a.types.includes('Trade')))
    .filter((r) => r.types.includes('Trade') || r.tradeBlock)
    .filter(
      (r) =>
        t.give.includes(r.positionId) ||
        !text ||
        `${r.positionId} ${r.title ?? ''}`.toLowerCase().includes(text),
    )
    .slice(0, 60)
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-meta font-medium text-ink-2">1 Give</p>
        <input
          aria-label="Find a seat to give"
          className={cx(INPUT, 'mt-1')}
          value={filter}
          placeholder="Position ID or title"
          onChange={(e) => setFilter(e.currentTarget.value)}
        />
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1 text-small">
          {list.map((r) => {
            const blockedSeat = !r.types.includes('Trade')
            return (
              <li key={r.positionId}>
                <label className={cx('flex items-start gap-2', blockedSeat && 'text-muted')}>
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={blockedSeat}
                    checked={t.give.includes(r.positionId)}
                    onChange={(e) =>
                      setT({
                        give: e.currentTarget.checked
                          ? [...t.give, r.positionId]
                          : t.give.filter((x) => x !== r.positionId),
                      })
                    }
                  />
                  <span>
                    {r.positionId} {r.title ?? ''}, {r.level} {r.location} ({r.status})
                    {r.standardHeads != null ? `, ${fmt(r.standardHeads, 'num2')} standard heads` : ''}
                    {blockedSeat && r.tradeBlock ? (
                      <span className="block text-meta">{r.tradeBlock}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        {model.credit.map((c) => (
          <div key={c.orgPositionId} className="mt-2">
            <Switch
              checked={
                t.creditUsedBp === c.bp && (t.giveOrgPositionId ?? c.orgPositionId) === c.orgPositionId
              }
              onChange={(on) =>
                setT({
                  creditUsedBp: on ? c.bp : 0,
                  giveOrgPositionId: on && !t.give.length ? c.orgPositionId : null,
                })
              }
              label={`${creditText(c.bp)}, held by ${c.label}`}
            />
          </div>
        ))}
      </div>
      <div>
        <p className="text-meta font-medium text-ink-2">2 Get</p>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          <Field label="Level">
            {(id) => (
              <Choice
                id={id}
                value={form.level}
                placeholder="Pick a level"
                options={levels}
                onChange={(v) => set({ level: (v || null) as Level | null })}
              />
            )}
          </Field>
          <Field label="Location">
            {(id) => (
              <Choice
                id={id}
                value={form.location}
                placeholder="Pick a location"
                options={locations}
                onChange={(v) => set({ location: v || null })}
              />
            )}
          </Field>
          <Field label="FTE">
            {(id) => (
              <input
                id={id}
                type="number"
                min={0.5}
                max={1}
                step={0.1}
                className={INPUT}
                value={form.fte ?? ''}
                onChange={(e) => set({ fte: e.currentTarget.value ? Number(e.currentTarget.value) : null })}
              />
            )}
          </Field>
          <Field label="Reports to">
            {(id) => (
              <Choice
                id={id}
                value={form.managerPositionId}
                placeholder="Pick a manager seat"
                options={managers}
                onChange={(v) => set({ managerPositionId: v || null })}
              />
            )}
          </Field>
          <Field label="Job family">
            {(id) => (
              <input
                id={id}
                className={INPUT}
                value={form.jobFamily ?? ''}
                onChange={(e) => set({ jobFamily: e.currentTarget.value || null })}
              />
            )}
          </Field>
          {date('Start', form.startDate, (d) => set({ startDate: d }), `From ${model.firstOpenMonth} on.`)}
          <Field label="Seats" hint="Blank: as many as the give side buys.">
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                step={1}
                className={INPUT}
                value={t.count === 'max' ? '' : t.count}
                onChange={(e) =>
                  setT({ count: e.currentTarget.value ? Number(e.currentTarget.value) : 'max' })
                }
              />
            )}
          </Field>
        </div>
        <div className="mt-2">
          <Switch
            checked={t.partTimeRest}
            onChange={(v) => setT({ partTimeRest: v })}
            label="Add a part-time seat with what is left, where the location allows part time"
          />
        </div>
      </div>
    </div>
  )
}
