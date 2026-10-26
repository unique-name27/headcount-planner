/**
 * The six managers' request files (docs/PLAN.md 5.5, 13.5): kind 'requests' workspace files, one per
 * sample manager, as each manager's own browser would write them with "Export requests" in Manager
 * mode on 29 Sep 2026. Importing them over the sample with Requests > Queue > Import requests says
 * "Merged 14 requests from 6 files, 2 conflicts" (`workspace/merge.ts` `mergeRequests`, with the
 * sample's merge base). Draws no random numbers.
 *
 * The story behind them: the HRBPs last imported these managers' files on 15 Sep 2026, so the
 * sample's plan state carries that merge base (each of their requests' `updatedAt` as it stood then,
 * `sampleMergeBase`). Since then each manager worked on in their own browser:
 *  - every manager drafted New roles (11 drafts in all, new to the workspace: merged);
 *  - Manager A and two Systems & Software managers commented on a pending request the workspace has
 *    not changed since (their copy is later: merged);
 *  - the trade's requester and the cross-unit move's requester commented on their pending request,
 *    which the workspace has also moved on since 15 Sep (an approval step each): changed on both
 *    sides, so each is a conflict listed for a choice.
 * Every other request in a file is the manager's copy as it stood at their last import (or as they
 * submitted it, if later): the workspace's copy is the same or later, so nothing changes.
 *
 * A file holds only the requests whose `requestView` is 'full' for the manager in Manager mode (PLAN
 * 5.5, `export.requests`), with the steps and comments, and no amounts. The sample's generator never
 * loads the access layer (it imports the sample), so the rule comes in as `exported`; with none given it
 * is "raised by the manager", which is what `requestView` gives each of these six managers on the
 * sample (requestFiles.test.ts builds the files through `requestView` and checks they are the same).
 */
import { fromRow } from '@/plan/engine/requests'
import type { Comment, HcRequest, LockedVersionRef, WorkspaceFile } from '@/plan/types'
import { buildWorkspaceFile, serializeWorkspace } from '@/plan/workspace/file'
import type { Datasets, ISODate, ISODateTime, RequestRow } from '../../schema'
import type { Planted } from '../base'
import type { Persona } from '../personas'
import { requestAsKnownOn } from '../requests'

/** The last Import requests of these managers' files. */
export const MERGE_DATE: ISODate = '2026-09-15'
/** When the managers exported their files. */
export const EXPORTED_AT: ISODateTime = '2026-09-29T16:30'
/** The notice once the six files merge (merge.ts `mergeSummary`). */
export const MERGE_SUMMARY = 'Merged 14 requests from 6 files, 2 conflicts'
/** What the import dialogs say before the merge runs (merge.ts `mergePreviewText`, M3 review UI-11). */
export const MERGE_PREVIEW = 'Merges 14 requests from 6 files; 2 conflicts to choose'

export interface RequestFilesInput {
  datasets: Pick<Datasets, 'requests' | 'positions' | 'workers'>
  personas: readonly Persona[]
  planted: Pick<Planted, 'crossUnitMove' | 'story3'>
  tradeRequestId: string
}

/** One manager's file, as planned. */
interface FilePlan {
  managerId: string
  label: string
  /** Pending requests the manager commented on, with the comment day. */
  comments: { requestId: string; on: ISODate; text: string }[]
  /** New role drafts: title, level and start. */
  drafts: { title: string; level: 'P2' | 'P3' | 'P4'; start: ISODate; on: ISODate }[]
}

const requesterOf = (rows: readonly RequestRow[], id: string): string =>
  rows.find((r) => r.requestId === id)!.requesterId

/**
 * Whether an Export requests file made in Manager mode by `managerId` holds `req` (its `requestView`
 * is 'full' for them). The default reads "raised by the manager".
 */
export type ExportRule = (req: HcRequest, managerId: string) => boolean

const raisedBy: ExportRule = (req, managerId) => req.requesterId === managerId

