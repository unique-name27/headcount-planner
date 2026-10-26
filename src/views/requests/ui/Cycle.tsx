/**
 * Requests > Cycle (docs/PLAN.md 9.4 and 10.3): the cycle's stage strip and dates, each unit's ranked
 * asks against its target with the cut line, and the managers who have not sent their ranked asks
 * with "Copy note" ("Could you send your ranked asks for FY28 by 16 Oct?"). The HRBP orders the
 * unit's asks and drags the cut line (heads and in-year band estimate above and below it), a leader
 * does both within its org, each finishes its review stage, and Finance moves the stage on, locks the
 * cycle or returns it. Manager mode sees its own ranked asks, ranks them, and reads the dates; the
 * cut line never shows there. Every control is the model's (`RequestsCycle.controls`) and every write
 * one action through the app's write hook. In HRBP review the unit's HRBP picks an ask to approve it
 * with changes (`RequestsCycle.cards`); the lock waits, with its reason beside the button, while any
 * ask still waits on its manager. The cut line moves with the arrow keys and keeps the focus.
 */
import { type ReactNode, useRef, useState } from 'react'
import { WriteBlocked } from '@/app/write/WriteBlocked'
import { Figure } from '@/charts'
import { Dialog } from '@/components/Dialog'
import { IconArrowDown, IconArrowUp, IconCopy } from '@/components/icons'
import { KpiStrip } from '@/components/KpiStrip'
import { Grid, Section } from '@/components/Section'
import { toast } from '@/components/toast'
import { Button, cx, IconButton } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { CYCLE_STAGES, type CycleStage, type ISODate } from '@/data/schema'
import { formatDate } from '@/lib/dates'
import { writeClipboard } from '@/lib/export/clipboard'
import { fmt } from '@/lib/format'
import type { Cycle as CycleRow } from '@/plan/types'
import {
  type CycleControls,
  type CycleOpenOption,
  headsCount,
  type RankedAskRow,
  type UnitControls,
} from '../engine'
import { ID } from '../metrics'
import { Choice, Field, INPUT } from './form'
import { defsOf, useRequests } from './model'
import { RequestCardView } from './RequestCardView'
import { useWriteSteps } from './useWriteSteps'

/** An ask below the cut line carries a warning mark (the model's `cut`); none where no line shows. */
const cutTone = (r: RankedAskRow) => (r.cut === 'Below' ? 'warning' : null)

function CopyNote({ text, count }: { text: string; count: number }) {
  const [fallback, setFallback] = useState<string | null>(null)
  const copy = async () => {
    try {
      await writeClipboard(text)
      toast('Note copied', {
        tone: 'good',
        description: `Ready to paste into email or chat for the ${count === 1 ? 'manager' : `${count} managers`}.`,
      })
    } catch {
      setFallback(text)
    }
  }
  return (
    <>
      <Button size="sm" icon={<IconCopy className="size-3.5" />} onClick={() => void copy()}>
        Copy note
      </Button>
      <Dialog
        open={fallback != null}
        onOpenChange={(o) => !o && setFallback(null)}
        title="Note for managers"
        description="The browser blocked copying. Select the text and copy it from here."
        footer={
          <Button variant="primary" onClick={() => setFallback(null)}>
            Done
          </Button>
        }
      >
        <textarea
          readOnly
          value={fallback ?? ''}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Note for managers"
          className="h-[120px] w-full resize-none rounded-control bg-sheet-2 p-3 font-[inherit] text-small leading-snug text-ink outline-none"
        />
      </Dialog>
    </>
  )
}

