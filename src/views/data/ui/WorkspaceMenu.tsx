/**
 * The Workspace menu and its dialogs (docs/PLAN.md 5.5, 8.3; M3 freeze): what the masthead's
 * Workspace control (`masthead:workspace`: HR admin shown, every other mode limited "Lists only the
 * files this mode saves and opens.") opens, placed by the core builder in src/app/Masthead.tsx.
 * Each item shows by its own action's decision: Save a Shareable file (`export.shareable`), Export
 * requests (`export.requests`), Export for a manager (`export.for-manager`), Open a shared file
 * (`workspace.open-shared`), Import requests (`request.import`), and in HR admin the Full file
 * (`export.full`, with the switch on) and Import with Replace or Merge (`workspace.import`). Every
 * item reads ../engine/workspace.ts; writes go through src/app/write/usePlanWrite.ts. A reader tab
 * offers the reads and the exports and disables the imports with READ_ONLY_NOTE.
 *
 * The menu lives in a popover that unmounts when it closes, so an item that needs a dialog (a
 * picker, a confirm, a file to read) closes the menu and opens its dialog in `WorkspaceHost`: one
 * small root of its own, under the shell's providers (the same stores, so the same mode, Acting as
 * person and plan state), drawn only while a dialog is open. The Data room's Workspace tab opens the
 * same dialogs (`openWorkspace`). Components render the engine's models and compute nothing.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the workspace-ui builder filled the components.
 */
import { type ReactNode, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MODE_LABEL } from '@/access/modes'
import { ShellProviders } from '@/app/providers'
import { usePlanWrite } from '@/app/write/usePlanWrite'
import { WriteBlocked } from '@/app/write/WriteBlocked'
import type { Column } from '@/charts'
import { DataTable } from '@/charts/DataTable'
import { Dialog } from '@/components/Dialog'
import { IconDownload, IconFile, IconSearch, IconUpload } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button, cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { cachedSampleRequestFiles } from '@/data/sample/raw/sampleFiles'
import { formatDate } from '@/lib/dates'
import { downloadBlob } from '@/lib/export/download'
import type { Format } from '@/lib/format'
import type { JsonValue, WorkspaceFile } from '@/plan/types'
import type { WorkspaceDiff } from '@/plan/workspace/diff'
import { FULL_FILE_NOTICE } from '@/plan/workspace/file'
import { type WorkspaceItemKey, type WorkspaceMenuItem, workspaceMenuOf } from '../engine/menu'
import {
  conflictRows,
  type FileResult,
  figureOf,
  forManagerFile,
  fullFile,
  importPreview,
  importRequestsPreview,
  managersForExport,
  openSharedFile,
  type RequestsPreview,
  requestsFile,
  type SharedAuditRow,
  type SharedFileView,
  type SharedRequestRow,
  shareableFile,
} from '../engine/workspace'
import { setWorkspaceDialog, useWorkspaceDialog, type WorkspaceDialogKind } from './workspaceStore'

/* ───────────── shared bits ───────────── */

const nowIso = () => new Date().toISOString()

/** Saves a built file, or says why it was not built. */
export function save(r: FileResult): boolean {
  if (!r.ok) {
    toast(r.refused, { tone: 'critical' })
    return false
  }
  downloadBlob(new Blob([r.out.text], { type: 'application/json;charset=utf-8' }), r.out.name)
  // The save says what the file is: "Contains individual pay", the Manager line, or that a
  // Shareable saved with Show pay amounts on holds no individual pay (D-PAYFILES, D-MODELINE).
  toast(`Saved ${r.out.name}.`, { tone: 'good', ...(r.out.notice ? { description: r.out.notice } : {}) })
  return true
}

/** A picked file as the engine reads it: its name, text and size on disk. */
interface Picked {
  name: string
  text: string
  sizeBytes: number
}

async function readPicked(list: FileList | null): Promise<Picked[]> {
  const out: Picked[] = []
  for (const f of Array.from(list ?? [])) out.push({ name: f.name, text: await f.text(), sizeBytes: f.size })
  return out
}

