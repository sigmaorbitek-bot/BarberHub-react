import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "../../../services/supabase";
import { useProfissional } from "../useProfissional";
import "../Profissional.css";
import "./ProfissionalHomePage.css";

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function ProfissionalHomePage() {
  const { contexto } = useProfissional();
  const navigate = useNavigate();
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      setLoading(true);
      setMessage("");

      try {
        const { data, error } = await supabase.rpc(
          "obter_dashboard_profissional",
        );

        if (error) {
          throw error;
        }

        if (!ativo) {
          return;
        }

        const item = Array.isArray(data) ? data[0] : data;
        setResumo(item || null);
      } catch (error) {
        console.warn("[BarberHub] Dashboard profissional:", error);

        if (ativo) {
          setMessage(
            "Os indicadores do painel serão liberados após aplicar as migrations da área profissional.",
          );
          setResumo(null);
        }
      } finally {
        if (ativo) {
          setLoading(false);
        }
      }
    }

    carregar();

    return () => {
      ativo = false;
    };
  }, []);

  const cards = [
    {
      label: "HOJE",
      valor: loading ? "..." : resumo?.atendimentos_hoje ?? 0,
      detalhe: "atendimentos agendados",
      icon: "📅",
    },
    {
      label: "PRÓXIMOS",
      valor: loading ? "..." : resumo?.proximos_atendimentos ?? 0,
      detalhe: "na sua agenda",
      icon: "⏱️",
    },
    {
      label: "CONCLUÍDOS NO MÊS",
      valor: loading ? "..." : resumo?.concluidos_mes ?? 0,
      detalhe: "atendimentos finalizados",
      icon: "✅",
    },
    {
      label: "FATURAMENTO GERADO",
      valor: loading ? "..." : moeda(resumo?.faturamento_mes),
      detalhe: "no mês atual",
      icon: "💰",
    },
  ];

  return (
    <section className="professional-dashboard-page">
      <div className="professional-page-heading professional-home-heading">
        <div>
          <span className="professional-eyebrow">VISÃO GERAL</span>
          <h1>Olá, {contexto.profissional_nome}</h1>
          <p>
            Acompanhe sua rotina na <strong>{contexto.barbearia_nome}</strong>.
          </p>
        </div>

        <button
          type="button"
          className="professional-primary-button"
          disabled={!contexto.ver_agendamentos}
          onClick={() => navigate("/profissional/agenda")}
        >
          Abrir minha agenda
        </button>
      </div>

      {message ? <div className="professional-info-box">{message}</div> : null}

      <div className="professional-home-stats">
        {cards.map((card) => (
          <article key={card.label}>
            <div className="professional-home-stat-icon" aria-hidden="true">
              {card.icon}
            </div>
            <div>
              <small>{card.label}</small>
              <strong>{card.valor}</strong>
              <span>{card.detalhe}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="professional-home-grid">
        <section className="professional-panel-card">
          <div className="professional-section-heading">
            <div>
              <span className="professional-eyebrow">ATALHOS</span>
              <h2>Acesso rápido</h2>
            </div>
          </div>

          <div className="professional-home-actions">
            <button
              type="button"
              disabled={!contexto.ver_agendamentos}
              onClick={() => navigate("/profissional/agenda")}
            >
              <span>📅</span>
              <div>
                <strong>Minha agenda</strong>
                <small>Veja seus próximos atendimentos.</small>
              </div>
            </button>

            <button
              type="button"
              disabled={!contexto.ver_financeiro}
              onClick={() => navigate("/profissional/financeiro")}
            >
              <span>💰</span>
              <div>
                <strong>Meu financeiro</strong>
                <small>Faturamento e comissão.</small>
              </div>
            </button>

            <button
              type="button"
              disabled={!contexto.ver_clientes}
              onClick={() => navigate("/profissional/clientes")}
            >
              <span>🧑‍🤝‍🧑</span>
              <div>
                <strong>Clientes</strong>
                <small>Acesse somente se autorizado.</small>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate("/profissional/notificacoes")}
            >
              <span>🔔</span>
              <div>
                <strong>Notificações</strong>
                <small>Acompanhe atualizações importantes.</small>
              </div>
            </button>
          </div>
        </section>

        <aside className="professional-panel-card professional-home-permissions">
          <span className="professional-eyebrow">SEU ACESSO</span>
          <h2>Permissões liberadas</h2>

          <div className="professional-permission-list">
            <span>{contexto.ver_agendamentos ? "✅" : "—"} Agenda</span>
            <span>{contexto.alterar_status ? "✅" : "—"} Alterar status</span>
            <span>{contexto.ver_financeiro ? "✅" : "—"} Financeiro</span>
            <span>{contexto.ver_agenda_equipe ? "✅" : "—"} Agenda da equipe</span>
            <span>{contexto.ver_clientes ? "✅" : "—"} Clientes</span>
            <span>{contexto.ver_produtos ? "✅" : "—"} Produtos</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