export function Cycle() {
  const ctx = useAnalytics()
  const { cycle } = useRequests()
  const [picked, setPicked] = useState<string | null>(null)
  const changeCard = cycle.cards.find((c) => c.requestId === picked) ?? null
  const changeable = new Set(cycle.cards.map((c) => c.requestId))
  const facts = cycle.cycle
  const at = facts ? CYCLE_STAGES.indexOf(facts.stage) : -1
  const dates: [string, string | null][] = facts
    ? [
        ['Asks due', facts.asksDue],
        ['HRBP review due', facts.hrbpReviewDue],
        ['Leader review due', facts.leaderReviewDue],
        ['Finance review due', facts.financeReviewDue],
      ]
    : []
  const controls = cycle.controls
  return (
    <>
      {cycle.open && <OpenCycle option={cycle.open} />}
      <Grid>
        {facts && (
          <div className="col-span-full rounded-sheet bg-sheet px-5 py-4">
            <h2 className="cut-head text-title font-semibold">{facts.fiscalYear} planning cycle</h2>
            <ol aria-label="Cycle stages" className="mt-3 flex flex-wrap gap-2">
              {CYCLE_STAGES.map((s, i) => (
                <li
                  key={s}
                  aria-current={i === at ? 'step' : undefined}
                  className={cx(
                    'rounded-chip px-2 py-0.5 text-meta',
                    i === at
                      ? 'bg-ink font-semibold text-on-ink'
                      : i < at
                        ? 'bg-sheet-3 text-ink'
                        : 'bg-sheet-2 text-muted',
                  )}
                >
                  {s}
                </li>
              ))}
            </ol>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-meta text-ink-2">
              {dates.map(([label, d]) => (
                <div key={label} className="flex gap-1.5">
                  <dt>{label}</dt>
                  <dd className="font-medium text-ink">{d ? formatDate(d) : '—'}</dd>
                </div>
              ))}
            </dl>
            {cycle.units.length > 0 && (
              <ul className="mt-3 space-y-1 text-small text-ink-2">
                {cycle.units.map((u) => (
                  <li key={u.businessUnit}>{u.sentence}</li>
                ))}
              </ul>
            )}
            {cycle.mineSent != null && (
              <p className="mt-3 text-small text-ink-2">
                {cycle.mineSent
                  ? 'Your ranked asks are in.'
                  : `Your ranked asks are not in yet. They are due ${formatDate(facts.asksDue)}.`}
              </p>
            )}
            {controls && <StageBar controls={controls} />}
          </div>
        )}
        <KpiStrip id="requests-cycle-kpis" kpis={cycle.kpis} />
      </Grid>
      {controls?.units
        .filter((u) => u.canRank || u.canCut)
        .map((u) => (
          <UnitRanking
            key={`${u.businessUnit}|${u.order.join(',')}|${u.cutAfter ?? ''}|${u.cutSet}`}
            cycleId={controls.cycleId}
            unit={u}
            rows={cycle.asks.rows.filter((r) => r.businessUnit === u.businessUnit)}
          />
        ))}
      {controls?.mine?.canRank && controls.mine.requestIds.length > 1 && (
        <MineRanking
          key={controls.mine.requestIds.join(',')}
          cycleId={controls.cycleId}
          ids={controls.mine.requestIds}
          rows={cycle.asks.rows}
        />
      )}
      <Section title="Ranked asks" dek={cycle.asks.subtitle}>
        <Figure
          id="requests-cycle-asks"
          metric={ID.cycleAsks}
          uses={cycle.asks.uses}
          title={cycle.asks.title}
          data={cycle.asks.rows}
          columns={cycle.asks.columns}
          definitions={
            cycle.cutShown ? defsOf(ctx, ID.cycleAsks, ID.cycleAboveCut) : defsOf(ctx, ID.cycleAsks)
          }
          note={
            changeable.size
              ? `${cycle.asks.note ?? ''} Pick an ask to approve it with changes.`.trim()
              : (cycle.asks.note ?? undefined)
          }
          empty={cycle.asks.empty}
          table={
            cycle.cutShown
              ? {
                  rowTone: cutTone,
                  ...(changeable.size
                    ? {
                        onRowClick: (r: RankedAskRow) => setPicked(r.requestId),
                        rowClickable: (r: RankedAskRow) => changeable.has(r.requestId),
                      }
                    : {}),
                }
              : undefined
          }
          tableOnly
        />
        {changeCard && (
          <RequestCardView
            key={changeCard.requestId}
            card={changeCard}
            money={ctx.guard.mode === 'rounded' ? 'moneyM' : 'moneyFull'}
          />
        )}
      </Section>
      {cycle.cutShown && (
        <Section
          title="Managers who have not submitted"
          dek={cycle.notSubmitted.subtitle}
          actions={
            cycle.copyNote && cycle.notSubmitted.rows.length > 0 ? (
              <CopyNote text={cycle.copyNote} count={cycle.notSubmitted.rows.length} />
            ) : undefined
          }
        >
          <Figure
            id="requests-cycle-not-submitted"
            metric={ID.cycleNotSubmitted}
            uses={cycle.notSubmitted.uses}
            title={cycle.notSubmitted.title}
            data={cycle.notSubmitted.rows}
            columns={cycle.notSubmitted.columns}
            definitions={defsOf(ctx, ID.cycleNotSubmitted)}
            note={
              cycle.copyNote ? `The note reads: ${cycle.copyNote}` : (cycle.notSubmitted.note ?? undefined)
            }
            empty={cycle.notSubmitted.empty}
            tableOnly
          />
        </Section>
      )}
    </>
  )
}

