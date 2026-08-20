/** Fallback for the import file pickers until GET /api/config answers (see
    useAppConfig) — the base list without the CAD extensions. The server
    (backend/Imaging/FileTypes.cs) is the source of truth and sniffs the real
    type from the file's magic numbers anyway. */
export const ACCEPT_FALLBACK = '.tif,.tiff,.pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp'
