/**
 * The Lists tab (the template app's official lists): each category's list as the app uses it now,
 * with how many rows hold a value not on it; open one for its values and the rows that use each.
 * HR admin can add a value, retire one (and restore it) and make a proposed list official; every
 * change is logged. Changes go through the lists' pure reducers
 * (`@/data/lists/edit`) and the lists store (src/app/dictionary.ts), so the scopes, the Acting as
 * picker and the quality index follow at once.
 */
import { useState } from 'react'
import { useOfficialLists } from '@/app/dictionary'
import { DataTable, Figure } from '@/charts'
import { Grid, Section } from '@/components'
import { goTo } from '@/components/navigation'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { canAdd, isListId, listDef } from '@/data/lists/defs'
import { applyEdit } from '@/data/lists/edit'
import type { ListEdit, ListId } from '@/data/lists/types'
import { useStore } from '@/data/store'
import type { DataRoomModel } from '../engine'
import { tabRoute } from '../engine/links'
import { LIST_VALUE_COLUMNS, listsOf, listValueRows, notOnListRows } from '../engine/lists'

function ListDetail({ id }: { id: ListId }) {
  const ctx = useAnalytics()
  const state = useOfficialLists((s) => s.state)
  const commit = useOfficialLists((s) => s.commit)
  const readOnly = useStore((s) => s.readOnly)
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const def = listDef(id)
  const { lists } = listsOf(ctx)
  const list = lists[id]
  const values = listValueRows(ctx, id)
  const missing = notOnListRows(ctx, id)
  const editable = ctx.access.can('action:data.import') && !readOnly
  const by = ctx.access.actingAs?.name ?? null
  const run = (edit: ListEdit) => {
    const r = applyEdit(state, lists, edit, { by })
    if (!r.ok) {
      setMessage(r.error)
      return false
    }
    commit(r.state)
    setMessage(r.change.what)
    return true
  }
  return (
    <Section
      title={def.label}
      id="list-detail"
      dek={def.about}
      actions={
        editable && list.status === 'proposed' ? (
          <Button size="sm" variant="primary" onClick={() => run({ kind: 'make-official', list: id })}>
            Make official
          </Button>
        ) : undefined
      }
    >
      <div className="col-span-full rounded-sheet bg-sheet px-4 py-4 lg:col-span-8 lg:px-5">
        <DataTable
          columns={LIST_VALUE_COLUMNS}
          rows={values}
          caption={`${def.label} values`}
          density="compact"
          maxRows={40}
          search={values.length > 12 ? 'Find a value' : false}
          onRowClick={
            editable
              ? (r) =>
                  run(
                    r.status === 'Retired'
                      ? { kind: 'restore', list: id, value: r.value }
                      : { kind: 'retire', list: id, value: r.value },
                  )
              : undefined
          }
        />
        {editable && (
          <p className="mt-2 text-meta text-muted">
            Select a value to retire it, or a retired one to restore it.
          </p>
        )}
        {editable && canAdd(def) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              className="h-8 w-60 rounded-control border border-rule-strong bg-sheet px-2 text-small text-ink"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={`New ${def.singular.toLowerCase()}`}
              placeholder={`New ${def.singular.toLowerCase()}`}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!draft.trim()}
              onClick={() => {
                if (run({ kind: 'add', list: id, value: draft })) setDraft('')
              }}
            >
              Add
            </Button>
          </div>
        )}
        {message && <p className="mt-2 text-meta text-ink-2">{message}</p>}
      </div>
      <div className="col-span-full rounded-sheet bg-sheet px-4 py-4 lg:col-span-4 lg:px-5">
        <h3 className="cut-head text-title font-semibold">In the data, not on the list</h3>
        {missing.length ? (
          <DataTable
            columns={[
              { key: 'value', label: 'Value' },
              { key: 'field', label: 'Field' },
              { key: 'rows', label: 'Rows', format: 'int' },
            ]}
            rows={missing}
            caption="Values not on the list"
            density="compact"
            maxRows={20}
          />
        ) : (
          <p className="mt-1 text-small text-ink-2">Every value in the data is on the list.</p>
        )}
      </div>
    </Section>
  )
}

export function ListsTab({ model, selected }: { model: DataRoomModel; selected: string | null }) {
  const fig = model.lists
  const id = selected && isListId(selected) ? selected : null
  return (
    <>
      <Grid>
        <Figure
          id="data-lists"
          metric={fig.metric}
          uses={fig.uses}
          title={fig.title}
          subtitle={fig.subtitle}
          data={fig.rows}
          columns={fig.columns}
          note={fig.note ?? undefined}
          gate={false}
          tableOnly
          table={{ onRowClick: (r) => goTo('data', tabRoute('lists', r.id)) }}
          empty={fig.empty}
        />
      </Grid>
      {id && <ListDetail key={id} id={id} />}
    </>
  )
}
