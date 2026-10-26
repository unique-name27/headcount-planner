/**
 * Writing workspace files `.hcplan.json` (docs/PLAN.md 5.5, change C30). Built by engines C in M1.
 * Pure: the caller writes the bytes.
 *
 * Every file but Full is built from the guarded models it is given, never from the PlanStore:
 *  - Shareable (any mode): only what the exporting mode and Acting as person see, already through the
 *    guard (requests by `requestView`, comments by `commentVisible`, audit rows by `auditView`,
 *    versions and closes by reference, model values exactly as on screen), no pay or leave field;
 *  - Full (HR admin with "Show pay amounts" on): everything; its first line says "Contains individual
 *    pay";
 *  - Requests ("Export requests"): requests whose `requestView` is 'full', with steps and comments;
 *    Manager-mode files hold no amounts;
 *  - Export for a manager: a Shareable made exactly as Manager mode acting as that manager (header mode
 *    'manager').
 * Every file made in Manager mode (a manager's own Shareable or Requests file, and Export for a
 * manager) names its mode on its first line: `modeLine`, the Manager export line for the acting
 * manager ("Made in Manager mode for Aditya Joshi's team. No amounts are included.", D-MODELINE).
 * Checksums catch damage, not forgery.
 *
 * As a last check, a Shareable or Requests slice that holds a per-person pay or leave field (a
 * dataset field flagged `pay` or `leave`), a figure column flagged `pay` (one person's amount, HR
 * admin with Show pay amounts on: D-PAYFILES, review EX-2) or a columnar line table (a typed array)
 * is refused: those belong in a Full file only.
 *
 * Full files and change C35 (docs/PLAN.md 15.2):
 *  - A locked version's line table is written by column, one array per field, with its amounts
 *    (the local and USD components) as integer cents under `cents`; heads, FTE, active and the rate
 *    stay exact under `numbers` (`encodeLineTable`). The lock hash reads amounts in integer cents
 *    (src/plan/engine/versions.ts `lockHash`), so a locked version read back from a Full file still
 *    verifies. The in-memory file holds the same cents (`buildWorkspaceFile` rounds them), so a file
 *    read back equals the file built. validate.ts still reads the earlier form (every number column
 *    exact under `numbers`) and line tables written as rows.
 *  - A month close's actual lines are written exact, as before: a close's hash reads every digit of
 *    its lines (src/plan/engine/close.ts `closeHash`), so rounding them would break it, and a close
 *    is a twentieth of a locked version.
 *  - The checksum is over the body exactly as written (cents included).
 *  - The import limit is 150 MB for a Full file and 25 MB for a Shareable or Requests file.
 */
import { APP_NAME, FILE_PREFIX } from '@/app/brand'
import { DATASETS, type Datasets, type ISODateTime, type Mode } from '@/data/schema'
import { sha256 } from '@/lib/sha256'
import { canonicalJson } from '../canonical'
import { PLAN_LINE_NUMBERS } from '../engine/lineTable'
import type {
  AnyVersion,
  FullFileNotice,
  LockedVersionRef,
  PlanLineNumber,
  PlanLineTable,
  PlanStateSlice,
  StringColumn,
  WorkspaceBody,
  WorkspaceFile,
  WorkspaceKind,
} from '../types'
import { isScopeKey } from './shared'

export const WORKSPACE_FORMAT = 'hcplan'
export const WORKSPACE_VERSION = 1
/** Shareable and Requests files over this size are refused on import (25 MB, C35). */
export const MAX_WORKSPACE_BYTES = 25 * 1024 * 1024
/** Full files over this size are refused on import (150 MB, C35). */
export const MAX_FULL_FILE_BYTES = 150 * 1024 * 1024

/** The import limit for a kind of file: 150 MB for a Full file, 25 MB for the others (C35). */
export const maxBytesOf = (kind: WorkspaceKind): number =>
  kind === 'full' ? MAX_FULL_FILE_BYTES : MAX_WORKSPACE_BYTES

/** A line table's amount columns: the local and USD components, written in Full files as integer cents. */
export const CENT_COLUMNS: readonly PlanLineNumber[] = PLAN_LINE_NUMBERS.filter(
  (k) => k.startsWith('local') || k.startsWith('usd'),
)

/** A line table's other number columns (heads, FTE, active, rate), written exact. */
export const EXACT_COLUMNS: readonly PlanLineNumber[] = PLAN_LINE_NUMBERS.filter(
  (k) => !CENT_COLUMNS.includes(k),
)

