/**
 * Loading primitives. Plain CSS animations only (border-spinner, background-position
 * shimmer) — nothing newer than ~2018 so old browsers render them fine.
 */

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={'spinner' + (className ? ' ' + className : '')}
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 8)) }}
      role="status"
      aria-label="Φόρτωση"
    />
  )
}

/** Full-area centered spinner with optional text (page gate, panels). */
export function LoadingBlock({ text }: { text?: string }) {
  return (
    <div className="loading-block">
      <Spinner size={28} />
      {text && <p>{text}</p>}
    </div>
  )
}

/** Grey shimmer bar. width/height accept CSS values ("60%", 14). */
export function Skeleton({ width = '100%', height = 14, style }: {
  width?: string | number
  height?: string | number
  style?: React.CSSProperties
}) {
  return <span className="skeleton" style={{ width, height, ...style }} aria-hidden="true" />
}

/** A few stacked lines of varying width — for panels/cards. */
export function SkeletonLines({ rows = 4 }: { rows?: number }) {
  const widths = ['85%', '60%', '72%', '48%', '66%', '55%']
  return (
    <div className="skeleton-lines" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} width={widths[i % widths.length]} />
      ))}
    </div>
  )
}

/** Determinate progress bar (0..100). */
export function ProgressBar({ percent, indeterminate }: { percent: number; indeterminate?: boolean }) {
  const p = Math.max(0, Math.min(100, percent))
  return (
    <div className={'progress' + (indeterminate ? ' indeterminate' : '')} role="progressbar"
         aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate ? undefined : Math.round(p)}>
      <div className="progress-fill" style={indeterminate ? undefined : { width: `${p}%` }} />
    </div>
  )
}
