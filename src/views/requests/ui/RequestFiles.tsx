/**
 * The Requests view's workspace file buttons (docs/PLAN.md 5.5, 8.3, 15.1 R17): "Export requests"
 * (`export.requests`, every mode: the requests whose view is full for you, their steps and the
 * comments you may read; Manager-mode files hold no amounts) on Mine and in the Queue header, and
 * "Import requests" (`request.import`: HRBP, Leader within its org, Finance, HR admin) in the Queue
 * header. The files are written and read by the Data room's workspace engine
 * (src/views/data/engine/workspace.ts `requestsFile`, `importRequestsPreview`), so a file from here
 * is the same file the masthead's Workspace menu saves; the merge itself is the write path's
 * `importRequests` action, run with the conflicts chosen here ("Merged 14 requests from 6 files, 2
 * conflicts"). Export works in a reader tab; Import is disabled there with the read-only note.
 *
 * The conflicts list what the importer may read of each (`conflictRows`: a limited request by ID,
 * type and title only, no comment the importer may not read), each with one choice: "Decide later"
 * (shown and sent as no choice, so the conflict stays for the next import), keep this workspace's
 * copy, or take the file's, the same three as the Workspace menu's dialog.
 */
import { useState } from 'react'
import { usePlanWrite } from '@/app/write/usePlanWrite'
import { WriteBlocked } from '@/app/write/WriteBlocked'
import { Dialog } from '@/components/Dialog'
import { IconDownload, IconUpload } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { formatDate } from '@/lib/dates'
import { downloadBlob } from '@/lib/export/download'
import {
  type ConflictRow,
  conflictRows,
  importRequestsPreview,
  type RequestsPreview,
  requestsFile,
  savedNote,
} from '@/views/data/engine/workspace'
import type { FileButton } from '../engine'
import { RadioChoice, Refusal } from './form'
import { useWriteSteps } from './useWriteSteps'

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** "Export requests": saves the file this mode and Acting as person may write. */
export function ExportRequestsButton({ button }: { button: FileButton }) {
  const ctx = useAnalytics()
  if (!button.shown) return null
  const save = () => {
    try {
      const r = requestsFile(ctx, new Date().toISOString())
      if (!r.ok) {
        toast(r.refused, { tone: 'critical' })
        return
      }
      downloadBlob(new Blob([r.out.text], { type: 'application/json;charset=utf-8' }), r.out.name)
      // A Manager-mode file says its mode line, as the Workspace menu's save does (D-MODELINE).
      toast('Requests file saved', { tone: 'good', description: savedNote(r.out) })
    } catch (e) {
      toast(messageOf(e), { tone: 'critical' })
    }
  }
  return (
    <Button size="sm" icon={<IconDownload className="size-3.5" />} onClick={save}>
      Export requests
    </Button>
  )
}

