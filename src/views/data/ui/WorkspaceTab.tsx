/**
 * The Workspace tab (docs/PLAN.md 5.5): the workspace files HR admin saves and brings in, the same
 * items as the masthead's Workspace menu (../engine/menu.ts `workspaceMenuOf`): Save a Shareable
 * file, Export requests, Export for a manager (with a manager picker), the Full file ("Contains
 * individual pay", with Show pay amounts on), Open a shared file, Import requests (the sample's six
 * manager files among them) and Import with its diff, then Replace or Merge. Below them, what each
 * file holds and who can make it. Checksums catch damage, not forgery, and every file but Full holds
 * only what the exporting mode shows.
 *
 * When the sample changed with this version and a plan state made on the earlier sample was set
 * aside (lead browser finding B9, src/app/planState.ts), the tab opens with it: the notice, and a
 * button that saves it as a Full file (HR admin with Show pay amounts on); once saved, the kept copy
 * can be removed.
 */
import { useMemo, useState } from 'react'
import { samplePlan } from '@/app/boot'
import { clearAside, earlierSampleOf, SAMPLE_CHANGED_NOTICE, usePlan } from '@/app/planState'
import { usePlanWrite } from '@/app/write/usePlanWrite'
import { type Column, Figure } from '@/charts'
import { Grid, Section } from '@/components'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { onSample, useStore } from '@/data/store'
import type { DataRoomModel } from '../engine'
import { workspaceMenuOf } from '../engine/menu'
import { EARLIER_SAMPLE_LABEL, earlierSampleFile, FULL_NEEDS_PAY_TEXT } from '../engine/workspace'
import { ID } from '../roomMetrics'
import { save, useWorkspaceChoice, WorkspaceItem } from './WorkspaceMenu'

interface FileRow {
  [key: string]: unknown
  file: string
  holds: string
  madeIn: string
}

const FILES: readonly FileRow[] = [
  {
    file: 'Shareable',
    holds: 'What the exporting mode and Acting as person see, already through the cost guard',
    madeIn: 'Every mode',
  },
  { file: 'Full', holds: 'Everything, individual pay included', madeIn: 'HR admin with pay amounts shown' },
  {
    file: 'Requests',
    holds: 'Requests with their steps and comments, for merging back',
    madeIn: 'Every mode',
  },
  {
    file: 'Export for a manager',
    holds: 'A Shareable file built as Manager mode acting as the manager picked: no amounts at all',
    madeIn: 'HRBP, Leader (managers in the org) and HR admin',
  },
]

const COLUMNS: readonly Column<FileRow>[] = [
  { key: 'file', label: 'File' },
  { key: 'holds', label: 'What it holds' },
  { key: 'madeIn', label: 'Made in' },
]

/** The plan state set aside when the sample changed (B9): the notice and its Full file. */
function EarlierSample() {
  const ctx = useAnalytics()
  const write = usePlanWrite()
  const stored = usePlan((s) => s.stored)
  const audit = usePlan((s) => s.audit)
  const kept = usePlan((s) => s.aside)
  const sampleOn = useStore((s) => onSample(s.sources))
  const [saved, setSaved] = useState(false)
  const aside = earlierSampleOf({ stored, audit, aside: kept }, sampleOn ? samplePlan() : null)
  if (!aside) return null
  const go = () => {
    if (save(earlierSampleFile(ctx, aside, new Date().toISOString()))) setSaved(true)
  }
  return (
    <Section title={EARLIER_SAMPLE_LABEL} dek={SAMPLE_CHANGED_NOTICE.title} className="mb-6">
      <div className="col-span-full flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={!ctx.showPay} onClick={go}>
          Save them as a Full file
        </Button>
        {saved && aside.at && (
          <Button
            size="sm"
            variant="ghost"
            disabled={write.readOnly}
            onClick={() => {
              setSaved(false)
              void clearAside(aside.baselineId)
            }}
          >
            Remove the kept copy
          </Button>
        )}
        {!ctx.showPay && <span className="text-label text-ink-2">{FULL_NEEDS_PAY_TEXT}</span>}
      </div>
    </Section>
  )
}

export function WorkspaceTab({ model }: { model: DataRoomModel }) {
  const ctx = useAnalytics()
  const write = usePlanWrite()
  const menu = useMemo(() => workspaceMenuOf(ctx), [ctx])
  const { busy, choose } = useWorkspaceChoice()
  const items = (list: typeof menu.save) => (
    <ul className="col-span-full grid gap-1 sm:grid-cols-2">
      {list.map((it) => (
        <WorkspaceItem
          key={it.key}
          item={it}
          blocked={write.blocked}
          busy={busy === it.key}
          onChoose={choose}
        />
      ))}
    </ul>
  )
  return (
    <>
      <EarlierSample />
      <Section
        title="Save a file"
        dek="Each file is saved to your computer. Only the Full file holds individual pay."
      >
        {items(menu.save)}
      </Section>
      <Section
        title="Open or bring in a file"
        dek="Opening a file merges nothing. Imports show what they would change before anything is written."
        className="mt-6"
      >
        {items(menu.bring)}
      </Section>
      <Grid className="mt-6">
        <Figure
          id="data-workspace"
          metric={ID.qualityMetricTiers}
          uses={[]}
          title="Workspace files"
          subtitle={model.workspace.note}
          data={FILES}
          columns={COLUMNS}
          note="Each file carries a checksum, so damage shows; a checksum does not prove who made a file."
          gate={false}
          tableOnly
        />
      </Grid>
    </>
  )
}
