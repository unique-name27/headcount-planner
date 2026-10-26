/**
 * One row of filters above the content (the template app's FilterBar.tsx, docs/PLAN.md 9.2): saved
 * views first, then the fiscal period, the leader (a seat and every seat below it) and the list
 * filters (business unit, department, cost center, location, level, legal entity, country,
 * currency), and a muted count of who is in scope; the data standard folds into the row's end.
 * Active filters show as removable chips underneath, with the leader's chain of seats. Each filter's
 * menu has an Include / Exclude switch where the mode's clamp keeps an exclusion, and the changes
 * made while one menu is open are one history entry. An exclusion that would leave out 1 to 4
 * Filled heads cannot be picked.
 *
 * The mode shapes the row (docs/PLAN.md 8.1 `FILTER_DIMS_OF`, 8.2): a tree mode (Manager, Leader)
 * pins the leader inside its tree, HRBP mode pins its business unit (the pin, and why on hover),
 * and every option list and count comes from inside the scope; Finance filters unit, cost center,
 * legal entity, country and currency, include only. The version and comparison are pickers in the
 * view header, not filters.
 *
 * Under 768px the row is the period control and one "Filters (n)" button, which opens a bottom
 * sheet with the saved views, every filter, the scope count and the data standard.
 */
import { Dialog as BDialog } from '@base-ui/react/dialog'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NO_PICK_LABEL, WHOLE_COMPANY, WHOLE_ORG, WHOLE_TEAM, WHOLE_UNIT } from '@/access/copy'
import {
  FILTER_DIMENSION_LABELS,
  filterChips,
  isFiltered,
  leaderExcludedLabel,
  leaderOrgLabel,
} from '@/components/filterLabels'
import { IconChevronRight, IconClose, IconFilter, IconReset } from '@/components/icons'
import { MultiSelect } from '@/components/MultiSelect'
import { Button } from '@/components/ui'
import { useMinWidth, useNarrow } from '@/components/useNarrow'
import { useAnalytics } from '@/data/context'
import {
  dropIdleModes,
  type FilterDimension,
  type FilterMode,
  hasOrgFilter,
  holderNames,
  isExcluded,
  type ListDimension,
  withMode,
} from '@/data/scope'
import { useStore } from '@/data/store'
import { fmt, plural } from '@/lib/format'
import { minGroupOf } from '@/metrics/privacy'
import { holdHistory } from './address'
import { pinnedTip } from './copy'
import {
  DIMENSIONS,
  type DimensionOption,
  dimensionOptions,
  filledHeads,
  filterRowParts,
  headMatcher,
  leaderChain,
  leaderOptions,
  offersExclude,
  otherFilters,
  scopeHeads,
  scopeLeaders,
  tooFewToLeaveOut,
} from './filterOptions'
import { LeaderPicker } from './LeaderPicker'
import { listModeHint, ModeSwitch } from './ModeSwitch'
import { PeriodControl } from './PeriodControl'
import { ViewsMenu } from './SavedViews'
import { NoPickButton, PinnedFilter } from './ScopeControls'
import { StandardControl } from './StandardControl'

/** Why Exclude greys out some choices (`tooFewToLeaveOut`). */
const tooFewNote = (what: string, min: number) =>
  `${what} of fewer than ${min} filled seats can't be left out. Comparing the scope with and without them would single them out.`

const CHIP =
  'inline-flex h-7 max-w-full items-center gap-1.5 rounded-control bg-sheet pl-2 text-meta shadow-[inset_0_0_0_1px_var(--rule)]'

function RemoveButton({ label, onClick }: { label: string; onClick: (button: HTMLElement) => void }) {
  return (
    <button
      type="button"
      data-chip-remove=""
      aria-label={label}
      onClick={(e) => onClick(e.currentTarget)}
      className="mr-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-chip text-muted hover:bg-hover hover:text-ink"
    >
      <IconClose className="size-3" />
    </button>
  )
}

