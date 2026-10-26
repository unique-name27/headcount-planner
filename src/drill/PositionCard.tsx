/**
 * One position, on one sheet (docs/PLAN.md 9.5; in place of the template app's person card): the
 * seat's title, level, org and derived status, who holds it (names per mode), the chain above it,
 * its status history, its holders over time, its reqs, the requests that touch it (8.4), its audit
 * rows (8.4 rule 7) and its standard heads. Positions in the chain open their own cards; the counts
 * (positions reporting to it, every position below it, its reqs) open the records behind them.
 *
 * Everything on the card comes from `positionCardModel` (./position.ts), so the leak crawler reads
 * what the card shows. A position outside the mode's scope gets the limited card ("Outside Silicon
 * Engineering."). No amount is ever on the card.
 */
import { Dialog as BDialog } from '@base-ui/react/dialog'
import { useMemo } from 'react'
import { Button, StatusPill, Tag } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { formatDate } from '@/lib/dates'
import { fmt } from '@/lib/format'
import { Drill } from './Drill'
import { focusScope } from './focus'
import { type PositionCardModel, positionCardModel } from './position'
import { positionsBelowSpec, reqsSpec, subPositionsSpec } from './related'
import { positionNamer } from './seats'
import { useDrillStore } from './store'
import { drillSpec } from './types'

const LINK =
  'rounded-mark text-left text-link underline decoration-rule-strong underline-offset-[3px] hover:decoration-link'

const count = (n: number, one: string, many: string) => `${fmt(n, 'int')} ${n === 1 ? one : many}`

const STATUS_TONE = {
  Filled: 'good',
  Open: 'warning',
  Planned: 'info',
  'On hold': 'info',
  Eliminated: 'critical',
} as const

