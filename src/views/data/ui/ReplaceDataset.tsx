/**
 * "Replace with your file" on a dataset (HR admin, `action:data.import`): pick an Excel or CSV
 * export, review how its columns were mapped and what the import changed, then replace the dataset;
 * the other datasets keep running as they are. An uploaded dataset can go back to the sample. Nothing
 * is replaced in a tab that only reads (another tab writes).
 */
import { useRef, useState } from 'react'
import { DataTable } from '@/charts'
import { Dialog } from '@/components/Dialog'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { summarizeIssues } from '@/data/import/issues'
import { datasetDef } from '@/data/schema'
import { useStore } from '@/data/store'
import { fmt, plural } from '@/lib/format'
import type { ManifestRow } from '../engine/manifest'
import { type PreparedImport, prepareImport, rememberMapping, replaceArgs } from './upload'

export function ReplaceDataset({ row }: { row: ManifestRow }) {
  const ctx = useAnalytics()
  const readOnly = useStore((s) => s.readOnly)
  const replaceDataset = useStore((s) => s.replaceDataset)
  const resetDataset = useStore((s) => s.resetDataset)
  const input = useRef<HTMLInputElement>(null)
  const [prepared, setPrepared] = useState<PreparedImport | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  if (!ctx.access.can('action:data.import') || readOnly) return null
  const def = datasetDef(row.key)
  const pay = new Set(def.fields.filter((f) => f.pay || f.leave).map((f) => f.key))
  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setMessage(null)
    try {
      setPrepared(await prepareImport(file, row.key, ctx.all.workers))
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The file could not be read.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  const replace = async () => {
    if (!prepared) return
    setBusy(true)
    try {
      const { meta, extra } = replaceArgs(prepared)
      await replaceDataset(row.key, prepared.result.rows, meta, extra)
      await rememberMapping(prepared)
      setMessage(`${def.label} now comes from ${prepared.fileName}.`)
      setPrepared(null)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : `${def.label} could not be replaced.`)
    } finally {
      setBusy(false)
    }
  }
  const summary = prepared ? summarizeIssues(prepared.result.issues) : []
  return (
    <span className="flex flex-wrap items-center gap-2">
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xlsm,.xls,.csv,.tsv"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
        Replace with your file
      </Button>
      {row.source === 'upload' && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => resetDataset(row.key).then(() => setMessage(`${def.label} is the sample again.`))}
        >
          Back to the sample
        </Button>
      )}
      {message && <span className="text-meta text-ink-2">{message}</span>}
      {prepared && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) setPrepared(null)
          }}
          title={`Replace ${def.label.toLowerCase()} with ${prepared.fileName}`}
          description={`${prepared.sheet.name}: ${plural(prepared.result.stats.rowsIn, 'row')} in the file, ${fmt(prepared.result.stats.rowsOut, 'int')} to import.${prepared.fromProfile ? ' The columns are mapped as you saved them for these headers.' : ''}`}
          width={720}
          footer={
            <>
              <Button size="sm" variant="ghost" onClick={() => setPrepared(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={busy || prepared.missingRequired.length > 0}
                onClick={() => void replace()}
              >
                Replace {def.label.toLowerCase()}
              </Button>
            </>
          }
        >
          {prepared.missingRequired.length > 0 && (
            <p className="mb-3 text-small text-bad-text">
              The file has no column for {prepared.missingRequired.join(', ')}. Add it to the file, then pick
              it again.
            </p>
          )}
          <DataTable
            columns={[
              { key: 'field', label: 'Field' },
              { key: 'header', label: 'Column in the file' },
              { key: 'confidence', label: 'Match' },
            ]}
            rows={def.fields.map((f) => ({
              field: f.label,
              header: prepared.mapping[f.key]?.header ?? '',
              confidence: prepared.mapping[f.key]?.header ? prepared.mapping[f.key].confidence : '',
            }))}
            caption="How the columns were mapped"
            density="compact"
          />
          <h4 className="mt-4 mb-1.5 text-small font-semibold">What the import changed</h4>
          {summary.length ? (
            <ul className="space-y-1 text-small text-ink-2">
              {summary.map((s) => (
                <li key={`${s.code}|${s.field}|${s.action}`}>
                  {s.message} ({fmt(s.count, 'int')})
                  {!ctx.showPay && pay.has(s.field)
                    ? ''
                    : s.examples.length
                      ? `: ${s.examples.join(', ')}`
                      : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-ink-2">Nothing needed changing.</p>
          )}
        </Dialog>
      )}
    </span>
  )
}
