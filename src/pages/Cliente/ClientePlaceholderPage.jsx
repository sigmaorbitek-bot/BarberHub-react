import { Link } from "react-router-dom";
import "./ClientePlaceholderPage.css";

export default function ClientePlaceholderPage({
  eyebrow = "BARBERHUB",
  title,
  description,
  icon = "✦",
  nextStep,
}) {
  return (
    <section className="client-placeholder-page">
      <div className="client-page-heading">
        <div>
          <span>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>

      <div className="client-placeholder-card">
        <div className="client-placeholder-icon">
          {icon}
        </div>

        <strong>{title}</strong>

        <p>
          A estrutura desta área já está pronta. Agora vamos
          conectar o fluxo real ao Supabase, mantendo as regras
          de segurança do BarberHub.
        </p>

        {nextStep ? (
          <span className="client-placeholder-next">
            Próximo passo: {nextStep}
          </span>
        ) : null}

        <Link to="/cliente">
          ← Voltar para o início
        </Link>
      </div>
    </section>
  );
}
