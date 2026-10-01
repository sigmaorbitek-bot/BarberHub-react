import "./EmptyState.css";

export default function EmptyState({
  icon = "📭",
  title,
  description,
}) {
  return (
    <div className="panel-empty-state">
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>

      {description ? (
        <p>{description}</p>
      ) : null}
    </div>
  );
}
