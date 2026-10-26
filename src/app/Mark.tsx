/** Seat positions in a 20×20 box: a 2×2 grid, as in the favicon. The fourth seat is open. */
const SEATS = [
  { x: 5, y: 5 },
  { x: 10.75, y: 5 },
  { x: 5, y: 10.75 },
]
const OPEN = { x: 10.75, y: 10.75 }
const SIZE = 4.25

/**
 * The Headcount Planner mark: four seats on an ink tile, three filled and one open. `working` pulses
 * the filled seats one after another while data loads (CSS `mark-seat` in src/styles/index.css;
 * held still for people who prefer reduced motion).
 */
export function Mark({ size = 20, working = false }: { size?: number; working?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      <rect width="20" height="20" rx="4" fill="var(--ink)" />
      {SEATS.map((s, i) => (
        <rect
          key={i}
          x={s.x}
          y={s.y}
          width={SIZE}
          height={SIZE}
          fill="var(--on-ink)"
          className={working ? 'mark-seat' : undefined}
          style={working ? { animationDelay: `${i * 150}ms` } : undefined}
        />
      ))}
      <rect
        x={OPEN.x + 0.5}
        y={OPEN.y + 0.5}
        width={SIZE - 1}
        height={SIZE - 1}
        fill="none"
        stroke="var(--on-ink)"
        strokeWidth={1}
      />
    </svg>
  )
}
