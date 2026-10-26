/**
 * Excel templates and dataset exports (ExcelJS, loaded on demand).
 *
 * A template has one sheet per dataset with the field labels as headers (required ones marked
 * "*"), dropdowns for list fields, real Excel dates, approval steps as compact text, and two help
 * sheets: "Read me" and "Fields". A dataset export writes the same layout with the current rows,
 * so it can be edited and uploaded again unchanged.
 */
import type { DataValidation, Workbook, Worksheet } from 'exceljs'
import { APP_NAME } from '@/app/brand'
import { addListsSheet, type SheetList } from '../lists/sheet'
import {
  DATASET_KEYS,
  DATASETS,
  type DatasetDef,
  type DatasetKey,
  type Datasets,
  type FieldDef,
  LEVELS,
  type StepRow,
  VIEW_LABEL,
} from '../schema'
import { formatSteps, STEPS_EXAMPLE } from './steps'

type ExcelModule = typeof import('exceljs')

async function loadExcel(): Promise<ExcelModule> {
  const mod = await import('exceljs')
  // The browser bundle arrives as a CommonJS default export; Node also exposes named exports.
  return ((mod as unknown as { default?: ExcelModule }).default ?? mod) as ExcelModule
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const TYPE_LABELS: Record<FieldDef['type'], string> = {
  string: 'Text',
  id: 'ID',
  date: 'Date',
  datetime: 'Date and time',
  number: 'Number',
  percent: 'Percent',
  money: 'Amount',
  boolean: 'Yes or no',
  enum: 'List',
  level: 'Level',
  steps: 'Approval steps',
}

const NUM_FMT: Partial<Record<FieldDef['type'], string>> = {
  date: 'yyyy-mm-dd',
  datetime: 'yyyy-mm-dd hh:mm',
  percent: '0.0%',
  money: '#,##0',
}

const INK = 'FF1F2933'
const FILL_REQUIRED = 'FFDDE3EA'
const FILL_RECOMMENDED = 'FFE9EDF2'
const FILL_OPTIONAL = 'FFF4F6F8'
const RULE = 'FF9AA5B1'

/** Rows below the data that still get dropdowns, so new rows typed in the template validate too. */
const VALIDATION_SPARE_ROWS = 500

const headerLabel = (f: FieldDef) => (f.required ? `${f.label} *` : f.label)
const requirement = (f: FieldDef) => (f.required ? 'Required' : f.recommended ? 'Recommended' : 'Optional')

/**
 * An official list for a template column (Settings > Official lists): the dropdown offers its
 * active values from the hidden Lists sheet, through the workbook name.
 */
export type TemplateList = SheetList

/** Official lists by the field they fill (`dataset.field`). */
export type TemplateLists = Readonly<Record<string, TemplateList>>

const LEVEL_TITLES = 'Codes such as IC4 or L4 and titles such as Senior, Staff, Director or VP are converted.'

function allowedValues(f: FieldDef, official?: TemplateList): string {
  // The official list names the values; how other spellings are read still applies.
  if (official)
    return [
      `A value from the official ${official.label.toLowerCase()} list (${official.name} in this workbook).`,
      f.type === 'level' ? LEVEL_TITLES : '',
    ]
      .filter(Boolean)
      .join(' ')
  if (f.type === 'enum') return (f.values ?? []).join(', ')
  if (f.type === 'level') return `${LEVELS.join(', ')}. ${LEVEL_TITLES}`
  if (f.type === 'boolean') return 'Yes, No'
  if (f.type === 'steps')
    return `Steps separated by ";", each a role (Manager, HRBP, Leader or Finance), the approver's employee ID, the decision and its date: ${STEPS_EXAMPLE}.`
  return ''
}

function listFor(f: FieldDef): readonly string[] | null {
  if (f.type === 'enum') return f.values ?? null
  if (f.type === 'level') return LEVELS
  if (f.type === 'boolean') return ['Yes', 'No']
  return null
}

const ISO_DT = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/

/** A record value as an Excel cell value: dates as real dates, yes/no as words, steps as text. */
function toCell(f: FieldDef, v: unknown, payValues: boolean): string | number | Date | null {
  if (v == null || v === '') return null
  if (f.pay && !payValues) return null
  if ((f.type === 'date' || f.type === 'datetime') && typeof v === 'string') {
    const m = ISO_DT.exec(v)
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0)) : v
  }
  if (f.type === 'steps') return Array.isArray(v) ? formatSteps(v as StepRow[]) || null : String(v)
  if (f.type === 'boolean') return v === true ? 'Yes' : v === false ? 'No' : String(v)
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  return String(v)
}