/** Finish a review stage, move the stage on, lock, or return (each by the model's controls). */
export function StageBar({ controls }: { controls: CycleControls }) {
  const { write, run, busy } = useWriteSteps()
  const [to, setTo] = useState<CycleStage | ''>('')
  const off = !!write.blocked || busy
  const any =
    controls.finish.length > 0 || controls.lock || controls.returnTo.length > 0 || controls.dates != null
  if (!any) return null
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
      {controls.dates && (
        <DatesDialog
          title="Change the cycle's dates"
          button="Change dates"
          save="Save dates"
          initial={controls.dates}
          disabled={off}
          onSave={(dates) => run([(w) => w.run('setCycleDates', { cycleId: controls.cycleId, dates })])}
        />
      )}
      {controls.finish.map((f) => (
        <Button key={f.label} disabled={off} onClick={() => run([(w) => w.run('finishStage', f.input)])}>
          {f.label}
        </Button>
      ))}
      {controls.lock && (
        <Button
          variant="primary"
          disabled={off || !!controls.lockWaiting}
          onClick={() => run([(w) => w.run('lockCycle', { cycleId: controls.cycleId })])}
        >
          Lock the cycle
        </Button>
      )}
      {controls.lock && controls.lockWaiting && (
        <p className="text-meta text-ink-2">{controls.lockWaiting}</p>
      )}
      {controls.returnTo.length > 0 && (
        <div className="flex items-end gap-2">
          <Field label="Return the cycle to" className="w-44">
            {(id) => (
              <Choice
                id={id}
                value={to}
                placeholder="Pick a stage"
                options={controls.returnTo.map((s) => ({ value: s, label: s }))}
                onChange={(v) => setTo(v as CycleStage | '')}
              />
            )}
          </Field>
          <Button
            disabled={off || !to}
            onClick={() => to && run([(w) => w.run('returnCycle', { cycleId: controls.cycleId, to })])}
          >
            Return the cycle
          </Button>
        </div>
      )}
      <WriteBlocked blocked={write.blocked} />
    </div>
  )
}

/** "Open the FY28 planning cycle" (Finance, HR admin), with its due dates. */
function OpenCycle({ option }: { option: CycleOpenOption }) {
  const { write, run, busy } = useWriteSteps()
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-sheet bg-sheet px-5 py-4">
      <p className="min-w-0 flex-1 text-small text-ink-2">
        No planning cycle is under way. Open the {option.fiscalYear} cycle so managers can send their ranked
        asks.
      </p>
      <DatesDialog
        title={`Open the ${option.fiscalYear} planning cycle`}
        button={`Open the ${option.fiscalYear} cycle`}
        save="Open the cycle"
        initial={option.dates}
        disabled={!!write.blocked || busy}
        onSave={(dates) => run([(w) => w.run('openCycle', { fiscalYear: option.fiscalYear, dates })])}
      />
      <WriteBlocked blocked={write.blocked} />
    </div>
  )
}

/** The cycle's four due dates in a dialog: asks, HRBP review, Leader review and Finance review. */
function DatesDialog({
  title,
  button,
  save,
  initial,
  disabled,
  onSave,
}: {
  title: string
  button: string
  save: string
  initial: CycleRow['dates']
  disabled: boolean
  onSave: (dates: CycleRow['dates']) => void
}) {
  const [open, setOpen] = useState(false)
  const [dates, setDates] = useState(initial)
  const field = (label: string, key: keyof CycleRow['dates'], required = false) => (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          type="date"
          className={INPUT}
          required={required}
          value={dates[key] ?? ''}
          onChange={(e) => {
            const v = (e.currentTarget.value || null) as ISODate | null
            setDates((d) => ({ ...d, [key]: key === 'asksDue' ? (v ?? d.asksDue) : v }))
          }}
        />
      )}
    </Field>
  )
  return (
    <>
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => {
          setDates(initial)
          setOpen(true)
        }}
      >
        {button}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description="Managers read these dates on the Cycle tab and in the note for managers who have not submitted."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={disabled || !dates.asksDue}
              onClick={() => {
                setOpen(false)
                onSave(dates)
              }}
            >
              {save}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {field('Asks due', 'asksDue', true)}
          {field('HRBP review due', 'hrbpReviewDue')}
          {field('Leader review due', 'leaderReviewDue')}
          {field('Finance review due', 'financeReviewDue')}
        </div>
      </Dialog>
    </>
  )
}