/** A hidden file input and the button that opens it. */
function FilePicker({
  label,
  multiple = false,
  disabled = false,
  onPick,
}: {
  label: string
  multiple?: boolean
  disabled?: boolean
  onPick: (files: Picked[]) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const list = e.currentTarget.files
          void readPicked(list).then((files) => {
            if (input.current) input.current.value = ''
            if (files.length) onPick(files)
          })
        }}
      />
      <Button
        size="sm"
        variant="secondary"
        icon={<IconUpload />}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {label}
      </Button>
    </>
  )
}

/** A refusal or a problem, beside the control it is about. */
function Problem({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-2 text-small text-bad-text">
      {children}
    </p>
  )
}

/** The free-text hint every free-text box carries (8.4 rule 5); none here, but files carry comments. */
const FILE_NOTE = 'Checksums catch damage to a file, not who made it.'

/* ───────────── the menu ───────────── */

/** One item of the menu or the Workspace tab. */
export function WorkspaceItem({
  item,
  blocked,
  busy,
  onChoose,
}: {
  item: WorkspaceMenuItem
  blocked: string | null
  busy: boolean
  onChoose: (item: WorkspaceMenuItem) => void
}) {
  const reason = item.disabled ?? (item.writes ? blocked : null)
  return (
    <li>
      <button
        type="button"
        disabled={!!reason || busy}
        onClick={() => onChoose(item)}
        className={cx(
          'flex w-full items-start gap-2.5 rounded-control px-2 py-1.5 text-left',
          'hover:bg-hover disabled:pointer-events-none disabled:opacity-55',
        )}
      >
        <span className="mt-0.5 shrink-0 text-ink-2">
          {item.writes ? <IconUpload /> : item.key === 'open-shared' ? <IconFile /> : <IconDownload />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-small font-medium text-ink">
            {item.label}
            {item.dialog ? '…' : ''}
            {busy ? ' (saving)' : ''}
          </span>
          <span className="block text-label text-ink-2">{item.hint}</span>
          {item.limited && <span className="block text-label text-muted">{item.limited}</span>}
        </span>
      </button>
      {reason && (
        <div className="px-2 pb-1 pl-9">
          {item.disabled ? (
            <span className="text-label text-ink-2">{item.disabled}</span>
          ) : (
            <WriteBlocked blocked={reason} />
          )}
        </div>
      )}
    </li>
  )
}

/** What an item does when chosen: a file saved at once, or its dialog opened. */
export function useWorkspaceChoice(onClose?: () => void) {
  const ctx = useAnalytics()
  const [busy, setBusy] = useState<WorkspaceItemKey | null>(null)
  const choose = (item: WorkspaceMenuItem) => {
    if (item.disabled) return
    if (item.dialog) {
      onClose?.()
      openWorkspace(item.key as WorkspaceDialogKind)
      return
    }
    setBusy(item.key)
    // Let the item say it is saving before the file is built from every figure the mode shows.
    window.setTimeout(() => {
      try {
        save(item.key === 'shareable' ? shareableFile(ctx, nowIso()) : requestsFile(ctx, nowIso()))
      } finally {
        setBusy(null)
        onClose?.()
      }
    }, 0)
  }
  return { busy, choose }
}

/** The menu's items, inside the masthead's Workspace menu. */
export function WorkspaceMenu({ onClose }: { onClose?: () => void }) {
  const ctx = useAnalytics()
  const write = usePlanWrite()
  const menu = useMemo(() => workspaceMenuOf(ctx), [ctx])
  const { busy, choose } = useWorkspaceChoice(onClose)
  const list = (title: string, items: readonly WorkspaceMenuItem[]) =>
    items.length ? (
      <section>
        <h3 className="eyebrow px-2 pb-1">{title}</h3>
        <ul className="flex flex-col gap-0.5">
          {items.map((it) => (
            <WorkspaceItem
              key={it.key}
              item={it}
              blocked={write.blocked}
              busy={busy === it.key}
              onChoose={choose}
            />
          ))}
        </ul>
      </section>
    ) : null
  return (
    <div className="flex flex-col gap-3">
      {menu.note && <p className="px-2 text-label text-ink-2">{menu.note}</p>}
      {list('Save', menu.save)}
      {list('Open or bring in', menu.bring)}
      <p className="px-2 text-label text-muted">{FILE_NOTE}</p>
    </div>
  )
}

/* ───────────── Export for a manager ───────────── */

function ForManagerDialog({ onClose }: { onClose: () => void }) {
  const ctx = useAnalytics()
  const managers = useMemo(() => managersForExport(ctx), [ctx])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const q = query.trim().toLowerCase()
  const shown = q ? managers.filter((m) => m.label.toLowerCase().includes(q)) : managers
  const pick = (personId: string) => {
    setBusy(true)
    window.setTimeout(() => {
      try {
        if (save(forManagerFile(ctx, personId, nowIso()))) onClose()
      } finally {
        setBusy(false)
      }
    }, 0)
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Export for a manager"
      description="The file is built exactly as Manager mode acting as the manager shows it: no amounts, no band estimates, no approvers-only comments, nothing about their own seat or above."
      width={520}
    >
      <label className="relative mb-3 flex h-8 items-center">
        <span className="sr-only">Find a manager</span>
        <IconSearch className="pointer-events-none absolute left-2.5 size-3.5 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Name or seat, such as P-1021"
          className="h-8 w-full rounded-control bg-sheet pr-2 pl-8 text-small text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none placeholder:text-muted"
        />
      </label>
      {shown.length ? (
        <ul className="flex max-h-[50vh] flex-col gap-0.5 overflow-y-auto">
          {shown.map((m) => (
            <li key={m.personId}>
              <button
                type="button"
                disabled={busy}
                onClick={() => pick(m.personId)}
                className="flex w-full items-center justify-between gap-3 rounded-control px-2 py-1.5 text-left text-small hover:bg-hover disabled:opacity-55"
              >
                <span className="min-w-0 truncate">{m.label}</span>
                <IconDownload className="shrink-0 text-ink-2" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-ink-2">
          {managers.length
            ? 'No manager matches. Try part of a name or a seat.'
            : 'There is no manager this mode exports for.'}
        </p>
      )}
    </Dialog>
  )
}

/* ───────────── the Full file ───────────── */

function FullFileDialog({ onClose }: { onClose: () => void }) {
  const ctx = useAnalytics()
  const menu = workspaceMenuOf(ctx)
  const item = menu.save.find((i) => i.key === 'full')
  const [busy, setBusy] = useState(false)
  const go = () => {
    setBusy(true)
    window.setTimeout(() => {
      try {
        if (save(fullFile(ctx, nowIso()))) onClose()
      } finally {
        setBusy(false)
      }
    }, 0)
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={FULL_FILE_NOTICE}
      description="A Full file holds everything in this workspace: every dataset with individual pay, the plan, the locked versions and the whole audit log. Keep it where you keep HR records."
      width={480}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" disabled={busy || !item || !!item.disabled} onClick={go}>
            {busy ? 'Saving the Full file' : 'Save the Full file'}
          </Button>
        </>
      }
    >
      {item?.disabled ? (
        <Problem>{item.disabled}</Problem>
      ) : (
        <p className="text-small text-ink-2">{FILE_NOTE}</p>
      )}
    </Dialog>
  )
}

/* ───────────── Open a shared file ───────────── */

const REQUEST_COLUMNS: Column<SharedRequestRow>[] = [
  { key: 'requestId', label: 'Request' },
  { key: 'type', label: 'Type' },
  { key: 'state', label: 'State' },
  { key: 'jobTitle', label: 'Title' },
  { key: 'level', label: 'Level' },
  { key: 'businessUnit', label: 'Unit' },
  { key: 'requesterName', label: 'Requester' },
  { key: 'stepRole', label: 'Waiting on' },
  { key: 'startDate', label: 'Start', format: 'date' },
]

const AUDIT_COLUMNS: Column<SharedAuditRow>[] = [
  { key: 'at', label: 'When', format: 'date' },
  { key: 'byName', label: 'By' },
  { key: 'objectLabel', label: 'Record type' },
  { key: 'id', label: 'Record' },
  { key: 'fieldLabel', label: 'Field' },
  { key: 'oldText', label: 'From', freeText: true },
  { key: 'newText', label: 'To', freeText: true },
  { key: 'effectiveDate', label: 'Effective', format: 'date' },
  { key: 'comment', label: 'Comment', freeText: true },
]

/** One figure the file carries, as a table with the columns this view keeps. */
function SharedFigure({ value }: { value: JsonValue }) {
  const f = figureOf(value)
  if (!f) return null
  const columns: Column<Record<string, unknown>>[] = f.columns.map((c) => ({
    key: c.key,
    label: c.label,
    ...(c.format ? { format: c.format as Format } : {}),
    ...(c.pay ? { pay: true } : c.band ? { band: true } : c.money ? { cost: true } : {}),
  }))
  return (
    <section className="mt-4">
      <h4 className="text-small font-semibold">{f.title}</h4>
      {f.subtitle && <p className="text-label text-ink-2">{f.subtitle}</p>}
      <DataTable columns={columns} rows={f.rows} density="compact" maxRows={50} caption={f.title} />
      {f.note && <p className="mt-1 text-label text-muted">{f.note}</p>}
    </section>
  )
}

/** An opened shared file, read only, through the current mode and Acting as person. */
export function SharedFileDialog({ view, onClose }: { view: SharedFileView | null; onClose: () => void }) {
  if (!view) return null
  const figures = view.figures ? Object.entries(view.figures) : []
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${view.kind === 'requests' ? 'Requests file' : 'Shareable file'}: ${view.scopeLabel}`}
      description={`Made in ${MODE_LABEL[view.madeIn] ?? view.madeIn} mode on ${formatDate(view.savedAt.slice(0, 10))}. Shown as this mode and person may see it; nothing merges.`}
      width={880}
      footer={
        <Button size="sm" variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {view.note && (
        <p className="mb-3 rounded-control bg-sheet-2 px-3 py-2 text-small text-ink-2">{view.note}</p>
      )}
      <section>
        <h4 className="text-small font-semibold">Requests</h4>
        <DataTable
          columns={REQUEST_COLUMNS}
          rows={view.requests}
          density="compact"
          maxRows={50}
          caption="Requests in the file"
          emptyText="The file holds no request this mode shows."
        />
      </section>
      {view.comments.length > 0 && (
        <section className="mt-4">
          <h4 className="text-small font-semibold">Comments</h4>
          <ul className="mt-1 flex flex-col gap-1 text-small">
            {view.comments.map((c) => (
              <li key={`${c.requestId}|${c.comment.id}`}>
                <span className="font-medium">{c.requestId}</span>
                <span className="text-ink-2"> · {formatDate(c.comment.at.slice(0, 10))} · </span>
                {c.comment.text}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="mt-4">
        <h4 className="text-small font-semibold">Changes</h4>
        <DataTable
          columns={AUDIT_COLUMNS}
          rows={view.audit}
          density="compact"
          maxRows={50}
          caption="Audit entries in the file"
          emptyText="The file holds no change this mode shows."
        />
      </section>
      {figures.map(([id, v]) => (
        <SharedFigure key={id} value={v} />
      ))}
    </Dialog>
  )
}

/** Picks a file, opens it through this view, then shows it. */
function OpenSharedDialog({ onClose }: { onClose: () => void }) {
  const ctx = useAnalytics()
  const [view, setView] = useState<SharedFileView | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  if (view) return <SharedFileDialog view={view} onClose={onClose} />
  const pick = ([f]: Picked[]) => {
    if (!f) return
    const r = openSharedFile(ctx, f.text, f.sizeBytes)
    if (r.ok) setView(r.view)
    else setProblem(r.reason)
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Open a shared file"
      description="A Shareable or Requests file opens to read, as this mode and Acting as person may see it, whatever mode made it. Nothing merges."
      width={480}
    >
      <FilePicker label="Choose a file" onPick={pick} />
      {problem && <Problem>{problem}</Problem>}
    </Dialog>
  )
}

/* ───────────── Import (Replace or Merge) ───────────── */

/** Import (Replace or Merge) with the diff first (HR admin). */
export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ctx = useAnalytics()
  const write = usePlanWrite()
  const [read, setRead] = useState<{
    name: string
    file: WorkspaceFile
    diff: WorkspaceDiff
    replaceRefused: string | null
    mergeRefused: string | null
  } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!open) return null
  const pick = ([f]: Picked[]) => {
    if (!f) return
    setProblem(null)
    const r = importPreview(ctx, f.text, f.sizeBytes)
    if (r.ok)
      setRead({
        name: f.name,
        file: r.file,
        diff: r.diff,
        replaceRefused: r.replaceRefused,
        mergeRefused: r.mergeRefused,
      })
    else {
      setRead(null)
      setProblem(r.reason)
    }
  }
  const run = async (name: 'replaceWorkspace' | 'mergeWorkspace') => {
    if (!read) return
    setBusy(true)
    const out = await write.run(name, { file: read.file })
    setBusy(false)
    if (out.ok) {
      toast(out.notice, { tone: 'good' })
      onClose()
    } else setProblem(out.refused)
  }
  const can = !!read && !busy && !write.blocked
  // Replace takes the file's audit log, so it waits on a chain that verifies (C35); Merge keeps this log.
  const canReplace = can && !read?.replaceRefused
  const canMerge = can && !read?.mergeRefused
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Import a workspace file"
      description="A Full file, checked first (size, checksum, version, format and the locked versions' hashes), then shown as what it would change. Replace puts its data, plan and audit log in place of this workspace's; Merge adds what is new and keeps the rest, this workspace's audit log included."
      width={620}
      footer={
        <>
          <WriteBlocked blocked={write.blocked} />
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!canMerge}
            title={read?.mergeRefused ?? undefined}
            onClick={() => void run('mergeWorkspace')}
          >
            Merge
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!canReplace}
            title={read?.replaceRefused ?? undefined}
            onClick={() => void run('replaceWorkspace')}
          >
            Replace
          </Button>
        </>
      }
    >
      <FilePicker label={read ? 'Choose another file' : 'Choose a Full file'} disabled={busy} onPick={pick} />
      {problem && <Problem>{problem}</Problem>}
      {read && (
        <section className="mt-4">
          <h4 className="text-small font-semibold">What {read.name} would change</h4>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-small text-ink-2">
            {read.diff.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {read.replaceRefused && <Problem>{read.replaceRefused}</Problem>}
        </section>
      )}
    </Dialog>
  )
}

/* ───────────── Import requests ───────────── */

/** Import requests with the merge summary and the conflicts to choose. */
export function ImportRequestsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ctx = useAnalytics()
  const write = usePlanWrite()
  const [picked, setPicked] = useState<Picked[]>([])
  const [choices, setChoices] = useState<Record<string, 'current' | 'incoming'>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const preview: RequestsPreview | null = useMemo(
    () => (picked.length ? importRequestsPreview(ctx, picked) : null),
    [ctx, picked],
  )
  const conflicts = useMemo(() => (preview ? conflictRows(ctx, preview.conflicts) : []), [ctx, preview])
  if (!open) return null
  const choose = (files: Picked[]) => {
    setProblem(null)
    setChoices({})
    setPicked(files)
  }
  const merge = async () => {
    if (!preview?.files.length) return
    setBusy(true)
    const out = await write.run('importRequests', { files: preview.files, choices })
    setBusy(false)
    if (out.ok) {
      toast(out.notice, { tone: 'good' })
      onClose()
    } else setProblem(out.refused)
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Import requests"
      description="Requests from Export requests or Shareable files merge by request ID: the later change wins, and a request changed on both sides since the last import waits for your choice. Only requests you may see are counted."
      width={720}
      footer={
        <>
          <WriteBlocked blocked={write.blocked} />
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!preview?.files.length || !!preview?.blocked || busy || !!write.blocked}
            onClick={() => void merge()}
          >
            Merge
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <FilePicker label="Choose files" multiple disabled={busy} onPick={choose} />
        {ctx.isSample && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => choose([...cachedSampleRequestFiles()])}
          >
            Use the sample’s six manager files
          </Button>
        )}
      </div>
      {problem && <Problem>{problem}</Problem>}
      {preview && (
        <section className="mt-4">
          <p className="text-small font-medium">{preview.summary}</p>
          <p className="text-label text-ink-2">
            {picked.length === 1 ? '1 file read' : `${picked.length} files read`}
            {preview.skipped ? `; ${preview.skipped} left as they are` : ''}.
          </p>
          {preview.refused.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-small">
              {preview.refused.map((r) => (
                <li key={r.name}>
                  <span className="font-medium">{r.name}:</span>{' '}
                  <span className="text-bad-text">{r.reason}</span>
                </li>
              ))}
            </ul>
          )}
          {conflicts.some((c) => !c.choosable) && (
            <div className="mt-3">
              <h4 className="text-small font-semibold">Cannot merge</h4>
              <ul className="mt-1 flex flex-col gap-2">
                {conflicts
                  .filter((c) => !c.choosable)
                  .map((c) => (
                    <li key={c.requestId} className="rounded-control bg-sheet-2 px-3 py-2 text-small">
                      <div className="font-medium">
                        {c.requestId}: {c.type}
                        {c.title ? `, ${c.title}` : ''}
                      </div>
                      <div className="text-ink-2">{c.what}</div>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {conflicts.some((c) => c.choosable) && (
            <div className="mt-3">
              <h4 className="text-small font-semibold">Changed on both sides</h4>
              <ul className="mt-1 flex flex-col gap-2">
                {conflicts
                  .filter((c) => c.choosable)
                  .map((c) => (
                    <li key={c.requestId} className="rounded-control bg-sheet-2 px-3 py-2 text-small">
                      <div className="font-medium">
                        {c.requestId}: {c.type}
                        {c.title ? `, ${c.title}` : ''}
                      </div>
                      <div className="text-ink-2">{c.what}</div>
                      {c.here && c.inFile && (
                        <div className="text-label text-muted">
                          Changed here {formatDate(c.here.slice(0, 10))}; in the file{' '}
                          {formatDate(c.inFile.slice(0, 10))}.
                        </div>
                      )}
                      <fieldset className="mt-1 flex flex-wrap gap-3">
                        <legend className="sr-only">Which copy to keep for {c.requestId}</legend>
                        {(
                          [
                            ['', 'Decide later'],
                            ['current', 'Keep this workspace’s copy'],
                            ['incoming', 'Take the file’s copy'],
                          ] as const
                        ).map(([value, label]) => (
                          <label key={value} className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`conflict-${c.requestId}`}
                              checked={(choices[c.requestId] ?? '') === value}
                              onChange={() =>
                                setChoices((prev) => {
                                  const next = { ...prev }
                                  if (value) next[c.requestId] = value
                                  else delete next[c.requestId]
                                  return next
                                })
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </fieldset>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </Dialog>
  )
}

/* ───────────── the host ───────────── */

/** The dialog open now, drawn under the shell's providers (see the module comment). */
function WorkspaceHost() {
  const kind = useWorkspaceDialog()
  if (!kind) return null
  const close = () => setWorkspaceDialog(null)
  return (
    <ShellProviders>
      {kind === 'for-manager' && <ForManagerDialog onClose={close} />}
      {kind === 'full' && <FullFileDialog onClose={close} />}
      {kind === 'open-shared' && <OpenSharedDialog onClose={close} />}
      {kind === 'import' && <ImportDialog open onClose={close} />}
      {kind === 'import-requests' && <ImportRequestsDialog open onClose={close} />}
    </ShellProviders>
  )
}

let host: Root | null = null

/** Opens a Workspace dialog, mounting the host the first time. */
export function openWorkspace(kind: WorkspaceDialogKind): void {
  if (!host && typeof document !== 'undefined') {
    const el = document.createElement('div')
    el.dataset.hcpWorkspace = 'dialogs'
    document.body.append(el)
    host = createRoot(el)
    host.render(<WorkspaceHost />)
  }
  setWorkspaceDialog(kind)
}
