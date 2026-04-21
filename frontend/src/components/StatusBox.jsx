// src/components/StatusBox.jsx
// Reusable feedback component displayed below action buttons.

export default function StatusBox({ loading, error, success }) {
  if (!loading && !error && !success) return null

  const type  = error ? 'error' : loading ? 'loading' : 'success'
  const icon  = error ? '⚠️'   : loading ? '⏳'       : '✅'
  const text  = String(error || success || 'Processing…')

  return (
    <div className={`status-box ${type}`} role="status" aria-live="polite">
      <span className="status-icon">{icon}</span>
      <span>{text}</span>
    </div>
  )
}
