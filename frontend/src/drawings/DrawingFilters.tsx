import ComboSelect from '../components/ComboSelect'
import type { Filters, LookupData } from '../api/types'
import type { useListState } from './useListState'

/** The «Αναζήτηση» card. Every control applies immediately except the text box,
    which waits for Enter or the button (see useListState). */
export default function DrawingFilters({ lookups, list }: {
  lookups: LookupData | undefined
  list: ReturnType<typeof useListState>
}) {
  const { filters, draftQ, setDraftQ, apply, setFilter, search, reset } = list
  const ypokatOptions = (lookups?.ypokatErg ?? []).filter(
    (y) => !filters.kathg || y.parentId === Number(filters.kathg),
  )
  const date = (key: keyof Filters) => ({
    type: 'date' as const,
    value: filters[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => apply({ ...filters, [key]: e.target.value }),
  })

  return (
    <section className="card filters">
      <div className="filters-title">Αναζήτηση</div>
      <div className="filter-grid">
        <label className="field field-search">
          <span>Κείμενο</span>
          <input
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Αριθμός σχεδίου, κωδικός έργου, τίτλος, περιγραφή…"
          />
        </label>
        <label className="field">
          <span>Εισαγωγή από</span>
          <input {...date('insFrom')} />
        </label>
        <label className="field">
          <span>Εισαγωγή έως</span>
          <input {...date('insTo')} />
        </label>
        <div className="filter-buttons">
          <button className="primary" onClick={search}>Αναζήτηση</button>
          <button onClick={reset}>Καθαρισμός</button>
        </div>
        <div className="field">
          <span>Κατηγορία έργου</span>
          <ComboSelect options={lookups?.kathgoriaErg ?? []} value={filters.kathg} allLabel="Όλες" onChange={setFilter('kathg')} />
        </div>
        <div className="field">
          <span>Υποκατηγορία</span>
          <ComboSelect options={ypokatOptions} value={filters.ypokat} allLabel="Όλες" onChange={setFilter('ypokat')} />
        </div>
        <div className="field">
          <span>Μονάδα</span>
          <ComboSelect options={lookups?.monadaInUse ?? []} value={filters.hstr} allLabel="Όλες" onChange={setFilter('hstr')} />
        </div>
        <div className="field">
          <span>Είδος σχεδίου</span>
          <ComboSelect options={lookups?.eidosSxed ?? []} value={filters.eidos} allLabel="Όλα" onChange={setFilter('eidos')} />
        </div>
        <div className="field">
          <span>Χώρος αποθήκευσης</span>
          <ComboSelect options={lookups?.xorosApoth ?? []} value={filters.xoros} allLabel="Όλοι" onChange={setFilter('xoros')} />
        </div>
      </div>
    </section>
  )
}
