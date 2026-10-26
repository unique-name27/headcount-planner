/**
 * Targets' changes (docs/PLAN.md 6.9, 8.3, 9.4; M3). On Gap: Finance (and HR admin) sets an org's
 * heads and cost target for the fiscal year shown, editing a target in view or setting one for a
 * new org. On Sub-org targets: a leader splits its org's target into its sub-orgs' targets, or moves
 * target from one sub-org to another, inside the envelope (the parent's target); a split or move past
 * it needs Finance, which may go past. Each change writes 'target' audit entries that Finance reads
 * in Target changes. Every choice and starting value comes from the model (`TargetsGap.writes`,
 * `TargetsSubOrgs.writes`).
 */
import { useMemo, useState } from 'react'
import { Button, Dialog } from '@/components'
import type { ISODate, TargetRow } from '@/data/schema'
import { fmt, plural } from '@/lib/format'
import type { FreezeOrgOption } from '@/views/finance/engine'
import { type SplitChoice, type SubOrgWrites, splitChildrenOf, type TargetSetWrites } from '../engine'
import { ChangeBar, Choice, Field, INPUT, Refusal, useSave } from './form'

const NEW = '__new'

type Kind = FreezeOrgOption['kind']
const KIND_LABEL: Readonly<Record<Kind, string>> = {
  unit: 'Business unit',
  department: 'Department',
  costCenter: 'Cost center',
  leader: 'Leader’s org',
}

/** A number typed in a field, or null when blank. */
const num = (s: string): number | null => (s.trim() === '' ? null : Number(s))

/* ───────────── Gap: set a target ───────────── */

export function TargetSetBar({ writes }: { writes: TargetSetWrites }) {
  const [open, setOpen] = useState(false)
  const { blocked } = useSave()
  return (
    <ChangeBar accesses={[writes.access]}>
      {writes.access.shown && (
        <Button size="sm" disabled={!!blocked} onClick={() => setOpen(true)}>
          Set a target
        </Button>
      )}
      {open && <SetDialog writes={writes} onClose={() => setOpen(false)} />}
    </ChangeBar>
  )
}