/** Moves one item of a list up or down. */
function moved(ids: readonly string[], i: number, by: -1 | 1): string[] {
  const out = [...ids]
  const j = i + by
  if (j < 0 || j >= out.length) return out
  ;[out[i], out[j]] = [out[j] as string, out[i] as string]
  return out
}

/** One unit's ranked asks: reorder them, and drag the cut line between them. */
function UnitRanking({
  cycleId,
  unit,
  rows,
}: {
  cycleId: string
  unit: UnitControls
  rows: readonly RankedAskRow[]
}) {
  const { write, run, busy } = useWriteSteps()
  const [order, setOrder] = useState<readonly string[]>(unit.order)
  const byId = new Map(rows.map((r) => [r.requestId, r]))
  const reordered = order.join('|') !== unit.order.join('|')
  const current = unit.options.find((o) => o.afterHeads === unit.cutAfter) ?? null
  const [line, setLine] = useState<number | null>(current ? unit.options.indexOf(current) : null)
  const option = line != null ? (unit.options[line] ?? null) : null
  // A key press moves the handle to another row: the handle that mounts there takes the focus back.
  const keyed = useRef(false)
  const moveLine = (by: number) => {
    keyed.current = true
    setLine((l) => Math.max(0, Math.min(unit.options.length - 1, (l ?? 0) + by)))
  }
  const handleRef = (el: HTMLButtonElement | null) => {
    if (el && keyed.current) {
      keyed.current = false
      el.focus()
    }
  }
  // The line falls after the last ask the viewer sees whose rank is above it (the line counts every
  // ask of the unit, some of which the viewer may not see); before the first when none is.
  let handleAfter = -1
  if (option)
    order.forEach((id, i) => {
      const r = byId.get(id)
      if (r && r.rank <= option.above) handleAfter = i
    })
  const dropAfter = (k: number) => {
    // The line after the k-th ask: after the heads up to it (the engine snaps it to whole asks).
    const heads = k === 0 ? 0 : (byId.get(order[k - 1] ?? '')?.cumulativeHeads ?? 0)
    const i = unit.options.findIndex((o) => o.afterHeads === heads)
    if (i >= 0) setLine(i)
  }
  const off = !!write.blocked || busy
  const lineChanged = option != null && (option.afterHeads !== unit.cutAfter || !unit.cutSet)
  return (
    <Section
      title={`${unit.businessUnit}: rank and cut`}
      dek={
        unit.canCut
          ? 'Drag the cut line, or move it with the arrow keys. Heads and in-year band estimate show above and below it. Asks below the line are rejected when the cycle locks.'
          : 'Order the asks. The cut line is set by the unit’s HRBP and Finance.'
      }
      actions={
        <>
          {unit.canRank && (
            <Button
              size="sm"
              disabled={off || !reordered}
              onClick={() =>
                run([
                  (w) =>
                    w.run('rankCycleAsks', { cycleId, businessUnit: unit.businessUnit, requestIds: order }),
                ])
              }
            >
              Save ranking
            </Button>
          )}
          {unit.canCut && option && (
            <Button
              size="sm"
              variant="primary"
              disabled={off || reordered || !lineChanged}
              onClick={() =>
                run([
                  (w) =>
                    w.run('moveCutLine', {
                      cycleId,
                      businessUnit: unit.businessUnit,
                      afterHeads: option.afterHeads,
                    }),
                ])
              }
            >
              {unit.cutSet ? 'Move the cut line here' : 'Set the cut line here'}
            </Button>
          )}
          <WriteBlocked blocked={write.blocked} />
        </>
      }
    >
      <div className="col-span-full rounded-sheet bg-sheet px-5 py-4">
        {option && (
          <p className="mb-2 text-small text-ink" aria-live="polite">
            Above the line: {headsCount(option.headsAbove)}
            {option.bandAbove != null ? `, ${fmt(option.bandAbove, 'moneyFull')} in-year band estimate` : ''}.
            Below: {headsCount(option.headsBelow)}
            {option.bandBelow != null ? `, ${fmt(option.bandBelow, 'moneyFull')}` : ''}.
          </p>
        )}
        {reordered && unit.canCut && (
          <p className="mb-2 text-meta text-ink-2">Save the ranking before you move the cut line.</p>
        )}
        <ol
          className="max-h-[480px] overflow-y-auto text-small"
          aria-label={`${unit.businessUnit} ranked asks`}
        >
          {unit.canCut && (
            <li>
              <DropZone onDrop={() => !reordered && dropAfter(0)}>
                {!reordered && option && handleAfter === -1 && (
                  <CutHandle onMove={moveLine} buttonRef={handleRef} />
                )}
              </DropZone>
            </li>
          )}
          {order.map((id, i) => {
            const r = byId.get(id)
            if (!r) return null
            return (
              <li key={id}>
                <DropZone onDrop={() => unit.canCut && !reordered && dropAfter(i + 1)}>
                  <div className="flex items-center gap-2 border-b border-rule py-1">
                    <span className="w-8 text-right text-ink-2">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {r.requestId} {r.type}
                      {r.jobTitle ? `, ${r.level ? `${r.level} ` : ''}${r.jobTitle}` : ''}
                      {r.manager ? <span className="text-ink-2"> · {r.manager}</span> : null}
                    </span>
                    <span className="w-16 text-right text-ink-2">{headsCount(r.heads)}</span>
                    {unit.canRank && (
                      <>
                        <IconButton
                          size="sm"
                          label={`Move ${r.requestId} up`}
                          disabled={i === 0}
                          onClick={() => setOrder((o) => moved(o, i, -1))}
                        >
                          <IconArrowUp className="size-3.5" />
                        </IconButton>
                        <IconButton
                          size="sm"
                          label={`Move ${r.requestId} down`}
                          disabled={i === order.length - 1}
                          onClick={() => setOrder((o) => moved(o, i, 1))}
                        >
                          <IconArrowDown className="size-3.5" />
                        </IconButton>
                      </>
                    )}
                  </div>
                  {unit.canCut && !reordered && option && handleAfter === i && (
                    <CutHandle onMove={moveLine} buttonRef={handleRef} />
                  )}
                </DropZone>
              </li>
            )
          })}
        </ol>
      </div>
    </Section>
  )
}

