export default function EmptyState({ title, message, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      {title && <strong>{title}</strong>}
      {message && <p className="muted">{message}</p>}
      {actionLabel && onAction && (
        <button className="btn primary" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
