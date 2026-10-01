import {
  useNavigate,
} from "react-router-dom";

import {
  useProfissional,
} from "./useProfissional";
import "./Profissional.css";

export default function ProfissionalHomePage() {
  const {
    contexto,
  } = useProfissional();

  const navigate =
    useNavigate();

  return (
    <section className="professional-dashboard-page">
      <div className="professional-page-heading">
        <div>
          <span className="professional-eyebrow">
            VISÃO GERAL
          </span>

          <h1>
            Olá,{" "}
            {
              contexto.profissional_nome
            }
          </h1>

          <p>
            Acompanhe sua rotina na{" "}
            <strong>
              {
                contexto.barbearia_nome
              }
            </strong>
            .
          </p>
        </div>
      </div>

      <div className="professional-dashboard-cards">
        <button
          type="button"
          disabled={
            !contexto.ver_agendamentos
          }
          onClick={() =>
            navigate(
              "/profissional/agenda",
            )
          }
        >
          <div className="professional-dashboard-card-icon">
            📅
          </div>

          <div>
            <small>
              AGENDA
            </small>

            <strong>
              Meus agendamentos
            </strong>

            <p>
              {contexto.ver_agendamentos
                ? "Veja seus próximos atendimentos."
                : "Acesso não liberado pela barbearia."}
            </p>
          </div>

          <span>›</span>
        </button>

        <button
          type="button"
          disabled={
            !contexto.ver_financeiro
          }
          onClick={() =>
            navigate(
              "/profissional/financeiro",
            )
          }
        >
          <div className="professional-dashboard-card-icon">
            💰
          </div>

          <div>
            <small>
              RESULTADOS
            </small>

            <strong>
              Meu financeiro
            </strong>

            <p>
              {contexto.ver_financeiro
                ? "Acompanhe seus resultados e comissão."
                : "Acesso não liberado pela barbearia."}
            </p>
          </div>

          <span>›</span>
        </button>
      </div>

      <div className="professional-dashboard-info">
        <div>
          <span>🔐</span>

          <div>
            <strong>
              Acesso controlado pela barbearia
            </strong>

            <p>
              Você visualiza somente os módulos e informações liberados para seu perfil.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
