export function LoadingState({ label = "Loading..." }) {
  return <div className="empty-state"><p>{label}</p></div>;
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="empty-state">
      <h4>Something went wrong</h4>
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-secondary btn-sm" onClick={onRetry}>Retry</button>
      )}
    </div>
  );
}
