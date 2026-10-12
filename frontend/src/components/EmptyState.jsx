export default function EmptyState({ title, desc, action }) {
  return (
    <div className="empty-state">
      <img src="/assets/logo.png" alt="" />
      <h4>{title}</h4>
      <p>{desc}</p>
      {action}
    </div>
  );
}
