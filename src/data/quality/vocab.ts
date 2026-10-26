/**
 * Known vocabularies per field: a filled value outside its field's list is "not recognized" and
 * counts against the field's tier. Enum and level fields take their lists from the schema. Free
 * text (sites, departments, cost centers, legal entities, currencies) is not checked here: every
 * company has its own.
 *
 * Official lists (Settings > Official lists, `src/data/lists`) add to this: an official list hands
 * the quality index a `VocabOverlay`, whose values replace a field's list here (and give a list to
 * fields that have none, such as departments and work sites).
 */
import { DATASETS, LEVELS } from '../schema'

function build(): Map<string, ReadonlySet<string>> {
  const out = new Map<string, ReadonlySet<string>>()
  for (const d of DATASETS)
    for (const f of d.fields) {
      const ref = `${d.key}.${f.key}`
      if (f.type === 'level') out.set(ref, new Set(LEVELS))
      else if (f.type === 'enum' && f.values?.length) out.set(ref, new Set(f.values))
    }
  return out
}

const VOCAB = build()

/**
 * The official lists in force, by field: a field named here is checked against these values
 * instead of its built-in list. Built once per state of the lists, so the quality index can be
 * reused while they stay the same.
 */
export interface VocabOverlay {
  /** Changes whenever the lists do (for memo keys and debugging). */
  readonly version: string
  readonly refs: ReadonlyMap<string, ReadonlySet<string>>
}

/** The allowed values of a field, or undefined when any value is fine. */
export const vocabOf = (ref: string): ReadonlySet<string> | undefined => VOCAB.get(ref)

/** The allowed values of a field in their canonical order, or null. */
export const vocabList = (ref: string): string[] | null => {
  const v = VOCAB.get(ref)
  return v ? [...v] : null
}

/**
 * A filled value the field's vocabulary does not know: the official list's when the overlay names
 * the field, otherwise the built-in one. Booleans, numbers and steps are never checked.
 */
export function isUnrecognized(ref: string, value: unknown, overlay?: VocabOverlay | null): boolean {
  if (typeof value !== 'string') return false
  const v = overlay?.refs.get(ref) ?? VOCAB.get(ref)
  return !!v && !v.has(value)
}
