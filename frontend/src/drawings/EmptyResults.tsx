/** Shown instead of rows when a search matched nothing. */
export default function EmptyResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="empty-note">
      <svg width="72" height="56" viewBox="0 0 72 56" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="70" height="54" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <rect x="7.5" y="7.5" width="57" height="41" stroke="currentColor" opacity="0.45" />
        <rect x="42.5" y="38.5" width="22" height="10" stroke="currentColor" opacity="0.7" />
        <path d="M15 18h24M15 25h30M15 32h18" stroke="currentColor" opacity="0.45" />
      </svg>
      <p><strong>Δεν βρέθηκαν σχέδια</strong></p>
      <p>Δοκιμάστε λιγότερα φίλτρα ή διαφορετικό κείμενο αναζήτησης.</p>
      <button onClick={onClear}>Καθαρισμός φίλτρων</button>
    </div>
  )
}