function widthFor(f: FieldDef, rows: readonly Record<string, unknown>[]): number {
  if (f.type === 'date') return Math.max(12, headerLabel(f).length + 3)
  if (f.type === 'datetime') return Math.max(17, headerLabel(f).length + 3)
  if (f.type === 'steps') return 48
  let w = headerLabel(f).length + 3
  for (let i = 0; i < Math.min(rows.length, 200); i++) {
    const v = rows[i][f.key]
    if (v != null) w = Math.max(w, String(v).length + 2)
  }
  return Math.min(40, Math.max(10, w))
}

/** ExcelJS supports range validations through `worksheet.dataValidations`, which its typings omit. */
interface RangeValidations {
  dataValidations: { add(range: string, validation: DataValidation): void }
}

function columnLetter(n: number): string {
  let s = ''
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s
  return s
}

function styleHeaderRow(ws: Worksheet, fills: string[]): void {
  const row = ws.getRow(1)
  row.height = 20
  row.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: INK } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fills[col - 1] ?? FILL_OPTIONAL } }
    cell.alignment = { vertical: 'middle' }
    cell.border = { bottom: { style: 'thin', color: { argb: RULE } } }
  })
}

function addDatasetSheet(
  wb: Workbook,
  def: DatasetDef,
  fields: FieldDef[],
  rows: readonly Record<string, unknown>[],
  payValues: boolean,
  lists?: TemplateLists,
): Worksheet {
  const officialOf = (f: FieldDef) => lists?.[`${def.key}.${f.key}`]
  const ws = wb.addWorksheet(def.sheet, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = fields.map((f) => ({
    header: headerLabel(f),
    key: f.key,
    width: widthFor(f, rows),
    style: NUM_FMT[f.type] ? { numFmt: NUM_FMT[f.type] } : {},
  }))
  styleHeaderRow(
    ws,
    fields.map((f) => (f.required ? FILL_REQUIRED : f.recommended ? FILL_RECOMMENDED : FILL_OPTIONAL)),
  )
  fields.forEach((f, i) => {
    const allowed = allowedValues(f, officialOf(f))
    ws.getRow(1).getCell(i + 1).note = [
      f.description,
      `${requirement(f)}.`,
      allowed ? `Allowed: ${allowed}` : '',
    ]
      .filter(Boolean)
      .join(' ')
  })
  ws.addRows(rows.map((r) => fields.map((f) => toCell(f, r[f.key], payValues))))
  if (fields.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: fields.length } }

  const lastRow = rows.length + 1 + VALIDATION_SPARE_ROWS
  fields.forEach((f, i) => {
    const official = officialOf(f)
    const col = columnLetter(i + 1)
    if (official) {
      ;(ws as unknown as RangeValidations).dataValidations.add(`${col}2:${col}${lastRow}`, {
        type: 'list',
        allowBlank: true,
        formulae: [official.name],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: `Check ${f.label.toLowerCase()}`,
        error: `${APP_NAME} expects a value from the official ${official.label.toLowerCase()} list. Other values are checked when you upload.`,
      })
      return
    }
    const list = listFor(f)
    if (!list) return
    ;(ws as unknown as RangeValidations).dataValidations.add(`${col}2:${col}${lastRow}`, {
      type: 'list',
      allowBlank: true,
      formulae: [`"${list.join(',')}"`],
      showErrorMessage: true,
      errorStyle: 'warning',
      errorTitle: `Check ${f.label.toLowerCase()}`,
      error: `${APP_NAME} expects one of: ${list.join(', ')}. Other values are checked when you upload.`,
    })
  })
  return ws
}

