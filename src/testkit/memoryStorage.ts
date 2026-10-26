/**
 * An in-memory `Storage` for tests, to stand in for localStorage:
 *
 *   const storage = new MemoryStorage()
 *   vi.stubGlobal('localStorage', storage)
 *
 * It keeps insertion order like the browser, and can be told to fail (a private window, a full quota,
 * blocked site data) so code that must never throw on storage can be checked.
 */
export class MemoryStorage implements Storage {
  readonly m = new Map<string, string>()
  /** While set, every call throws it. */
  failure: Error | null = null

  private check(): void {
    if (this.failure) throw this.failure
  }

  get length(): number {
    this.check()
    return this.m.size
  }
  key(i: number): string | null {
    this.check()
    return [...this.m.keys()][i] ?? null
  }
  getItem(k: string): string | null {
    this.check()
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string): void {
    this.check()
    this.m.set(k, String(v))
  }
  removeItem(k: string): void {
    this.check()
    this.m.delete(k)
  }
  clear(): void {
    this.check()
    this.m.clear()
  }

  /** Every key, for assertions (never throws). */
  keys(): string[] {
    return [...this.m.keys()]
  }
}
