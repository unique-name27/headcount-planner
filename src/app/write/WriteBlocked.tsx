/**
 * The write lock beside a button (docs/PLAN.md 5.4, 8.2; M3): what a view shows next to a disabled
 * write button when `usePlanWrite().blocked` says why ("Read only: Headcount Planner is open in
 * another tab." in a reader tab, "Pick who you act as before making changes." with no Acting as
 * pick). Renders nothing when writes may be made. An addition to the M3 freeze's files (core), so
 * every view words the lock the same way.
 */
import { IconLock } from '@/components/icons'

export function WriteBlocked({ blocked }: { blocked: string | null }) {
  if (!blocked) return null
  return (
    <span role="status" className="inline-flex items-center gap-1 text-label text-ink-2">
      <IconLock className="size-3.5 shrink-0" />
      <span>{blocked}</span>
    </span>
  )
}
