import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../services/supabase";

import "./ClienteHomePage.css";

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const ACTIONS = [
  {
    icon: "📅",
    title: "Agendar horário",
    text: "Escolha barbearia, serviço, profissional, data e horário.",
    to: "/cliente/agendar",
    primary: true,
  },
  {
    icon: "🗓️",
    title: "Meus agendamentos",
    text: "Acompanhe seus próximos horários e atendimentos anteriores.",
    to: "/cliente/agendamentos",
  },
  {
    icon: "🛍️",
    title: "Produtos",
    text: "Veja produtos disponíveis nas barbearias.",
    to: "/cliente/produtos",
  },
  {
    icon: "📦",
    title: "Meus pedidos",
    text: "Acompanhe seus pedidos e o andamento de cada compra.",
    to: "/cliente/pedidos",
  },
  {
    icon: "⭐",
    title: "Avaliações",
    text: "Avalie atendimentos concluídos e acompanhe respostas.",
    to: "/cliente/avaliacoes",
  },
  {
    icon: "👤",
    title: "Meu perfil",
    text: "Atualize seus dados e configurações de conta.",
    to: "/cliente/perfil",
  },
];

export default function ClienteHomePage() {
  const { profile } = useAuth();

  const [contas, setContas] = useState([]);
  const [loadingContas, setLoadingContas] = useState(true);
  const [erroContas, setErroContas] = useState("");

  useEffect(() => {
    let active = true;

    async function loadAccounts() {
      setLoadingContas(true);
      setErroContas("");

      const { data, error } = await supabase.rpc("listar_contas_cliente");

      if (!active) return;

      if (error) {
        console.error("[BarberHub] Resumo de contas do cliente:", error);

        setContas([]);
        setErroContas("Não foi possível carregar suas contas agora.");
        setLoadingContas(false);
        return;
      }

      setContas(data || []);
      setLoadingContas(false);
    }

    loadAccounts();

    return () => {
      active = false;
    };
  }, []);

  const financialSummary = useMemo(() => {
    return contas.reduce(
      (summary, account) => {
        if (account.status === "cancelado" || account.status === "pago") {
          return summary;
        }

        summary.open += Number(account.saldo || 0);
        summary.quantity += 1;

        if (account.status === "vencido") {
          summary.overdue += Number(account.saldo || 0);
        }

        return summary;
      },
      {
        open: 0,
        overdue: 0,
        quantity: 0,
      },
    );
  }, [contas]);

  const firstName =
    String(profile?.nome || "Cliente")
      .trim()
      .split(/\s+/)[0] || "Cliente";

  return (
    <section className="client-home">
      <div className="client-home-hero">
        <div>
          <span className="client-home-eyebrow">ÁREA DO CLIENTE</span>

          <h1>Olá, {firstName} 👋</h1>

          <p>
            Agende seus horários, acompanhe pedidos, contas, avaliações e tudo o
            que acontece com você no BarberHub.
          </p>
        </div>

        <Link to="/cliente/agendar" className="client-home-primary">
          📅 Agendar horário
        </Link>
      </div>

      <div className="client-home-highlight-grid">
        <article className="client-home-highlight">
          <span aria-hidden="true">📅</span>

          <div>
            <small>PRÓXIMO HORÁRIO</small>
            <strong>Consulte sua agenda</strong>
            <p>
              Seus próximos atendimentos ficam organizados em Meus agendamentos.
            </p>
          </div>

          <Link to="/cliente/agendamentos">Ver agenda →</Link>
        </article>

        <article
          className={`client-home-highlight${
            financialSummary.overdue > 0 ? " client-home-highlight--danger" : ""
          }`}
        >
          <span aria-hidden="true">💰</span>

          <div>
            <small>MINHAS CONTAS</small>

            <strong>
              {loadingContas ? "Carregando..." : moeda(financialSummary.open)}
            </strong>

            <p>
              {erroContas
                ? erroContas
                : financialSummary.quantity > 0
                  ? `${financialSummary.quantity} conta(s) em aberto`
                  : "Nenhuma pendência em aberto"}
            </p>
          </div>

          <Link to="/cliente/contas">Ver contas →</Link>
        </article>

        <article className="client-home-highlight">
          <span aria-hidden="true">🔔</span>

          <div>
            <small>AVISOS</small>
            <strong>Central de notificações</strong>
            <p>
              Confirmações, alterações, pedidos e pagamentos em um só lugar.
            </p>
          </div>

          <Link to="/cliente/notificacoes">Ver avisos →</Link>
        </article>
      </div>

      <div className="client-home-section-heading">
        <div>
          <span>ACESSO RÁPIDO</span>
          <h2>O que você deseja fazer?</h2>
        </div>
      </div>

      <div className="client-home-actions">
        {ACTIONS.map((action) => (
          <Link
            key={action.title}
            to={action.to}
            className={`client-home-action${
              action.primary ? " client-home-action--primary" : ""
            }`}
          >
            <span aria-hidden="true">{action.icon}</span>

            <div>
              <strong>{action.title}</strong>
              <p>{action.text}</p>
            </div>

            <b aria-hidden="true">→</b>
          </Link>
        ))}
      </div>

      <div className="client-home-tip">
        <span aria-hidden="true">✦</span>

        <div>
          <strong>Seu espaço no BarberHub</strong>
          <p>
            Sua conta pode acompanhar diferentes barbearias sem precisar criar
            um novo cadastro para cada unidade.
          </p>
        </div>
      </div>
    </section>
  );
}