function SetDialog({ writes, onClose }: { writes: TargetSetWrites; onClose: () => void }) {
  const [pick, setPick] = useState(writes.rows[0]?.key ?? NEW)
  const kinds = useMemo(() => [...new Set(writes.orgs.map((o) => o.kind))], [writes.orgs])
  const [kind, setKind] = useState<Kind>(kinds[0] ?? 'unit')
  const ofKind = writes.orgs.filter((o) => o.kind === kind)
  const [orgAt, setOrgAt] = useState(0)
  const current = writes.rows.find((r) => r.key === pick)?.row ?? null
  const [heads, setHeads] = useState(current ? String(current.targetHeads) : '')
  const [cost, setCost] = useState(current?.targetCost != null ? String(current.targetCost) : '')
  const [date, setDate] = useState<string>(current?.targetDate ?? '')
  const { save, busy, refused, blocked, setRefused } = useSave()
  const org = ofKind[orgAt] ?? ofKind[0]
  const startFrom = (key: string) => {
    const r = writes.rows.find((x) => x.key === key)?.row ?? null
    setHeads(r ? String(r.targetHeads) : '')
    setCost(r?.targetCost != null ? String(r.targetCost) : '')
    setDate(r?.targetDate ?? '')
    setRefused(null)
  }
  const keyOf = (): Omit<TargetRow, 'targetHeads' | 'targetCost' | 'targetDate'> | null => {
    if (current)
      return {
        fiscalYear: current.fiscalYear,
        businessUnit: current.businessUnit,
        department: current.department ?? null,
        costCenter: current.costCenter ?? null,
        leaderPositionId: current.leaderPositionId ?? null,
      }
    if (!org) return null
    return {
      fiscalYear: writes.fiscalYear,
      businessUnit: org.businessUnit,
      department: org.kind === 'department' ? org.value : null,
      costCenter: org.kind === 'costCenter' ? org.value : null,
      leaderPositionId: org.kind === 'leader' ? org.value : null,
    }
  }
  const h = num(heads)
  const c = num(cost)
  const k = keyOf()
  const ready = k != null && h != null && Number.isFinite(h) && (c == null || Number.isFinite(c))
  return (
    <Dialog
      title="Set a target"
      description={`${writes.fiscalYear} heads and cost for an org. The change is audited with your name; leaders see it in their targets.`}
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
            disabled={!!blocked || busy || !ready}
            onClick={() =>
              k &&
              h != null &&
              void save(
                'setTarget',
                {
                  row: { ...k, targetHeads: h, targetCost: c, targetDate: (date || null) as ISODate | null },
                },
                onClose,
              )
            }
          >
            {busy ? 'Saving' : 'Save target'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Target" className="sm:col-span-2">
          {(id) => (
            <Choice
              id={id}
              value={pick}
              options={[
                ...writes.rows.map((r) => ({ value: r.key, label: r.label })),
                { value: NEW, label: 'A new org' },
              ]}
              onChange={(v) => {
                setPick(v)
                startFrom(v)
              }}
            />
          )}
        </Field>
        {pick === NEW && (
          <>
            <Field label="Org type">
              {(id) => (
                <Choice<Kind>
                  id={id}
                  value={kind}
                  options={kinds.map((x) => ({ value: x, label: KIND_LABEL[x] }))}
                  onChange={(x) => {
                    setKind(x)
                    setOrgAt(0)
                  }}
                />
              )}
            </Field>
            <Field label="Org">
              {(id) => (
                <Choice
                  id={id}
                  value={String(orgAt)}
                  options={ofKind.map((o, i) => ({ value: String(i), label: o.label }))}
                  onChange={(v) => setOrgAt(Number(v))}
                />
              )}
            </Field>
          </>
        )}
        <Field label="Target heads">
          {(id) => (
            <input
              id={id}
              type="number"
              min={0}
              step={1}
              className={INPUT}
              value={heads}
              onChange={(e) => setHeads(e.currentTarget.value)}
            />
          )}
        </Field>
        <Field label="Target cost (USD)" hint="Blank: heads only.">
          {(id) => (
            <input
              id={id}
              type="number"
              min={0}
              step="any"
              className={INPUT}
              value={cost}
              onChange={(e) => setCost(e.currentTarget.value)}
            />
          )}
        </Field>
        <Field label="Target date" hint={`Blank: the fiscal year's end, ${fmt(writes.yearEnd, 'date')}.`}>
          {(id) => (
            <input
              id={id}
              type="date"
              className={INPUT}
              value={date}
              onChange={(e) => setDate(e.currentTarget.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}

/* ───────────── Sub-org targets: split and move ───────────── */

export function SubOrgBar({ writes }: { writes: SubOrgWrites }) {
  const [open, setOpen] = useState<'split' | 'move' | null>(null)
  const { blocked } = useSave()
  return (
    <ChangeBar accesses={[writes.split.access, writes.move.access]}>
      {writes.split.access.shown && (
        <Button
          size="sm"
          disabled={!!blocked || !writes.split.choices.length}
          onClick={() => setOpen('split')}
        >
          Split a target
        </Button>
      )}
      {writes.move.access.shown && (
        <Button size="sm" disabled={!!blocked || !writes.move.choices.length} onClick={() => setOpen('move')}>
          Move target
        </Button>
      )}
      {(writes.split.access.shown || writes.move.access.shown) && !writes.split.choices.length && (
        <span className="text-meta text-muted">No org here has a target to split into sub-orgs.</span>
      )}
      {open === 'split' && <SplitDialog writes={writes} onClose={() => setOpen(null)} />}
      {open === 'move' && <MoveDialog writes={writes} onClose={() => setOpen(null)} />}
    </ChangeBar>
  )
}

/** "601 heads, $59.9M" as the mode prints a target. */
const envelopeText = (c: SplitChoice, money: SubOrgWrites['money']): string =>
  `${plural(c.envelopeHeads, 'head')}${c.envelopeCostUsd != null ? `, ${fmt(c.envelopeCostUsd, money)}` : ''}`

function SplitDialog({ writes, onClose }: { writes: SubOrgWrites; onClose: () => void }) {
  const choices = writes.split.choices
  const [parent, setParent] = useState(choices[0]?.parentLeaderPositionId ?? '')
  const choice = choices.find((c) => c.parentLeaderPositionId === parent) ?? choices[0]
  return (
    <Dialog
      title="Split a target"
      description="Give each sub-org its share of the parent's target. What is not split stays unallocated."
      open
      width={720}
      onOpenChange={(o) => !o && onClose()}
    >
      <div className="flex flex-col gap-3">
        <Field label="Parent org">
          {(id) => (
            <Choice
              id={id}
              value={choice?.parentLeaderPositionId ?? ''}
              options={choices.map((c) => ({ value: c.parentLeaderPositionId, label: c.parentLabel }))}
              onChange={setParent}
            />
          )}
        </Field>
        {choice && (
          <SplitBody key={choice.parentLeaderPositionId} choice={choice} writes={writes} onClose={onClose} />
        )}
      </div>
    </Dialog>
  )
}

/** The split form's body: one heads box and one cost box per sub-org, each labelled with its sub-org. */
export function SplitBody({
  choice,
  writes,
  onClose,
}: {
  choice: SplitChoice
  writes: SubOrgWrites
  onClose: () => void
}) {
  const [heads, setHeads] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      choice.children.map((c) => [c.leaderPositionId, c.targetHeads == null ? '' : String(c.targetHeads)]),
    ),
  )
  const [costs, setCosts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      choice.children.map((c) => [
        c.leaderPositionId,
        c.targetCostUsd == null ? '' : String(c.targetCostUsd),
      ]),
    ),
  )
  // The cost boxes the viewer changed: only those send a cost (review UI-2).
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set())
  const { save, busy, refused, blocked } = useSave()
  const children = splitChildrenOf(choice, writes, heads, costs, touched)
  const total = children.reduce((n, c) => n + (Number.isFinite(c.targetHeads) ? c.targetHeads : 0), 0)
  const past = total > choice.envelopeHeads
  return (
    <div className="flex flex-col gap-3 border-t border-rule pt-3">
      <p className="text-small text-ink">
        Envelope: {envelopeText(choice, writes.money)}. Split so far: {fmt(total, 'int')} heads.
      </p>
      {past && !writes.pastEnvelope && (
        <p className="text-meta text-ink-2">A move past a sub-org’s envelope needs Finance.</p>
      )}
      <div className="flex flex-col gap-2">
        {choice.children.map((c) => (
          <fieldset
            key={c.leaderPositionId}
            className="grid min-w-0 items-end gap-2 sm:grid-cols-[1fr_120px_160px]"
          >
            <legend className="sr-only">{c.label}</legend>
            <p className="text-small text-ink" aria-hidden="true">
              {c.label}
            </p>
            <Field label="Heads">
              {(id) => (
                <input
                  id={id}
                  aria-label={`Heads, ${c.label}`}
                  type="number"
                  min={0}
                  step={1}
                  className={INPUT}
                  value={heads[c.leaderPositionId] ?? ''}
                  onChange={(e) => {
                    const v = e.currentTarget.value
                    setHeads((h) => ({ ...h, [c.leaderPositionId]: v }))
                  }}
                />
              )}
            </Field>
            <Field
              label="Cost (USD)"
              hint={
                !c.costAllowed
                  ? 'Heads only: not made of whole cost atoms.'
                  : c.targetCostUsd != null
                    ? writes.costRounded
                      ? 'Shown rounded down. A cost you change is saved as typed; blank removes its cost target.'
                      : 'Blank removes its cost target.'
                    : undefined
              }
            >
              {(id) => (
                <input
                  id={id}
                  aria-label={`Cost (USD), ${c.label}`}
                  type="number"
                  min={0}
                  step="any"
                  className={INPUT}
                  disabled={!c.costAllowed}
                  value={costs[c.leaderPositionId] ?? ''}
                  onChange={(e) => {
                    const v = e.currentTarget.value
                    setCosts((x) => ({ ...x, [c.leaderPositionId]: v }))
                    setTouched((t) => new Set([...t, c.leaderPositionId]))
                  }}
                />
              )}
            </Field>
          </fieldset>
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Refusal text={refused} />
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!!blocked || busy || !children.length}
          onClick={() =>
            void save(
              'splitTarget',
              {
                fiscalYear: writes.fiscalYear,
                parentLeaderPositionId: choice.parentLeaderPositionId,
                // A child with no `targetCost` keeps its stored cost target (`splitChildrenOf`, UI-2).
                children,
              },
              onClose,
            )
          }
        >
          {busy ? 'Saving' : 'Save the split'}
        </Button>
      </div>
    </div>
  )
}

function MoveDialog({ writes, onClose }: { writes: SubOrgWrites; onClose: () => void }) {
  const choices = writes.move.choices.filter((c) => c.children.length > 1)
  const [parent, setParent] = useState(choices[0]?.parentLeaderPositionId ?? '')
  const choice = choices.find((c) => c.parentLeaderPositionId === parent) ?? choices[0]
  const kids = choice?.children ?? []
  const [from, setFrom] = useState(kids[0]?.leaderPositionId ?? '')
  const [to, setTo] = useState(kids[1]?.leaderPositionId ?? '')
  const [heads, setHeads] = useState('1')
  const [cost, setCost] = useState('')
  const { save, busy, refused, blocked } = useSave()
  const h = Number(heads)
  const c = num(cost)
  const ready = !!choice && from !== '' && to !== '' && from !== to && Number.isInteger(h) && h >= 1
  return (
    <Dialog
      title="Move target"
      description="Move heads, and cost with them, from one sub-org's target to another's. The parent's total stays the same."
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
            disabled={!!blocked || busy || !ready}
            onClick={() =>
              void save(
                'moveTarget',
                {
                  fiscalYear: writes.fiscalYear,
                  fromLeaderPositionId: from,
                  toLeaderPositionId: to,
                  heads: h,
                  cost: c,
                },
                onClose,
              )
            }
          >
            {busy ? 'Saving' : 'Move'}
          </Button>
        </>
      }
    >
      {!choice ? (
        <p className="text-small text-ink-2">No parent org here has two sub-orgs to move target between.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Parent org" className="sm:col-span-2">
            {(id) => (
              <Choice
                id={id}
                value={choice.parentLeaderPositionId}
                options={choices.map((x) => ({ value: x.parentLeaderPositionId, label: x.parentLabel }))}
                onChange={(v) => {
                  setParent(v)
                  const k = choices.find((x) => x.parentLeaderPositionId === v)?.children ?? []
                  setFrom(k[0]?.leaderPositionId ?? '')
                  setTo(k[1]?.leaderPositionId ?? '')
                }}
              />
            )}
          </Field>
          <Field label="From">
            {(id) => (
              <Choice
                id={id}
                value={from}
                options={kids.map((k) => ({ value: k.leaderPositionId, label: k.label }))}
                onChange={setFrom}
              />
            )}
          </Field>
          <Field label="To">
            {(id) => (
              <Choice
                id={id}
                value={to}
                options={kids.map((k) => ({ value: k.leaderPositionId, label: k.label }))}
                onChange={setTo}
              />
            )}
          </Field>
          <Field label="Heads">
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                step={1}
                className={INPUT}
                value={heads}
                onChange={(e) => setHeads(e.currentTarget.value)}
              />
            )}
          </Field>
          <Field label="Cost with them (USD)" hint="Blank moves heads only.">
            {(id) => (
              <input
                id={id}
                type="number"
                min={0}
                step="any"
                className={INPUT}
                value={cost}
                onChange={(e) => setCost(e.currentTarget.value)}
              />
            )}
          </Field>
        </div>
      )}
    </Dialog>
  )
}
