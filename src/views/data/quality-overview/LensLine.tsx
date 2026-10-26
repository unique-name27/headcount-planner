/**
 * The quality lens on one number (the template app's LensLine.tsx, with its exports and props): when
 * "Show data quality" is on, a quiet block saying the number's tier, the field limiting it and what
 * holds it there, and "Definition changed" when the dictionary holds a change to it. Nothing renders
 * while the lens is off, in the Data room, or for a number that names no data.
 */
import type { ReactNode } from 'react'
import { useCurrentView } from '@/components/currentView'
import { MedalGlyph } from '@/components/tier/TierBadge'
import { withoutTierPrefix } from '@/components/tier/tierModel'
import { cx } from '@/components/ui'
import { useAnalyticsIfAny } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import { TIER_LABEL } from '@/data/quality/tier'
import { DefinitionChangedMark } from '@/views/data/metrics/ui/EditDefinition'
import { useLensOn } from './lens'

export type LensVariant = 'tile' | 'figure' | 'finding'

export interface QualityLensLineProps {
  /** The fields the number declares; the metric's registered `uses` when it declares none. */
  uses?: readonly FieldRef[]
  /** The metric dictionary entry, for its lineage and "Definition changed". */
  metricId?: string
  /** What the number is, for the drill panel's title. */
  label: string
  variant: LensVariant
  /** Say the tier in words (figure footers); tiles and findings already show their badge beside it. */
  showTier?: boolean
  /** Mark a changed definition (default true); tiles, figures and findings carry their own mark and turn it off. */
  showChanged?: boolean
  className?: string
}

export function QualityLensLine({
  uses,
  metricId,
  label,
  variant,
  showTier = false,
  showChanged = true,
  className,
}: QualityLensLineProps): ReactNode {
  const on = useLensOn()
  const view = useCurrentView()
  const ctx = useAnalyticsIfAny()
  if (!on || !ctx || !view || view.key === 'data') return null
  const fields = uses?.length ? uses : metricId ? ctx.metrics.usesOf(metricId) : []
  const fallback = view.datasets ?? []
  if (!fields.length && !fallback.length) return null
  const limiting = ctx.quality.limitingOf(fields, fallback)
  const explain = withoutTierPrefix(ctx.quality.explainOf(fields, fallback))
  return (
    <div
      className={cx(
        'mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-label text-muted',
        variant === 'figure' && 'text-meta',
        className,
      )}
    >
      <span className="sr-only">Data quality for {label}:</span>
      {showTier && (
        <span className="inline-flex items-center gap-1 font-medium text-ink-2">
          <MedalGlyph tier={limiting.tier} className="size-3" />
          {TIER_LABEL[limiting.tier]}
        </span>
      )}
      <span>{explain}</span>
      {showChanged && metricId && <DefinitionChangedMark metricId={metricId} />}
    </div>
  )
}
