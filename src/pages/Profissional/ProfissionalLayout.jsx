import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { ProfissionalProvider } from "./ProfissionalContext";
import { useProfissional } from "./useProfissional";
import "./Profissional.css";

function iniciais(nome) {
  return String(nome || "P")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
}

function LayoutInterno() {
  const { contexto, loading, error } = useProfissional();
  const { sair } = useAuth();
  const navigate = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false);

  if (loading) {
    return (
      <main className="professional-layout-loading">
        <img src="/barber.png" alt="BarberHub" />
        <strong>BarberHub</strong>
        <span>Carregando painel profissional...</span>
      </main>
    );
  }

  if (error || !contexto) {
    return (
      <main className="professional-layout-loading">
        <strong>Não foi possível carregar seu painel.</strong>
        <span>{error || "Vínculo profissional não encontrado."}</span>
      </main>
    );
  }

  const foto = contexto.profissional_foto_url;
  const logoBarbearia = contexto.barbearia_logo_url;

  const grupos = [
    {
      titulo: "GESTÃO",
      itens: [
        { to: "/profissional", label: "Visão geral", icon: "📊", end: true, visible: true },
        { to: "/profissional/agenda", label: "Minha agenda", icon: "📅", visible: contexto.ver_agendamentos },
        { to: "/profissional/equipe", label: "Agenda da equipe", icon: "👥", visible: contexto.ver_agenda_equipe },
        { to: "/profissional/clientes", label: "Clientes", icon: "🧑‍🤝‍🧑", visible: contexto.ver_clientes },
        { to: "/profissional/produtos", label: "Produtos", icon: "🛍️", visible: contexto.ver_produtos },
      ],
    },
    {
      titulo: "RESULTADOS",
      itens: [
        { to: "/profissional/financeiro", label: "Meu financeiro", icon: "💰", visible: contexto.ver_financeiro },
      ],
    },
    {
      titulo: "SISTEMA",
      itens: [
        { to: "/profissional/notificacoes", label: "Notificações", icon: "🔔", visible: true },
        { to: "/profissional/minha-conta", label: "Minha conta", icon: "⚙️", visible: true },
      ],
    },
  ];

  async function handleSair() {
    await sair();
    navigate("/login/profissional", { replace: true });
  }

  return (
    <div className="professional-layout">
      <aside
        className={
          menuAberto
            ? "professional-sidebar professional-sidebar--open"
            : "professional-sidebar"
        }
      >
        <div className="professional-sidebar-brand">
          <div className="professional-sidebar-avatar">
            {foto ? (
              <img src={foto} alt={`Foto de ${contexto.profissional_nome}`} />
            ) : (
              <span>{iniciais(contexto.profissional_nome)}</span>
            )}
          </div>

          <div>
            <strong>{contexto.profissional_nome}</strong>
            <span>Profissional</span>
          </div>
        </div>

        <div className="professional-current-unit">
          <div className="professional-current-unit-avatar">
            {logoBarbearia ? (
              <img src={logoBarbearia} alt={`Logo de ${contexto.barbearia_nome}`} />
            ) : (
              <span>{iniciais(contexto.barbearia_nome)}</span>
            )}
          </div>

          <div>
            <small>UNIDADE ATUAL</small>
            <strong>{contexto.barbearia_nome}</strong>
            <span>Área profissional</span>
          </div>
        </div>

        <nav className="professional-sidebar-nav" aria-label="Menu profissional">
          {grupos.map((grupo) => {
            const itensVisiveis = grupo.itens.filter((item) => item.visible);

            if (!itensVisiveis.length) {
              return null;
            }

            return (
              <section key={grupo.titulo} className="professional-sidebar-group">
                <span className="professional-sidebar-group-title">{grupo.titulo}</span>

                {itensVisiveis.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMenuAberto(false)}
                    className={({ isActive }) =>
                      isActive
                        ? "professional-menu-item professional-menu-item--active"
                        : "professional-menu-item"
                    }
                  >
                    <span aria-hidden="true">{item.icon}</span>
                    <strong>{item.label}</strong>
                    <span className="professional-menu-arrow" aria-hidden="true">›</span>
                  </NavLink>
                ))}
              </section>
            );
          })}
        </nav>

        <div className="professional-sidebar-footer">
          <span>BarberHub</span>
          <strong>Área profissional</strong>
          <button type="button" onClick={handleSair}>🚪 Sair</button>
        </div>
      </aside>

      {menuAberto ? (
        <button
          type="button"
          className="professional-sidebar-overlay"
          aria-label="Fechar menu"
          onClick={() => setMenuAberto(false)}
        />
      ) : null}

      <div className="professional-main-area">
        <header className="professional-header">
          <div className="professional-header-left">
            <button
              type="button"
              className="professional-mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setMenuAberto(true)}
            >
              ☰
            </button>

            <div>
              <small>PAINEL PROFISSIONAL</small>
              <strong>{contexto.barbearia_nome}</strong>
              <span>· {contexto.profissional_nome}</span>
            </div>
          </div>

          <div className="professional-header-actions">
            <button
              type="button"
              className="professional-header-notification"
              aria-label="Abrir notificações"
              onClick={() => navigate("/profissional/notificacoes")}
            >
              🔔
            </button>

            <button
              type="button"
              className="professional-header-profile"
              onClick={() => navigate("/profissional/minha-conta")}
            >
              <div>
                <strong>{contexto.profissional_nome}</strong>
                <span>{contexto.barbearia_nome}</span>
              </div>

              <div className="professional-header-avatar">
                {foto ? (
                  <img src={foto} alt={`Foto de ${contexto.profissional_nome}`} />
                ) : (
                  <span>{iniciais(contexto.profissional_nome)}</span>
                )}
              </div>
            </button>
          </div>
        </header>

        <main className="professional-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function ProfissionalLayout() {
  return (
    <ProfissionalProvider>
      <LayoutInterno />
    </ProfissionalProvider>
  );
}
