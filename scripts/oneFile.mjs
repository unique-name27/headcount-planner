// The one-file build's own check (docs/PLAN.md 3.3, 17 M4): dist-single/index.html must open from
// file:// with no network request, and stay under its size budget. Pure, so
// src/ship/oneFile.test.ts checks it on made-up pages; scripts/check-single.mjs runs it on the real
// build (verify's one-file step), and copy-single.mjs and deploy-pages.mjs refuse a page that fails.
//
// It reads the page the way the browser's HTML parser does: markup outside <script> and <style>
// holds only the page's own few tags, every <script> is inline and ends where the parser ends it,
// and nothing (tag attribute, CSS url() or @import, dynamic import(), worker, a fetch of a written
// URL) names a file or address to load. Library code that could load something on demand (an
// image by URL in the deck writer, say) is not a request at open and is not flagged.

/** The most the one file may weigh, in bytes. M3 ended at 4,820,666; the budget leaves room for M4. */
export const ONE_FILE_BUDGET = 6_000_000

/** The element the app mounts into (src/main.tsx). */
export const MOUNT_ID = 'root'

/** The only tags the page's markup may hold outside its scripts and styles. */
export const PAGE_TAGS = [
  'html',
  'head',
  'meta',
  'title',
  'link',
  'script',
  'style',
  'body',
  'div',
  'noscript',
]

/** Elements whose content the parser reads as text up to their end tag. */
const RAW_TEXT = new Set(['script', 'style', 'title', 'noscript', 'textarea'])

/** Attributes that load or point at a resource. */
const URL_ATTRIBUTES = new Set([
  'src',
  'href',
  'srcset',
  'poster',
  'data',
  'action',
  'formaction',
  'background',
  'ping',
  'manifest',
  'xlink:href',
])

/** A value that names nothing to fetch: a data: URL, a fragment or nothing. */
const inline = (value) => {
  const v = value.trim()
  return v === '' || v.startsWith('#') || /^data:/i.test(v)
}

