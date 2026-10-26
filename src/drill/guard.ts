/**
 * The records panel's lines about what the mode leaves out (docs/PLAN.md 8.2, 8.3 and 9.5): rows
 * outside the scope, a kind the mode does not list, and the per-position amounts the mode keeps
 * off. The rows themselves are kept to the scope by `rowsInScope` (src/access/records.ts). Pure.
 *
 *   recordsOutsideLine(ctx.access, 12)   // "12 records outside Silicon Engineering are not listed."
 *   payAmountsNote(ctx.access)           // a plan-line or req list while amounts are off
 */

import type { AccessContext } from '@/access/context'
import { kindNotShown, modeName, recordsOutside } from '@/access/copy'
import { PICK_LABEL } from '@/access/modes'

type Access = Pick<AccessContext, 'mode' | 'can'>

const records = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'record' : 'records'}`

/**
 * The muted line under the panel's title when rows were left out: "12 records outside Silicon
 * Engineering are not listed." ("…outside Dana Ito's org…"). A scope still waiting for its pick
 * has no name: "12 records are not listed until a manager is picked." Null when nothing was left
 * out or there is no scope.
 */
export function recordsOutsideLine(
  access: Pick<AccessContext, 'scope'> & Partial<Pick<AccessContext, 'mode' | 'unset'>>,
  leftOut: number,
): string | null {
  if (leftOut <= 0) return null
  const s = access.scope
  if (access.unset || (s && !s.label)) {
    const pick = access.mode ? PICK_LABEL[access.mode] : 'a person'
    return `${records(leftOut)} ${leftOut === 1 ? 'is' : 'are'} not listed until ${pick} is picked.`
  }
  if (!s) return null
  return recordsOutside(leftOut, s.label)
}

/** The panel's sentence for a kind the mode does not list: "These records are not shown in Finance mode." */
export const kindHiddenLine = (access: Pick<AccessContext, 'mode'>): string => kindNotShown(access.mode)

/**
 * The note on a list with per-position amounts while they are off (plan lines, reqs with offers):
 * where to switch them on, in the mode with the switch (HR admin); otherwise that the mode shows
 * totals only, never one position's amount (docs/PLAN.md 7.2 rule 4).
 */
export function payAmountsNote(access: Access): string {
  if (access.can('pay:switch'))
    return 'Per-position amounts are hidden. Turn on "Show pay amounts" in Settings to include them.'
  if (access.mode === 'manager') return `Amounts are not shown in ${modeName(access.mode)}.`
  return `Per-position amounts are not shown in ${modeName(access.mode)}. Totals over 5 or more costed people still show.`
}
