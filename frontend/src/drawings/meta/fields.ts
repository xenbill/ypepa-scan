// The metadata of a drawing, described once.
//
// Three screens edit these same twelve fields — «Καταχώριση», «Μαζική
// καταχώριση» (common values + per-file overrides) and «Επεξεργασία» in the
// viewer — and each used to carry its own copy of the labels, lengths and
// lookup lists. They now all render from META_FIELDS; only the layout differs,
// because a 4-column dialog table cannot fit the viewer's 310px side panel.
//
// Values are kept as strings throughout ('' = empty), which is what <input> and
// FormData speak; the converters at the bottom translate at the edges.
import type { DrawingMeta, DrawingRow, Lookup, LookupData } from '../../api/types'
import { monadaForEdit } from '../../api/types'

export interface MetaValues {
  arithmosSxed: string
  eidosId: string
  titlosSxed: string
  perigrafhSxed: string
  kodikosErg: string
  kathgId: string
  ypokatId: string
  perigrafhErg: string
  hstrId: string
  titlosErg: string
  xorosId: string
  hmer: string
}

export type MetaKey = keyof MetaValues

export const EMPTY_META: MetaValues = {
  arithmosSxed: '', eidosId: '', titlosSxed: '', perigrafhSxed: '', kodikosErg: '', kathgId: '',
  ypokatId: '', perigrafhErg: '', hstrId: '', titlosErg: '', xorosId: '', hmer: '',
}

/** Which pick list a lookup field offers; 'monada' and 'ypokat' are computed. */
export type LookupSource = 'eidosSxed' | 'kathgoriaErg' | 'ypokat' | 'xorosApoth' | 'monada'

export type FieldDef =
  | { label: string; control: 'text'; maxLength: number }
  | { label: string; control: 'textarea'; maxLength: number; rows: number }
  | { label: string; control: 'date' }
  | { label: string; control: 'lookup'; source: LookupSource }

export const META_FIELDS: Record<MetaKey, FieldDef> = {
  arithmosSxed: { label: 'Αριθμός σχεδίου', control: 'text', maxLength: 50 },
  eidosId: { label: 'Είδος σχεδίου', control: 'lookup', source: 'eidosSxed' },
  titlosSxed: { label: 'Τίτλος σχεδίου', control: 'text', maxLength: 500 },
  perigrafhSxed: { label: 'Περιγραφή σχεδίου', control: 'textarea', maxLength: 2000, rows: 2 },
  kodikosErg: { label: 'Κωδικός έργου', control: 'text', maxLength: 50 },
  kathgId: { label: 'Κατηγορία έργου', control: 'lookup', source: 'kathgoriaErg' },
  ypokatId: { label: 'Υποκατηγορία έργου', control: 'lookup', source: 'ypokat' },
  perigrafhErg: { label: 'Περιγραφή έργου', control: 'textarea', maxLength: 2000, rows: 2 },
  hstrId: { label: 'Μονάδα', control: 'lookup', source: 'monada' },
  titlosErg: { label: 'Υπομονάδα', control: 'text', maxLength: 500 },
  xorosId: { label: 'Χώρος αποθήκευσης', control: 'lookup', source: 'xorosApoth' },
  hmer: { label: 'Ημερομηνία', control: 'date' },
}

export const metaLabel = (k: MetaKey): string => META_FIELDS[k].label

/**
 * The options for one lookup field. Υποκατηγορία only offers the children of the
 * chosen Κατηγορία, and Μονάδα offers the top-level units plus the record's own
 * one when that is a sub-unit (old rows), so editing never silently drops it.
 */
export function optionsFor(
  source: LookupSource,
  lookups: LookupData,
  values: MetaValues,
  current?: { hstrId: number | null; monada: string | null } | null,
): Lookup[] {
  switch (source) {
    case 'ypokat':
      return lookups.ypokatErg.filter((y) => !values.kathgId || y.parentId === Number(values.kathgId))
    case 'monada':
      return monadaForEdit(lookups, current)
    default:
      return lookups[source]
  }
}

/** Picking another category drops the subcategory under it — it belongs elsewhere. */
export function patchMeta(values: MetaValues, patch: Partial<MetaValues>): MetaValues {
  const next = { ...values, ...patch }
  if (patch.kathgId !== undefined && patch.ypokatId === undefined) next.ypokatId = ''
  return next
}

// ---- edges -----------------------------------------------------------------

/** POST /api/drawings expects the values as form fields, named exactly like these keys. */
export function appendMeta(fd: FormData, values: MetaValues): FormData {
  for (const k of Object.keys(EMPTY_META) as MetaKey[]) fd.append(k, values[k])
  return fd
}

const str = (v: string | null | undefined) => v ?? ''
const id = (v: number | null | undefined) => (v == null ? '' : String(v))

export function metaFromRow(d: DrawingRow): MetaValues {
  return {
    arithmosSxed: str(d.arithmosSxed),
    eidosId: id(d.eidosSxedId),
    titlosSxed: str(d.titlosSxed),
    perigrafhSxed: str(d.perigrafhSxed),
    kodikosErg: str(d.kodikosErg),
    kathgId: id(d.kathgErgId),
    ypokatId: id(d.ypokatErgId),
    perigrafhErg: str(d.perigrafhErg),
    hstrId: id(d.hstrId),
    titlosErg: str(d.titlosErg),
    xorosId: id(d.xorosApothId),
    hmer: d.hmer ? d.hmer.slice(0, 10) : '',
  }
}

/** PUT /api/drawings/{id} wants real nulls and numeric lookup ids. */
export function metaToDrawingMeta(v: MetaValues): DrawingMeta {
  const text = (s: string) => s || null
  const num = (s: string) => (s ? Number(s) : null)
  return {
    kodikosErg: text(v.kodikosErg),
    arithmosSxed: text(v.arithmosSxed),
    titlosErg: text(v.titlosErg),
    titlosSxed: text(v.titlosSxed),
    perigrafhSxed: text(v.perigrafhSxed),
    perigrafhErg: text(v.perigrafhErg),
    hmer: text(v.hmer),
    eidosId: num(v.eidosId),
    kathgId: num(v.kathgId),
    ypokatId: num(v.ypokatId),
    xorosId: num(v.xorosId),
    hstrId: num(v.hstrId),
  }
}
