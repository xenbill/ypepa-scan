import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getStats, type StatItem } from '../api/api'
import { Skeleton, SkeletonLines } from '../components/Loading'

/** Compact single-hue bar list: sorted desc, proportional bars, scrolls past ~8 rows.
    Each row links to the list filtered by that value (`param` = the list's URL key). */
function StatList({ title, items, param }: { title: string; items: StatItem[]; param: 'kathg' | 'eidos' | 'hstr' }) {
  const navigate = useNavigate()
  const max = Math.max(1, ...items.map((s) => s.count))
  return (
    <section className="card home-card">
      <h2>{title}</h2>
      <div className="stat-scroll">
        {items.map((s) => {
          const href = s.id != null ? `/drawings?${param}=${s.id}` : null
          const body = (
            <>
              <div className="stat-row-line">
                <span className="stat-name">{s.name}</span>
                <span className="stat-count">{s.count.toLocaleString('el-GR')}</span>
              </div>
              <div className="stat-bar-track">
                <div className="stat-bar-fill" style={{ width: `${(s.count / max) * 100}%` }} />
              </div>
            </>
          )
          const label = `${s.name}: ${s.count.toLocaleString('el-GR')}`
          // Drawings without a value (id null) can't be filtered for; plain row.
          return href ? (
            <a key={s.name} className="stat-row stat-link" href={href} title={`${label} — προβολή στη λίστα`}
               onClick={(e) => { e.preventDefault(); navigate(href) }}>
              {body}
            </a>
          ) : (
            <div key={s.name} className="stat-row" title={label}>{body}</div>
          )
        })}
      </div>
    </section>
  )
}

function StatListSkeleton({ title }: { title: string }) {
  return (
    <section className="card home-card" aria-busy="true">
      <h2>{title}</h2>
      <div className="stat-scroll"><SkeletonLines rows={6} /></div>
    </section>
  )
}

/* Static drawing-sheet vignette: margin frame, floor plan with door swing,
   dimension lines, title block. Inline SVG — nothing fetched. */
function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 340 200" fill="none" aria-hidden="true">
      <g stroke="currentColor">
        <rect x="1.5" y="1.5" width="337" height="197" opacity=".3" />
        <rect x="14.5" y="14.5" width="311" height="171" opacity=".22" />
        <rect x="230.5" y="152.5" width="95" height="33" opacity=".5" />
        <path d="M230 163.5h96M230 174.5h96M262.5 152v34" opacity=".3" />
        <path d="M44.5 52.5h150v104h-150z" strokeWidth="1.5" opacity=".6" />
        <path d="M44 104.5h58M144 104.5h50.5M102.5 104v52M102.5 52v32" strokeWidth="1.5" opacity=".6" />
        <path d="M102.5 84a20 20 0 0 1 20 20" opacity=".45" />
        <path d="M44 36.5h150M44.5 30v13M194.5 30v13" opacity=".45" />
        <path d="M40 40.5l9-8M190 40.5l9-8" opacity=".45" />
        <path d="M214.5 52v104M208 52.5h13M208 156.5h13" opacity=".45" />
        <path d="M210 56.5l9-8M210 160.5l9-8" opacity=".45" />
      </g>
    </svg>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const stats = useQuery({ queryKey: ['stats'], queryFn: ({ signal }) => getStats(signal), staleTime: 60_000 })

  return (
    <div className="home-grid">
      <section className="card hero">
        <div className="hero-text">
          <div className="hero-eyebrow">Αρχείο τεχνικών σχεδίων</div>
          <p className="home-stat">
            {stats.data ? stats.data.total.toLocaleString('el-GR') : <Skeleton width={110} height={38} />}
            <span> σχέδια στο αρχείο</span>
          </p>
          <p className="hero-note">
            Αναζητήστε και προβάλετε τα αρχειοθετημένα σχέδια ή καταχωρίστε νέα.
          </p>
          <div className="hero-actions">
            <button className="primary" onClick={() => navigate('/drawings')}>Άνοιγμα λίστας σχεδίων</button>
            <button onClick={() => navigate('/drawings?import=1')}>+ Καταχώριση σχεδίου</button>
            <button onClick={() => navigate('/drawings?import=mass')}>Μαζική καταχώριση</button>
          </div>
        </div>
        <HeroArt />
      </section>
      {stats.data ? (
        <>
          <StatList title="Ανά κατηγορία έργου" items={stats.data.perKathgoria} param="kathg" />
          <StatList title="Ανά είδος σχεδίου" items={stats.data.perEidos} param="eidos" />
          <StatList title="Ανά μονάδα" items={stats.data.perMonada} param="hstr" />
        </>
      ) : stats.isError ? (
        <p className="status-err">Σφάλμα: {(stats.error as Error).message}</p>
      ) : (
        <>
          <StatListSkeleton title="Ανά κατηγορία έργου" />
          <StatListSkeleton title="Ανά είδος σχεδίου" />
          <StatListSkeleton title="Ανά μονάδα" />
        </>
      )}
    </div>
  )
}