/** The six managers and what each did since the last import. */
function plans(input: RequestFilesInput): FilePlan[] {
  const rows = input.datasets.requests
  const persona = (key: string) => input.personas.find((p) => p.key === key)!
  const [bf1, bf2] = [...input.planted.story3.backfillRequestIds]
    .sort()
    .filter((id, i, all) => all.findIndex((x) => requesterOf(rows, x) === requesterOf(rows, id)) === i)
  const managerA = persona('manager-a')
  const ownPending = (managerId: string) =>
    rows.filter(
      (r) =>
        r.requesterId === managerId &&
        (r.state === 'Submitted' || r.state === 'In review') &&
        (r.submittedAt ?? '').slice(0, 10) <= '2026-09-24',
    )[0]
  const aPending = ownPending(managerA.employeeId)
  return [
    {
      managerId: requesterOf(rows, input.tradeRequestId),
      label: 'trade',
      comments: [
        {
          requestId: input.tradeRequestId,
          on: '2026-09-24',
          text: 'The Bengaluru team can take the first two seats in January if that helps.',
        },
      ],
      drafts: [
        { title: 'Software Engineer II', level: 'P3', start: '2027-01-04', on: '2026-09-23' },
        { title: 'Senior Driver Engineer', level: 'P4', start: '2027-02-01', on: '2026-09-25' },
      ],
    },
    {
      managerId: requesterOf(rows, input.planted.crossUnitMove),
      label: 'cross-unit',
      comments: [
        {
          requestId: input.planted.crossUnitMove,
          on: '2026-09-23',
          text: 'The handover plan for the move is agreed with both teams.',
        },
      ],
      drafts: [
        { title: 'Supply Chain Planner', level: 'P2', start: '2027-01-04', on: '2026-09-22' },
        { title: 'Senior Buyer', level: 'P4', start: '2027-03-01', on: '2026-09-28' },
      ],
    },
    {
      managerId: managerA.employeeId,
      label: 'manager-a',
      comments: aPending
        ? [
            {
              requestId: aPending.requestId,
              on: '2026-09-25',
              text: 'The Munich team is ready to interview in January.',
            },
          ]
        : [],
      drafts: [
        { title: 'Account Manager', level: 'P3', start: '2027-03-01', on: '2026-09-24' },
        { title: 'Sales Operations Analyst', level: 'P2', start: '2027-02-01', on: '2026-09-28' },
      ],
    },
    {
      managerId: persona('manager-b').employeeId,
      label: 'manager-b',
      comments: [],
      drafts: [
        { title: 'Reliability Engineer II', level: 'P3', start: '2027-01-04', on: '2026-09-21' },
        { title: 'Senior Quality Engineer', level: 'P4', start: '2027-02-01', on: '2026-09-26' },
      ],
    },
    {
      managerId: requesterOf(rows, bf1),
      label: 'backfill-1',
      comments: [
        {
          requestId: bf1,
          on: '2026-09-26',
          text: 'The new seat is the backfill for the role we lost in the summer.',
        },
      ],
      drafts: [
        { title: 'Software Engineer II', level: 'P3', start: '2027-01-04', on: '2026-09-22' },
        { title: 'Firmware Engineer II', level: 'P3', start: '2027-03-01', on: '2026-09-27' },
      ],
    },
    {
      managerId: requesterOf(rows, bf2),
      label: 'backfill-2',
      comments: [
        { requestId: bf2, on: '2026-09-27', text: 'Interviews can start as soon as this is approved.' },
      ],
      drafts: [{ title: 'Validation Engineer II', level: 'P3', start: '2027-02-01', on: '2026-09-24' }],
    },
  ]
}

/** The day a row was raised: its submit day, or a draft's last update. */
const raisedOn = (r: RequestRow): ISODate => (r.submittedAt ?? r.updatedAt ?? '').slice(0, 10)

/**
 * A manager's copy of the requests their file holds (`exported`): as they stood at the last import, or
 * as submitted after it.
 */
function managerCopies(rows: readonly RequestRow[], managerId: string, exported: ExportRule): RequestRow[] {
  const out: RequestRow[] = []
  for (const r of rows) {
    if (!exported(fromRow(r), managerId)) continue
    const raised = raisedOn(r)
    const copy = requestAsKnownOn(r, raised > MERGE_DATE ? raised : MERGE_DATE)
    if (copy && raised <= EXPORTED_AT.slice(0, 10)) out.push(copy)
  }
  return out
}

