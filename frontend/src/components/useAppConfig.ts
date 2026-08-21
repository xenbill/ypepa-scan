import { useQuery } from '@tanstack/react-query'
import { getConfig, type AppConfig } from '../api/config'

/** GET /api/config, cached for the whole session. `undefined` while loading —
    callers fall back to the conservative (non-CAD) defaults until it answers. */
export function useAppConfig(): AppConfig | undefined {
  return useQuery({
    queryKey: ['config'],
    queryFn: ({ signal }) => getConfig(signal),
    staleTime: Infinity,
  }).data
}
