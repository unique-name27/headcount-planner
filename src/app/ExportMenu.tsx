/**
 * "Export" for a view (the template app's ExportMenu.tsx; docs/PLAN.md 14.1): every figure on this
 * tab, or every figure on every tab of the view, as one Excel workbook (a sheet per figure) or one
 * PowerPoint deck (a slide per figure), the long CSV, and "Copy link to this view". Each item follows
 * its decision (`action:export.view`, `action:export.deck`, `action:export.long-csv`, `export:link`);
 * the figures carry exactly what the screen shows (their rows went through the cost guard, and
 * `moneyOpts` drops the money columns the mode hides). The whole-view export lays the other tabs out
 * off screen first (`renderWholeView`, in the same mode and picks) and reports its progress in a
 * toast. The export library loads on first use.
 *
 * Every file carries the export header (`planHeaderOf` with the view, so the
 * forecast's files state "Actual for closed months, forecast for open"), the mode it is for, and,
 * where the mode shows the long CSV, the long CSV's control totals on the Summary and the About slide
 * (docs/PLAN.md 14.1 items 1 and 4), with Finance's component control totals where the guard shows
 * the split (review SB-1). The long CSV is finance-export's model (src/views/finance/engine/longCsv.ts
 * `longCsvOf`, the same guarded model as the screen) written through `longFileText`, the one writer
 * of long CSVs and load files (./longExport.ts), so with Show pay amounts on its first line is
 * "Contains individual pay" (D-PAYFILES, review EX-1); both load through `import()`.
 */
import { useState } from 'react'
import { useFigureRegistry } from '@/charts/registry'
import { IconCopy, IconDownload, IconFile, IconSlides, IconTable } from '@/components/icons'
import { toast, updateToast } from '@/components/toast'
import { Button, Menu, type MenuItem } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { moneyLeftOut, moneyOpts, moneyShown } from '@/lib/export/columns'
import type { ViewControlTotals } from '@/lib/export/view'
import { plural } from '@/lib/format'
import type { ViewDef } from '@/views/types'
import { accessInputOf } from './exportMeta'
import { exportMetaOf, longSourceOf, tabExportOptions, tabTakesControlTotals } from './tabExport'
import { copyViewLink } from './viewActions'
import { renderWholeView } from './wholeView'
import {
  type ExportKind,
  layoutProgress,
  tabExportDone,
  WHOLE_VIEW_LABEL,
  wholeViewDone,
  writeProgress,
} from './wholeViewModel'

