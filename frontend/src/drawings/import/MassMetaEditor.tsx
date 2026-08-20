import type { Lookup, LookupData } from '../../api/types'
import { type MetaValues } from '../meta/fields'
import { MetaCells, MetaForm } from '../meta/MetaForm'

/**
 * The metadata grid of «Μαζική καταχώριση» — everything except Αριθμός σχεδίου,
 * which belongs to the single file. Used twice: once for the common values, and
 * once per file for the overrides. With `placeholders` it is in override mode:
 * blank text fields show the common value greyed out and the lookup pickers
 * offer «↑ <common value>» as their blank entry, so blank means "inherit".
 */
export default function MassMetaEditor({ values, onChange, lookups, placeholders, optionsBasis, disabled, onClear }: {
  values: MetaValues
  onChange: (m: MetaValues) => void
  lookups: LookupData
  placeholders?: MetaValues
  optionsBasis?: MetaValues
  disabled?: boolean
  onClear?: () => void
}) {
  return (
    <div className={'mass-fields' + (disabled ? ' is-disabled' : '')}>
      <MetaForm values={values} onChange={onChange} lookups={lookups} multiline
                placeholders={placeholders} optionsBasis={optionsBasis} disabled={disabled}>
        {/* Three label+field pairs per row, no section headers: this grid sits
            above (and, per file, inside) the file table, so height is what
            counts. The single-file page keeps the roomier sectioned layout. */}
        <table className="form-table mass-form-table">
          <tbody>
            <tr>
              <MetaCells k="eidosId" />
              <MetaCells k="hmer" />
              <MetaCells k="xorosId" />
            </tr>
            <tr>
              <MetaCells k="kathgId" />
              <MetaCells k="ypokatId" />
              <MetaCells k="kodikosErg" />
            </tr>
            <tr>
              <MetaCells k="hstrId" />
              <MetaCells k="titlosErg" />
              <MetaCells k="perigrafhErg" />
            </tr>
            <tr>
              <MetaCells k="titlosSxed" span={2} />
              <MetaCells k="perigrafhSxed" span={2} />
            </tr>
            {placeholders && (
              <tr>
                <td colSpan={6} className="mass-fields-foot">
                  <span className="mass-inherit-note">
                    Κενό πεδίο = κοινή τιμή.
                    {onClear && <> <button type="button" className="linklike" onClick={onClear}>Επαναφορά στα κοινά</button></>}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </MetaForm>
    </div>
  )
}

const nameOf = (list: Lookup[], id: string) => list.find((l) => String(l.id) === id)?.name ?? ''

/** One-line preview of the common values, for the collapsed «Κοινά στοιχεία» header. */
export function summarize(m: MetaValues, lookups: LookupData): string {
  const parts: string[] = []
  if (m.eidosId) parts.push(nameOf(lookups.eidosSxed, m.eidosId))
  if (m.kodikosErg) parts.push(m.kodikosErg)
  if (m.kathgId) parts.push(nameOf(lookups.kathgoriaErg, m.kathgId))
  if (m.ypokatId) parts.push(nameOf(lookups.ypokatErg, m.ypokatId))
  if (m.hstrId) parts.push(nameOf(lookups.monadaEdit, m.hstrId))
  if (m.titlosErg) parts.push(m.titlosErg)
  if (m.titlosSxed) parts.push(m.titlosSxed)
  if (m.xorosId) parts.push(nameOf(lookups.xorosApoth, m.xorosId))
  if (m.hmer) parts.push(m.hmer)
  return parts.join(' · ')
}