/** The leader's seat with the seats above it; earlier links widen the scope to that seat. */
function LeaderCrumbs({
  leaderId,
  nameOf,
  onRemove,
}: {
  leaderId: string
  nameOf: (positionId: string) => string | undefined
  onRemove: () => void
}) {
  const ctx = useAnalytics()
  const setFilters = useStore((s) => s.setFilters)
  const excluded = useStore((s) => isExcluded(s.filters, 'leaderId'))
  const scope = ctx.access.scope
  const full = leaderChain(ctx.positionIndex, leaderId)
  // A tree mode's chain starts inside its tree, nothing above it.
  const inside = scope ? full.filter((id) => scope.positionIds.has(id) || scope.kind === 'unit') : full
  const chain = !ctx.access.can('filter:chain') ? full.slice(-1) : inside.length ? inside : full.slice(-1)
  const label = (id: string) => nameOf(id) ?? ctx.positionIndex.byId.get(id)?.title ?? id
  if (excluded)
    return (
      <span className={CHIP}>
        <span className="text-muted">Leader</span>
        <span className="truncate font-medium text-ink">{leaderExcludedLabel(leaderId, nameOf)}</span>
        <RemoveButton
          label={`Remove leader exclusion ${leaderOrgLabel(leaderId, nameOf)}`}
          onClick={() => {
            onRemove()
            // The exclude mode goes with the leader, as the address does.
            setFilters({
              leaderId: null,
              modes: withMode(useStore.getState().filters.modes, 'leaderId', 'include'),
            })
          }}
        />
      </span>
    )
  const shown = chain.slice(-4)
  const hidden = chain.length - shown.length
  return (
    <span className={CHIP}>
      <span className="text-muted">Leader</span>
      <nav aria-label="Reporting line" className="flex min-w-0 items-center gap-0.5">
        {hidden > 0 && <span className="text-muted">…</span>}
        {shown.slice(0, -1).map((id) => (
          <span key={id} className="flex min-w-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setFilters({ leaderId: id })}
              title={`Widen to ${leaderOrgLabel(id, nameOf)}`}
              className="max-w-[120px] truncate rounded-mark text-ink-2 hover:text-ink hover:underline"
            >
              {label(id)}
            </button>
            <IconChevronRight className="size-3 shrink-0 text-muted" />
          </span>
        ))}
        <span aria-current="true" className="truncate font-medium text-ink">
          {leaderOrgLabel(leaderId, nameOf)}
        </span>
      </nav>
      <RemoveButton
        label="Remove leader filter"
        onClick={() => {
          onRemove()
          setFilters({ leaderId: null })
        }}
      />
    </span>
  )
}

