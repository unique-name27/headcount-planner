/**
 * Finance > Versions' changes (docs/PLAN.md 6.5, 6.6, C28; M3): lock the year's Working into a
 * Budget or a reforecast (Working stays editable), reopen a reforecast as the new Working (the
 * confirm lists the rows it replaces), close the next month from HRIS actuals (setting the month's
 * actual rates first where they are missing), and start a Working for a new fiscal year. Every choice
 * comes from the model (`FinanceVersions.writes`); the buttons run the actions through the write hook.
 */
import { useState } from 'react'
import { FREE_TEXT_HINT } from '@/access/copy'
import { Button, Dialog } from '@/components'
import { fmt } from '@/lib/format'
import type { FiscalYear } from '@/plan/types'
import type { ReopenChoice, VersionWrites } from '../engine'
import { ChangeBar, Choice, Field, INPUT, Refusal, useSave } from './form'

type Open = 'create' | 'lock' | 'reopen' | 'close' | null

export function VersionChanges({ writes }: { writes: VersionWrites }) {
  const [open, setOpen] = useState<Open>(null)
  const { blocked } = useSave()
  const close = writes.close.choice
  return (
    <ChangeBar
      accesses={[writes.lock.access, writes.reopen.access, writes.close.access, writes.create.access]}
    >
      {writes.lock.access.shown && (
        <Button size="sm" disabled={!!blocked || !writes.lock.choices.length} onClick={() => setOpen('lock')}>
          Lock a version
        </Button>
      )}
      {writes.reopen.access.shown && (
        <Button
          size="sm"
          disabled={!!blocked || !writes.reopen.choices.length}
          onClick={() => setOpen('reopen')}
        >
          Reopen as new
        </Button>
      )}
      {writes.close.access.shown && close && (
        <>
          <Button size="sm" disabled={!!blocked || !!close.notYet} onClick={() => setOpen('close')}>
            Close {close.label}
          </Button>
          {close.notYet && <span className="text-meta text-ink-2">{close.notYet}</span>}
        </>
      )}
      {writes.create.access.shown && (
        <Button
          size="sm"
          disabled={!!blocked || !writes.create.years.length}
          onClick={() => setOpen('create')}
        >
          New Working version
        </Button>
      )}
      {open === 'lock' && <LockDialog writes={writes} onClose={() => setOpen(null)} />}
      {open === 'reopen' && <ReopenDialog choices={writes.reopen.choices} onClose={() => setOpen(null)} />}
      {open === 'close' && close && <CloseDialog writes={writes} onClose={() => setOpen(null)} />}
      {open === 'create' && <CreateDialog writes={writes} onClose={() => setOpen(null)} />}
    </ChangeBar>
  )
}

