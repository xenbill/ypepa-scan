// The server's UI configuration (GET /api/config): which file types the import
// pickers offer and whether the CAD feature (DWG/DXF/DGN/DWF) is enabled. The
// backend (Imaging/FileTypes.cs + the Cad:Enabled flag) is the single source of
// truth — the SPA builds its pickers and manual/help content from this.
import { getJson } from './http'

export interface AppConfig {
  cadEnabled: boolean
  /** Comma-separated extension list for <input type="file" accept>. */
  accept: string
}

export const getConfig = (signal?: AbortSignal) => getJson<AppConfig>('/api/config', signal)
