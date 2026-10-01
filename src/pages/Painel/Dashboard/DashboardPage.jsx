import { Link } from "react-router-dom";

import EmptyState from "../../../components/Painel/EmptyState/EmptyState";
import StatCard from "../../../components/Painel/StatCard/StatCard";
import { useAuth } from "../../../hooks/useAuth";
import { useBarbearia } from "../../../hooks/useBarbearia";
import {
  formatarDataHora,
  formatarMoeda,
} from "../../../utils/formatters";
import { useDashboardData } from "./useDashboardData";
import "./DashboardPage.css";

export default function DashboardPage() {
  const { user } = useAuth();

  const {
    barbeariaId,
    barbearia,
  } = useBarbearia();

  const {
    data,
    loading,
    errorMessage,
    recarregar,
  } = useDashboardData({
    barbeariaId,
    usuarioId: user?.id,
  });

  const base = `/painel/${barbeariaId}`;

  const cards = [
    {
      icon: "📅",
      tag: "Hoje",
      value: loading
        ? "..."
        : data.totalAgendamentosHoje,
      label: "Agendamentos hoje",
      helper: "Agenda do dia",
      to: `${base}/agendamentos`,
    },
    {
      icon: "💰",
      tag: "Hoje",
      value: loading
        ? "..."
        : formatarMoeda(
            data.faturamentoHoje,
          ),
      label: "Faturamento hoje",
      helper: "Serviços + produtos",
      to: `${base}/financeiro`,
      variant: "finance",
    },
    {
      icon: "🧾",
      tag: "Atenção",
      value: loading
        ? "..."
        : data.pedidosPendentes,
      label: "Pedidos pendentes",
      helper: "Aguardando confirmação",
      to: `${base}/pedidos`,
      variant:
        data.pedidosPendentes > 0
          ? "attention"
          : "default",
    },
    {
      icon: "📦",
      tag: "Estoque",
      value: loading
        ? "..."
        : data.estoqueBaixo,
      label: "Estoque baixo",
      helper: "Itens com até 3 unidades",
      to: `${base}/produtos`,
      variant:
        data.estoqueBaixo > 0
          ? "attention"
          : "default",
    },
    {
      icon: "👥",
      tag: "Base",
      value: loading
        ? "..."
        : data.totalClientes,
      label: "Clientes",
      helper: "Clientes vinculados",
      to: `${base}/clientes`,
    },
    {
      icon: "💈",
      tag: "Equipe",
      value: loading
        ? "..."
        : data.totalProfissionais,
      label: "Profissionais ativos",
      helper: "Equipe disponível",
      to: `${base}/profissionais`,
    },
    {
      icon: "⭐",
      tag: "Clientes",
      value: loading
        ? "..."
        : data.avaliacaoMedia.toLocaleString(
            "pt-BR",
            {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            },
          ),
      label: "Avaliação média",
      helper: "Satisfação dos clientes",
      to: `${base}/avaliacoes`,
    },
    {
      icon: "🔔",
      tag: "Novidades",
      value: loading
        ? "..."
        : data.notificacoesNaoLidas,
      label: "Notificações",
      helper: "Avisos não lidos",
    },
  ];

  return (
    <section className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <span className="dashboard-heading-eyebrow">
            PAINEL DE GESTÃO
          </span>

          <h1>
            Visão geral
          </h1>

          <p>
            Acompanhe o que está acontecendo hoje em{" "}
            <strong>
              {barbearia?.nome || "sua barbearia"}
            </strong>
            .
          </p>
        </div>

        <div className="dashboard-heading-actions">
          <button
            type="button"
            className="dashboard-refresh-button"
            onClick={recarregar}
            disabled={loading}
          >
            ↻ Atualizar
          </button>

          <Link
            className="dashboard-primary-button"
            to={`${base}/agendamentos`}
          >
            + Novo agendamento
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <div className="dashboard-alert">
          <span>{errorMessage}</span>

          <button
            type="button"
            onClick={recarregar}
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      <div className="dashboard-stat-grid">
        {cards.map((card) => (
          <StatCard
            key={card.label}
            {...card}
          />
        ))}
      </div>

      <div className="dashboard-content-grid">
        <section className="dashboard-section dashboard-section--wide">
          <div className="dashboard-section-header">
            <div>
              <span>AGENDA</span>
              <h2>Próximos agendamentos</h2>
              <p>
                Os próximos clientes que serão atendidos.
              </p>
            </div>

            <Link to={`${base}/agendamentos`}>
              Ver agenda completa
            </Link>
          </div>

          {loading ? (
            <div className="dashboard-loading-list">
              Carregando próximos agendamentos...
            </div>
          ) : data.proximosAgendamentos.length ? (
            <div className="dashboard-list">
              {data.proximosAgendamentos.map(
                (item) => {
                  const cliente =
                    item.clientes?.nome ||
                    item.cliente_nome ||
                    "Cliente";

                  return (
                    <article
                      className="dashboard-list-item"
                      key={item.id}
                    >
                      <div className="dashboard-list-icon">
                        📅
                      </div>

                      <div className="dashboard-list-main">
                        <strong>{cliente}</strong>

                        <span>
                          {item.servicos?.nome ||
                            "Serviço"}{" "}
                          ·{" "}
                          {item.profissionais?.nome ||
                            "Profissional não definido"}
                        </span>
                      </div>

                      <div className="dashboard-list-side">
                        <strong>
                          {formatarDataHora(
                            item.data_hora,
                          )}
                        </strong>

                        <span
                          className={`dashboard-status dashboard-status--${item.status}`}
                        >
                          {item.status}
                        </span>
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          ) : (
            <EmptyState
              icon="📅"
              title="Nenhum próximo agendamento"
              description="Quando houver horários futuros, eles aparecerão aqui."
            />
          )}
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section-header">
            <div>
              <span>ATALHOS</span>
              <h2>Ações rápidas</h2>
              <p>Tarefas usadas no dia a dia.</p>
            </div>
          </div>

          <div className="dashboard-quick-actions">
            {[
              [
                "📅",
                "Novo agendamento",
                "Cadastre um horário",
                "agendamentos",
              ],
              [
                "👤",
                "Clientes",
                "Gerencie sua base",
                "clientes",
              ],
              [
                "🛍️",
                "Produtos",
                "Gerencie o estoque",
                "produtos",
              ],
              [
                "🧾",
                "Pedidos",
                "Confirme novas vendas",
                "pedidos",
              ],
              [
                "💰",
                "Financeiro",
                "Entradas, gastos e lucro",
                "financeiro",
              ],
              [
                "⭐",
                "Avaliações",
                "Feedback dos clientes",
                "avaliacoes",
              ],
            ].map(
              ([icon, title, helper, path]) => (
                <Link
                  key={title}
                  className="dashboard-quick-action"
                  to={`${base}/${path}`}
                >
                  <span aria-hidden="true">
                    {icon}
                  </span>

                  <div>
                    <strong>{title}</strong>
                    <small>{helper}</small>
                  </div>

                  <span aria-hidden="true">
                    →
                  </span>
                </Link>
              ),
            )}
          </div>
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section-header">
            <div>
              <span>CENTRAL DE AVISOS</span>
              <h2>Notificações recentes</h2>
            </div>
          </div>

          {loading ? (
            <div className="dashboard-loading-list">
              Carregando notificações...
            </div>
          ) : data.notificacoesRecentes.length ? (
            <div className="dashboard-list dashboard-list--compact">
              {data.notificacoesRecentes.map(
                (item) => (
                  <article
                    className="dashboard-notification"
                    key={item.id}
                  >
                    <div>
                      <strong>
                        {item.titulo}
                      </strong>

                      <p>
                        {item.mensagem}
                      </p>
                    </div>

                    {!item.lida ? (
                      <span
                        className="dashboard-unread-dot"
                        title="Não lida"
                      />
                    ) : null}
                  </article>
                ),
              )}
            </div>
          ) : (
            <EmptyState
              icon="🔔"
              title="Nenhuma notificação"
              description="Os avisos importantes da barbearia aparecerão aqui."
            />
          )}
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section-header">
            <div>
              <span>EXPERIÊNCIA DO CLIENTE</span>
              <h2>Comentários recentes</h2>
              <p>
                O que os clientes estão falando.
              </p>
            </div>

            <Link to={`${base}/avaliacoes`}>
              Ver todos
            </Link>
          </div>

          {loading ? (
            <div className="dashboard-loading-list">
              Carregando comentários...
            </div>
          ) : data.comentariosRecentes.length ? (
            <div className="dashboard-comments">
              {data.comentariosRecentes.map(
                (item) => (
                  <article
                    className="dashboard-comment"
                    key={item.id}
                  >
                    <div className="dashboard-comment-top">
                      <strong>
                        {item.clientes?.nome ||
                          "Cliente"}
                      </strong>

                      <span>
                        {"⭐".repeat(
                          Math.max(
                            1,
                            Math.min(
                              5,
                              Number(item.nota) || 1,
                            ),
                          ),
                        )}
                      </span>
                    </div>

                    <p>
                      “{item.comentario}”
                    </p>
                  </article>
                ),
              )}
            </div>
          ) : (
            <EmptyState
              icon="💬"
              title="Nenhum comentário recente"
              description="Os comentários das avaliações aparecerão aqui."
            />
          )}
        </section>
      </div>
    </section>
  );
}