/** What a script must not do for the page to open with no request. */
const SCRIPT_RULES = [
  [/<!--/, 'holds "<!--", which changes where the browser ends a script'],
  [/\bimport\s*\(\s*["'`]/, 'loads a module with import(), which the one file does not hold'],
  [
    /["'`](?:\.{0,2}\/)?assets\/[^"'`\s]+\.(?:m?js|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|wasm)["'`]/,
    'names a built file under assets/',
  ],
  [
    /new\s+URL\(\s*["'`](?!data:|blob:)[^"'`]+["'`]\s*,\s*import\.meta\.url/,
    'resolves a file next to the page with import.meta.url',
  ],
  [/\bnew\s+(?:Shared)?Worker\s*\(/, 'starts a worker from a file'],
  [/serviceWorker\s*\.\s*register\s*\(/, 'registers a service worker'],
  [
    /\b(?:fetch|sendBeacon|EventSource|WebSocket)\s*\(\s*["'`](?:https?:|wss?:)?\/\//,
    'requests a written address',
  ],
]

/** CSS that would fetch: @import, or url() of anything but a data: URL or a fragment. */
function cssProblems(css, where) {
  const out = []
  if (/@import\b/i.test(css)) out.push(`${where} uses @import.`)
  for (const m of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^"'\s)][^)]*?))\s*\)/gi)) {
    const value = m[1] ?? m[2] ?? m[3] ?? ''
    if (!inline(value)) out.push(`${where} loads ${value.slice(0, 80)} with url().`)
  }
  return out
}

/** The attributes of a start tag, from just after its name; `end` is the index after its ">". */
function readAttributes(html, from) {
  const attrs = new Map()
  let i = from
  for (;;) {
    while (i < html.length && /\s/.test(html[i])) i++
    if (i >= html.length) return { attrs, end: -1 }
    if (html[i] === '>') return { attrs, end: i + 1 }
    if (html.startsWith('/>', i)) return { attrs, end: i + 2 }
    if (html[i] === '/') {
      i++
      continue
    }
    const name = /^[^\s/>=]+/.exec(html.slice(i, i + 200))?.[0] ?? html[i]
    i += name.length
    while (i < html.length && /\s/.test(html[i])) i++
    let value = ''
    if (html[i] === '=') {
      i++
      while (i < html.length && /\s/.test(html[i])) i++
      const q = html[i]
      if (q === '"' || q === "'") {
        const close = html.indexOf(q, i + 1)
        if (close < 0) return { attrs, end: -1 }
        value = html.slice(i + 1, close)
        i = close + 1
      } else {
        const m = /^[^\s>]*/.exec(html.slice(i, i + 4096))?.[0] ?? ''
        value = m
        i += m.length
      }
    }
    attrs.set(name.toLowerCase(), value)
  }
}

/** Where a raw-text element's content ends: its end tag, as the parser finds it. */
function rawTextEnd(html, name, from) {
  const re = new RegExp(`</${name}[\\s/>]`, 'ig')
  re.lastIndex = from
  const m = re.exec(html)
  return m ? m.index : -1
}

/**
 * The page read as the browser reads it: its size, its inline scripts and styles, and each reason
 * it would not open on its own from file:// (empty when it would).
 */
export function oneFileReport(html, { budget = ONE_FILE_BUDGET, mount = MOUNT_ID } = {}) {
  const problems = []
  const bytes = new TextEncoder().encode(html).length
  if (bytes > budget)
    problems.push(
      `The page is ${bytes.toLocaleString('en-US')} bytes, over its ${budget.toLocaleString('en-US')} byte budget.`,
    )
  if (!/^\s*<!doctype html>/i.test(html)) problems.push('The page does not start with <!doctype html>.')

  let scripts = 0
  let styles = 0
  let mounted = false
  let i = 0
  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt < 0) break
    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4)
      i = close < 0 ? html.length : close + 3
      continue
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      const close = html.indexOf('>', lt)
      i = close < 0 ? html.length : close + 1
      continue
    }
    const closing = html[lt + 1] === '/'
    const name = /^[a-zA-Z][a-zA-Z0-9:-]*/.exec(html.slice(lt + (closing ? 2 : 1), lt + 80))?.[0]
    if (!name) {
      i = lt + 1
      continue
    }
    const tag = name.toLowerCase()
    if (!PAGE_TAGS.includes(tag)) {
      problems.push(
        `The page's markup holds a <${closing ? '/' : ''}${tag}> tag, which only a script or style may hold (a script may have ended early).`,
      )
      i = lt + 1
      continue
    }
    if (closing) {
      const close = html.indexOf('>', lt)
      i = close < 0 ? html.length : close + 1
      continue
    }
    const { attrs, end } = readAttributes(html, lt + 1 + name.length)
    if (end < 0) {
      problems.push(`A <${tag}> tag is never closed.`)
      break
    }
    for (const [attr, value] of attrs) {
      if (URL_ATTRIBUTES.has(attr) && !inline(value))
        problems.push(`<${tag} ${attr}="${value.slice(0, 80)}"> loads a file or an address.`)
      if (attr === 'style') problems.push(...cssProblems(value, `A style attribute on <${tag}>`))
    }
    if (tag === 'meta' && (attrs.get('http-equiv') ?? '').toLowerCase() === 'refresh')
      problems.push('A <meta http-equiv="refresh"> sends the page elsewhere.')
    if (tag === 'div' && attrs.get('id') === mount) mounted = true
    i = end
    if (!RAW_TEXT.has(tag)) continue
    const stop = rawTextEnd(html, tag, end)
    if (stop < 0) {
      problems.push(`A <${tag}> is never closed.`)
      break
    }
    const content = html.slice(end, stop)
    if (tag === 'script') {
      scripts++
      if (!attrs.has('src'))
        for (const [re, why] of SCRIPT_RULES)
          if (re.test(content)) problems.push(`Inline script ${scripts} ${why}.`)
    }
    if (tag === 'style') {
      styles++
      problems.push(...cssProblems(content, `Inline style ${styles}`))
    }
    i = stop
  }
  if (scripts === 0) problems.push('The page holds no inline script.')
  if (!mounted) problems.push(`The page holds no <div id="${mount}"> for the app to mount into.`)
  return { bytes, budget, scripts, styles, problems }
}

/** Each reason the page would not open on its own from file:// (empty when it would). */
export const oneFileProblems = (html, options) => oneFileReport(html, options).problems
