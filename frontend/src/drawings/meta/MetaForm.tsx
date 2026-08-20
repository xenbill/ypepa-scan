import { createContext, useContext } from 'react'
import ComboSelect from '../../components/ComboSelect'
import type { Lookup, LookupData } from '../../api/types'
import {
  META_FIELDS, metaLabel, optionsFor, patchMeta,
  type LookupSource, type MetaKey, type MetaValues,
} from './fields'

interface MetaFormValue {
  values: MetaValues
  onChange: (next: MetaValues) => void
  lookups: LookupData
  /** The row being edited — lets Μονάδα keep a legacy sub-unit that is not in the list. */
  current?: { hstrId: number | null; monada: string | null } | null
  /** Μαζική καταχώριση only: the common values a blank field inherits. */
  placeholders?: MetaValues
  /** Which values decide the dependent option lists. Defaults to `values`; the
      per-file override editor passes the *effective* ones, so Υποκατηγορία still
      offers the children of an inherited Κατηγορία. */
  optionsBasis?: MetaValues
  disabled?: boolean
  /** Render single-line text fields as (one-line-tall) textareas too, so every
      free-text field looks and stretches the same — the mass grid uses this.
      Newlines are stripped, since these values are single-line in the DB. */
  multiline?: boolean
}

const Ctx = createContext<MetaFormValue | null>(null)

/** Wraps any layout of <MetaCells>/<MetaField>; they read the values from here. */
export function MetaForm({ children, ...value }: MetaFormValue & { children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function useMetaForm(): MetaFormValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('MetaControl used outside <MetaForm>')
  return ctx
}

/** Full list for a source — used to name an inherited value, which may sit outside
    the currently offered (filtered) options. */
function nameList(source: LookupSource, lookups: LookupData): Lookup[] {
  if (source === 'ypokat') return lookups.ypokatErg
  if (source === 'monada') return lookups.monadaEdit
  return lookups[source]
}

const nameOf = (list: Lookup[], id: string) => list.find((l) => String(l.id) === id)?.name ?? ''

/** One editor control. Everything about the field — label, length, which pick list —
    comes from META_FIELDS, so a change there reaches all three screens. */
export function MetaControl({ k, required, invalid }: { k: MetaKey; required?: boolean; invalid?: boolean }) {
  const { values, onChange, lookups, current, placeholders, optionsBasis, disabled, multiline } = useMetaForm()
  const def = META_FIELDS[k]
  const value = values[k]
  const inherited = placeholders?.[k] ?? ''
  const set = (v: string) => onChange(patchMeta(values, { [k]: v } as Partial<MetaValues>))
  const cls = invalid ? 'is-invalid' : undefined

  switch (def.control) {
    case 'text':
      if (multiline) {
        return (
          <textarea value={value} maxLength={def.maxLength} rows={1} required={required} className={cls}
                    disabled={disabled} placeholder={inherited || undefined}
                    onChange={(e) => set(e.target.value.replace(/\n/g, ' '))} />
        )
      }
      return (
        <input value={value} maxLength={def.maxLength} required={required} className={cls}
               disabled={disabled} placeholder={inherited || undefined}
               onChange={(e) => set(e.target.value)} />
      )
    case 'textarea':
      return (
        <textarea value={value} maxLength={def.maxLength} rows={def.rows} disabled={disabled} className={cls}
                  placeholder={inherited || undefined} onChange={(e) => set(e.target.value)} />
      )
    case 'date':
      return (
        <input type="date" value={value} disabled={disabled} className={cls}
               title={inherited && !value ? 'Κοινή τιμή: ' + inherited : undefined}
               onChange={(e) => set(e.target.value)} />
      )
    case 'lookup': {
      // In override mode the blank entry reads «↑ common value»; for Υποκατηγορία
      // only while the category is inherited too, since a subcategory of another
      // category would be wrong.
      const canInherit = placeholders != null
        && (def.source !== 'ypokat' || values.kathgId === '' || !placeholders.kathgId)
      const allLabel = canInherit ? '↑ ' + (nameOf(nameList(def.source, lookups), inherited) || '—') : '—'
      return (
        <ComboSelect options={optionsFor(def.source, lookups, optionsBasis ?? values, current)} value={value}
                     allLabel={allLabel} onChange={set} />
      )
    }
  }
}

/** A <th>label</th><td>control</td> pair for the import pages' .form-table
    layout. `error` marks the control red and prints the message under it —
    the pages validate on submit instead of the browser's native bubbles. */
export function MetaCells({ k, required, wide, span, error }: {
  k: MetaKey; required?: boolean; wide?: boolean; span?: number; error?: string
}) {
  return (
    <>
      <th>{metaLabel(k)}{required ? ' *' : ''}</th>
      <td colSpan={span ?? (wide ? 3 : undefined)}>
        <MetaControl k={k} required={required} invalid={!!error} />
        {error && <div className="field-err">{error}</div>}
      </td>
    </>
  )
}

/** A stacked <label> for the viewer's narrow side panel. */
export function MetaField({ k, required, error }: { k: MetaKey; required?: boolean; error?: string }) {
  return (
    <label>
      {metaLabel(k)}
      <MetaControl k={k} required={required} invalid={!!error} />
      {error && <div className="field-err">{error}</div>}
    </label>
  )
}
