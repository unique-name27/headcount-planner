/**
 * "Changed by your HRBP" (docs/PLAN.md 9.4 Plan > Positions, 8.4 rules 3, 5 and 7, 10.1): the notes a
 * manager reads on a seat (Plan > Positions) and in My team, one per HRBP Working edit of the seat:
 * "Changed by your HRBP: start moved from Jan to Mar". Each note is built from the seat's audit
 * entries written in HRBP mode (a seat edit, or an HRBP approval's audited Working edit such as Start
 * date or Start recruiting), read through `auditView` for the viewer, so a seat outside the viewer's
 * scope, or an entry whose request 8.4 rule 3 hides, gives no note, and in Manager mode the reason
 * passes through `managerText`. The reason never holds an amount: it is refused at entry (8.4 rule 5).
 * Pure; one result per analytics context.
 *
 * Readings taken here (plan-ui, M3):
 *  - One note per edit: the HRBP-mode `position` entries of one seat at one moment (`at`), the fields
 *    a seat edit changes (start, level, location, FTE, status) in that order; the cost center and
 *    legal entity a location change takes, and the opened date a move to Open sets, are not named.
 *  - Outside Manager mode the note reads "Changed by the HRBP: ...", since the reader is not the
 *    seat's manager.
 *  - A start moved inside one year names months ("from Jan to Mar"), across years months and years
 *    ("from Dec 2026 to Feb 2027"), inside one month the days ("from 3 Jan to 17 Jan").
 */
import { auditView, viewerOf } from '@/access/visibility'
import type { Column } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import type { ISODate } from '@/data/schema'
import { requestsOf } from '@/drill/seats'
import { dateOf, formatDate, formatMonth, formatMonthShort } from '@/lib/dates'
import type { AuditRow } from '@/plan/types'
import { requestOfEntry } from '@/views/audit/engine'
import type { HrbpChangeRow } from '.'
import type { HrbpChangeNote } from './edits'

export type { HrbpChangeNote } from './edits'

/** The fields a seat edit changes, in the order a note names them. */
export const NOTE_FIELDS = ['startDate', 'level', 'location', 'fte', 'status'] as const

const NOTED: ReadonlySet<string> = new Set(NOTE_FIELDS)

const isDate = (v: unknown): v is ISODate => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** "Jan", "Dec 2026" or "3 Jan" for one side of a moved start, given the other side. */
function startWord(d: ISODate, other: ISODate | null): string {
  if (!other) return formatDate(d)
  if (d.slice(0, 7) === other.slice(0, 7)) return formatDate(d).replace(/ \d{4}$/, '')
  if (d.slice(0, 4) === other.slice(0, 4)) return formatMonthShort(d)
  return formatMonth(d)
}

/** What one field's change reads in a note ("start moved from Jan to Mar"), or null to leave it out. */
export function changeWords(field: string, old: unknown, value: unknown): string | null {
  switch (field) {
    case 'startDate': {
      const a = isDate(old) ? old : null
      const b = isDate(value) ? value : null
      if (a && b) return `start moved from ${startWord(a, b)} to ${startWord(b, a)}`
      if (b) return `start set to ${formatDate(b)}`
      if (a) return 'start cleared'
      return null
    }
    case 'level':
      return old != null && value != null
        ? `level changed from ${String(old)} to ${String(value)}`
        : value != null
          ? `level set to ${String(value)}`
          : null
    case 'location':
      return old != null && value != null
        ? `location moved from ${String(old)} to ${String(value)}`
        : value != null
          ? `location set to ${String(value)}`
          : null
    case 'fte': {
      const n = (v: unknown) => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v))
      return value != null ? `FTE changed from ${old == null ? '1' : n(old)} to ${n(value)}` : null
    }
    case 'status':
      if (value === 'On hold') return 'put on hold'
      if (old === 'On hold') return 'taken off hold'
      if (old === 'Planned' && value === 'Open') return 'opened for recruiting'
      return old != null && value != null ? `status changed from ${String(old)} to ${String(value)}` : null
    default:
      return null
  }
}

/** "a", "a and b", "a, b and c". */
function listWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

const memo = new WeakMap<AnalyticsContext, ReadonlyMap<string, readonly HrbpChangeNote[]>>()

/** Every seat's notes as the viewer may read them, newest first (memoized per context). */
export function hrbpNotesBySeat(ctx: AnalyticsContext): ReadonlyMap<string, readonly HrbpChangeNote[]> {
  const hit = memo.get(ctx)
  if (hit) return hit
  const out = new Map<string, HrbpChangeNote[]>()
  const entries = ctx.audit.filter((e) => e.object === 'position' && e.mode === 'hrbp' && NOTED.has(e.field))
  if (entries.length) {
    const viewer = viewerOf(ctx)
    // The Audit page's own link (8.4 rule 7): the request whose seat the entry created, else the
    // request whose own entry shares its `at` (the store stamps one action's drafts alike), so a note
    // follows its request even when R47's business time and the wall clock differ (M3 verify).
    const requestOf = requestOfEntry(ctx, requestsOf(ctx), ctx.audit)
    const groups = new Map<string, AuditRow[]>()
    for (const e of entries) {
      const shown = auditView(e, viewer, requestOf)
      if (!shown) continue
      const key = `${shown.id}\u0000${shown.at}`
      const list = groups.get(key)
      if (list) list.push(shown)
      else groups.set(key, [shown])
    }
    const prefix = ctx.access.mode === 'manager' ? 'Changed by your HRBP' : 'Changed by the HRBP'
    for (const rows of groups.values()) {
      const parts: string[] = []
      for (const f of NOTE_FIELDS) {
        const row = rows.find((r) => r.field === f)
        const words = row ? changeWords(f, row.old, row.new) : null
        if (words) parts.push(words)
      }
      if (!parts.length) continue
      const first = rows[0]
      const note: HrbpChangeNote = {
        positionId: first.id,
        at: first.at,
        text: `${prefix}: ${listWords(parts)}`,
        reason: rows.find((r) => r.comment)?.comment ?? null,
      }
      const list = out.get(first.id)
      if (list) list.push(note)
      else out.set(first.id, [note])
    }
    for (const list of out.values()) list.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  }
  memo.set(ctx, out)
  return out
}

/** The "Changed by your HRBP" notes for a seat, as the viewer may read them, newest first. */
export function notesOf(ctx: AnalyticsContext, positionId: string): readonly HrbpChangeNote[] {
  return hrbpNotesBySeat(ctx).get(positionId) ?? []
}

/** The columns of a list of notes (Plan > Positions' changes, My team's). */
export const CHANGE_COLUMNS: readonly Column<HrbpChangeRow>[] = [
  { key: 'on', label: 'Changed', format: 'date' },
  { key: 'positionId', label: 'Position ID' },
  { key: 'title', label: 'Title', freeText: true },
  { key: 'change', label: 'Change' },
  { key: 'reason', label: 'Reason', freeText: true },
]

/** Every note on the seats given, newest first, as rows (each seat's title from `titleOf`). */
export function changeRows(
  ctx: AnalyticsContext,
  ids: ReadonlySet<string>,
  titleOf: (positionId: string) => string | null,
): HrbpChangeRow[] {
  const out: HrbpChangeRow[] = []
  for (const [id, list] of hrbpNotesBySeat(ctx)) {
    if (!ids.has(id)) continue
    for (const n of list)
      out.push({ positionId: id, title: titleOf(id), on: dateOf(n.at), change: n.text, reason: n.reason })
  }
  return out.sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : a.positionId < b.positionId ? -1 : 1))
}