function addFieldsSheet(wb: Workbook, defs: DatasetDef[], includePay: boolean, lists?: TemplateLists): void {
  const ws = wb.addWorksheet('Fields', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Sheet', key: 'sheet', width: 18 },
    { header: 'Column', key: 'column', width: 26 },
    { header: 'Requirement', key: 'requirement', width: 14 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Allowed values', key: 'allowed', width: 48 },
    { header: 'Description', key: 'description', width: 80 },
    { header: 'Pay amount', key: 'pay', width: 12 },
  ]
  styleHeaderRow(ws, [])
  for (const def of defs)
    for (const f of def.fields) {
      if (f.pay && !includePay) continue
      ws.addRow({
        sheet: def.sheet,
        column: headerLabel(f),
        requirement: requirement(f),
        type: TYPE_LABELS[f.type],
        allowed: allowedValues(f, lists?.[`${def.key}.${f.key}`]),
        description: f.description,
        pay: f.pay ? 'Yes' : '',
      })
    }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } }
}

const GUIDANCE = [
  'Keep the header row as it is. Columns marked * are required; rows without them are skipped and listed in the import log.',
  'Dates can be real Excel dates or text such as 2026-09-30. Day-first dates (30/09/2026) are detected per column.',
  'Percentages can be typed as 3.5% or 0.035. A column of whole numbers such as 3.5 is read as 3.5%.',
  'Yes or no columns accept Yes, No, Y, N, True, False, 1 and 0.',
  'Levels use P1-P6, M1-M2 and E1-E3. Codes such as IC4 or L4 and titles such as Senior, Director and VP are converted.',
  'FTE is a share of full time: 1 is full time, 0.5 half. 80 or 80% is read as 0.8.',
  'Base salary and offer base are full-time rates, not part-time pay.',
  'Approval steps are one cell per request: Manager E10234 Approved 2026-08-03; HRBP E10077 Pending.',
  'Leave a cell blank when the value is unknown rather than typing a placeholder such as TBD.',
  `Pay amounts (base salary, offers, sign-on, relocation, agency fees) and leave appear in ${APP_NAME} only for HR admin with pay amounts shown.`,
  `The file stays on this computer. ${APP_NAME} reads it in the browser and never uploads it.`,
]

function addReadMe(wb: Workbook, title: string, intro: string[], defs: DatasetDef[]): void {
  const ws = wb.addWorksheet('Read me')
  ws.columns = [{ width: 22 }, { width: 70 }, { width: 44 }, { width: 44 }]
  ws.addRow([title]).font = { bold: true, size: 14, color: { argb: INK } }
  for (const line of intro) ws.addRow([line])
  ws.addRow([])
  ws.addRow(['How to fill it in']).font = { bold: true, color: { argb: INK } }
  for (const line of GUIDANCE) ws.addRow([line])
  ws.addRow([])
  const head = ws.addRow(['Sheet', 'What it holds', 'Required columns', 'Used by'])
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: INK } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_REQUIRED } }
  })
  for (const def of defs) {
    const row = ws.addRow([
      def.sheet,
      def.description,
      def.fields
        .filter((f) => f.required)
        .map((f) => f.label)
        .join(', '),
      def.usedBy.map((v) => VIEW_LABEL[v]).join(', '),
    ])
    row.alignment = { vertical: 'top', wrapText: true }
  }
  ws.addRow([])
  ws.addRow(['See the Fields sheet for every column, its type and the values it accepts.'])
  ws.addRow(['Company confidential.']).font = { italic: true }
}

async function toBlob(wb: Workbook): Promise<Blob> {
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: XLSX_MIME })
}

/** The workbook's date and the "Prepared" line: given, or now. */
const madeOn = (today: string | undefined): { date: Date; day: string } => {
  const date = today ? new Date(`${today.slice(0, 10)}T00:00:00Z`) : new Date()
  return { date, day: date.toISOString().slice(0, 10) }
}