function LockDialog({ writes, onClose }: { writes: VersionWrites; onClose: () => void }) {
  const choices = writes.lock.choices
  const [workingId, setWorkingId] = useState(choices[0]?.workingId ?? '')
  const choice = choices.find((c) => c.workingId === workingId) ?? choices[0]
  const [name, setName] = useState(choice?.suggestedName ?? '')
  const { save, busy, refused, blocked } = useSave()
  if (!choice) return null
  return (
    <Dialog
      title="Lock a version"
      description="Locking stores the year's Working as it is now, with a checksum of its lines, assumptions and rates. Working stays editable."
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
            disabled={!!blocked || busy || !name.trim()}
            onClick={() =>
              void save(
                'lockVersion',
                {
                  workingId: choice.workingId,
                  as: { kind: choice.kind, name: name.trim() },
                  // The standard head Finance confirms here (11.2 "Compute from Budget", SP-13).
                  ...(choice.standardHeadUsd != null ? { standardHeadUsd: choice.standardHeadUsd } : {}),
                },
                onClose,
              )
            }
          >
            {busy ? 'Locking' : choice.kind === 'budget' ? 'Lock the Budget' : 'Lock the reforecast'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Working version">
          {(id) => (
            <Choice
              id={id}
              value={choice.workingId}
              options={choices.map((c) => ({ value: c.workingId, label: c.workingName }))}
              onChange={(v) => {
                setWorkingId(v)
                setName(choices.find((c) => c.workingId === v)?.suggestedName ?? '')
              }}
            />
          )}
        </Field>
        <p className="text-small text-ink-2">
          {choice.kind === 'budget'
            ? `This is ${choice.fiscalYear}'s first lock: it becomes the year's Budget, which never unlocks.`
            : `${choice.fiscalYear} has ${choice.locked.join(', ')}. This lock is a reforecast and stores its forecast.`}
        </p>
        {choice.standardHeadUsd != null && (
          <div className="flex flex-col gap-0.5">
            <p className="flex items-baseline justify-between gap-3 text-small text-ink">
              <span>Standard head</span>
              <span className="tabular-nums">{fmt(choice.standardHeadUsd, 'moneyFull')}</span>
            </p>
            {choice.standardHeadNote && <p className="text-meta text-ink-2">{choice.standardHeadNote}</p>}
          </div>
        )}
        <Field label="Name" hint={FREE_TEXT_HINT}>
          {(id) => (
            <input
              id={id}
              className={INPUT}
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}

function ReopenDialog({ choices, onClose }: { choices: readonly ReopenChoice[]; onClose: () => void }) {
  const [id, setId] = useState(choices[0]?.reforecastId ?? '')
  const choice = choices.find((c) => c.reforecastId === id) ?? choices[0]
  const { save, busy, refused, blocked } = useSave()
  if (!choice) return null
  return (
    <Dialog
      title="Reopen as new"
      description={`${choice.workingName} is retired and kept read only. A new ${choice.fiscalYear} Working starts from the reforecast's assumptions, plan rates and proration. Positions, requests and closes stay as they are.`}
      open
      width={680}
      onOpenChange={(o) => !o && onClose()}
      footer={
        <>
          <Refusal text={refused} />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!!blocked || busy}
            onClick={() => void save('reopenVersion', { reforecastId: choice.reforecastId }, onClose)}
          >
            {busy ? 'Reopening' : 'Reopen as new'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Reforecast">
          {(fid) => (
            <Choice
              id={fid}
              value={choice.reforecastId}
              options={choices.map((c) => ({ value: c.reforecastId, label: c.name }))}
              onChange={setId}
            />
          )}
        </Field>
        <p className="text-small text-ink">
          {choice.replaced.length
            ? `${fmt(choice.replaced.length, 'int')} Working ${choice.replaced.length === 1 ? 'value differs' : 'values differ'} from ${choice.name} and will be replaced:`
            : `Working's assumptions and plan rates match ${choice.name}. Nothing is replaced.`}
        </p>
        {choice.replaced.length > 0 && (
          <div className="max-h-[280px] overflow-y-auto rounded-control shadow-[inset_0_0_0_1px_var(--rule)]">
            <table className="w-full text-meta">
              <thead className="text-ink-2">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Table</th>
                  <th className="px-2 py-1 text-left font-medium">Org</th>
                  <th className="px-2 py-1 text-left font-medium">Key</th>
                  <th className="px-2 py-1 text-right font-medium">Working</th>
                  <th className="px-2 py-1 text-right font-medium">Reforecast</th>
                </tr>
              </thead>
              <tbody>
                {choice.replaced.map((r) => (
                  <tr key={`${r.table}|${r.org ?? ''}|${r.key}`} className="border-t border-rule">
                    <td className="px-2 py-1">{r.table}</td>
                    <td className="px-2 py-1">{r.org ?? 'Company'}</td>
                    <td className="px-2 py-1">{r.key}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.working ?? '—'}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.reforecast ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  )
}

function CloseDialog({ writes, onClose }: { writes: VersionWrites; onClose: () => void }) {
  const choice = writes.close.choice
  const { save, busy, refused, blocked } = useSave()
  if (!choice) return null
  const missing = choice.missingRates.length > 0
  return (
    <Dialog
      title={`Close ${choice.label}`}
      description="Closing snapshots HRIS actuals per assignment, with the one-time items booked in the month, at the month's actual rates. Back-dated changes to closed months post in the first open month."
      open
      onOpenChange={(o) => !o && onClose()}
      footer={
        <>
          <Refusal text={refused} />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {missing && choice.carry.length > 0 && (
            <Button
              disabled={!!blocked || busy}
              onClick={() => void save('setFx', { versionId: choice.workingId, rates: choice.carry })}
            >
              Use {choice.carryFrom}'s actual rates
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!!blocked || busy || missing}
            onClick={() => void save('closeMonth', { month: choice.month }, onClose)}
          >
            {busy ? 'Closing' : `Close ${choice.label}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 text-small">
        {missing ? (
          <p className="text-ink">
            {choice.label} has no actual rate yet for {choice.missingRates.join(', ')} in {choice.workingName}
            . Set them in Assumptions, or start from {choice.carryFrom ?? 'the month before'}'s and change
            them there.
          </p>
        ) : (
          <p className="text-ink">Every currency has an actual rate for {choice.label}.</p>
        )}
        <p className="text-ink-2">
          Months close one at a time, in order. A closed month is read from its close.
        </p>
      </div>
    </Dialog>
  )
}

function CreateDialog({ writes, onClose }: { writes: VersionWrites; onClose: () => void }) {
  const c = writes.create
  const [fy, setFy] = useState<FiscalYear>(c.years[0] as FiscalYear)
  const [name, setName] = useState(`${c.years[0] ?? ''} Working`)
  const [from, setFrom] = useState(c.defaultFrom ?? '')
  const { save, busy, refused, blocked } = useSave()
  return (
    <Dialog
      title="New Working version"
      description="Each fiscal year has one Working version. It starts from another version's assumptions and rates."
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
            disabled={!!blocked || busy || !name.trim()}
            onClick={() =>
              void save(
                'createVersion',
                {
                  fiscalYear: fy,
                  name: name.trim(),
                  proration: c.proration,
                  from: from || null,
                  assumptions: [],
                },
                onClose,
              )
            }
          >
            {busy ? 'Checking' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fiscal year">
          {(id) => (
            <Choice<FiscalYear>
              id={id}
              value={fy}
              options={c.years.map((y) => ({ value: y, label: y }))}
              onChange={(v) => {
                setFy(v)
                setName(`${v} Working`)
              }}
            />
          )}
        </Field>
        <Field label="Name" hint={FREE_TEXT_HINT}>
          {(id) => (
            <input
              id={id}
              className={INPUT}
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          )}
        </Field>
        <Field label="Start from" className="sm:col-span-2">
          {(id) => (
            <Choice
              id={id}
              value={from}
              options={c.from.map((v) => ({ value: v.versionId, label: v.name }))}
              onChange={setFrom}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}
