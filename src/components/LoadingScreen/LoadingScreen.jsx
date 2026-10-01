export default function LoadingScreen({
  text = "Carregando...",
}) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-spinner" aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}
