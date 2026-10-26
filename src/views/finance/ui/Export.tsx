/**
 * Finance > Export (docs/PLAN.md 9.4, 14.1 items 3, 4 and 6): the FP&A load file at Finance's rules,
 * the unsuppressed one for HR admin with Show pay amounts on, the version they read (the version
 * shown: picking one here moves the header's picker), the file's control totals and its full-year
 * rows. Renders the model; the buttons write the files the engine builds (./../engine/loadFile.ts).
 * A reader tab still exports: no file takes the write lock.
 */

import { picksForVersion } from '@/app/pickerOptions'
import { Figure } from '@/charts'
import { Button, EmptyState, Grid, Section, Segmented, toast } from '@/components'
import { useStore } from '@/data/store'
import { downloadBlob, MIME } from '@/lib/export/download'
import { plural } from '@/lib/format'
import { ID as PLAN } from '@/views/plan/metrics'
import type { LoadFileChoice } from '../engine'
import { loadFileOf, loadFileText } from '../engine/loadFile'
import { defsOf, useFinance } from './model'

export function Export() {
  const { ctx, m } = useFinance()
  const e = m.export
  const compare = useStore((s) => s.compare)
  const setPicks = useStore((s) => s.setPicks)
  if (!e.loadFile && !e.fullLoadFile)
    return (
      <Grid>
        <EmptyState
          title="No load file in this mode"
          body="Load files are written in Finance mode and HR admin mode."
        />
      </Grid>
    )
  const shown = ctx.version?.versionId ?? null
  const download = (choice: LoadFileChoice) => {
    const file = loadFileOf(ctx, { ...(shown ? { versionId: shown } : {}), full: choice.individualPay })
    if (!file) {
      toast('The load file could not be written', {
        tone: 'critical',
        description: choice.disabled ?? undefined,
      })
      return
    }
    downloadBlob(new Blob([loadFileText(ctx, file)], { type: MIME.csv }), `${file.fileName}.csv`)
    toast(choice.individualPay ? 'Load file with individual pay downloaded' : 'Load file downloaded', {
      tone: 'good',
      description: `${plural(file.rows.length, 'row')} for ${file.meta.plan?.version ?? 'the version shown'}.`,
    })
  }
  const choices = [e.loadFile, e.fullLoadFile].filter((c): c is LoadFileChoice => c != null)
  return (
    <>
      <Section
        title="FP&A load file"
        dek="One row per period, unit, cost center, account, component and currency, with heads, FTE and the version's facts on every row, so the file stands alone."
        actions={
          e.versions.length > 1 && shown ? (
            <Segmented
              label="Version the load file reads"
              value={shown}
              options={e.versions.map((v) => ({ value: v.versionId, label: v.label }))}
              onChange={(id) => setPicks(picksForVersion(ctx, { compare }, id))}
            />
          ) : undefined
        }
      >
        {choices.map((c) => (
          <div
            key={c.label}
            className="col-span-12 flex flex-wrap items-center gap-x-4 gap-y-1 md:col-span-6"
          >
            <Button size="sm" disabled={!!c.disabled} onClick={() => download(c)}>
              {c.label}
            </Button>
            <p className="min-w-0 basis-full text-small text-ink-2">{c.disabled ?? c.note}</p>
          </div>
        ))}
      </Section>
      <Grid>
        {e.totals && (
          <Figure
            id="finance-export-totals"
            metric={PLAN.costLoaded}
            definitions={defsOf(ctx, PLAN.costLoaded)}
            uses={e.totals.uses}
            title={e.totals.title}
            subtitle={e.totals.subtitle}
            data={e.totals.rows}
            columns={e.totals.columns}
            empty={e.totals.empty}
            note={e.totals.note ?? undefined}
            tableOnly
            tableToggle={false}
            image={false}
          />
        )}
        {e.components && (
          <Figure
            id="finance-export-components"
            metric={PLAN.costLoaded}
            definitions={defsOf(ctx, PLAN.costLoaded)}
            uses={e.components.uses}
            title={e.components.title}
            subtitle={e.components.subtitle}
            data={e.components.rows}
            columns={e.components.columns}
            empty={e.components.empty}
            tableOnly
            tableToggle={false}
            image={false}
          />
        )}
        {e.preview && (
          <Figure
            id="finance-export-preview"
            metric={PLAN.costLoaded}
            definitions={defsOf(ctx, PLAN.costLoaded)}
            uses={e.preview.uses}
            title={e.preview.title}
            subtitle={e.preview.subtitle}
            data={e.preview.rows}
            columns={e.preview.columns}
            empty={e.preview.empty}
            note={e.preview.note ?? undefined}
            tableOnly
            tableToggle={false}
            image={false}
          />
        )}
      </Grid>
    </>
  )
}
