/** Types for scripts/oneFile.mjs (the one-file build's own check). */

/** The most the one file may weigh, in bytes. */
export declare const ONE_FILE_BUDGET: number
/** The element the app mounts into. */
export declare const MOUNT_ID: 'root'
/** The only tags the page's markup may hold outside its scripts and styles. */
export declare const PAGE_TAGS: string[]

export interface OneFileOptions {
  /** Bytes; ONE_FILE_BUDGET when left out. */
  budget?: number
  /** The mount element's id; MOUNT_ID when left out. */
  mount?: string
}

export interface OneFileReport {
  bytes: number
  budget: number
  /** Inline scripts read. */
  scripts: number
  /** Inline styles read. */
  styles: number
  /** Each reason the page would not open on its own from file:// (empty when it would). */
  problems: string[]
}

export declare function oneFileReport(html: string, options?: OneFileOptions): OneFileReport
export declare function oneFileProblems(html: string, options?: OneFileOptions): string[]
