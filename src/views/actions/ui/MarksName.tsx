/**
 * Marks v2 on screen (the template app's MarksName.tsx): the name marks are kept under in this
 * browser ("Kept as Priya in this browser"), typed once, and the marks file: save what this browser
 * has marked so a teammate can load it, or load theirs. Marks stay personal; the file is how a team
 * passes a handled list along. Not security, and never in the settings file. The browser keeps
 * every mode's marks; a file saved in a mode carries only the marks of items that mode lists, and a
 * file loaded in a mode changes only those (the M2 review, RM-4).
 */
import { useId, useMemo, useRef, useState } from 'react'
import { APP_SLUG } from '@/app/brand'
import { IconDownload, IconUpload } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { todayISO } from '@/lib/dates'
import { downloadBlob } from '@/lib/export/download'
import { plural } from '@/lib/format'
import { listedMarkKeys, marksFile, marksWithin, readMarksFile } from '../engine'
import { useActionMarks } from './store'
import { SOURCES } from './useActions'

/** Save to a file and Load from one, for the handled and snoozed list. */
export function MarksFileButtons() {
  const ctx = useAnalytics()
  const fileRef = useRef<HTMLInputElement>(null)
  const merge = useActionMarks((s) => s.merge)
  const marks = useActionMarks((s) => s.marks)
  // Only the items this mode lists go in a file saved here, and only they change on a load.
  const listed = useMemo(() => listedMarkKeys(ctx, SOURCES), [ctx])
  const count = Object.keys(marksWithin(marks, listed)).length
  const save = () => {
    const s = useActionMarks.getState()
    const shown = marksWithin(s.marks, listed)
    downloadBlob(
      new Blob([marksFile({ marks: shown, name: s.name }, Date.now())], { type: 'application/json' }),
      `${APP_SLUG}-marks-${todayISO()}.json`,
    )
    toast('Marks file downloaded', {
      tone: 'good',
      description: `${plural(count, 'mark')} on the items this mode lists. It holds item keys, dates and your name, never an amount.`,
    })
  }
  const load = async (file: File | undefined) => {
    if (!file) return
    let text: string
    try {
      text = await file.text()
    } catch {
      toast('The file could not be read', { tone: 'critical' })
      return
    }
    const r = readMarksFile(text, Date.now())
    if (!r.ok) {
      toast('Marks not loaded', { tone: 'critical', description: r.reason })
      return
    }
    const mine = marksWithin(r.marks, listed)
    const changed = merge(mine)
    const outside = r.count - Object.keys(mine).length
    const left = outside
      ? ` ${plural(outside, 'mark')} on items this mode does not list ${outside === 1 ? 'was' : 'were'} left out.`
      : ''
    toast('Marks loaded', {
      tone: 'good',
      description: changed
        ? `${plural(changed, 'item')} marked from the file. Where both marked an item, the later mark is kept.${left}`
        : `Nothing new: this browser already had every mark in the file for this mode.${left}`,
    })
  }
  return (
    <>
      <Button icon={<IconDownload />} disabled={!count} onClick={save}>
        Save marks to a file
      </Button>
      <Button icon={<IconUpload />} onClick={() => fileRef.current?.click()}>
        Load marks…
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          void load(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </>
  )
}

/** The name marks carry, typed once in this browser. */
export function MarksName() {
  const name = useActionMarks((s) => s.name)
  const setName = useActionMarks((s) => s.setName)
  const [draft, setDraft] = useState(name ?? '')
  const [editing, setEditing] = useState(false)
  const id = useId()
  return (
    <div className="col-span-full mt-2 flex flex-col gap-2 text-meta text-ink-2">
      {editing ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setName(draft)
            setEditing(false)
            toast(draft.trim() ? `Marks are kept as ${draft.trim()}` : 'Marks keep no name', {
              tone: 'good',
              description: 'In this browser only.',
            })
          }}
        >
          <label htmlFor={id}>Your name on marks</label>
          <input
            id={id}
            value={draft}
            maxLength={60}
            onChange={(e) => setDraft(e.currentTarget.value)}
            className="h-8 w-48 rounded-control bg-sheet px-2 text-small text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none"
          />
          <Button size="sm" variant="primary" type="submit">
            Save name
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <p className="flex flex-wrap items-center gap-x-2">
          <span>
            {name ? `Marks are kept as ${name} in this browser.` : 'Marks are kept in this browser.'}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(name ?? '')
              setEditing(true)
            }}
          >
            {name ? 'Change name' : 'Add your name'}
          </Button>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <MarksFileButtons />
      </div>
    </div>
  )
}