export function PositionCard({ positionId }: { positionId: string }) {
  const ctx = useAnalytics()
  const openPosition = useDrillStore((s) => s.openPosition)
  const m = useMemo(() => positionCardModel(ctx, positionId), [ctx, positionId])
  // Built up front so a count with nothing to list (0) is plain text.
  const lists = useMemo(
    () => ({
      subs: subPositionsSpec(ctx, positionId),
      below: positionsBelowSpec(ctx, positionId),
      reqs: reqsSpec(ctx, positionId),
    }),
    [ctx, positionId],
  )
  if (!m.found)
    return (
      <div className="flex flex-col gap-2">
        <BDialog.Title tabIndex={-1} className="cut-head text-section font-semibold">
          Not in the data
        </BDialog.Title>
        <BDialog.Description className="text-small text-ink-2">
          No position with ID {positionId} is in the Positions dataset.
        </BDialog.Description>
      </div>
    )
  // A position outside the scope: what it is, and nothing else.
  if (m.outside)
    return (
      <article className="flex flex-col gap-2">
        <BDialog.Title tabIndex={-1} className="cut-head text-page-title leading-tight font-semibold">
          {m.title ?? positionId}
        </BDialog.Title>
        <BDialog.Description className="font-mono text-meta text-ink-2">{positionId}</BDialog.Description>
        {m.outsideLine && <p className="text-small text-muted">{m.outsideLine}</p>}
      </article>
    )
  return (
    <article className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <BDialog.Title tabIndex={-1} className="cut-head text-page-title leading-tight font-semibold">
            {m.title ?? positionId}
          </BDialog.Title>
          {m.status && <StatusPill severity={STATUS_TONE[m.status]} label={m.status} />}
        </div>
        <BDialog.Description className="text-body text-ink-2">
          {[m.level, m.holder].filter(Boolean).join(' · ')}
        </BDialog.Description>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-small">
          <dt className="text-muted">Org</dt>
          <dd className="text-ink-2">
            {[m.org?.department, m.org?.businessUnit, m.org?.location].filter(Boolean).join(' · ') || '—'}
          </dd>
          <dt className="text-muted">Cost center</dt>
          <dd className="text-ink-2">{m.org?.costCenter || '—'}</dd>
          <dt className="text-muted">Legal entity</dt>
          <dd className="text-ink-2">{m.org?.legalEntity || '—'}</dd>
        </dl>
        <PositionActions positionId={positionId} focus={m.focus} />
      </header>

      <section className="border-y border-rule py-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-small sm:grid-cols-2">
          <Fact label="Reports to">
            {m.chain.length ? (
              <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                {m.chain.map((c, i) => (
                  <span key={c.positionId} className="flex items-center gap-1">
                    {i > 0 && <span className="text-muted">›</span>}
                    {c.opens ? (
                      <button type="button" className={LINK} onClick={() => openPosition(c.positionId)}>
                        {c.holder ?? c.title ?? c.positionId}
                      </button>
                    ) : (
                      <span>{c.holder ?? c.title ?? c.positionId}</span>
                    )}
                  </span>
                ))}
              </span>
            ) : (
              'Top of the tree shown'
            )}
          </Fact>
          <Fact label="FTE">{fmt(m.fte, 'num2')}</Fact>
          {m.plannedStart && <Fact label="Planned start">{formatDate(m.plannedStart)}</Fact>}
          {m.acceptedOfferDate && <Fact label="Offer accepted">{formatDate(m.acceptedOfferDate)}</Fact>}
          {m.endDate && <Fact label="Last day">{formatDate(m.endDate)}</Fact>}
          {m.standardHeads != null && <Fact label="Standard heads">{fmt(m.standardHeads, 'num2')}</Fact>}
          <Fact label="Below it">
            {m.subPositions ? (
              <>
                <Drill
                  spec={lists.subs}
                  label={`Show the ${count(m.subPositions, 'position', 'positions')} reporting to ${positionId}`}
                >
                  {count(m.subPositions, 'reporting position', 'reporting positions')}
                </Drill>
                {' · '}
                <Drill
                  spec={lists.below}
                  label={`Show the ${count(m.positionsBelow, 'position', 'positions')} below ${positionId}`}
                >
                  {`${count(m.positionsBelow, 'position', 'positions')} in all`}
                </Drill>
              </>
            ) : (
              'No positions report to it'
            )}
          </Fact>
          <Fact label="Reqs">
            {m.reqs ? (
              <Drill spec={lists.reqs} label={`Show the ${count(m.reqs, 'req', 'reqs')} for ${positionId}`}>
                {`${count(m.reqs, 'req', 'reqs')}${m.openReqs ? `, ${fmt(m.openReqs, 'int')} open` : ''}`}
              </Drill>
            ) : (
              'None'
            )}
          </Fact>
        </dl>
      </section>

      {m.holders.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="eyebrow">Held by</h3>
          <ol className="flex flex-col gap-1 text-small">
            {m.holders.map((h, i) => (
              <li key={`${h.start}-${i}`} className="flex gap-3">
                <span className="w-44 shrink-0 text-ink-2 tnum">
                  {formatDate(h.start)} – {h.end ? formatDate(h.end) : 'now'}
                </span>
                <span>
                  {h.name ?? 'Name not shown in this mode'}
                  {h.fte !== 1 ? ` · ${fmt(h.fte, 'num2')} FTE` : ''}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {m.hrbpChanges.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="eyebrow">Changes in Working</h3>
          <ul className="flex flex-col gap-1.5 text-small">
            {m.hrbpChanges.map((c, i) => (
              <li key={`${i}-${c.text}`}>
                <p className="text-ink">{c.text}</p>
                {c.reason && <p className="text-ink-2">Reason: {c.reason}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {m.history.length > 0 && <History m={m} />}

      {m.requests.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="eyebrow">Requests</h3>
          <Drill
            spec={() =>
              drillSpec({ kind: 'requests', title: `Requests that touch ${positionId}`, rows: m.requests })
            }
            className="self-start text-small"
          >
            {count(m.requests.length, 'request', 'requests')}
          </Drill>
          <ul className="flex flex-col gap-1 text-small">
            {m.requests.slice(0, 6).map((r) => (
              <li key={r.requestId} className="flex flex-wrap gap-x-2">
                <span className="font-mono text-meta text-ink-2">{r.requestId}</span>
                <span>{r.type}</span>
                <span className="text-muted">{r.state}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {m.audit.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="eyebrow">Audit</h3>
          <Drill
            spec={() => drillSpec({ kind: 'audit', title: `Audit entries for ${positionId}`, rows: m.audit })}
            className="self-start text-small"
          >
            {count(m.audit.length, 'entry', 'entries')}
          </Drill>
        </section>
      )}
    </article>
  )
}

/** The seat's effective-dated rows, oldest first: what changed on each date. */
function History({ m }: { m: PositionCardModel }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="eyebrow">Status history</h3>
      <table className="w-full text-small tnum">
        <tbody>
          {m.history.map((h, i) => (
            <tr key={`${h.effectiveDate}-${i}`} className="border-b border-rule last:border-0">
              <td className="py-1.5 pr-3 text-ink-2">{formatDate(h.effectiveDate)}</td>
              <td className="py-1.5 pr-3">{h.status}</td>
              <td className="py-1.5 text-ink-2">
                {[h.level, h.location, h.fte !== 1 ? `${fmt(h.fte, 'num2')} FTE` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-meta text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

/** "Focus on this org" for a card, where the mode offers it, and the position's ID. */
function PositionActions({ positionId, focus }: { positionId: string; focus: boolean }) {
  const ctx = useAnalytics()
  return (
    <div className="flex flex-wrap gap-2">
      {focus && (
        <Button
          onClick={() => {
            // The same merge, history entry and Undo as "Filter to" in the records panel.
            focusScope({ leaderId: positionId }, { mode: 'include', nameOf: positionNamer(ctx) })
          }}
        >
          Focus on this org
        </Button>
      )}
      <Tag tone="outline">ID {positionId}</Tag>
    </div>
  )
}
