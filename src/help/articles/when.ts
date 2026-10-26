/**
 * The conditions help text shares (PLAN 14.2): which modes a block, a list item or a tour step is
 * written for, named by what those modes show, never by mode names, so a policy change moves the
 * text with the page. `holds` in '../access' reads them; the comment on each says which modes it
 * picks today (src/access/ids.ts `PLAN_GRID` letters: Manager, HRBP, Leader, Finance, HR admin).
 *
 * Frozen in the M4 freeze (docs/CONTRACTS-M4.md): written in full; help-views and help-trust use
 * them and may combine them (`{ ...ROUNDED, scoped: true }`); a new shared condition is a note for
 * the lead.
 */
import type { Condition } from '../types'

/* ───────────── one mode ───────────── */

/** Manager mode: My team is its home (view:team SHHHH). */
export const MANAGER: Condition = { surface: 'view:team' }

/** HRBP mode: rounded cost and Working seat edits (pay:rounded HLLHH with action:position.edit HLHHS). */
export const HRBP: Condition = { surface: ['pay:rounded', 'action:position.edit'] }

/** Leader mode: rounded cost without seat edits. */
export const LEADER: Condition = { surface: 'pay:rounded', unless: 'action:position.edit' }

/** Finance mode: exact totals without the Data room (pay:exact HHHLS). */
export const FINANCE: Condition = { surface: 'pay:exact', unless: 'page:data' }

/** HR admin mode: the Data room (page:data HHHHS). */
export const HR_ADMIN: Condition = { surface: 'page:data' }

/* ───────────── groups of modes ───────────── */

/** The role homes: HRBP, Leader and Finance (view:home HSSSH). */
export const ROLE_HOME: Condition = { surface: 'view:home' }

/** Every mode but HR admin (the Data room hidden). */
export const NO_DATA_ROOM: Condition = { unless: 'page:data' }

/** Amounts of any kind show: every mode but Manager (cost:band HSSSS). */
export const AMOUNTS: Condition = { surface: 'cost:band' }

/** No amounts anywhere: Manager mode (7.6). Text about amounts goes under `AMOUNTS`. */
export const NO_AMOUNTS: Condition = { unless: 'cost:band' }

/** Rounded cost, $0.1M per team at QTD, YTD and full year: HRBP and Leader (pay:rounded HLLHH). */
export const ROUNDED: Condition = { surface: 'pay:rounded' }

/** Exact totals, monthly cost and components: Finance and HR admin (cost:monthly HHHSS). */
export const EXACT: Condition = { surface: 'cost:monthly' }

/** "Show pay amounts": HR admin (pay:switch HHHHS). */
export const PAY_SWITCH: Condition = { surface: 'pay:switch' }

/** One leave count for the whole scope: HRBP, Leader and HR admin (leave:counts HLLHS). */
export const LEAVE_COUNTS: Condition = { surface: 'leave:counts' }

/** No leave anywhere: Manager and Finance (16.1). */
export const NO_LEAVE: Condition = { unless: 'leave:counts' }

/**
 * The modes that keep to a scope while they hold one: Manager (a team), HRBP (a unit), Leader (an
 * org; not the CEO, CFO or CHRO, who see the company).
 */
export const SCOPED: Condition = { hidden: 'ui:kpi-delta-company', scoped: true }

/** The modes that raise requests: Manager, HRBP, Leader and HR admin (tab:requests.new LSLHS). */
export const RAISES_REQUESTS: Condition = { surface: 'tab:requests.new' }

/** The modes that see the queue: every mode but Manager (tab:requests.queue HLLLS). */
export const QUEUE: Condition = { surface: 'tab:requests.queue' }

/** Import requests: HRBP, Leader (limited), Finance and HR admin (action:request.import HSLSS). */
export const IMPORTS_REQUESTS: Condition = { surface: 'action:request.import' }

/** Export for a manager: HRBP, Leader (limited) and HR admin (action:export.for-manager HSLHS). */
export const FOR_MANAGER: Condition = { surface: 'action:export.for-manager' }

/** Replace or Merge from a Full file: HR admin (action:workspace.import HHHHS). */
export const WORKSPACE_IMPORT: Condition = { surface: 'action:workspace.import' }

/** What if: HRBP, Leader, Finance (limited) and HR admin (view:whatif HSSLS). */
export const WHAT_IF: Condition = { surface: 'view:whatif' }

/** Forecast and Targets: every mode but Manager (view:forecast HLLSS). */
export const FORECAST: Condition = { surface: 'view:forecast' }

/** The Finance view: HRBP (read only), Finance and HR admin (view:finance HLHSS). */
export const FINANCE_VIEW: Condition = { surface: 'view:finance' }

/** The FP&A load file: Finance (limited) and HR admin (tab:finance.export HHHLS). */
export const LOAD_FILE: Condition = { surface: 'tab:finance.export' }

/** The Audit page: every mode but Manager (page:audit HLLLS). */
export const AUDIT: Condition = { surface: 'page:audit' }

/** Working seat edits: HRBP (limited) and HR admin (action:position.edit HLHHS). */
export const SEAT_EDITS: Condition = { surface: 'action:position.edit' }

/** Runs the planning cycle: Finance and HR admin (action:cycle.lock HHHSS). */
export const RUNS_CYCLE: Condition = { surface: 'action:cycle.lock' }
