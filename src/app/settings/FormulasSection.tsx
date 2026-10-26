/**
 * Settings > Formulas (read only in M2): every metric the mode shows, grouped by home view, with its
 * definition, formula, population and window and the settings it calculates with at their values in
 * force (`formulaSections`, the pure model the leak crawl reads). Definitions are changed in the
 * Data room's Metric definitions.
 */
import { useAnalytics } from '@/data/context'
import { formulaSections } from './model'
import { SettingsBlock } from './ui'

export function FormulasSection() {
  const ctx = useAnalytics()
  const sections = formulaSections(ctx)
  return (
    <SettingsBlock
      section="formulas"
      intro="How each number is worked out, and the settings it uses. A changed setting is marked."
    >
      {sections.map((s) => (
        <details key={s.key} className="group border-t border-rule pt-3 first:border-t-0 first:pt-0">
          <summary className="cursor-pointer rounded-mark text-small font-semibold text-ink">
            {s.label} <span className="font-normal text-muted">({s.rows.length})</span>
          </summary>
          <dl className="mt-2 flex flex-col gap-3">
            {s.rows.map((r) => (
              <div key={r.id} className="min-w-0">
                <dt className="text-small font-medium text-ink">
                  {r.name}
                  {r.changed && <span className="ml-1.5 text-meta font-normal text-muted">changed</span>}
                </dt>
                <dd className="mt-0.5 text-meta leading-snug text-ink-2">
                  <p>{r.definition}</p>
                  {r.formula && <p className="mt-0.5 font-mono text-label text-ink">{r.formula}</p>}
                  {(r.population || r.window) && (
                    <p className="mt-0.5 text-muted">
                      {[r.population, r.window].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {r.settings.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {r.settings.map((p) => (
                        <li key={p.key}>
                          <span className="text-ink-2">{p.label}: </span>
                          <span className="tnum text-ink">{p.value}</span>
                          {p.changed && <span className="ml-1 text-muted">(changed)</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
    </SettingsBlock>
  )
}
