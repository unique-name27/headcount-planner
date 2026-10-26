/**
 * Every sentence the modes add (docs/PLAN.md 8.1 to 8.4 and 14.3). The two "not security" lines are
 * used verbatim wherever modes are explained: the Mode menu, Settings > Mode, the mode-change toast
 * and the `modes` help article (which ends with `NOT_SECURITY_LONG`). Tests keep every policy
 * reason, mode line, export line, pick prompt and help sentence about modes free of em dashes and of
 * `BANNED_MODE_WORDS` (only the `about-server` article is exempt), and keep `BANNED_HASH_WORDS` out
 * of everything, README included.
 *
 * Pure. Frozen in the M2 freeze (docs/CONTRACTS-M2.md). The constants and the one-line sentences are
 * PLAN's text, built in the freeze; the access builder added the rest (toasts, pick prompts, the
 * clamp's notes and `reportModeLine`).
 */
import { APP_NAME } from '@/app/brand'
import type { Mode } from '@/data/schema'
import { HOME_LABEL, MODE_LABEL, MODE_NAME } from './modes'

/* ───────────── what modes are (14.3) ───────────── */

export const NOT_SECURITY_SHORT =
  'Modes, Acting as and approvals change what Headcount Planner shows, not who can see the data.'

export const NOT_SECURITY_LONG =
  'Modes and Acting as shape Headcount Planner for how you use it. They are not security: anyone using it can switch modes or pick who they act as, and every mode reads the same data in this browser. Share Headcount Planner and its files only with people who may see all of it.'

/** Words no copy may use about modes (14.3), matched as substrings, lower case. */
export const BANNED_MODE_WORDS: readonly string[] = [
  'access',
  'permission',
  'restricted',
  'secure',
  'locked down',
  'authorized',
  'role-based access',
]

/** Words no copy anywhere may use about hashes and checksums (5.5, 14.3): they catch damage, not forgery. */
export const BANNED_HASH_WORDS: readonly string[] = ['tamper-proof', 'tamperproof', 'tamper proof']

/**
 * The only help article exempt from the banned-words scan (14.2): pinned to exactly `about-server`,
 * which must itself use a banned word (so the exemption is not stale). No tour is exempt.
 */
export const BANNED_WORDS_EXEMPT: { readonly articles: readonly ['about-server'] } = Object.freeze({
  articles: ['about-server'] as const,
})

/** "HRBP mode", "HR admin mode": the mode inside a sentence. */
export const modeName = (mode: Mode): string => `${MODE_NAME[mode]} mode`

/* ───────────── hidden routes (8.3) ───────────── */

/** "Forecast is not shown in Manager mode". */
export const hiddenPageTitle = (page: string, mode: Mode): string =>
  `${page} is not shown in ${modeName(mode)}`
/** "Finance, Export is not shown in HRBP mode". */
export const hiddenTabTitle = (view: string, tab: string, mode: Mode): string =>
  `${view}, ${tab} is not shown in ${modeName(mode)}`
/** "Headcount Planner opened My team instead." */
export const openedInstead = (mode: Mode): string => `${APP_NAME} opened ${HOME_LABEL[mode]} instead.`
/** "Headcount Planner opened Gap instead." */
export const openedTabInstead = (tab: string): string => `${APP_NAME} opened ${tab} instead.`
export const CHANGE_MODE = 'Change mode'

/* ───────────── records and scope ───────────── */

/** The limited position card's line: "Outside Silicon Engineering." */
export const outsideScope = (scope: string): string => `Outside ${scope}.`
/** "12 records outside Dana Ito's org are not listed." */
export const recordsOutside = (n: number, scope: string): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? 'record' : 'records'} outside ${scope} ${n === 1 ? 'is' : 'are'} not listed.`
/** "These records are not shown in Finance mode." */
export const kindNotShown = (mode: Mode): string => `These records are not shown in ${modeName(mode)}.`

/* ───────────── pay and free text (7.5, 8.4) ───────────── */

/** The masthead tag while HR admin's switch is on: "Pay amounts shown · Hide". */
export const PAY_SHOWN_TAG = 'Pay amounts shown'
export const HIDE_PAY = 'Hide'

/**
 * The hint under every free-text box (8.4 rule 5). The amount refusals are the engine's
 * (src/plan/engine/requests.ts `AMOUNT_COMMENT_NOTE`, `REMOVE_AMOUNT_TEXT`), not repeated here.
 */
export const FREE_TEXT_HINT = 'Do not include pay, performance or health details.'

/* ───────────── exports (14.1, 14.3) ───────────── */

/** Finance's export line. */
export const FINANCE_EXPORT_LINE =
  'Cost amounts cover groups of 5 or more costed people. Individual pay is left out.'

/** HRBP and Leader's export line. */
export const ROUNDED_EXPORT_LINE =
  'Cost amounts are rounded down to $0.1M per team, and groups under 5 are left out.'

/** Manager's export line, and every Export for a manager file's (for the chosen manager). */
export const managerExportLine = (name: string): string =>
  `Made in Manager mode for ${name}'s team. No amounts are included.`

/**
 * The mode line of every export header (14.1): "Made in HRBP mode for Silicon Engineering.",
 * "Made in Finance mode."; Manager's is `managerExportLine`.
 */
export const modeExportLine = (mode: Mode, scope?: string | null): string =>
  scope ? `Made in ${modeName(mode)} for ${scope}.` : `Made in ${modeName(mode)}.`

/**
 * The line Report a problem adds (14.2): the mode and the unit, never a person, position or
 * request ID: "Mode: HRBP (Silicon Engineering)", "Mode: Manager (manager set, name left out)".
 */
