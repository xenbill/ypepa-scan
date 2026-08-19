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

const ACTIONS = [
  {
    to: '/drawings', primary: true,
    title: 'Λίστα σχεδίων', desc: 'Αναζήτηση με φίλτρα, ταξινόμηση και προβολή.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" />
      </svg>
    ),
  },
  {
    to: '/drawings?import=1', primary: false,
    title: 'Καταχώριση σχεδίου', desc: 'Νέο σχέδιο με στοιχεία και αρχείο εικόνας.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /><path d="M12 11v6M9 14h6" />
      </svg>
    ),
  },
  {
    to: '/drawings?import=mass', primary: false,
    title: 'Μαζική καταχώριση', desc: 'Πολλά αρχεία μαζί, με κοινά στοιχεία.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 7h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" /><path d="M4 16V5a1 1 0 0 1 1-1h11" /><path d="M13.5 11v6M10.5 14h6" />
      </svg>
    ),
  },
]

export default function HomePage() {
  const navigate = useNavigate()
  const stats = useQuery({ queryKey: ['stats'], queryFn: ({ signal }) => getStats(signal), staleTime: 60_000 })
  const d = stats.data
  const kpis: { label: string; value: number | null }[] = [
    { label: 'κατηγορίες έργου', value: d ? d.perKathgoria.filter((s) => s.id != null).length : null },
    { label: 'είδη σχεδίου', value: d ? d.perEidos.filter((s) => s.id != null).length : null },
    { label: 'μονάδες', value: d ? d.perMonada.filter((s) => s.id != null).length : null },
  ]

  return (
    <div className="home-grid">
      <section className="card hero">
        <div className="hero-text">
          <div className="hero-eyebrow">Αρχείο τεχνικών σχεδίων</div>
          <p className="home-stat">
            {d ? d.total.toLocaleString('el-GR') : <Skeleton width={110} height={38} />}
            <span> σχέδια στο αρχείο</span>
          </p>
          <p className="hero-note">
            Αναζητήστε και προβάλετε τα αρχειοθετημένα σχέδια ή καταχωρίστε νέα.
          </p>
          <dl className="hero-kpis">
            {kpis.map((k) => (
              <div key={k.label}>
                <dt>{k.value != null ? k.value.toLocaleString('el-GR') : <Skeleton width={24} height={16} />}</dt>
                <dd>{k.label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <HeroArt />
      </section>

      <nav className="home-actions" aria-label="Ενέργειες">
        {ACTIONS.map((a) => (
          <a key={a.to} href={a.to} className={'card action-tile' + (a.primary ? ' action-primary' : '')}
             onClick={(e) => { e.preventDefault(); navigate(a.to) }}>
            <span className="action-icon">{a.icon}</span>
            <span className="action-body">
              <strong>{a.title}</strong>
              <span>{a.desc}</span>
            </span>
            <span className="action-arrow" aria-hidden="true">→</span>
          </a>
        ))}
      </nav>

      {d ? (
        <>
          <StatList title="Ανά κατηγορία έργου" items={d.perKathgoria} param="kathg" />
          <StatList title="Ανά είδος σχεδίου" items={d.perEidos} param="eidos" />
          <StatList title="Ανά μονάδα" items={d.perMonada} param="hstr" />
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