/** Where the dragged cut line can be dropped (after the row it holds). */
function DropZone({ onDrop, children }: { onDrop: () => void; children?: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop target for the cut line; the line also moves with the arrow keys
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
    >
      {children}
    </div>
  )
}

/** The cut line: drag it between asks, or focus it and use the arrow keys (the focus follows it). */
function CutHandle({
  onMove,
  buttonRef,
}: {
  onMove: (by: number) => void
  buttonRef: (el: HTMLButtonElement | null) => void
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      draggable
      aria-label="Cut line: drag it, or press the up and down arrow keys"
      onDragStart={(e) => e.dataTransfer.setData('text/plain', 'cut-line')}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          onMove(-1)
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          onMove(1)
        }
      }}
      className="my-1 flex w-full cursor-grab items-center gap-2 text-label font-semibold tracking-[0.02em] text-warning"
    >
      <span className="h-0.5 flex-1 bg-warning" />
      Cut line
      <span className="h-0.5 flex-1 bg-warning" />
    </button>
  )
}

/** Manager mode: the manager's own asks, ranked 1 first (each ask's priority). */
function MineRanking({
  cycleId,
  ids,
  rows,
}: {
  cycleId: string
  ids: readonly string[]
  rows: readonly RankedAskRow[]
}) {
  const { write, run, busy } = useWriteSteps()
  const [order, setOrder] = useState<readonly string[]>(ids)
  const byId = new Map(rows.map((r) => [r.requestId, r]))
  const changed = order.join('|') !== ids.join('|')
  return (
    <Section
      title="Rank your asks"
      dek="Put your most needed ask first. Where each ask lands is decided in review."
      actions={
        <>
          <Button
            size="sm"
            disabled={!changed || !!write.blocked || busy}
            onClick={() => run([(w) => w.run('rankCycleAsks', { cycleId, requestIds: order })])}
          >
            Save my ranking
          </Button>
          <WriteBlocked blocked={write.blocked} />
        </>
      }
    >
      <ol className="col-span-full rounded-sheet bg-sheet px-5 py-4 text-small">
        {order.map((id, i) => {
          const r = byId.get(id)
          return (
            <li key={id} className="flex items-center gap-2 border-b border-rule py-1">
              <span className="w-8 text-right text-ink-2">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">
                {id} {r?.type ?? ''}
                {r?.jobTitle ? `, ${r.jobTitle}` : ''}
              </span>
              <IconButton
                size="sm"
                label={`Move ${id} up`}
                disabled={i === 0}
                onClick={() => setOrder((o) => moved(o, i, -1))}
              >
                <IconArrowUp className="size-3.5" />
              </IconButton>
              <IconButton
                size="sm"
                label={`Move ${id} down`}
                disabled={i === order.length - 1}
                onClick={() => setOrder((o) => moved(o, i, 1))}
              >
                <IconArrowDown className="size-3.5" />
              </IconButton>
            </li>
          )
        })}
      </ol>
    </Section>
  )
}
