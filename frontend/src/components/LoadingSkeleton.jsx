export default function LoadingSkeleton({ rows = 3, label = "Loading…" }) {
  return (
    <div className="loading-skeleton" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="skeleton-card">
          <div className="skeleton-line wide" />
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
        </div>
      ))}
    </div>
  );
}
