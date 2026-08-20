import { formatMb } from '../../lib/format'
import { ProgressBar, Spinner } from '../../components/Loading'
import { hasOverrides, type FileRow, type RowStatus } from './useUploadQueue'

/** One file in the «Μαζική καταχώριση» table, plus its expandable override panel. */
export default function FileRowView({ row, locked, running, onToggle, onNumber, onRemove, children }: {
  row: FileRow
  locked: boolean
  running: boolean
  onToggle: () => void
  onNumber: (v: string) => void
  onRemove: () => void
  children?: React.ReactNode
}) {
  const tuned = hasOverrides(row.overrides)
  return (
    <>
      <tr className={'mass-row' + (row.expanded ? ' is-open' : '') + ' is-' + row.status.kind}>
        <td>
          <button type="button" className="mass-expand" onClick={onToggle} aria-expanded={row.expanded}
                  title={row.expanded ? 'Απόκρυψη ρυθμίσεων αρχείου' : 'Ρυθμίσεις ανά αρχείο'}>
            {row.expanded ? '▾' : '▸'}
          </button>
        </td>
        <td className="mass-name" title={row.file.name}>
          {row.file.name}
          {tuned && <span className="mass-tuned" title="Έχει διαφοροποιημένα στοιχεία">✎</span>}
        </td>
        <td className="mono">{formatMb(row.file.size)}</td>
        <td>
          <input value={row.arithmosSxed} maxLength={50} disabled={locked}
                 className={!row.arithmosSxed.trim() ? 'is-invalid' : undefined}
                 onChange={(e) => onNumber(e.target.value)} />
        </td>
        <td><RowStatusView status={row.status} /></td>
        <td>
          {!running && row.status.kind !== 'done' && (
            <button type="button" className="mass-remove" onClick={onRemove} title="Αφαίρεση">×</button>
          )}
        </td>
      </tr>
      {row.expanded && (
        <tr className="mass-detail">
          <td />
          <td colSpan={5}>{children}</td>
        </tr>
      )}
    </>
  )
}

function RowStatusView({ status }: { status: RowStatus }) {
  switch (status.kind) {
    case 'pending':
      return <span className="mass-status-pending">Σε αναμονή</span>
    case 'uploading': {
      const p = status.progress
      const pct = p.total > 0 ? (p.loaded / p.total) * 100 : 0
      return (
        <span className="mass-status-upl">
          <span className="upload-line">
            <span><Spinner size={11} /> {p.saving ? 'Αποθήκευση…' : p.total > 0 ? 'Αποστολή…' : 'Έναρξη…'}</span>
            {!p.saving && p.total > 0 && <span className="mono">{Math.round(pct)}%</span>}
          </span>
          <ProgressBar percent={pct} indeterminate={p.saving} />
        </span>
      )
    }
    case 'done':
      return <span className="status-ok">✓ Α/Α {status.id}</span>
    case 'error':
      return <span className={status.aborted ? 'status-warn' : 'status-err'} title={status.message}>{status.message}</span>
  }
}
