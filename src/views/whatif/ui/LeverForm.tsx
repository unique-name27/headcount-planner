/**
 * Add a lever (docs/PLAN.md 10.6, 11.5): the lever kind, then its pickers, all read from the model
 * (`WhatIfLevers.seats` and `pickers`): the seats a lever may name (Planned, or Open with no
 * accepted offer), the orgs in scope, levels and locations, and for a trade the tradable seats with
 * their weights in standard heads (blocked seats listed with their reason) and the get seats'
 * pickers. The form builds a `Lever` and hands it to `onAdd`; it computes no number.
 *
 * The What if tour's trade step points at [data-tour="whatif-trade"] (PLAN 11.5, review HL-9): the
 * trade lever's own fields while Trade is picked, else the lever picker where Trade is chosen, so the
 * anchor is drawn whatever lever kind is picked, exactly once.
 */
import { useState } from 'react'
import { MultiSelect } from '@/components/MultiSelect'
import { Button } from '@/components/ui'
import type { Level } from '@/data/schema'
import { LEVER_KIND_LABEL, LEVER_KINDS, type Lever, type WhatIfLevers } from '../engine'

const FIELD = 'h-8 min-w-0 rounded-control border border-rule-strong bg-sheet px-2 text-small text-ink'
const LABEL = 'flex min-w-0 flex-col gap-1 text-meta text-ink-2'

/** A seat as a picker names it: "P-2460 Design engineer (P3 San Jose, Planned)". */
const seatOption = (r: WhatIfLevers['seats']['rows'][number]) =>
  `${r.positionId}${r.title ? ` ${r.title}` : ''} (${r.level} ${r.location}, ${r.status})`