/** A locked version's line table as a Full file writes it (C35): amounts as integer cents. */
export interface CentLineTable {
  length: number
  versionId: string
  positionId: StringColumn
  holderId: StringColumn
  month: StringColumn
  status: StringColumn
  currency: StringColumn
  basis: StringColumn
  /** Heads, FTE, active and the rate, exact. */
  numbers: Readonly<Record<string, ArrayLike<number>>>
  /** The amount columns (`CENT_COLUMNS`), each value an integer number of cents. */
  cents: Readonly<Record<string, readonly number[]>>
}

/** An amount in integer cents, as the lock hash reads it (`-0` reads 0). */
const toCents = (x: number): number => Math.round(x * 100) || 0

/** A line table with its amounts rounded to the cent, as a Full file holds them (C35). */
export function centLines(t: PlanLineTable): PlanLineTable {
  const numbers = { ...t.numbers } as Record<PlanLineNumber, Float64Array>
  for (const k of CENT_COLUMNS) {
    const col = t.numbers[k]
    const out = new Float64Array(col.length)
    for (let i = 0; i < col.length; i++) out[i] = toCents(col[i]) / 100
    numbers[k] = out
  }
  return { ...t, numbers }
}

/** A line table as a Full file writes it: the amount columns as integer cents (C35). */
export function encodeLineTable(t: PlanLineTable): CentLineTable {
  const numbers: Record<string, ArrayLike<number>> = {}
  for (const k of EXACT_COLUMNS) numbers[k] = t.numbers[k]
  const cents: Record<string, number[]> = {}
  for (const k of CENT_COLUMNS) {
    const col = t.numbers[k]
    const out = new Array<number>(col.length)
    for (let i = 0; i < col.length; i++) out[i] = toCents(col[i])
    cents[k] = out
  }
  return {
    length: t.length,
    versionId: t.versionId,
    positionId: t.positionId,
    holderId: t.holderId,
    month: t.month,
    status: t.status,
    currency: t.currency,
    basis: t.basis,
    numbers,
    cents,
  }
}

/** A version's line table in memory: its number columns are typed arrays (never a file's parsed text). */
const isTableInMemory = (v: AnyVersion): v is Extract<AnyVersion, { state: 'locked' }> =>
  !!v &&
  v.state === 'locked' &&
  !!v.lines &&
  typeof v.lines === 'object' &&
  !Array.isArray(v.lines) &&
  ArrayBuffer.isView((v.lines as PlanLineTable).numbers?.localBase)

const written = new WeakMap<WorkspaceBody, unknown>()

/**
 * A body as its file writes it: a Full body's locked line tables in memory as `encodeLineTable`
 * writes them (C35); every other body, and a body parsed from a file's text, as it is.
 */
export function bodyAsWritten(body: WorkspaceBody): unknown {
  // A body parsed from a file may be any shape: only a Full body with tables in memory is encoded.
  const plan = body?.plan as Partial<Extract<PlanStateSlice, { kind: 'full' }>> | undefined
  const versions = plan?.kind === 'full' ? plan.state?.versions : undefined
  if (!plan?.state || !Array.isArray(versions) || !versions.some(isTableInMemory)) return body
  const hit = written.get(body)
  if (hit) return hit
  const out = {
    ...body,
    plan: {
      ...plan,
      state: {
        ...plan.state,
        versions: versions.map((v) => (isTableInMemory(v) ? { ...v, lines: encodeLineTable(v.lines) } : v)),
      },
    },
  }
  written.set(body, out)
  return out
}
/** A Full file's first line and its save dialog's note. */
export const FULL_FILE_NOTICE: FullFileNotice = 'Contains individual pay'

/**
 * Whether a text is the Manager export line a Manager-mode file carries (src/access/copy.ts
 * `managerExportLine`, or `modeExportLine('manager')` while no manager is picked): "Made in Manager
 * mode for <name>'s team. No amounts are included." with a name of 1 to 120 characters and no digit,
 * or "Made in Manager mode." (D-MODELINE). An amount check over the name is the reader's
 * (validate.ts `readWorkspace`'s `hasAmount`).
 */
export function managerModeLine(text: unknown): text is string {
  if (typeof text !== 'string') return false
  if (text === 'Made in Manager mode.') return true
  const m = /^Made in Manager mode for (.{1,120})'s team\. No amounts are included\.$/u.exec(text)
  return !!m && !/[\p{Nd}\p{Cc}]/u.test(m[1])
}
export const WORKSPACE_EXTENSION = '.hcplan.json'