/** "Import requests": pick files, read the merge summary and the conflicts, then merge. */
export function ImportRequestsButton({ button }: { button: FileButton }) {
  const [open, setOpen] = useState(false)
  const write = usePlanWrite()
  if (!button.shown) return null
  return (
    <>
      <Button
        size="sm"
        icon={<IconUpload className="size-3.5" />}
        disabled={!!write.blocked}
        onClick={() => setOpen(true)}
      >
        Import requests
      </Button>
      <WriteBlocked blocked={write.blocked} />
      {open && <ImportRequestsDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function ImportRequestsDialog({ onClose }: { onClose: () => void }) {
  const ctx = useAnalytics()
  const [preview, setPreview] = useState<RequestsPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<string, 'current' | 'incoming'>>({})
  const { write, run, busy } = useWriteSteps((out) => {
    if (out.ok) onClose()
  })

  const read = async (list: FileList | null) => {
    setError(null)
    setPreview(null)
    if (!list?.length) return
    try {
      const files = await Promise.all(
        [...list].map(async (f) => ({ name: f.name, text: await f.text(), sizeBytes: f.size })),
      )
      setPreview(importRequestsPreview(ctx, files))
    } catch (e) {
      setError(messageOf(e))
    }
  }

  const conflicts = preview ? conflictRows(ctx, preview.conflicts) : []
  const canMerge = !!preview && preview.files.length > 0 && !write.blocked && !busy
  return (
    <Dialog
      title="Import requests"
      description="Merges the requests in Export requests and Shareable files by request ID. The later change wins; a request changed on both sides is a conflict you choose."
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      width={640}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!canMerge}
            onClick={() =>
              preview && run([(w) => w.run('importRequests', { files: preview.files, choices })])
            }
          >
            Merge
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-small">
        <input
          type="file"
          multiple
          accept=".json,.hcplan.json,application/json"
          aria-label="Files to import"
          onChange={(e) => void read(e.currentTarget.files)}
        />
        <Refusal text={error} />
        {preview && (
          <>
            <p className="font-semibold text-ink">{preview.summary}</p>
            {preview.skipped > 0 && (
              <p className="text-ink-2">
                {preview.skipped === 1
                  ? '1 request was skipped.'
                  : `${preview.skipped} requests were skipped.`}
              </p>
            )}
            {preview.refused.map((r) => (
              <Refusal key={r.name} text={`${r.name}: ${r.reason}`} />
            ))}
            <ConflictChoices
              conflicts={conflicts}
              choices={choices}
              onChoose={(id, v) =>
                setChoices((x) => {
                  const next = { ...x }
                  if (v) next[id] = v
                  else delete next[id]
                  return next
                })
              }
            />
          </>
        )}
        <WriteBlocked blocked={write.blocked} />
      </div>
    </Dialog>
  )
}

/**
 * The conflicts of an import, as the importer may read them (`conflictRows`): those that cannot
 * merge here (an ID clash, a decision that cannot take effect) listed with why, and those changed on
 * both sides each with its choice: "Decide later" until one is picked (shown and sent as no choice),
 * this workspace's copy or the file's, as the Workspace menu's dialog offers them.
 */
export function ConflictChoices({
  conflicts,
  choices,
  onChoose,
}: {
  conflicts: readonly ConflictRow[]
  choices: Readonly<Record<string, 'current' | 'incoming'>>
  onChoose: (requestId: string, choice: '' | 'current' | 'incoming') => void
}) {
  const stuck = conflicts.filter((c) => !c.choosable)
  const open = conflicts.filter((c) => c.choosable)
  const heading = (c: ConflictRow) => (
    <span className="font-medium">
      {c.requestId}: {c.type}
      {c.title ? `, ${c.title}` : ''}
    </span>
  )
  return (
    <>
      {stuck.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-ink-2">Cannot merge:</p>
          {stuck.map((c) => (
            <div key={c.requestId} className="flex flex-col gap-1 rounded-control bg-sheet-2 px-3 py-2">
              {heading(c)}
              <span className="text-ink-2">{c.what}</span>
            </div>
          ))}
        </div>
      )}
      {open.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-ink-2">Changed on both sides since the last merge. Pick which to keep:</p>
          {open.map((c) => (
            <div key={c.requestId} className="flex flex-col gap-1 rounded-control bg-sheet-2 px-3 py-2">
              {heading(c)}
              <span className="text-ink-2">{c.what}</span>
              {c.here && c.inFile && (
                <span className="text-label text-muted">
                  Changed here {formatDate(c.here.slice(0, 10))}; in the file{' '}
                  {formatDate(c.inFile.slice(0, 10))}.
                </span>
              )}
              <RadioChoice
                legend={`Which copy of ${c.requestId} to keep`}
                value={choices[c.requestId] ?? ''}
                onChange={(v) => onChoose(c.requestId, v)}
                options={[
                  { value: '', label: 'Decide later' },
                  { value: 'current', label: 'Keep this workspace’s copy' },
                  { value: 'incoming', label: 'Take the file’s copy' },
                ]}
              />
            </div>
          ))}
        </div>
      )}
    </>
  )
}
