// Mirrors the C# DTOs in Sxedia.Web/Data/Models.cs (System.Text.Json camelCase).

export interface Lookup {
  id: number
  name: string
  parentId: number | null
}

export interface LookupData {
  eidosSxed: Lookup[]
  kathgoriaErg: Lookup[]
  ypokatErg: Lookup[]
  xorosApoth: Lookup[]
  /** COMMON.G11HAF_STRUCTURE (HSTR_ID / TITLE) */
  monada: Lookup[]
  /** Subset of monada with at least one live drawing — search filter only */
  monadaInUse: Lookup[]
}

export interface DrawingRow {
  sxedioId: number
  kodikosErg: string | null
  arithmosSxed: string | null
  titlosErg: string | null
  titlosSxed: string | null
  perigrafhSxed: string | null
  perigrafhErg: string | null
  hmer: string | null
  eidosSxed: string | null
  kathgoriaErg: string | null
  ypokathgoriaErg: string | null
  xorosApoth: string | null
  monada: string | null
  eidosSxedId: number | null
  kathgErgId: number | null
  ypokatErgId: number | null
  xorosApothId: number | null
  hstrId: number | null
  mazikiKataxwrisi: number | null
  dateIns: string | null
  userIns: string | null
  /** file length in bytes; only present on GET /drawings/{id} */
  sizeBytes?: number | null
}

export interface SearchResult {
  items: DrawingRow[]
  total: number
  page: number
  pageSize: number
}

export interface Filters {
  q: string
  kathg: string
  ypokat: string
  eidos: string
  xoros: string
  hstr: string
  /** DATE_INS range (yyyy-MM-dd) */
  insFrom: string
  insTo: string
}

export const emptyFilters: Filters = {
  q: '', kathg: '', ypokat: '', eidos: '', xoros: '', hstr: '', insFrom: '', insTo: '',
}

/** Body for PUT /api/drawings/{id} — mirrors the C# ImportMeta record. */
export interface DrawingMeta {
  kodikosErg: string | null
  arithmosSxed: string | null
  titlosErg: string | null
  titlosSxed: string | null
  perigrafhSxed: string | null
  perigrafhErg: string | null
  hmer: string | null
  eidosId: number | null
  kathgId: number | null
  ypokatId: number | null
  xorosId: number | null
  hstrId: number | null
}

/** Sxedia.Web/Imaging/TileService.cs ViewInfo */
export interface ViewInfo {
  type: 'dzi' | 'pdf'
  url: string
  thumbUrl: string
  width: number | null
  height: number | null
}
