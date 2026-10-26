/**
 * The lineage probe (browser finding B4; test code only): a figure's `uses` must name only fields its
 * model reads. For every field a figure lists, the probe blanks that field in every row of its
 * dataset (as an import with the column empty would), rebuilds the contexts and the models from the
 * blanked copy of the sample, and compares the figure's signature (a tile's value, change, words,
 * records and card; a hero's value, comparison and parts; a figure's rows and words). A field whose
 * blank moves nothing in any mode probed must be named in the figure's lineage notes, with why it is
 * read all the same: a fallback (its partner covers a blank, so the probe blanks the pair together
 * and that must move the figure), a blank that reads as the value every sample row has, a case the
 * sample has none of, a person-level rule of another mode, or a snapshot plan state keeps. A model
 * that throws on a blank counts as moving.
 */
import type { Kpi } from '@/components/types'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { Sample } from '@/data/sample'
import type { DatasetKey, Datasets } from '@/data/schema'
import { resolveCalc } from '@/drill/calc'
import { resolveDrill } from '@/drill/types'
import type { FigureData, HeroModel } from '../../types'

/** One thing the probe reads: the figure's id, where it was read (mode), its lineage and what it shows. */
export interface Probed {
  id: string
  /** The figure in one context ("hr-admin approved"): one per mode probed. */
  key: string
  uses: readonly FieldRef[]
  sig: string
}

/** A record's identity in a drill: the ID it is listed by. */
function rowKey(r: unknown): string {
  const o = (r ?? {}) as Record<string, unknown>
  const id = o.requestId ?? o.reqId ?? o.employeeId ?? o.positionId ?? o.id
  return id != null ? String(id) : JSON.stringify(o)
}

const safely = <T>(f: () => T): T | 'throws' => {
  try {
    return f()
  } catch {
    return 'throws'
  }
}

const drillKeys = (src: unknown) =>
  safely(
    () =>
      resolveDrill(src as never)?.rows.map((r) => [rowKey(r), (r as { weight?: unknown }).weight ?? null]) ??
      null,
  )

const cardOf = (src: unknown) =>
  safely(() => {
    const c = resolveCalc(src as never)
    return c ? [c.value, c.steps.map((x) => x.result)] : null
  })

/** A tile's signature: its number, change, words, records and card. */
export function kpiProbe(k: Kpi, where: string, id = k.id): Probed {
  return {
    id,
    key: `${where} ${id}`,
    uses: k.uses ?? [],
    sig: JSON.stringify([
      k.value,
      k.delta ?? null,
      k.deltaEmpty ?? null,
      k.suppressed ?? false,
      k.note ?? null,
      k.formula ?? null,
      drillKeys(k.drill),
      drillKeys(k.deltaDrill),
      cardOf(k.calc),
    ]),
  }
}

/** A hero's signature: its value, comparison, parts and records. */
export function heroProbe(h: HeroModel, where: string, id = h.id): Probed {
  return {
    id,
    key: `${where} ${id}`,
    uses: h.uses,
    sig: JSON.stringify([
      h.value,
      h.comparison?.value ?? null,
      h.note ?? null,
      h.reason ?? null,
      h.parts.map((p) => [p.key, p.count, drillKeys(p.drill)]),
      drillKeys(h.drill),
    ]),
  }
}

/** A figure's signature: its rows and words. */
export function figureProbe(f: FigureData<object>, where: string, id = f.id): Probed {
  return { id, key: `${where} ${id}`, uses: f.uses, sig: JSON.stringify([f.rows, f.empty, f.note ?? null]) }
}

/** The sample with some fields blank in every row of their datasets. */
export function blankFields(s: Sample, refs: readonly FieldRef[]): Sample {
  const datasets = { ...s.datasets } as Record<DatasetKey, readonly object[]>
  for (const ref of refs) {
    const [ds, field] = ref.split('.') as [DatasetKey, string]
    datasets[ds] = datasets[ds].map((r) => ({ ...r, [field]: null }))
  }
  return { ...s, datasets: datasets as unknown as Datasets }
}

export interface ProbeResult {
  /** By figure id: the listed fields whose blank moved nothing in any context it was read in. */
  still: Map<string, FieldRef[]>
  /** By figure id: every field it lists, in any context. */
  listed: Map<string, readonly FieldRef[]>
  /** How many fields were blanked. */
  fields: number
}

/** Reads the probed things over a blanked sample; null when a model throws (everything moved). */
function readOver(read: (s: Sample) => Probed[], s: Sample): Map<string, Probed> | null {
  try {
    return new Map(read(s).map((p) => [p.key, p]))
  } catch {
    return null
  }
}

/**
 * Blanks each field the probed things list, one at a time, and reports by figure id the listed
 * fields that moved nothing wherever the figure was read. `read` builds what to compare from a
 * sample (the same keys every time).
 */
export function probeLineage(base: Sample, read: (s: Sample) => Probed[]): ProbeResult {
  const before = read(base)
  const fields = [...new Set(before.flatMap((p) => p.uses))].sort()
  const listed = new Map<string, Set<FieldRef>>()
  for (const p of before) {
    const set = listed.get(p.id) ?? new Set<FieldRef>()
    for (const r of p.uses) set.add(r)
    listed.set(p.id, set)
  }
  // moved[id] holds the fields whose blank moved the figure in some context.
  const moved = new Map<string, Set<FieldRef>>()
  for (const ref of fields) {
    const after = readOver(read, blankFields(base, [ref]))
    for (const p of before) {
      if (!p.uses.includes(ref)) continue
      const a = after?.get(p.key)
      if (!a || a.sig !== p.sig) {
        const set = moved.get(p.id) ?? new Set<FieldRef>()
        set.add(ref)
        moved.set(p.id, set)
      }
    }
  }
  const still = new Map<string, FieldRef[]>()
  for (const [id, refs] of listed) {
    const m = moved.get(id) ?? new Set<FieldRef>()
    const left = [...refs].filter((r) => !m.has(r)).sort()
    if (left.length) still.set(id, left)
  }
  return {
    still,
    listed: new Map([...listed].map(([id, set]) => [id, [...set].sort()])),
    fields: fields.length,
  }
}

/** Whether blanking these fields together moves the figure in some context it is read in. */
export function movesTogether(
  base: Sample,
  read: (s: Sample) => Probed[],
  id: string,
  refs: readonly FieldRef[],
): boolean {
  const before = read(base).filter((p) => p.id === id)
  const after = readOver(read, blankFields(base, refs))
  return before.some((p) => !after || after.get(p.key)?.sig !== p.sig)
}