export function FilterBar() {
  const ctx = useAnalytics()
  const filters = useStore((s) => s.filters)
  const setFilters = useStore((s) => s.setFilters)
  const resetFilters = useStore((s) => s.resetFilters)
  const { mode, scope, unset } = ctx.access
  const parts = filterRowParts(ctx.access)
  const tree = scope?.kind === 'tree' ? scope : null
  const unit = scope?.kind === 'unit' ? scope : null

  // Filled heads on the as-of date, inside the mode's scope: every option list and count reads them.
  const heads = useMemo(() => {
    const all = filledHeads(ctx.all, ctx.positionIndex)
    const holds = scopeHeads(scope)
    return holds ? all.filter(holds) : all
  }, [ctx.all, ctx.positionIndex, scope])
  const names = useMemo(() => holderNames(ctx.all.workers, ctx.asOf), [ctx.all.workers, ctx.asOf])
  const nameOf = (id: string) => names.get(id)

  // Each dimension counts within the rest of the row, so a count is who would be in scope.
  const options = useMemo(() => {
    const out = {} as Record<ListDimension, DimensionOption[]>
    for (const k of DIMENSIONS) {
      const within = hasOrgFilter(otherFilters(filters, k))
        ? headMatcher(otherFilters(filters, k), ctx.all, ctx.positionIndex)
        : undefined
      out[k] = dimensionOptions(heads, k, filters[k], within)
    }
    return out
  }, [heads, filters, ctx.all, ctx.positionIndex])
  const leaders = useMemo(() => {
    const rest = otherFilters(filters, 'leaderId')
    return leaderOptions({
      index: ctx.positionIndex,
      heads,
      names,
      inScope: scopeLeaders(scope),
      within: hasOrgFilter(rest) ? headMatcher(rest, ctx.all, ctx.positionIndex) : undefined,
    })
  }, [ctx.positionIndex, ctx.all, heads, names, scope, filters])

  // Excluding, a choice that would leave out 1 to min - 1 Filled heads can't be picked; one already
  // picked stays, so it can be taken off.
  const min = minGroupOf(ctx.metrics)
  const leaderExcluded = isExcluded(filters, 'leaderId')
  const leaderChoices = leaderExcluded
    ? leaders.map((o) =>
        o.id !== filters.leaderId && tooFewToLeaveOut(o.size, min) ? { ...o, disabled: true } : o,
      )
    : leaders
  const choices = (k: ListDimension): DimensionOption[] =>
    isExcluded(filters, k)
      ? options[k].map((o) =>
          !filters[k].includes(o.value) && tooFewToLeaveOut(o.count, min) ? { ...o, disabled: true } : o,
        )
      : options[k]
  const setDimMode = (k: FilterDimension, m: FilterMode) =>
    setFilters({ modes: withMode(filters.modes, k, m) })
  const canExclude = (k: FilterDimension) => parts.exclude && offersExclude(mode, k, scope)

  // Everything changed while one filter menu is open is one history entry. An exclude switch left
  // on without values only lasts while its menu is open (the address never carries one).
  const held = useRef<(() => void) | null>(null)
  const onMenu = (open: boolean) => {
    if (!open) {
      const now = useStore.getState().filters
      const clean = dropIdleModes(now)
      if (clean !== now) setFilters({ modes: clean.modes })
    }
    held.current?.()
    held.current = open ? holdHistory() : null
  }
  useEffect(() => () => held.current?.(), [])

  const inScope = useMemo(() => {
    const ok = headMatcher(ctx.filters, ctx.all, ctx.positionIndex)
    return heads.filter(ok).length
  }, [heads, ctx.filters, ctx.all, ctx.positionIndex])
  const total = heads.length

  const chips = filterChips(filters, nameOf).filter(
    (c) => c.key !== 'leaderId' && !(unit && c.key === 'businessUnit'),
  )
  // A scope is not a filter: a tree mode's own tree, HRBP's business unit. The scope line carries its
  // pin, so it gets no chip.
  const lockedLeader = !!tree && !!filters.leaderId && tree.rootPositionIds.has(filters.leaderId)
  const leaderChip = !!filters.leaderId && !unset && !lockedLeader
  const showChips = parts.chips && isFiltered(filters) && (chips.length > 0 || leaderChip)
  const standardFixed = parts.standard === 'read-only'
  const standardShown = parts.standard !== 'hidden'

  // A chip's remove button and Reset take themselves away: focus moves to the chip that took the
  // removed one's place (or the one before it), and to the leader picker when no chip is left.
  const chipRow = useRef<HTMLDivElement>(null)
  const fieldset = useRef<HTMLFieldSetElement>(null)
  const refocus = useRef<number | null>(null)
  useEffect(() => {
    const at = refocus.current
    if (at == null) return
    refocus.current = null
    const left = chipRow.current?.querySelectorAll<HTMLElement>('[data-chip-remove]') ?? []
    const next =
      left[Math.min(at, left.length - 1)] ??
      fieldset.current?.querySelector<HTMLElement>('[data-tour="filter-leader"]') ??
      fieldset.current?.querySelector<HTMLElement>('[data-tour="filter-views"]')
    next?.focus()
  })
  const removedAt = (el: HTMLElement) => {
    const all = [...(chipRow.current?.querySelectorAll<HTMLElement>('[data-chip-remove]') ?? [])]
    refocus.current = Math.max(0, all.indexOf(el))
  }

  const narrow = useNarrow()
  const wide = useMinWidth(1280)
  const [sheetOpen, setSheetOpen] = useState(false)
  const activeCount = chips.length + (leaderChip ? 1 : 0)
  const tip = scope && !unset ? pinnedTip(mode, scope.label) : ''

  const leaderControl = !parts.leader ? null : unset && tree ? (
    <NoPickButton mode={mode} label={FILTER_DIMENSION_LABELS.leaderId} />
  ) : (
    <LeaderPicker
      options={leaderChoices}
      value={lockedLeader ? null : filters.leaderId}
      currentName={filters.leaderId ? (nameOf(filters.leaderId) ?? filters.leaderId) : undefined}
      onChange={(leaderId) => setFilters({ leaderId })}
      mode={leaderExcluded ? 'exclude' : 'include'}
      onModeChange={canExclude('leaderId') ? (m) => setDimMode('leaderId', m) : undefined}
      onOpenChange={onMenu}
      clearLabel={tree ? (mode === 'manager' ? WHOLE_TEAM : WHOLE_ORG) : unit ? WHOLE_UNIT : WHOLE_COMPANY}
      {...(tree && { pinned: tip, emptyText: 'No seat in this tree leads 3 or more filled seats.' })}
      {...(unit && { emptyText: 'No seat in this business unit leads 3 or more filled seats.' })}
      note={leaderChoices.some((o) => o.disabled) ? tooFewNote('Orgs', min) : undefined}
    />
  )
  const orgFilters = (
    <>
      {leaderControl}
      {parts.dims.map((k) => {
        if (unit && k === 'businessUnit')
          return unset ? (
            <NoPickButton key={k} mode={mode} label={FILTER_DIMENSION_LABELS[k]} />
          ) : (
            <PinnedFilter
              key={k}
              mode={mode}
              label={FILTER_DIMENSION_LABELS[k]}
              value={unit.unit}
              tip={tip}
            />
          )
        const listMode: FilterMode = isExcluded(filters, k) ? 'exclude' : 'include'
        const list = choices(k)
        return (
          <MultiSelect
            key={k}
            label={FILTER_DIMENSION_LABELS[k]}
            options={list}
            note={list.some((o) => o.disabled) ? tooFewNote('Groups', min) : undefined}
            value={filters[k]}
            onChange={(v) => setFilters({ [k]: v })}
            width={k === 'department' || k === 'costCenter' ? 340 : 300}
            excluded={listMode === 'exclude'}
            onOpenChange={onMenu}
            header={
              canExclude(k) ? (
                <ModeSwitch
                  label={FILTER_DIMENSION_LABELS[k]}
                  value={listMode}
                  onChange={(m) => setDimMode(k, m)}
                  hint={listModeHint(listMode)}
                />
              ) : undefined
            }
          />
        )
      })}
    </>
  )
  const scopeCount = unset
    ? NO_PICK_LABEL[mode]
    : scope
      ? `${fmt(inScope, 'int')} of ${plural(total, 'person', 'people')} in ${scope.label}`
      : ctx.isCompany
        ? `${plural(inScope, 'person', 'people')} in scope`
        : `${fmt(inScope, 'int')} of ${plural(total, 'person', 'people')} in scope`

  return (
    <div className="pt-4 pb-1">
      <fieldset ref={fieldset} data-tour="filter-row" className="flex min-w-0 flex-wrap items-center gap-2">
        <legend className="sr-only">Filters</legend>
        {narrow ? (
          <>
            {parts.period && <PeriodControl />}
            <BDialog.Root open={sheetOpen} onOpenChange={(o) => setSheetOpen(o)}>
              <BDialog.Trigger
                render={
                  <Button
                    icon={<IconFilter />}
                    aria-label={`Filters${activeCount ? `, ${activeCount} active` : ''}`}
                  >
                    Filters{activeCount ? ` (${activeCount})` : ''}
                  </Button>
                }
              />
              <BDialog.Portal>
                <BDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
                <BDialog.Popup className="fixed inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col rounded-t-sheet bg-sheet text-ink shadow-(--shadow-pop) outline-none transition-transform duration-200 data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full">
                  <div className="flex items-center gap-3 border-b border-rule px-4 pt-4 pb-3">
                    <div className="min-w-0 flex-1">
                      <BDialog.Title className="cut-head text-section font-semibold">Filters</BDialog.Title>
                      {parts.inScope && (
                        <BDialog.Description className="mt-0.5 text-meta text-muted">
                          {scopeCount}
                        </BDialog.Description>
                      )}
                    </div>
                    <BDialog.Close
                      aria-label="Close"
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-hover hover:text-ink"
                    >
                      <IconClose />
                    </BDialog.Close>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {parts.views && <ViewsMenu />}
                      {orgFilters}
                    </div>
                    {standardShown && (
                      <div className="mt-4 border-t border-rule pt-4">
                        <StandardControl />
                      </div>
                    )}
                  </div>
                </BDialog.Popup>
              </BDialog.Portal>
            </BDialog.Root>
          </>
        ) : (
          <>
            {parts.views && (
              <>
                <ViewsMenu />
                <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-rule-strong sm:block" />
              </>
            )}
            {parts.period && (
              <>
                <PeriodControl />
                <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-rule-strong sm:block" />
              </>
            )}
            {orgFilters}
          </>
        )}
        {parts.inScope && (
          <p
            aria-live="polite"
            className="ml-auto pl-2 text-meta whitespace-nowrap text-muted max-md:sr-only"
          >
            {scopeCount}
          </p>
        )}
        {standardShown && (wide || (standardFixed && !narrow)) && <StandardControl compact />}
      </fieldset>
      {standardShown && !wide && !narrow && !standardFixed && (
        <div className="mt-2.5">
          <StandardControl />
        </div>
      )}
      {showChips && (
        <div ref={chipRow} className="mt-2 flex flex-wrap items-center gap-1.5">
          {leaderChip && filters.leaderId && (
            <LeaderCrumbs
              leaderId={filters.leaderId}
              nameOf={nameOf}
              onRemove={() => {
                refocus.current = 0
              }}
            />
          )}
          {chips.map((c) => (
            <span key={c.id} className={CHIP}>
              <span className="text-muted">{c.dimension}</span>
              <span className="truncate font-medium text-ink">{c.label}</span>
              <RemoveButton
                label={`Remove ${c.dimension.toLowerCase()}${c.excluded ? ' exclusion' : ''} ${c.value}`}
                onClick={(button) => {
                  removedAt(button)
                  setFilters(c.remove)
                }}
              />
            </span>
          ))}
          {parts.reset && (
            <Button
              size="sm"
              variant="ghost"
              icon={<IconReset className="size-3.5" />}
              onClick={() => {
                refocus.current = Number.MAX_SAFE_INTEGER
                resetFilters()
              }}
              className="ml-0.5"
            >
              Reset
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
