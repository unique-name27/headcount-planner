/**
 * Bullet: one row per org against its target, on one shared scale (docs/PLAN.md 9.3: the Leader
 * home's "a bullet per sub-org against its target", `home-rollup-suborgs`). It is BulletList
 * (./BulletList.tsx) with what a target comparison needs said once: every row in one unit (heads,
 * or one money format), bar lengths comparable across rows, and each row judged by
 * `bulletTargetStatus` ("Over" or "Within target", by the measure's good direction) so the glyph
 * and its word match the Needs attention item for the same org. A row without a target shows no
 * tick and no status; one without a value shows "—" and no bar.
 *
 *   <Figure id="home-rollup-suborgs" metric="targets.target.heads" title="Sub-orgs against target" data={rows} columns={cols} uses={uses}>
 *     <Bullet data={rows} label="label" value="asks" target="target" format="int" onSelect={(r) => drill(r.drill)} />
 *   </Figure>
 */
import { type Format, fmt } from '@/lib/format'
import { BulletList } from './BulletList'
import { type BulletStatus, bulletTargetStatus } from './bulletModel'
import { type ChartBaseProps, type Key, numAt, textAt } from './shared'

export interface BulletProps<T extends object> extends ChartBaseProps<T> {
  data: readonly T[]
  label: Key<T> | ((d: T) => string | null)
  value: Key<T> | ((d: T) => number | null)
  target: Key<T> | ((d: T) => number | null)
  /** One unit for every row (default 'int': heads). */
  format?: Format
  /** Which way is good (default 'down': over a target is the problem). */
  goodDirection?: 'up' | 'down'
  /** The row's own state when the view decides it (the guarded over-target flag, 7.2 rule 8). */
  status?: (d: T) => BulletStatus | null
  /** Row group: a header each time it changes. */
  group?: Key<T> | ((d: T) => string | null)
  onSelectLabel?: (d: T) => void
  rowHeight?: number
  nullNote?: string
}

export function Bullet<T extends object>({
  data,
  label,
  value,
  target,
  format = 'int',
  goodDirection = 'down',
  status,
  ...rest
}: BulletProps<T>) {
  const num = (a: Key<T> | ((d: T) => number | null)) => (d: T) =>
    typeof a === 'function' ? a(d) : numAt(d, a)
  const v = num(value)
  const t = num(target)
  return (
    <BulletList
      {...rest}
      data={data}
      label={typeof label === 'function' ? label : (d: T) => textAt(d, label)}
      value={v}
      target={t}
      format={(_d, x) => fmt(x, format)}
      status={status ?? ((d) => bulletTargetStatus(v(d), t(d), goodDirection))}
      scale="shared"
    />
  )
}
