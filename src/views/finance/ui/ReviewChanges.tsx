/**
 * Finance > Reconcile's change (docs/PLAN.md 6.10, 8.3 `recon.review`; M3): mark reconciliation
 * exceptions reviewed. Finance and HR admin mark any in view; an HRBP its own unit's. A reviewed
 * exception stays while its data does, and reads "Reviewed". The rows to pick come from the model
 * (`FinanceReconcile.writes.reviewable`).
 */
import { useState } from 'react'
import { Button, Dialog } from '@/components'
import type { ReconRow, ReconWrites } from '../engine'
import { ChangeBar, Refusal, useSave } from './form'

export function ReviewChanges({ writes, rows }: { writes: ReconWrites; rows: readonly ReconRow[] }) {
  const [open, setOpen] = useState(false)
  const { blocked } = useSave()
  return (
    <ChangeBar accesses={[writes.access]}>
      {writes.access.shown && (
        <Button size="sm" disabled={!!blocked || !writes.reviewable.length} onClick={() => setOpen(true)}>
          Mark reviewed
        </Button>
      )}
      {writes.access.shown && !writes.reviewable.length && (
        <span className="text-meta text-muted">No open exception here for you to review.</span>
      )}
      {open && <ReviewDialog writes={writes} rows={rows} onClose={() => setOpen(false)} />}
    </ChangeBar>
  )
}

function ReviewDialog({
  writes,
  rows,
  onClose,
}: {
  writes: ReconWrites
  rows: readonly ReconRow[]
  onClose: () => void
}) {
  const open = rows.filter((r) => writes.reviewable.includes(r.id))
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const { save, busy, refused, blocked } = useSave()
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <Dialog
      title="Mark reviewed"
      description="A reviewed exception stays listed while the data still disagrees, marked reviewed with your name."
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
            disabled={!!blocked || busy || !picked.size}
            onClick={() => void save('markReviewed', { exceptionIds: [...picked] }, onClose)}
          >
            {busy ? 'Saving' : `Mark ${picked.size} reviewed`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-small text-ink">
          <input
            type="checkbox"
            className="size-3.5 accent-(--ink)"
            checked={picked.size === open.length && open.length > 0}
            onChange={(e) => setPicked(e.currentTarget.checked ? new Set(open.map((r) => r.id)) : new Set())}
          />
          Every open exception listed ({open.length})
        </label>
        <ul className="flex max-h-[320px] flex-col gap-1 overflow-y-auto border-t border-rule pt-2">
          {open.map((r) => (
            <li key={r.id}>
              <label className="flex items-start gap-2 text-small text-ink">
                <input
                  type="checkbox"
                  className="mt-1 size-3.5 accent-(--ink)"
                  checked={picked.has(r.id)}
                  onChange={() => toggle(r.id)}
                />
                <span>
                  <span className="font-medium">{r.kindText}</span>
                  <span className="text-ink-2"> · {r.positionId ?? r.employeeId ?? r.id}</span>
                  {r.detail && <span className="block text-meta text-muted">{r.detail}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  )
}
