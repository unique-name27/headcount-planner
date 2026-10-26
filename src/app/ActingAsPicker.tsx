/**
 * The Acting as picker (the template app's access/ui ScopePicker; docs/PLAN.md 8.2): "Act as a
 * manager", "Act as an HRBP", "Act as a leader", "Act as a Finance person" or "Act as an HR admin",
 * one dialog with a config per mode. Title, dek, a search field, the people the mode can act as
 * (`actingAsOptions`: the sample's persona first, then the largest scope), `NOT_SECURITY_SHORT`, a
 * primary button that is disabled until a row is picked, and Cancel, which keeps the mode as it
 * was. Mounted once by the shell; opened by choosing a mode that has no pick yet, by "Change who you
 * act as", or by a remembered pick that is gone from the data (with the note at the top).
 */
import { type KeyboardEvent, useId, useMemo, useRef, useState } from 'react'
import { NOT_SECURITY_SHORT, PICKER_COPY } from '@/access/copy'
import type { Mode } from '@/access/modes'
import type { ActingAsOption } from '@/access/scopes'
import { useMode } from '@/access/store'
import { Dialog } from '@/components/Dialog'
import { IconCheck, IconSearch } from '@/components/icons'
import { PICKER_ITEM, SEARCH_INPUT } from '@/components/styles'
import { Button, cx, Tag } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { actingAsRows } from './actingAsRows'
import { COMPANY_TAG, PERSONA_TAG, PICK_SEARCH } from './copy'
import { useOfficialLists } from './dictionary'

/** A row's key: the person, and the unit for an HRBP (one row per unit). */
export const optionKey = (o: ActingAsOption): string => `${o.pick.personId}|${o.pick.unit ?? ''}`

/** The row matches a search: name, line or unit, any case. */
export function optionMatches(o: ActingAsOption, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [o.pick.name, o.line, o.pick.unit ?? '', o.pick.personId].some((x) => x.toLowerCase().includes(q))
}

/** The dialog's body: the note, the search, the rows (the sample's persona first), the buttons. */
export function PickerBody({ mode, onDone }: { mode: Mode; onDone: () => void }) {
  const ctx = useAnalytics()
  const saved = useOfficialLists((s) => s.state)
  const stored = useMode((s) => s.actingAs[mode])
  const note = useMode((s) => s.pickNote)
  const choose = useMode((s) => s.choose)
  const copy = PICKER_COPY[mode]
  const words = PICK_SEARCH[mode]
  const rows = useMemo(() => actingAsRows(mode, ctx, saved), [mode, ctx, saved])
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(() => {
    const cur = stored
      ? rows.find((r) => r.pick.personId === stored.personId && r.pick.unit === stored.unit)
      : null
    return cur ? optionKey(cur) : null
  })
  const [active, setActive] = useState(0)
  const list = useMemo(() => rows.filter((r) => optionMatches(r, query)), [rows, query])
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const at = Math.min(active, Math.max(0, list.length - 1))
  const pickedRow = rows.find((r) => optionKey(r) === picked)

  const enter = (row: ActingAsOption | undefined) => {
    if (!row) return
    choose(mode, row.pick)
    onDone()
  }
  const move = (i: number) => {
    setActive(i)
    listRef.current?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.scrollIntoView({ block: 'nearest' })
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && list.length) {
      e.preventDefault()
      move(Math.min(list.length - 1, at + 1))
    } else if (e.key === 'ArrowUp' && list.length) {
      e.preventDefault()
      move(Math.max(0, at - 1))
    } else if (e.key === 'Enter' && list[at]) {
      // Enter in the search picks the highlighted row, like a double click.
      e.preventDefault()
      enter(list[at])
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {note && <p className="rounded-control bg-sheet-2 px-3 py-2 text-small text-ink">{note}</p>}
      <div className="rounded-control shadow-[inset_0_0_0_1px_var(--rule-strong)]">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
          <input
            // biome-ignore lint/a11y/noAutofocus: the dialog opens to pick one row; the search is where that starts
            autoFocus
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={list[at] ? `${listId}-${at}` : undefined}
            aria-label={words.search}
            placeholder={words.search}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKey}
            className={SEARCH_INPUT}
          />
        </div>
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={words.list}
          className="max-h-[min(360px,45dvh)] overflow-y-auto overscroll-contain py-1"
        >
          {list.length === 0 && (
            <div className="px-3 py-3 text-small text-muted">
              {rows.length ? 'No matches.' : copy.disabled}
            </div>
          )}
          {list.map((r, i) => {
            const key = optionKey(r)
            const selected = key === picked
            return (
              <div
                key={key}
                id={`${listId}-${i}`}
                role="option"
                tabIndex={-1}
                aria-selected={selected}
                data-index={i}
                data-highlighted={i === at ? '' : undefined}
                onMouseMove={() => i !== at && setActive(i)}
                onClick={() => setPicked(key)}
                onDoubleClick={() => enter(r)}
                className={cx(PICKER_ITEM, 'cursor-pointer items-start')}
              >
                <span className="mt-0.5 flex w-4 shrink-0 justify-center">
                  <IconCheck className={cx('size-4', !selected && 'opacity-0')} strokeWidth={2.25} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className={cx('truncate', selected && 'font-semibold')}>{r.pick.name}</span>
                    {r.persona && <Tag tone="outline">{PERSONA_TAG}</Tag>}
                    {r.company && <Tag>{COMPANY_TAG}</Tag>}
                  </span>
                  {r.line && <span className="block text-meta leading-snug text-muted">{r.line}</span>}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-meta text-muted">{copy.foot}</p>
        <p className="text-meta text-muted">{NOT_SECURITY_SHORT}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-rule pt-3">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!pickedRow} onClick={() => enter(pickedRow)}>
          {copy.confirm}
        </Button>
      </div>
    </div>
  )
}

export function ActingAsPicker() {
  const picking = useMode((s) => s.picking)
  const cancel = useMode((s) => s.cancelPick)
  // The dialog keeps the last mode's words while it closes, so its title does not change mid-fade.
  const [shown, setShown] = useState<Mode>(picking ?? 'manager')
  if (picking && picking !== shown) setShown(picking)
  const copy = PICKER_COPY[picking ?? shown]
  return (
    <Dialog
      title={copy.title}
      description={copy.dek}
      open={!!picking}
      onOpenChange={(o) => {
        if (!o) cancel()
      }}
      width={520}
    >
      {picking && <PickerBody key={picking} mode={picking} onDone={cancel} />}
    </Dialog>
  )
}
