/**
 * A stand-in for pptxgenjs in tests (`vi.mock('pptxgenjs', …)`): it records each deck's properties
 * and, per slide, the text runs, table cells, notes and image count the deck writer adds, so a test
 * reads the slides `exportViewDeck` writes without opening a .pptx. Test code only.
 *
 *   vi.mock('pptxgenjs', async () => ({ default: (await import('./deck.testkit')).FakePptx }))
 */

/** What one slide holds. */
export interface FakeSlide {
  /** Every text the slide adds, in order (a list of runs joined by line breaks). */
  texts: string[]
  /** Every table, as rows of cell texts. */
  tables: string[][][]
  notes: string[]
  images: number
}

/** One deck as written. */
export interface FakeDeck {
  author: string
  company: string
  title: string
  subject: string
  slides: FakeSlide[]
}

/** Every deck made since the last `resetDecks()`, in order. */
export const decks: FakeDeck[] = []

export function resetDecks(): void {
  decks.length = 0
}

type Run = string | { text?: string }
type Cell = string | { text?: string }

const runText = (r: Run): string => (typeof r === 'string' ? r : (r.text ?? ''))

class Slide {
  background: unknown = null
  constructor(private readonly data: FakeSlide) {}
  addText(text: string | readonly Run[]): this {
    this.data.texts.push(typeof text === 'string' ? text : text.map(runText).join('\n'))
    return this
  }
  addShape(): this {
    return this
  }
  addImage(): this {
    this.data.images++
    return this
  }
  addTable(rows: readonly (readonly Cell[])[]): this {
    this.data.tables.push(rows.map((r) => r.map((c) => (typeof c === 'string' ? c : (c.text ?? '')))))
    return this
  }
  addNotes(notes: string): this {
    this.data.notes.push(notes)
    return this
  }
}

/** The fake `PptxGenJS` class. */
export class FakePptx {
  layout = ''
  theme: unknown = null
  readonly ShapeType = { line: 'line' }
  private readonly deck: FakeDeck = { author: '', company: '', title: '', subject: '', slides: [] }

  constructor() {
    decks.push(this.deck)
  }
  set author(v: string) {
    this.deck.author = v
  }
  get author(): string {
    return this.deck.author
  }
  set company(v: string) {
    this.deck.company = v
  }
  get company(): string {
    return this.deck.company
  }
  set title(v: string) {
    this.deck.title = v
  }
  get title(): string {
    return this.deck.title
  }
  set subject(v: string) {
    this.deck.subject = v
  }
  get subject(): string {
    return this.deck.subject
  }
  addSlide(): Slide {
    const data: FakeSlide = { texts: [], tables: [], notes: [], images: 0 }
    this.deck.slides.push(data)
    return new Slide(data)
  }
  async write(): Promise<Blob> {
    return new Blob(['pptx'])
  }
}

/** Everything a slide says, its texts and table cells, as one string. */
export const slideText = (s: FakeSlide): string =>
  [...s.texts, ...s.tables.flatMap((t) => t.map((r) => r.join(' | ')))].join('\n')
