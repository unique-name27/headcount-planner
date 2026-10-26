/**
 * Settings > Mode, the first section (the template app's access/ui ModeSection; docs/PLAN.md 8.1
 * and 8.2): the Mode menu's grouped radio list, the long wording that modes are not security as the
 * intro, and who the mode acts as with "Change who you act as". Under the pick, `NOT_SECURITY_SHORT`,
 * as on the Mode menu and the mode-change toast (8.2: Acting as is a pick, not sign-in).
 */
import { NO_PICK_LABEL, NOT_SECURITY_LONG, NOT_SECURITY_SHORT, PICKER_COPY } from '@/access/copy'
import { openPicker } from '@/access/store'
import { Button } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { actingAsLine } from '../copy'
import { ModeChoices } from '../ModeMenu'
import { SettingsBlock } from './ui'

export function ModeSection() {
  const { access } = useAnalytics()
  // The mode as the page shows it, so the line names the pick on screen.
  const name = access.unset ? null : access.actingAs?.name
  return (
    <SettingsBlock section="mode" intro={NOT_SECURITY_LONG}>
      <ModeChoices />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-small text-ink">{name ? actingAsLine(name) : NO_PICK_LABEL[access.mode]}</span>
        <Button size="sm" onClick={() => openPicker(access.mode)}>
          {PICKER_COPY[access.mode].change}
        </Button>
      </div>
      <p className="text-meta leading-snug text-muted">{NOT_SECURITY_SHORT}</p>
    </SettingsBlock>
  )
}
