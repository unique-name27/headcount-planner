/**
 * The six managers' request files of the generated sample, as files a person picks (docs/PLAN.md 5.5,
 * 13.5, 16.2): the texts `sampleRequestFiles` writes for the sample's datasets, personas, planted
 * rows and trade, checked against the sample's two locked versions, each with the name "Export
 * requests" would give it and its size in bytes. Import requests offers them while the sample is
 * loaded ("Use the sample's six manager files"), so "Merged 14 requests from 6 files, 2 conflicts"
 * can be seen without downloading anything. Separate from the bronze `requests` dataset in the Data
 * room. Pure apart from the memo; draws no random numbers.
 */
import type { LockedVersionRef } from '@/plan/types'
import { workspaceFileName } from '@/plan/workspace/file'
import { cachedSample, type Sample } from '../generate'
import { EXPORTED_AT, type RequestFiles, sampleRequestFiles } from './requestFiles'

/** A file as the picker hands it over: its name, text and size on disk. */
export interface NamedFile {
  name: string
  text: string
  sizeBytes: number
}

/** The sample's locked versions by reference (what each file's header lists). */
export function sampleLockedRefs(s: Sample): LockedVersionRef[] {
  return [s.locks.budget, s.locks.q1].map((v) => ({
    versionId: v.versionId,
    name: v.name,
    kind: v.kind,
    fiscalYear: v.fiscalYear,
    state: v.state,
    hash: v.hash,
  }))
}

const bytes = (text: string): number => new TextEncoder().encode(text).length

/** The six files of a generated sample, with their names and sizes. */
export function sampleRequestFilesOf(s: Sample): RequestFiles & { named: NamedFile[] } {
  const made = sampleRequestFiles(
    {
      datasets: s.datasets,
      personas: s.personas,
      planted: s.planted,
      tradeRequestId: s.story.tradeRequestId,
    },
    sampleLockedRefs(s),
  )
  const named = made.files.map((f, i) => {
    const text = made.texts[i]
    return { name: workspaceFileName(f, EXPORTED_AT), text, sizeBytes: bytes(text) }
  })
  return { ...made, named }
}

let memo: { sample: Sample; files: readonly NamedFile[] } | null = null

/** The app's sample's six files (`cachedSample()`), built once. */
export function cachedSampleRequestFiles(): readonly NamedFile[] {
  const s = cachedSample()
  if (!memo || memo.sample !== s) memo = { sample: s, files: sampleRequestFilesOf(s).named }
  return memo.files
}
