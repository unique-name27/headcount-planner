/**
 * "Open a shared file" (docs/PLAN.md 5.5, 8.4, C30; `workspace.open-shared`, read only, nothing
 * merges): the part of its contract that is plain data, pinned in M2 for the opener
 * (src/views/data/engine/workspace.ts `openSharedFile`), which the leak tests read too
 * (src/testkit/crawl.ts `openShared`). Pure.
 *
 * A shared file is shown through the current mode's guard and the current Acting as person's rules,
 * never through the mode it was made in. Requests, comments and audit rows are re-read row by row
 * (`requestView`, `commentVisible`, `auditView`, src/access/visibility.ts, which plan/ cannot
 * import). The file's figure snapshots cannot be re-guarded (they are the exporter's guarded output),
 * so they show only to the exact view that made them:
 *
 *  - the file is a Shareable, made in the current mode;
 *  - its header carries a scope identity (`scopeKey`) equal to the viewer's: the mode, the Acting as
 *    person, the HRBP's unit and the scope's own seats and positions, hashed. A display name never
 *    decides (two managers can share one: "Sebastian Wagner's team"), and a file with no scope
 *    identity shows no figures.
 *
 * In Manager mode a file made in another mode shows only what the manager's rules pass, under 5.5's
 * note. The opener itself is the Workspace menu's "Open a shared file" (src/views/data/ui/WorkspaceMenu.tsx).
 */
import type { Mode } from '@/data/schema'
import { sha256 } from '@/lib/sha256'
import { canonicalJson } from '../canonical'
import type { WorkspaceKind } from '../types'

/** A scope identity in a file header: 'scope-sha256-<hex>'. */
export const SCOPE_KEY_PREFIX = 'scope-sha256-'
const SCOPE_KEY = /^scope-sha256-[0-9a-f]{64}$/

/** Whether a header value is a scope identity this app writes. */
export const isScopeKey = (v: unknown): v is string => typeof v === 'string' && SCOPE_KEY.test(v)

/** Who a file is made for, or who opens one. */
export interface ScopeIdentity {
  mode: Mode
  /** The Acting as person; null while the pick is to be made. */
  personId: string | null
  /** HRBP: the unit picked. */
  unit?: string | null
  /** A tree scope's own seats (the acting person's); none for a unit or no scope. */
  rootPositionIds?: Iterable<string> | null
  /** The scope's positions; null for a mode with no scope (Finance, HR admin, a company leader). */
  positionIds?: Iterable<string> | null
}

const sorted = (ids: Iterable<string> | null | undefined): string[] | null =>
  ids ? [...new Set(ids)].sort() : null

/**
 * The scope identity of a view: a hash over the mode, the Acting as person, the unit and the sorted
 * seats, so two views share a key only when they show the same rows. Null while the pick is to be
 * made: an empty scope matches nothing.
 */
export function scopeKeyOf(id: ScopeIdentity): string | null {
  if (!id.personId) return null
  const body = {
    mode: id.mode,
    personId: id.personId,
    unit: id.unit ?? null,
    roots: sorted(id.rootPositionIds),
    positions: sorted(id.positionIds),
  }
  return `${SCOPE_KEY_PREFIX}${sha256(canonicalJson(body))}`
}

/** What the opener reads of a file's header. */
export interface SharedHeader {
  kind: WorkspaceKind
  mode: Mode
  /** Display only: never compared. */
  scopeLabel?: string
  scopeKey?: string | null
}

/** Who opens it: the current mode and the current view's scope identity. */
export interface SharedViewer {
  mode: Mode
  scopeKey: string | null
}

/**
 * Whether a file's figure snapshots may show to the viewer: a Shareable made in the viewer's mode
 * for the viewer's exact scope identity. Everything else in the file is re-read row by row.
 */
export function sharedFiguresShown(header: SharedHeader, viewer: SharedViewer): boolean {
  if (header.kind !== 'shareable') return false
  if (header.mode !== viewer.mode) return false
  if (!isScopeKey(header.scopeKey) || !isScopeKey(viewer.scopeKey)) return false
  return header.scopeKey === viewer.scopeKey
}

/** 5.5's note for a file Manager mode opens from another mode. */
export const managerForeignNote = (madeIn: string): string =>
  `This file was made in ${madeIn} mode and holds more than Manager mode shows. Ask for one made for your team.`

/** The note when a file's figures stay hidden for another reason (another person, team or mode). */
export const FIGURES_NOT_HERE_NOTE =
  'This file’s figures show only in the mode and for the person it was made for. Its requests and changes show as this mode shows them.'

/**
 * The note an opened file carries, or null when its figures show. `labelOf` names a mode
 * ("HRBP"); src/access/modes.ts `MODE_LABEL` in the app.
 */
export function sharedFileNote(
  header: SharedHeader,
  viewer: SharedViewer,
  labelOf: (mode: Mode) => string,
): string | null {
  if (viewer.mode === 'manager' && header.mode !== 'manager') return managerForeignNote(labelOf(header.mode))
  return sharedFiguresShown(header, viewer) ? null : FIGURES_NOT_HERE_NOTE
}