/** `linkOnly`: the view draws no figures here, so the menu offers only Copy link. */
export function ExportMenu({
  view,
  tab,
  linkOnly = false,
}: {
  view: ViewDef
  tab: string
  linkOnly?: boolean
}) {
  const registry = useFigureRegistry()
  const ctx = useAnalytics()
  const [busy, setBusy] = useState<ExportKind | 'long' | null>(null)
  const { access } = ctx
  const canKind = (kind: ExportKind) =>
    access.can(kind === 'workbook' ? 'action:export.view' : 'action:export.deck')
  const canLong = access.can('action:export.long-csv')
  // The forecast's files read the forecast (actual for closed months, forecast for open), as its
  // header's rate set says; every other view's read the version's lines.
  const longSource = longSourceOf(view)

  /**
   * The long CSV's control totals for the files' Summary and About slide, where the mode shows the
   * long CSV; none when it does not, or when the model cannot be read (the file still goes out).
   */
  const controlTotalsFor = async (): Promise<ViewControlTotals | undefined> => {
    if (!canLong) return undefined
    try {
      const [{ longCsvOf }, { menuControlTotals }] = await Promise.all([
        import('@/views/finance/engine/longCsv'),
        import('./longExport'),
      ])
      return menuControlTotals(longCsvOf(ctx, longSource))
    } catch (err) {
      console.error('The control totals could not be read', err)
      return undefined
    }
  }

  const metaFor = (tabLabel: string | undefined) => exportMetaOf(ctx, view, tabLabel)

  const runTab = async (kind: ExportKind) => {
    const figures = registry?.list() ?? []
    if (!figures.length) {
      toast('There is nothing to export on this tab yet.')
      return
    }
    setBusy(kind)
    try {
      // A heads-only tab's files carry no control totals: they are the long CSV's cost (review RP-1).
      const [lib, controlTotals] = await Promise.all([
        import('@/lib/export'),
        tabTakesControlTotals(ctx, view, tab) ? controlTotalsFor() : Promise.resolve(undefined),
      ])
      const { meta, opts } = tabExportOptions(ctx, view, tab, controlTotals)
      if (kind === 'workbook') await lib.exportViewWorkbook(figures, meta, opts)
      else await lib.exportViewDeck(figures, meta, opts)
      // A deck counts the figures it gives a slide (a summary slide stands in for others, RU-17).
      const done = tabExportDone({
        kind,
        meta,
        figures: figures.length,
        ...(kind === 'deck' ? { deckFigures: lib.deckEntries(lib.viewEntries(figures)).length } : {}),
        payDropped: moneyLeftOut(figures, moneyShown(opts)),
      })
      toast(done.title, { tone: 'good', description: done.description })
    } catch (err) {
      console.error('View export failed', err)
      toast('The export did not finish', {
        tone: 'critical',
        description: err instanceof Error ? err.message : 'Try again, or export figures one at a time.',
      })
    } finally {
      setBusy(null)
    }
  }

  const runView = async (kind: ExportKind) => {
    setBusy(kind)
    const meta = metaFor(WHOLE_VIEW_LABEL)
    const opts = moneyOpts(ctx)
    const first = layoutProgress(view.label, view.tabs[0], 0, view.tabs.length)
    const id = toast(first.title, { description: first.description, timeout: 0 })
    try {
      const lib = await import('@/lib/export')
      const {
        groups,
        failed,
        value: images,
      } = await renderWholeView(view, {
        // The off-screen tabs render in the same mode and picks, with the same tabs and figures.
        access: accessInputOf(access),
        onProgress: ({ index, total, tab: t }) => {
          const p = layoutProgress(view.label, t, index, total)
          updateToast(id, p.title, { description: p.description })
        },
        whileMounted: async (groups) => {
          const figures = groups.flatMap((g) => g.figures)
          const p = writeProgress(kind, 'images', figures.length)
          updateToast(id, p.title, { description: p.description })
          return lib.captureFigureImages(figures)
        },
      })
      const count = groups.reduce((n, g) => n + g.figures.length, 0)
      if (!count) {
        updateToast(id, 'There is nothing to export in this view yet.', { timeout: 5000 })
        return
      }
      const p = writeProgress(kind, 'file', count)
      updateToast(id, p.title, { description: p.description })
      const controlTotals = await controlTotalsFor()
      const full = { ...opts, captured: images, ...(controlTotals ? { controlTotals } : {}) }
      if (kind === 'workbook') await lib.exportViewWorkbook(groups, meta, full)
      else await lib.exportViewDeck(groups, meta, full)
      const done = wholeViewDone({
        kind,
        viewLabel: view.label,
        groups,
        ...(kind === 'deck' ? { deckFigures: lib.deckEntries(lib.viewEntries(groups)).length } : {}),
        failed,
        payDropped: moneyLeftOut(
          groups.flatMap((g) => g.figures),
          moneyShown(opts),
        ),
      })
      updateToast(id, done.title, { tone: 'good', description: done.description, timeout: 6000 })
    } catch (err) {
      console.error('Whole-view export failed', err)
      updateToast(id, 'The export did not finish', {
        tone: 'critical',
        description: err instanceof Error ? err.message : 'Try again, or export one tab at a time.',
        timeout: 8000,
      })
    } finally {
      setBusy(null)
    }
  }

  /**
   * The long CSV (docs/PLAN.md 14.1 item 3): one row per period, org, cost center, account, component
   * and currency from the guarded model, with the header and the control totals above the rows;
   * headcount-planner-<view>-long-<as-of>.csv.
   */
  const runLong = async () => {
    setBusy('long')
    const meta = metaFor(view.tabs.find((t) => t.key === tab)?.label)
    try {
      const [{ longCsvOf }, { menuLongCsv }, { downloadBlob, MIME }] = await Promise.all([
        import('@/views/finance/engine/longCsv'),
        import('./longExport'),
        import('@/lib/export/download'),
      ])
      const model = longCsvOf(ctx, longSource)
      const file = menuLongCsv(model, meta)
      if (!file) {
        toast(model.empty ?? 'There is nothing to export in this view yet.')
        return
      }
      downloadBlob(new Blob([file.text], { type: MIME.csv }), file.name)
      toast('Long CSV downloaded', {
        tone: 'good',
        description: `${plural(model.rows.length, 'row')} from ${meta.view}.${model.note ? ` ${model.note}` : ''}`,
      })
    } catch (err) {
      console.error('Long CSV export failed', err)
      toast('The export did not finish', {
        tone: 'critical',
        description: err instanceof Error ? err.message : 'Try again.',
      })
    } finally {
      setBusy(null)
    }
  }

  const kinds = (['workbook', 'deck'] as const).filter((k) => !linkOnly && canKind(k))
  const fileItem = (kind: ExportKind, whole: boolean): MenuItem => ({
    label:
      kind === 'workbook'
        ? `Excel workbook (${whole ? plural(view.tabs.length, 'tab') : 'all figures'})`
        : `PowerPoint slides (${whole ? plural(view.tabs.length, 'tab') : 'all figures'})`,
    icon: kind === 'workbook' ? <IconTable /> : <IconSlides />,
    hint: kind === 'workbook' ? '.xlsx' : '.pptx',
    onSelect: () => void (whole ? runView(kind) : runTab(kind)),
  })
  const items: MenuItem[] = []
  if (kinds.length) {
    items.push(
      { heading: view.tabs.length > 1 ? 'This tab' : 'This view' },
      ...kinds.map((k) => fileItem(k, false)),
    )
    if (view.tabs.length > 1)
      items.push(
        { separator: true },
        { heading: 'Whole view, all tabs' },
        ...kinds.map((k) => fileItem(k, true)),
      )
  }
  // The long CSV reads the guarded model, not the figures, so it goes wherever the mode shows it.
  if (canLong && !linkOnly && view.datasets.length > 0) {
    if (items.length) items.push({ separator: true })
    items.push({
      label: 'Long CSV (every period)',
      icon: <IconFile />,
      hint: '.csv',
      onSelect: () => void runLong(),
    })
  }
  // The address with the scope spelled out, so the link opens this tab with these filters.
  if (access.can('export:link')) {
    if (items.length) items.push({ separator: true })
    items.push({ label: 'Copy link to this view', icon: <IconCopy />, onSelect: () => void copyViewLink() })
  }
  if (!items.length) return null

  return (
    <Menu
      width={284}
      trigger={
        <Button data-tour="view-export" icon={<IconDownload />} caret disabled={!!busy}>
          {busy ? 'Exporting…' : 'Export'}
        </Button>
      }
      items={items}
    />
  )
}
