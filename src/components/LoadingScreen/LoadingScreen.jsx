import "./LoadingScreen.css";

export default function LoadingScreen({ text = "Carregando..." }) {
  return (
    <div
      className="loading-screen"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="loading-screen__card">
        <div className="loading-screen__logo-wrap">
          <img src="/barber.png" alt="" className="loading-screen__logo" />

          <span className="loading-screen__orbit" aria-hidden="true" />
        </div>

        <div className="loading-screen__brand">
          <strong>BarberHub</strong>
          <span>Gestão de barbearias</span>
        </div>

        <div className="loading-screen__spinner" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <p>{text}</p>

        <small>Desenvolvido por Sigma Orbitek</small>
      </div>
    </div>
  );
}
