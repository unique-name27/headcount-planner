/**
 * Canonical JSON (docs/PLAN.md 5.3, 5.5 and 10.7): one text for one value, so a hash computed twice,
 * in two tabs or after a save and a load, is the same. The lock hash, the audit chain and the
 * workspace checksum all hash `canonicalJson(...)` with `sha256()` from src/lib/sha256.ts.
 *
 * - Object keys are sorted (by UTF-16 code unit, `Array.prototype.sort`), with no spaces.
 * - A key whose value is `undefined` or a function is left out; in an array it reads `null` (as
 *   JSON.stringify does).
 * - Numbers are written as JSON writes them (`-0` reads `0`); NaN and Infinity throw, because a hash
 *   over them would hide a calculation bug.
 * - Typed arrays (the columns of PlanLineTable and ActualLineTable) are written as arrays of numbers.
 * - Map, Set, Date and other class instances throw: callers turn them into plain data first.
 *
 * Money is not rounded here: the lock hash converts its amounts to integer cents before hashing
 * (src/plan/engine/versions.ts `lockHash`). Built in the M1 freeze because engines A (versions) and
 * engines C (audit, workspace) both need it. Pure.
 */
export function canonicalJson(value: unknown): string {
  try {
    return fast(value)
  } catch (e) {
    if (e !== NOT_PLAIN) throw e
    // Something the text cannot hold: the writer with paths names where it is, and throws.
    return write(value, '$')
  }
}

/* ───────────── the fast writer: the same text, no paths ───────────── */

/** Thrown by the fast writer where `write` throws; `canonicalJson` then runs `write` for the message. */
const NOT_PLAIN: unique symbol = Symbol('not plain data')

/** A finite number as JSON writes it (`-0` reads `0`). */
const num = (x: number): string => {
  if (x - x !== 0) throw NOT_PLAIN
  return String(x)
}

function fast(v: unknown): string {
  if (v === null) return 'null'
  switch (typeof v) {
    case 'number':
      return num(v)
    case 'string':
      return JSON.stringify(v)
    case 'boolean':
      return v ? 'true' : 'false'
    case 'object':
      return fastObject(v)
    default:
      throw NOT_PLAIN
  }
}

/**
 * An array of strings, finite numbers and such arrays, with no hole: `JSON.stringify` writes it
 * exactly as `writeItems` does (no key to sort, no undefined), natively. A lock's lines are one.
 */
function isFlatData(v: readonly unknown[], depth: number): boolean {
  for (let i = 0; i < v.length; i++) {
    const x = v[i]
    if (typeof x === 'string') continue
    if (typeof x === 'number') {
      if (x - x !== 0) return false
      continue
    }
    if (depth > 0 && Array.isArray(x) && isFlatData(x, depth - 1)) continue
    return false
  }
  return true
}

function fastObject(v: object): string {
  if (Array.isArray(v)) {
    if (isFlatData(v, 2)) return JSON.stringify(v)
    const out: string[] = []
    for (let i = 0; i < v.length; i++) {
      const x: unknown = v[i]
      if (typeof x === 'number') out.push(num(x))
      else if (typeof x === 'string') out.push(JSON.stringify(x))
      // A hole is left empty, as `writeItems` leaves it; undefined and functions read null.
      else if (x === undefined) out.push(i in v ? 'null' : '')
      else if (typeof x === 'function') out.push('null')
      else out.push(fast(x))
    }
    return `[${out.join(',')}]`
  }
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
    const items = Array.from(v as unknown as ArrayLike<number | bigint>)
    if (!isFlatData(items, 0)) throw NOT_PLAIN
    return JSON.stringify(items)
  }
  const proto = Object.getPrototypeOf(v)
  if (proto !== Object.prototype && proto !== null) throw NOT_PLAIN
  const rec = v as Record<string, unknown>
  const parts: string[] = []
  for (const key of Object.keys(rec).sort()) {
    const x = rec[key]
    if (x === undefined || typeof x === 'function') continue
    parts.push(`${JSON.stringify(key)}:${fast(x)}`)
  }
  return `{${parts.join(',')}}`
}

/* ───────────── the writer with paths (errors only) ───────────── */

function write(v: unknown, path: string): string {
  if (v === null) return 'null'
  switch (typeof v) {
    case 'number':
      if (!Number.isFinite(v)) throw new Error(`canonicalJson: ${path} is not a finite number`)
      return JSON.stringify(v)
    case 'string':
      return JSON.stringify(v)
    case 'boolean':
      return v ? 'true' : 'false'
    case 'object':
      return writeObject(v, path)
    default:
      throw new Error(`canonicalJson: ${path} is a ${typeof v}`)
  }
}

/**
 * An array's items, written as `write` writes them. Numbers and strings are written in place, so the
 * path (only for an error) is built just for nested values: hashing a version's lines spent most of
 * its time building paths (M2 integration). A hole is left empty, as `Array.prototype.map` leaves it.
 */
function writeItems(v: ArrayLike<unknown>, path: string, holes: 'empty' | 'none'): string {
  const out = new Array<string>(v.length)
  for (let i = 0; i < v.length; i++) {
    if (holes === 'empty' && !(i in v)) continue
    const x = v[i]
    if (typeof x === 'number') {
      if (!Number.isFinite(x)) throw new Error(`canonicalJson: ${path}[${i}] is not a finite number`)
      out[i] = String(x)
    } else if (typeof x === 'string') out[i] = JSON.stringify(x)
    else if (holes === 'empty' && (x === undefined || typeof x === 'function')) out[i] = 'null'
    else out[i] = write(x, `${path}[${i}]`)
  }
  return `[${out.join(',')}]`
}

function writeObject(v: object, path: string): string {
  if (Array.isArray(v)) return writeItems(v, path, 'empty')
  if (ArrayBuffer.isView(v) && !(v instanceof DataView))
    return writeItems(v as unknown as ArrayLike<unknown>, path, 'none')
  const proto = Object.getPrototypeOf(v)
  if (proto !== Object.prototype && proto !== null) {
    throw new Error(`canonicalJson: ${path} is not plain data`)
  }
  const rec = v as Record<string, unknown>
  const parts: string[] = []
  for (const key of Object.keys(rec).sort()) {
    const x = rec[key]
    if (x === undefined || typeof x === 'function') continue
    const text =
      typeof x === 'string'
        ? JSON.stringify(x)
        : typeof x === 'number' && Number.isFinite(x)
          ? String(x)
          : write(x, `${path}.${key}`)
    parts.push(`${JSON.stringify(key)}:${text}`)
  }
  return `{${parts.join(',')}}`
}
