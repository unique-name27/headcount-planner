/**
 * Settings > This device (the template app's DeviceSection.tsx): save the settings to a file, load
 * them from one (`settings:device-files`), or clear everything Headcount Planner stored in this
 * browser (with a confirm step in the page). The settings file holds display and data settings, the
 * metric definitions, the official lists and the saved views; never pay amounts, data or plan state.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { IconDownload, IconReset, IconUpload } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { importListsSection, listsFileSection } from '@/data/lists/persist'
import { settingsFileName } from '@/data/settings'
import { clearDevice, exportSettings, importSettings, useStore } from '@/data/store'
import { todayISO } from '@/lib/dates'
import { downloadBlob } from '@/lib/export/download'
import { CATALOG } from '@/metrics/catalog'
import { importMetricsSection, metricsFileSection } from '@/metrics/imports'
import { APP_NAME } from '../brand'
import { useDictionary, useOfficialLists } from '../dictionary'
import { importedText } from './model'
import { Field, SettingsBlock } from './ui'

function ClearEverything() {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const confirmId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  // Cancel takes the confirmation away: focus goes back to the button that asked for it.
  const openRef = useRef<HTMLButtonElement>(null)
  const cancelled = useRef(false)
  useEffect(() => {
    if (confirming || !cancelled.current) return
    cancelled.current = false
    openRef.current?.focus()
  }, [confirming])
  const clear = async () => {
    setBusy(true)
    try {
      await clearDevice()
      // Other in-memory stores (import logs, sessions) start over with the page.
      location.reload()
    } catch (err) {
      console.error('Clearing this device failed', err)
      setBusy(false)
      toast('Not everything could be cleared', {
        tone: 'critical',
        description: err instanceof Error ? err.message : 'Reload the page and try again.',
      })
    }
  }
  if (!confirming)
    return (
      <Field
        label="Clear everything on this device"
        hint={`Deletes uploads, mappings, certifications, metric definition changes, lists, saved views and settings that ${APP_NAME} stored in this browser, then starts over on the sample data.`}
      >
        <Button
          ref={openRef}
          icon={<IconReset />}
          onClick={() => {
            setConfirming(true)
            requestAnimationFrame(() => cancelRef.current?.focus())
          }}
        >
          Clear everything…
        </Button>
      </Field>
    )
  return (
    <div
      role="alertdialog"
      aria-labelledby={`${confirmId}-title`}
      aria-describedby={`${confirmId}-body`}
      className="rounded-control bg-critical-wash px-4 py-3.5"
    >
      <p id={`${confirmId}-title`} className="text-small font-semibold text-ink">
        Clear everything {APP_NAME} stored in this browser?
      </p>
      <p id={`${confirmId}-body`} className="mt-1 max-w-[60ch] text-small leading-snug text-ink-2">
        Uploaded files, mappings, certifications, metric definition changes, lists and settings are deleted
        from this device. This can't be undone. Export your settings first if you want to keep them.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void clear()}>
          {busy ? 'Clearing…' : 'Clear everything'}
        </Button>
        <Button
          ref={cancelRef}
          disabled={busy}
          onClick={() => {
            cancelled.current = true
            setConfirming(false)
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function DeviceSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const { access } = useAnalytics()
  const files = access.can('settings:device-files')
  // A reader tab never clears: the writer tab would bring everything back on its next save.
  const readOnly = useStore((s) => s.readOnly)
  const onExport = () => {
    downloadBlob(
      exportSettings({
        metrics: metricsFileSection(useDictionary.getState().state),
        lists: listsFileSection(useOfficialLists.getState().state),
      }),
      settingsFileName(todayISO()),
    )
    toast('Settings file downloaded', { tone: 'good', description: 'Pay amounts are never in it.' })
  }
  const onImport = async (file: File | undefined) => {
    if (!file) return
    let text: string
    try {
      text = await file.text()
    } catch {
      toast('The file could not be read', { tone: 'critical' })
      return
    }
    const r = importSettings(text)
    if (!r.ok) {
      toast('Settings not imported', { tone: 'critical', description: r.error })
      return
    }
    const notes = [r.applied.length ? importedText(r.applied) : '']
    if (r.metricsSection !== undefined) {
      const m = importMetricsSection(r.metricsSection, useDictionary.getState().state, CATALOG)
      if (m.ok) {
        useDictionary.getState().commit(m.state)
        notes.push(`Metric definitions: ${m.report.summary}`)
      } else toast('The metric definitions were not imported', { tone: 'critical', description: m.error })
    }
    if (r.listsSection !== undefined) {
      const l = importListsSection(r.listsSection, useOfficialLists.getState().state)
      if (l.ok) {
        useOfficialLists.getState().commit(l.state)
        notes.push(l.summary)
      } else toast('The official lists were not imported', { tone: 'critical', description: l.error })
    }
    if (r.viewsSummary) notes.push(`Saved views: ${r.viewsSummary}.`)
    if (r.viewsError)
      toast('The saved views were not imported', {
        tone: 'critical',
        description: `${r.viewsError} Your saved views stay as they were.`,
      })
    toast('Settings imported', { tone: 'good', description: notes.filter(Boolean).join(' ') })
  }
  return (
    <SettingsBlock
      section="device"
      intro={`${APP_NAME} keeps everything in this browser. Nothing is sent anywhere.`}
    >
      {files && (
        <Field
          label="Settings file"
          hint="Move your settings to another browser or computer. The file holds display and data settings, your metric definitions with their change log, the official lists you saved and your saved views; it never holds pay amounts, data or plan state."
        >
          <Button icon={<IconDownload />} onClick={onExport}>
            Export settings
          </Button>
          <Button icon={<IconUpload />} onClick={() => fileRef.current?.click()}>
            Import settings…
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              void onImport(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </Field>
      )}
      {!readOnly && <ClearEverything />}
    </SettingsBlock>
  )
}
