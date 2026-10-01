import { Link } from "react-router-dom";

import "./StatCard.css";

export default function StatCard({
  icon,
  tag,
  value,
  label,
  helper,
  to,
  variant = "default",
}) {
  const className = [
    "stat-card",
    `stat-card--${variant}`,
    to ? "stat-card--clickable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <div className="stat-card-top">
        <span className="stat-card-icon" aria-hidden="true">
          {icon}
        </span>

        {tag ? (
          <span className="stat-card-tag">
            {tag}
          </span>
        ) : null}
      </div>

      <div className="stat-card-content">
        <strong>{value}</strong>
        <p>{label}</p>

        {helper ? (
          <small>{helper}</small>
        ) : null}
      </div>
    </>
  );

  if (to) {
    return (
      <Link
        className={className}
        to={to}
      >
        {content}
      </Link>
    );
  }

  return (
    <article className={className}>
      {content}
    </article>
  );
}