/**
 * The merge base the sample's plan state carries: each of the six managers' requests raised by the
 * last import, with its `updatedAt` as it stood then.
 */
export function sampleMergeBase(input: RequestFilesInput): { requestId: string; updatedAt: ISODateTime }[] {
  const out: { requestId: string; updatedAt: ISODateTime }[] = []
  for (const p of plans(input))
    for (const r of input.datasets.requests) {
      if (r.requesterId !== p.managerId || raisedOn(r) > MERGE_DATE) continue
      const then = requestAsKnownOn(r, MERGE_DATE)
      if (then) out.push({ requestId: r.requestId, updatedAt: fromRow(then).updatedAt })
    }
  return out.sort((a, b) => (a.requestId < b.requestId ? -1 : 1))
}

const nameOf = (input: RequestFilesInput, employeeId: string): string =>
  input.datasets.workers.find((w) => w.employeeId === employeeId)?.name ?? employeeId

/** The manager's seat on the as-of date (the org a draft New role sits under). */
function seatOf(
  input: RequestFilesInput,
  managerId: string,
): { positionId: string; row: Datasets['positions'][number] } {
  const persona = input.personas.find((p) => p.employeeId === managerId)
  const fromRequest = input.datasets.requests.find((r) => r.requesterId === managerId && r.managerPositionId)
  const positionId = persona?.positionId ?? fromRequest?.managerPositionId ?? ''
  const rows = input.datasets.positions
    .filter((r) => r.positionId === positionId)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : 1))
  return { positionId, row: rows[rows.length - 1] }
}

export interface RequestFiles {
  files: WorkspaceFile[]
  /** Each file as written (serializeWorkspace). */
  texts: string[]
  /** The draft IDs, by file. */
  drafts: string[][]
}

/**
 * The six files (see the module comment). Draft IDs follow the sample's last request ID. `exported` is
 * the Export requests rule in Manager mode (`requestView` 'full'); raised by the manager when not given.
 */
export function sampleRequestFiles(
  input: RequestFilesInput,
  lockedVersions: readonly LockedVersionRef[],
  exported: ExportRule = raisedBy,
): RequestFiles {
  const rows = input.datasets.requests
  let next = Math.max(...rows.map((r) => +r.requestId.replace(/^R-/, ''))) + 1
  const files: WorkspaceFile[] = []
  const drafts: string[][] = []
  let commentNo = 1
  for (const p of plans(input)) {
    const own = managerCopies(rows, p.managerId, exported).map(fromRow)
    const requests: HcRequest[] = own.map((q) => {
      const c = p.comments.find((x) => x.requestId === q.requestId)
      if (!c) return q
      const at: ISODateTime = `${c.on}T11:${String(10 + (commentNo % 40)).padStart(2, '0')}`
      const comment: Comment = {
        id: `C-${String(commentNo++).padStart(3, '0')}`,
        at,
        by: p.managerId,
        mode: 'manager',
        text: c.text,
        audience: 'everyone',
      }
      return { ...q, comments: [...q.comments, comment], updatedAt: at }
    })
    const seat = seatOf(input, p.managerId)
    const ids: string[] = []
    for (const d of p.drafts) {
      const requestId = `R-${next++}`
      ids.push(requestId)
      requests.push({
        ...fromRow({
          requestId,
          type: 'New role',
          state: 'Draft',
          reasonCode: 'Growth',
          requesterId: p.managerId,
          submittedById: null,
          submittedAt: null,
          updatedAt: `${d.on}T14:05`,
          positionId: null,
          businessUnit: seat.row.businessUnit,
          department: seat.row.department ?? null,
          costCenter: seat.row.costCenter,
          managerPositionId: seat.positionId,
          level: d.level,
          location: seat.row.location,
          jobTitle: d.title,
          fte: 1,
          startDate: d.start,
        }),
      })
    }
    drafts.push(ids)
    files.push(
      buildWorkspaceFile({
        kind: 'requests',
        savedAt: EXPORTED_AT,
        mode: 'manager',
        scopeLabel: `${nameOf(input, p.managerId)}'s team`,
        actingAs: p.label !== 'manager-a',
        plan: { kind: 'requests', requests },
        lockedVersions,
      }),
    )
  }
  return { files, texts: files.map(serializeWorkspace), drafts }
}
