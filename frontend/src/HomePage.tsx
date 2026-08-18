import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getStats, type StatItem } from './api'

/** Compact single-hue bar list: sorted desc, proportional bars, scrolls past ~8 rows. */
function StatList({ title, items }: { title: string; items: StatItem[] }) {
  const max = Math.max(1, ...items.map((s) => s.count))
  return (
    <section className="card home-card">
      <h2>{title}</h2>
      <div className="stat-scroll">
        {items.map((s) => (
          <div key={s.name} className="stat-row" title={`${s.name}: ${s.count.toLocaleString('el-GR')}`}>
            <div className="stat-row-line">
              <span className="stat-name">{s.name}</span>
              <span className="stat-count">{s.count.toLocaleString('el-GR')}</span>
            </div>
            <div className="stat-bar-track">
              <div className="stat-bar-fill" style={{ width: `${(s.count / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const stats = useQuery({ queryKey: ['stats'], queryFn: getStats, staleTime: 60_000 })

  return (
    <div className="home-grid">
      <section className="card home-card">
        <h2>Αρχείο σχεδίων</h2>
        <p className="home-stat">
          {stats.data ? stats.data.total.toLocaleString('el-GR') : '…'}
          <span> σχέδια</span>
        </p>
        <button className="primary" onClick={() => navigate('/sxedia')}>Άνοιγμα λίστας σχεδίων</button>
      </section>
      {stats.data && <StatList title="Ανά κατηγορία έργου" items={stats.data.perKathgoria} />}
      {stats.data && <StatList title="Ανά είδος σχεδίου" items={stats.data.perEidos} />}
      {stats.data && <StatList title="Ανά μονάδα" items={stats.data.perMonada} />}
    </div>
  )
}
