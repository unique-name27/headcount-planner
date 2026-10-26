/**
 * Settings > Privacy (the template app's PrivacySection.tsx; docs/PLAN.md 7): "Show pay amounts"
 * for this session, in HR admin only (`pay:switch`), and what this mode shows of cost, in the mode's
 * own export line. The switch lasts for the session only and turns off on every mode change.
 */
import { FINANCE_EXPORT_LINE, ROUNDED_EXPORT_LINE } from '@/access/copy'
import { Switch } from '@/components/ui'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { useStore } from '@/data/store'
import { plural } from '@/lib/format'
import { Field, SettingsBlock } from './ui'

export const PAY_SWITCH_HINT =
  'Amounts tied to one person or one seat, in every view and download. This lasts for this session only: amounts are hidden again on a mode change and the next time Headcount Planner opens.'

/** What the mode shows of cost, in a sentence (the guard's mode, docs/PLAN.md 7.1). */
export function costLine(ctx: Pick<AnalyticsContext, 'guard'>): string {
  switch (ctx.guard.mode) {
    case 'none':
      return 'This mode shows heads and status words only, never an amount.'
    case 'rounded':
      return ROUNDED_EXPORT_LINE
    case 'exact':
      return FINANCE_EXPORT_LINE
    case 'open':
      return 'Pay amounts are shown: every amount, per person and per seat, with no minimum group.'
  }
}

/** The smallest group a number covers, in a sentence. */
export const minimumLine = (min: number): string =>
  `Numbers about fewer than ${plural(min, 'person', 'people')} read "—", and smaller groups fold into "Other".`

export function PrivacySection() {
  const ctx = useAnalytics()
  const showPay = useStore((s) => s.showPay)
  const setShowPay = useStore((s) => s.setShowPay)
  const pay = ctx.access.can('pay:switch')
  return (
    <SettingsBlock section="privacy" intro={`${costLine(ctx)} ${minimumLine(ctx.guard.rules.minCosted)}`}>
      {pay && (
        <Field label="Pay amounts" hint={PAY_SWITCH_HINT}>
          <Switch checked={showPay} onChange={setShowPay} label="Show pay amounts for this session" />
        </Field>
      )}
    </SettingsBlock>
  )
}