export interface TemplateOptions {
  /** Datasets to include, in this order; every dataset by default. */
  datasets?: DatasetKey[]
  /** Example rows to pre-fill (e.g. the sample company). */
  sample?: Datasets
  /** Example rows per sheet when `sample` is given (default 20). */
  sampleRows?: number
  /** Write pay amounts in the example rows. Pay columns are always present; their cells stay blank unless this is true. */
  includePay?: boolean
  /** Extra lines for the top of the Read me sheet, such as why a dataset is left out. */
  notes?: string[]
  /**
   * Official lists by field (`dataset.field`): those columns get a dropdown of the list's active
   * values, held on a hidden Lists sheet with a workbook name per list.
   */
  lists?: TemplateLists
  /** The date the workbook says it was prepared (YYYY-MM-DD); today when absent. */
  today?: string
}

/** The hidden Lists sheet, with the lists the included fields use (once each). */
function addUsedLists(
  wb: Workbook,
  defs: readonly DatasetDef[],
  fields: (def: DatasetDef) => FieldDef[],
  lists?: TemplateLists,
): void {
  if (!lists) return
  const used = new Map<string, TemplateList>()
  for (const def of defs)
    for (const f of fields(def)) {
      const l = lists[`${def.key}.${f.key}`]
      if (l && !used.has(l.name)) used.set(l.name, l)
    }
  if (used.size) addListsSheet(wb, [...used.values()])
}

/** Build the upload template workbook. */
export async function buildTemplateWorkbook(opts: TemplateOptions = {}): Promise<Blob> {
  const ExcelJS = await loadExcel()
  const made = madeOn(opts.today)
  const wb = new ExcelJS.Workbook()
  wb.creator = APP_NAME
  wb.created = made.date
  const keys = opts.datasets ?? DATASET_KEYS
  const defs = keys.map((k) => DATASETS.find((d) => d.key === k)).filter((d): d is DatasetDef => !!d)
  const limit = opts.sampleRows ?? 20
  addReadMe(
    wb,
    `${APP_NAME} data template`,
    [
      `Prepared ${made.day}. Fill one sheet per dataset, then upload the file in the Data room.`,
      `${APP_NAME} recognizes each sheet by its columns, so sheets can be renamed, removed or reordered.`,
      ...(opts.notes ?? []),
    ],
    defs,
  )
  for (const def of defs) {
    const rows = (opts.sample?.[def.key] ?? []).slice(0, Math.max(0, limit)) as unknown as Record<
      string,
      unknown
    >[]
    addDatasetSheet(wb, def, def.fields, rows, !!opts.includePay, opts.lists)
  }
  addFieldsSheet(wb, defs, true, opts.lists)
  addUsedLists(wb, defs, (d) => d.fields, opts.lists)
  return toBlob(wb)
}

/** One dataset's current rows as a workbook that can be edited and uploaded again. */
export async function exportDatasetWorkbook<K extends DatasetKey>(
  key: K,
  rows: readonly Datasets[K][number][],
  opts: { includePay: boolean; lists?: TemplateLists; today?: string },
): Promise<Blob> {
  const ExcelJS = await loadExcel()
  const def = DATASETS.find((d) => d.key === key)
  if (!def) throw new Error(`Unknown dataset ${key}`)
  const made = madeOn(opts.today)
  const wb = new ExcelJS.Workbook()
  wb.creator = APP_NAME
  wb.created = made.date
  const fields = def.fields.filter((f) => opts.includePay || !f.pay)
  addDatasetSheet(wb, def, fields, rows as unknown as Record<string, unknown>[], opts.includePay, opts.lists)
  addFieldsSheet(wb, [def], opts.includePay, opts.lists)
  addReadMe(
    wb,
    `${APP_NAME} export: ${def.label}`,
    [
      `${rows.length.toLocaleString('en-US')} rows exported ${made.day}.`,
      opts.includePay
        ? 'Pay amounts are included. Handle this file as confidential pay data.'
        : `Pay amounts are left out. Show pay amounts in ${APP_NAME} (HR admin) to include them.`,
      'Edit the rows and upload the file again in the Data room to replace this dataset.',
    ],
    [def],
  )
  addUsedLists(wb, [def], () => fields, opts.lists)
  return toBlob(wb)
}
