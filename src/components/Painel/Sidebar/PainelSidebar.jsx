import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../../../hooks/useAuth";
import { useBarbearia } from "../../../hooks/useBarbearia";
import "./PainelSidebar.css";

const MENU_GROUPS = [
  {
    label: "Gestão",
    items: [
      ["", "📊", "Visão geral"],
      ["agendamentos", "📅", "Agendamentos"],
      ["clientes", "👥", "Clientes"],
      ["profissionais", "💈", "Profissionais"],
      ["horarios", "🕐", "Horários"],
    ],
  },
  {
    label: "Vendas",
    items: [
      ["servicos", "✂️", "Serviços"],
      ["produtos", "🛍️", "Produtos"],
      ["pedidos", "🧾", "Pedidos"],
    ],
  },
  {
    label: "Resultados",
    items: [
      ["financeiro", "💰", "Financeiro"],
      ["contas-receber", "📒", "Contas a receber"],
      ["avaliacoes", "⭐", "Avaliações"],
    ],
  },
  {
    label: "Sistema",
    items: [["configuracoes", "⚙️", "Configurações"]],
  },
];

export default function PainelSidebar({ mobileOpen, onCloseMobile }) {
  const navigate = useNavigate();
  const { sair } = useAuth();
  const { barbeariaId, barbearia } = useBarbearia();

  const base = `/painel/${barbeariaId}`;

  async function handleLogout() {
    try {
      await sair();

      navigate("/login/barbearia", {
        replace: true,
      });
    } catch (error) {
      console.error("[BarberHub] Erro ao sair:", error);
    }
  }

  function handleNewBarbershop() {
    onCloseMobile?.();

    navigate("/cadastro/barbearia?modo=nova-barbearia");
  }

  function handleChangeBarbershop() {
    onCloseMobile?.();

    navigate("/painel");
  }

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="panel-sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside
        className={[
          "panel-sidebar",
          mobileOpen ? "panel-sidebar--mobile-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="panel-sidebar-brand">
          <img src="/barber.png" alt="BarberHub" />

          <div>
            <strong>BarberHub</strong>
            <span>Gestão da barbearia</span>
          </div>
        </div>

        <div className="panel-sidebar-company">
          <div className="panel-sidebar-company-logo">
            {barbearia?.logo_url ? (
              <img src={barbearia.logo_url} alt={`Logo de ${barbearia.nome}`} />
            ) : (
              <span aria-hidden="true">💈</span>
            )}
          </div>

          <div className="panel-sidebar-company-info">
            <span className="panel-sidebar-company-label">UNIDADE ATUAL</span>

            <strong>{barbearia?.nome || "Barbearia"}</strong>

            <small>{barbearia?.cidade || "Carregando..."}</small>
          </div>

          <button
            type="button"
            className="panel-sidebar-company-switch"
            title="Trocar de barbearia"
            aria-label="Trocar de barbearia"
            onClick={handleChangeBarbershop}
          >
            ⇄
          </button>
        </div>

        <button
          type="button"
          className="panel-sidebar-add"
          onClick={handleNewBarbershop}
        >
          <span aria-hidden="true">＋</span>
          Adicionar barbearia
        </button>

        <nav className="panel-sidebar-nav" aria-label="Menu principal">
          {MENU_GROUPS.map((group) => (
            <div className="panel-sidebar-group" key={group.label}>
              <span className="panel-sidebar-group-label">{group.label}</span>

              <div className="panel-sidebar-group-items">
                {group.items.map(([path, icon, label]) => {
                  const to = path ? `${base}/${path}` : base;

                  return (
                    <NavLink
                      key={label}
                      to={to}
                      end={!path}
                      onClick={onCloseMobile}
                      className={({ isActive }) =>
                        isActive
                          ? "panel-sidebar-item panel-sidebar-item--active"
                          : "panel-sidebar-item"
                      }
                    >
                      <span
                        className="panel-sidebar-item-icon"
                        aria-hidden="true"
                      >
                        {icon}
                      </span>

                      <span className="panel-sidebar-item-label">{label}</span>

                      <span
                        className="panel-sidebar-item-arrow"
                        aria-hidden="true"
                      >
                        ›
                      </span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="panel-sidebar-bottom">
          <div className="panel-sidebar-developer">
            <span>Desenvolvido por</span>
            <strong>Sigma Orbitek</strong>
          </div>

          <button
            type="button"
            className="panel-sidebar-logout"
            onClick={handleLogout}
          >
            <span aria-hidden="true">🚪</span>
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}
