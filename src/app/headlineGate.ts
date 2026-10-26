/**
 * The folder-tab headline under the data standard (the template app's headlineGate.ts). A headline
 * is a number like any KPI: below the standard it reads "—", drops its spark and says why, so a tab
 * never shows what the tiles on the page hide.
 *
 * Every headline comes from the view's own pure `headline(ctx)` (docs/PLAN.md 9.1's folder
 * headlines), which reads the view's model under the mode's guard; the shell never computes one.
 * A headline that throws (a view still being built, a model that fails on odd data) reads "—", so
 * one view never blanks the tab strip. A view still being built (its contract's stub; none is left
 * after M3) is expected and is not logged; any other failure goes to the console.
 */
import { gateFor, type TierGate } from '@/components/tier/tierModel'
import type { AnalyticsContext } from '@/data/context'
import type { DataStandard } from '@/data/quality/tier'
import type { QualityIndex } from '@/data/quality/types'
import type { DatasetKey } from '@/data/schema'
import { DASH } from '@/lib/format'
import { timed } from '@/lib/timing'
import type { Headline, ViewDef } from '@/views/types'

export interface GatedHeadline extends Headline {
  /** Why the number is hidden ("Not yet confirmed for production"); null when it is shown. */
  hidden: string | null
  gate: TierGate | null
}

export function gateHeadline(
  headline: Headline,
  quality: Pick<QualityIndex, 'limitingOf' | 'explainOf'>,
  standard: DataStandard,
  datasets: readonly DatasetKey[],
): GatedHeadline {
  const gate = gateFor(quality, standard, headline.uses, datasets)
  if (!gate || gate.shown) return { ...headline, hidden: null, gate }
  return {
    value: DASH,
    label: headline.label,
    ...(headline.uses ? { uses: headline.uses } : {}),
    hidden: gate.reason,
    gate,
  }
}

/** A contract stub's error (src/plan/notBuilt.ts `notBuilt`): that part is not in this build yet. */
export const isNotBuilt = (error: unknown): boolean =>
  error instanceof Error && error.message.endsWith(' is not built yet')

/** The headline when computing it fails: no number, no words. */
export const FAILED_HEADLINE: Headline = Object.freeze({ value: DASH, label: '' })

/** A view's headline; "—" when computing it fails, so one view never blanks the tab strip. */
export function safeHeadline(
  view: Pick<ViewDef, 'key' | 'headline'>,
  ctx: AnalyticsContext,
  onError: (key: string, err: unknown) => void = (key, err) => {
    if (!isNotBuilt(err)) console.error(`Headline for ${key} failed`, err)
  },
): Headline {
  try {
    return timed(`hcp:headline:${view.key}`, () => view.headline(ctx))
  } catch (err) {
    onError(view.key, err)
    return FAILED_HEADLINE
  }
}

/** Every folder tab's headline, gated on the data standard. */
export function folderHeadlines(
  views: readonly Pick<ViewDef, 'key' | 'headline' | 'datasets'>[],
  ctx: AnalyticsContext,
  onError?: (key: string, err: unknown) => void,
): GatedHeadline[] {
  return views.map((v) => gateHeadline(safeHeadline(v, ctx, onError), ctx.quality, ctx.standard, v.datasets))
}