/** The kinds, in the order the export menu lists them. */
export const WORKSPACE_KINDS: readonly WorkspaceKind[] = ['shareable', 'requests', 'full']

/**
 * Dataset fields that hold one person's pay or leave (`pay` or `leave` in src/data/schema.ts). They
 * never appear as a key in a Shareable or Requests slice.
 */
export const PERSONAL_FIELDS: ReadonlySet<string> = new Set(
  DATASETS.flatMap((d) => d.fields.filter((f) => f.pay || f.leave).map((f) => f.key)),
)

/**
 * 'sha256-<hex>' (src/lib/sha256.ts) over the canonical JSON (src/plan/canonical.ts) of the body as
 * its file writes it (`bodyAsWritten`: a Full body's locked line tables in integer cents).
 */
export function workspaceChecksum(body: WorkspaceBody): string {
  return `sha256-${sha256(canonicalJson(bodyAsWritten(body)))}`
}

export interface BuildFileInput {
  kind: WorkspaceFile['kind']
  savedAt: ISODateTime
  mode: Mode
  scopeLabel: string
  /** The scope identity the file is made for (`scopeKeyOf`); written to the header when given. */
  scopeKey?: string | null
  actingAs: boolean
  /** The slice: built from guarded models for Shareable and Requests (the caller passes what the mode shows). */
  plan: PlanStateSlice
  lockedVersions: readonly LockedVersionRef[]
  /** Full files only. */
  datasets?: Partial<Datasets>
  /**
   * The mode line a file made in Manager mode carries first (`managerExportLine` for the acting
   * manager, D-MODELINE); refused for any other mode.
   */
  modeLine?: string
}

/** A figure snapshot's column that holds one person's amount (`pay: true`, src/views/data/engine/snapshots.ts). */
const isPayColumn = (v: object): boolean =>
  (v as { pay?: unknown }).pay === true && typeof (v as { key?: unknown }).key === 'string'

/**
 * The first pay or leave key, figure column flagged `pay`, or typed array, anywhere in a value; null
 * when there is none. Model values (`models`) are the cost guard's output, keyed by figure and
 * column, so only typed arrays and pay columns are looked for there.
 */
function personalPath(v: unknown, path: string, seen: Set<object>, keys = true): string | null {
  if (v === null || typeof v !== 'object') return null
  if (ArrayBuffer.isView(v)) return `${path} (a line table column)`
  if (seen.has(v)) return null
  seen.add(v)
  if (!keys && !Array.isArray(v) && isPayColumn(v)) return `${path} (a pay column)`
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const hit = personalPath(v[i], `${path}[${i}]`, seen, keys)
      if (hit) return hit
    }
    return null
  }
  for (const key of Object.keys(v)) {
    const at = `${path}.${key}`
    if (keys && PERSONAL_FIELDS.has(key)) return at
    const hit = personalPath((v as Record<string, unknown>)[key], at, seen, keys && at !== 'plan.models')
    if (hit) return hit
  }
  return null
}

/**
 * A workspace file with its checksum. Throws when the kind and the slice's kind differ, when a
 * non-Full file is given datasets, or when a Full file is not made in HR admin mode. Also throws when
 * a Shareable or Requests slice holds a pay or leave field or a line table (see the module comment).
 */
