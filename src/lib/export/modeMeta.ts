/**
 * The mode lines every export carries (docs/PLAN.md 14.1 item 1 and 14.3): "Made in HRBP mode for
 * Silicon Engineering." with the rounded modes' cost line, "Cost amounts are rounded down to $0.1M
 * per team, and groups under 5 are left out."; "Made in Finance mode." with "Cost amounts cover
 * groups of 5 or more costed people. Individual pay is left out."; Manager's "Made in Manager mode
 * for Priya Raman's team. No amounts are included." (no cost line: there are no amounts); and HR
 * admin's "Made in HR admin mode.", or "Made in HR admin mode with pay amounts shown." while Show pay
 * amounts is on (no cost line: the Rounding fact says which rules the amounts follow). A leader with
 * no scope of their own (CEO, CFO, CHRO) reads "Made in Leader mode for the whole company.". Figure
 * exports (`useExportMeta`) and view exports both take them from here, so a sheet, a slide, a CSV
 * and an image say the same. Pure.
 *
 * Lead decision D-MODELINE (M4 review CP-1, EX-8): every output names its mode, HR admin's included;
 * the template app's "nothing in HR admin" reading is gone.
 *
 *   const meta = { ...viewMeta, ...modeMeta(ctx.access) }
 */

import type { AccessContext } from '@/access/context'
import { FINANCE_EXPORT_LINE, managerExportLine, modeExportLine, ROUNDED_EXPORT_LINE } from '@/access/copy'
import type { ExportMeta } from '@/charts/types'

type ModeAccess = Pick<AccessContext, 'mode' | 'scope' | 'unset'> &
  Partial<Pick<AccessContext, 'actingAs' | 'switchOn'>>

/** The scope a leader's line names when they hold none: a company-wide leader's (CEO, CFO, CHRO). */
export const WHOLE_COMPANY_SCOPE = 'the whole company'

/** HR admin's mode line: "Made in HR admin mode.", "Made in HR admin mode with pay amounts shown.". */
export function hrAdminExportLine(switchOn: boolean): string {
  const line = modeExportLine('hr-admin')
  return switchOn ? `${line.replace(/\.$/, '')} with pay amounts shown.` : line
}

/**
 * The scope a mode line names: the scope's label; "the whole company" for a leader whose pick is set
 * and who holds no scope (a company-wide leader); none while the pick is missing or gone.
 */
function scopeOfLine(access: ModeAccess): string | null {
  if (access.unset) return null
  if (access.scope?.label) return access.scope.label
  return access.mode === 'leader' && !access.scope ? WHOLE_COMPANY_SCOPE : null
}

/** The mode line and the mode's cost line. */
export function modeMeta(access: ModeAccess): Pick<ExportMeta, 'modeLine' | 'costLine'> {
  switch (access.mode) {
    case 'hr-admin':
      return { modeLine: hrAdminExportLine(!!access.switchOn) }
    case 'manager': {
      // The manager is the Acting as person (or the tree's root); a pick still to be made names nobody.
      const name =
        access.unset || !access.actingAs
          ? access.scope?.kind === 'tree' && !access.unset
            ? access.scope.rootName
            : null
          : access.actingAs.name
      return { modeLine: name ? managerExportLine(name) : modeExportLine('manager') }
    }
    case 'hrbp':
    case 'leader':
      return { modeLine: modeExportLine(access.mode, scopeOfLine(access)), costLine: ROUNDED_EXPORT_LINE }
    case 'finance':
      return { modeLine: modeExportLine('finance'), costLine: FINANCE_EXPORT_LINE }
  }
}
