// Display formatting (el-GR). Not an API concern — the server sends raw values.

export function formatDate(s: string | null | undefined): string {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('el-GR')
}

/** Bytes → "12,3 MB" (el-GR), '' when unknown. */
export function formatMb(bytes: number | null | undefined): string {
  if (bytes == null) return ''
  return (bytes / 1048576).toLocaleString('el-GR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MB'
}

const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF', tiff: 'TIFF', jpeg: 'JPEG', png: 'PNG', gif: 'GIF', bmp: 'BMP', webp: 'WebP',
  dwg: 'DWG (AutoCAD)', zip: 'ZIP/Office', ole: 'Word/Excel (παλαιό)', unknown: 'Άγνωστος',
}

export function formatFileType(type: string | null | undefined): string {
  if (!type) return ''
  return FILE_TYPE_LABELS[type] ?? type.toUpperCase()
}