export function buildWorkspaceFile(input: BuildFileInput): WorkspaceFile {
  if (input.plan.kind !== input.kind)
    throw new Error(`A ${input.kind} file needs a ${input.kind} slice, not a ${input.plan.kind} one.`)
  if (input.kind !== 'full' && input.datasets) throw new Error('Only a Full workspace file carries datasets.')
  if (input.kind === 'full' && input.mode !== 'hr-admin')
    throw new Error('A Full workspace file is made in HR admin mode only.')
  if (input.scopeKey != null && !isScopeKey(input.scopeKey))
    throw new Error('A scope key is written by scopeKeyOf (src/plan/workspace/shared.ts).')
  if (input.modeLine != null && (input.mode !== 'manager' || !managerModeLine(input.modeLine)))
    throw new Error('Only a file made in Manager mode carries a mode line, the Manager export line.')
  if (input.kind !== 'full') {
    const hit = personalPath(input.plan, 'plan', new Set())
    if (hit) throw new Error(`A ${input.kind} file cannot hold individual pay or leave (${hit}).`)
  }
  // A Full file holds its locked versions' amounts to the cent (C35), so the file built here and
  // the file read back from its text are the same.
  const plan: PlanStateSlice =
    input.plan.kind === 'full'
      ? {
          ...input.plan,
          state: {
            ...input.plan.state,
            versions: input.plan.state.versions.map((v) =>
              isTableInMemory(v) ? { ...v, lines: centLines(v.lines) } : v,
            ),
          },
        }
      : input.plan
  const body: WorkspaceBody = {
    ...(input.kind === 'full' && input.datasets ? { datasets: input.datasets } : {}),
    plan,
    lockedVersions: input.lockedVersions.map((r) => ({
      versionId: r.versionId,
      name: r.name,
      kind: r.kind,
      fiscalYear: r.fiscalYear,
      state: r.state,
      hash: r.hash,
    })),
  }
  return {
    format: WORKSPACE_FORMAT,
    version: WORKSPACE_VERSION,
    kind: input.kind,
    ...(input.kind === 'full' ? { notice: FULL_FILE_NOTICE } : {}),
    ...(input.modeLine ? { modeLine: input.modeLine } : {}),
    savedAt: input.savedAt,
    app: APP_NAME,
    mode: input.mode,
    scopeLabel: input.scopeLabel,
    ...(input.scopeKey ? { scopeKey: input.scopeKey } : {}),
    actingAs: input.actingAs,
    checksum: workspaceChecksum(body),
    body,
  }
}

/** JSON.stringify's replacer: typed-array columns as plain arrays of numbers. */
function plainArrays(_key: string, value: unknown): unknown {
  return ArrayBuffer.isView(value) && !(value instanceof DataView)
    ? Array.from(value as unknown as ArrayLike<number>)
    : value
}

/**
 * The file's text: JSON with `format` first (a Full file's `notice` before it, so its first line reads
 * "Contains individual pay", and a Manager-mode file's `modeLine` before it, so its first line names
 * the mode: D-MODELINE), two-space indent, typed-array columns written as plain arrays. The opening
 * brace shares the first line with the first key: `{ "notice": "Contains individual pay",`.
 *
 * A Full file's body is written on one line with no indent (its header keeps one key a line), its
 * locked line tables with their amounts in integer cents (C35): the sample's locked versions alone
 * hold about 110,000 lines of 18 number columns, which indented come to some 75 MB, and to about
 * 19 MB compact before C35. Shareable and Requests files stay indented throughout: they are small,
 * and one value a line keeps a list of counts from reading as one grouped number ("[1,234]") to
 * anyone scanning the text.
 */
export function serializeWorkspace(file: WorkspaceFile): string {
  const header = {
    ...(file.notice ? { notice: file.notice } : {}),
    ...(file.modeLine ? { modeLine: file.modeLine } : {}),
    format: file.format,
    version: file.version,
    kind: file.kind,
    savedAt: file.savedAt,
    app: file.app,
    mode: file.mode,
    scopeLabel: file.scopeLabel,
    ...(file.scopeKey ? { scopeKey: file.scopeKey } : {}),
    actingAs: file.actingAs,
    checksum: file.checksum,
  }
  if (file.kind === 'full') {
    const head = JSON.stringify(header, null, 2)
    const lines = head.slice(0, -2) // without the closing "\n}"
    const text = `${lines},\n  "body": ${JSON.stringify(bodyAsWritten(file.body), plainArrays)}\n}`
    return text.startsWith('{\n  ') ? `{ ${text.slice(4)}\n` : `${text}\n`
  }
  const text = JSON.stringify({ ...header, body: file.body }, plainArrays, 2)
  return text.startsWith('{\n  ') ? `{ ${text.slice(4)}\n` : `${text}\n`
}

/** A scope label or date as a file-name part: lower case, letters and digits joined by "-". */
const fileSafe = (s: string, max: number): string =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '')

/** "headcount-planner-<kind>-<scope>-<as-of>.hcplan.json", with the scope label made safe for a file name. */
export function workspaceFileName(file: WorkspaceFile, asOf: string): string {
  const scope = fileSafe(file.scopeLabel, 60) || 'all'
  const date = fileSafe(asOf.slice(0, 10), 10) || 'undated'
  return `${FILE_PREFIX}-${file.kind}-${scope}-${date}${WORKSPACE_EXTENSION}`
}
