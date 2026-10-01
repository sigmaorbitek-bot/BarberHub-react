import { useNavigate } from "react-router-dom";

import "./Home.css";

const FEATURES = [
  {
    icon: "📅",
    label: "Agendamento online",
  },
  {
    icon: "💈",
    label: "Gestão de barbeiros",
  },
  {
    icon: "👥",
    label: "Gestão de clientes",
  },
];

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <main className="home-page">
      <section className="home-container">
        <div className="home-card">
          <div className="home-brand">
            <img
              src="/barber.png"
              alt="Logo do BarberHub"
              className="home-logo"
            />
          </div>

          <h1 className="home-title">Bem-vindo ao BarberHub!</h1>

          <p className="home-subtitle">Gestão inteligente para barbearias</p>

          <div className="home-divider" aria-hidden="true" />

          <p className="home-description">
            Organize sua barbearia, gerencie seus clientes e acompanhe seu
            negócio em um só lugar.
          </p>

          <div className="home-features" aria-label="Diferenciais do BarberHub">
            {FEATURES.map((feature) => (
              <div className="home-feature" key={feature.label}>
                <span className="home-feature-icon" aria-hidden="true">
                  {feature.icon}
                </span>

                <span>{feature.label}</span>
              </div>
            ))}
          </div>

          <div className="home-actions">
            <button
              type="button"
              className="home-button"
              onClick={() => navigate("/login/barbearia")}
            >
              <span aria-hidden="true">💈</span>
              Acessar como Barbearia
            </button>

            <button
              type="button"
              className="home-button"
              onClick={() => navigate("/login/cliente")}
            >
              <span aria-hidden="true">👤</span>
              Acessar como Cliente
            </button>
          </div>

          <p className="home-footer">
            BarberHub · Desenvolvido por Sigma Orbitek
          </p>
        </div>
      </section>
    </main>
  );
}