export function LeverForm({ m, onAdd }: { m: WhatIfLevers; onAdd: (lever: Lever) => void }) {
  const pk = m.pickers
  const seats = m.seats.rows
  const [kind, setKind] = useState<Lever['kind']>('defer')
  const [seat, setSeat] = useState('')
  const [many, setMany] = useState<string[]>([])
  const [date, setDate] = useState(pk.firstStart)
  const [months, setMonths] = useState('1')
  const [level, setLevel] = useState<Level>('P3')
  const [location, setLocation] = useState(pk.locations[0] ?? '')
  const [org, setOrg] = useState('')
  const [give, setGive] = useState<string[]>([])
  const [credit, setCredit] = useState('')
  const [fte, setFte] = useState('1')
  const [count, setCount] = useState('')
  const [rest, setRest] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const tradable = pk.give.filter((g) => !g.blocked)
  const blocked = pk.give.filter((g) => g.blocked)

  const build = (): Lever | string => {
    switch (kind) {
      case 'defer':
        if (!seat) return 'Pick a seat.'
        if (!date) return 'Pick the new start date.'
        return { kind, positionId: seat, to: date }
      case 'cancel':
        return seat ? { kind, positionId: seat } : 'Pick a seat.'
      case 'shift': {
        const n = Number(months)
        if (!many.length) return 'Pick at least one seat.'
        if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 24)
          return 'Shift by a whole number of months from −24 to 24, other than 0.'
        return { kind, positionIds: many, months: n }
      }
      case 'level':
        return seat ? { kind, positionId: seat, level } : 'Pick a seat.'
      case 'location':
        return seat ? { kind, positionId: seat, location } : 'Pick a seat.'
      case 'freeze':
        if (!org) return 'Pick the sub-org to freeze.'
        if (!date) return 'Pick the date the freeze starts.'
        return { kind, orgPositionId: org, from: date }
      case 'trade': {
        const creditBp = credit.trim() ? Math.round(Number(credit) * 10_000) : 0
        if (!Number.isFinite(creditBp) || creditBp < 0) return 'Trade credit is a number of standard heads.'
        if (!give.length && creditBp === 0) return 'Pick the seats to give, or use trade credit.'
        if (!org) return 'Pick the org the new seats report to.'
        if (!date) return 'Pick the start date of the new seats.'
        const f = Number(fte)
        if (!Number.isFinite(f) || f <= 0 || f > 1) return 'FTE is from 0.1 to 1.'
        const c = count.trim()
        const n = c ? Number(c) : null
        if (n != null && (!Number.isInteger(n) || n < 1))
          return 'Ask for a whole number of seats, or leave it blank for as many as the trade gives.'
        return {
          kind,
          ask: {
            give,
            creditUsedBp: creditBp,
            giveOrgPositionId: null,
            get: {
              level,
              location,
              fte: f,
              orgPositionId: org,
              businessUnit: pk.orgs.find((o) => o.positionId === org)?.businessUnit ?? '',
              jobFamily: null,
              start: date,
              count: n ?? 'max',
              partTimeRest: rest,
            },
          },
        }
      }
    }
  }

  const add = () => {
    const out = build()
    if (typeof out === 'string') {
      setProblem(out)
      return
    }
    setProblem(null)
    onAdd(out)
  }

  const needsSeat = kind === 'defer' || kind === 'cancel' || kind === 'level' || kind === 'location'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className={LABEL} {...(kind === 'trade' ? {} : { 'data-tour': 'whatif-trade' })}>
          Lever
          <select
            className={FIELD}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Lever['kind'])
              setProblem(null)
            }}
          >
            {LEVER_KINDS.map((k) => (
              <option key={k} value={k}>
                {LEVER_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        {needsSeat && (
          <label className={`${LABEL} basis-72`}>
            Seat
            <select className={FIELD} value={seat} onChange={(e) => setSeat(e.target.value)}>
              <option value="">Pick a seat</option>
              {seats.map((r) => (
                <option key={r.positionId} value={r.positionId}>
                  {seatOption(r)}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'shift' && (
          <>
            <MultiSelect
              label="Seats"
              width={360}
              options={seats.map((r) => ({ value: r.positionId, label: seatOption(r) }))}
              value={many}
              onChange={setMany}
            />
            <label className={LABEL}>
              Months (negative moves earlier)
              <input
                type="number"
                step={1}
                min={-24}
                max={24}
                className={`${FIELD} w-24`}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
              />
            </label>
          </>
        )}
        {(kind === 'defer' || kind === 'freeze' || kind === 'trade') && (
          <label className={LABEL}>
            {kind === 'defer' ? 'New start' : kind === 'freeze' ? 'Frozen from' : 'Start of the new seats'}
            <input
              type="date"
              className={FIELD}
              min={pk.firstStart}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        )}
        {(kind === 'level' || kind === 'trade') && (
          <label className={LABEL}>
            {kind === 'trade' ? 'Level of the new seats' : 'New level'}
            <select className={FIELD} value={level} onChange={(e) => setLevel(e.target.value as Level)}>
              {pk.levels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
        {(kind === 'location' || kind === 'trade') && (
          <label className={LABEL}>
            {kind === 'trade' ? 'Location of the new seats' : 'New location'}
            <select className={FIELD} value={location} onChange={(e) => setLocation(e.target.value)}>
              {pk.locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
        {(kind === 'freeze' || kind === 'trade') && (
          <label className={`${LABEL} basis-72`}>
            {kind === 'freeze' ? 'Sub-org' : 'The new seats report to'}
            <select className={FIELD} value={org} onChange={(e) => setOrg(e.target.value)}>
              <option value="">Pick an org</option>
              {pk.orgs.map((o) => (
                <option key={o.positionId} value={o.positionId}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {kind === 'trade' && (
        <div data-tour="whatif-trade" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <MultiSelect
              label="Seats to give"
              width={380}
              options={tradable.map((g) => ({
                value: g.positionId,
                label: `${g.positionId} ${g.level} ${g.location}, ${g.status} (${g.standardHeads ?? '—'} standard heads)`,
              }))}
              value={give}
              onChange={setGive}
              note={pk.giveNote ?? undefined}
            />
            <label className={LABEL}>
              Trade credit to use (standard heads)
              <input
                inputMode="decimal"
                className={`${FIELD} w-28`}
                value={credit}
                placeholder="0.00"
                onChange={(e) => setCredit(e.target.value)}
              />
            </label>
            <label className={LABEL}>
              FTE
              <input
                type="number"
                step={0.1}
                min={0.1}
                max={1}
                className={`${FIELD} w-20`}
                value={fte}
                onChange={(e) => setFte(e.target.value)}
              />
            </label>
            <label className={LABEL}>
              Seats wanted (blank for as many)
              <input
                type="number"
                step={1}
                min={1}
                className={`${FIELD} w-24`}
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-1.5 pb-1.5 text-meta text-ink-2">
              <input type="checkbox" checked={rest} onChange={(e) => setRest(e.target.checked)} />
              Part-time last seat with what is left
            </label>
          </div>
          {pk.credits.length > 0 && (
            <p className="text-meta text-ink-2">
              Trade credit held:{' '}
              {pk.credits.map((c) => `${c.label} ${c.standardHeads} standard heads`).join('; ')}.
            </p>
          )}
          {blocked.length > 0 && (
            <details className="text-meta text-ink-2">
              <summary>Seats that cannot be given ({blocked.length})</summary>
              <ul className="mt-1 space-y-0.5">
                {blocked.map((g) => (
                  <li key={g.positionId}>
                    {g.positionId} {g.level} {g.location}: {g.blocked}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="sm" onClick={add}>
          Add lever
        </Button>
        {problem && (
          <span role="alert" className="text-meta text-critical">
            {problem}
          </span>
        )}
      </div>
    </div>
  )
}