export function reportModeLine(mode: Mode, unit: string | null, picked: boolean): string {
  switch (mode) {
    case 'manager':
      return `Mode: Manager (${picked ? 'manager set, name left out' : 'no manager set'})`
    case 'leader':
      return `Mode: Leader (${picked ? 'leader set, name left out' : 'no leader set'})`
    case 'hrbp':
      return `Mode: HRBP (${unit || 'no unit set'})`
    default:
      return `Mode: ${MODE_LABEL[mode]}`
  }
}

/* ───────────── scopes and Acting as (8.2) ───────────── */

/** "Priya Raman's team": a Manager's scope. */
export const teamOf = (name: string): string => `${name}'s team`
/** "Dana Ito's org": a Leader's scope. */
export const orgOf = (name: string): string => `${name}'s org`

/** The scope line before a scoped mode's pick is made (its scope holds nobody). */
export const NO_PICK_LABEL: Readonly<Record<Mode, string>> = {
  manager: 'No manager picked',
  hrbp: 'No HRBP picked',
  leader: 'No leader picked',
  finance: 'Nobody picked for Finance mode',
  'hr-admin': 'Nobody picked for HR admin mode',
}

/** Writes wait for an Acting as pick in every mode (8.2). */
export const PICK_BEFORE_CHANGES = 'Pick who you act as before making changes.'

/** One Acting as picker's wording. */
export interface PickerCopy {
  title: string
  dek: string
  foot: string
  confirm: string
  /** The Mode menu's and Settings' "Change…" button. */
  change: string
  /** The Mode menu's line in place of the hint when nobody can be picked. */
  disabled: string
  /** The note at the top of the picker when the remembered pick is gone. */
  gone: (name: string) => string
}

const gone = (name: string): string => `${name} is not in the loaded data for this mode. Pick again.`
const CHANGE_PICK = 'Change who you act as…'

/** Each mode's Acting as picker. Acting as is a pick, not sign-in (`NOT_SECURITY_SHORT` sits beside it). */
export const PICKER_COPY: Readonly<Record<Mode, PickerCopy>> = {
  manager: {
    title: 'Act as a manager',
    dek: "Manager mode shows one manager's team: the positions below their own seat.",
    foot: 'Headcount Planner lists everyone who holds a seat another seat reports to.',
    confirm: 'Show their team',
    change: CHANGE_PICK,
    disabled: 'Needs manager positions in the Positions data.',
    gone,
  },
  hrbp: {
    title: 'Act as an HRBP',
    dek: "HRBP mode shows one business unit's plan and cycle.",
    foot: "Headcount Planner lists each unit's HR business partner from the Units list.",
    confirm: 'Show this unit',
    change: CHANGE_PICK,
    disabled: 'Needs an HR business partner for each unit on the Units list in Settings, Official lists.',
    gone,
  },
  leader: {
    title: 'Act as a leader',
    dek: "Leader mode shows one leader's org against its target. The CEO, CFO and CHRO see the whole company.",
    foot: 'Headcount Planner lists the holders of leader seats: Director and above, or marked on the Levels list.',
    confirm: 'Show their org',
    change: CHANGE_PICK,
    disabled: 'Needs leader seats (Director and above) in the Positions data.',
    gone,
  },
  finance: {
    title: 'Act as a Finance person',
    dek: 'Finance mode shows the whole company. Who you act as signs approvals and changes.',
    foot: 'Headcount Planner lists the Finance people on the Roles list, else every active employee.',
    confirm: 'Act as this person',
    change: CHANGE_PICK,
    disabled: 'Needs active employees in the Workers data.',
    gone,
  },
  'hr-admin': {
    title: 'Act as an HR admin',
    dek: 'HR admin mode shows everything. Who you act as signs imports and changes.',
    foot: 'Headcount Planner lists the HR admins on the Roles list, else every active employee.',
    confirm: 'Act as this person',
    change: CHANGE_PICK,
    disabled: 'Needs active employees in the Workers data.',
    gone,
  },
}

/** The toast title after a mode change without a pick to name: "Finance mode". */
export const modeToastTitle = (mode: Mode): string => modeName(mode)
/** The toast when leaving a scope whose values stay as ordinary filters. */
export const leftScopeDescription = (scope: string): string => `The filters still show ${scope}.`
export const WHOLE_COMPANY = 'Whole company'
export const WHOLE_TEAM = 'Whole team'
export const WHOLE_ORG = 'Whole org'
export const WHOLE_UNIT = 'Whole business unit'
/** The toast description entering Finance mode. */
export const FINANCE_FILTERS_NOTE =
  'Finance mode filters by unit, cost center, legal entity, country and currency, include only.'

/** The clamp's toast for a link or saved view whose filters left the scope (`clampReason`). */
export const leaderLeftOut = (mode: Mode, scope: string, from: 'link' | 'view'): string =>
  `${modeName(mode)} shows ${scope}, so the ${from === 'view' ? 'saved view' : 'link'}'s leader outside it was left out.`
export const unitsLeftOut = (mode: Mode, scope: string, from: 'link' | 'view'): string =>
  `${modeName(mode)} shows ${scope}, so the ${from === 'view' ? 'saved view' : 'link'}'s other business units were left out.`
export const outsideLeftOut = (mode: Mode, scope: string, from: 'link' | 'view'): string =>
  `${modeName(mode)} shows ${scope}, so the ${from === 'view' ? 'saved view' : 'link'}'s filters outside it were left out.`
export const financeLeftOut = (from: 'link' | 'view'): string =>
  `Finance mode filters by unit, cost center, legal entity, country and currency, so the ${from === 'view' ? 'saved view' : 'link'}'s other filters were left out.`
