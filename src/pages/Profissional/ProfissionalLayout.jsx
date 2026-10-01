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

  const itens = [
    {
      grupo: "GESTÃO",
      itens: [
        {
          to: "/profissional",
          label: "Visão geral",
          icon: "📊",
          end: true,
          visible: true,
        },
        {
          to: "/profissional/agenda",
          label: "Meus agendamentos",
          icon: "📅",
          visible: contexto.ver_agendamentos,
        },
      ],
    },
    {
      grupo: "RESULTADOS",
      itens: [
        {
          to: "/profissional/financeiro",
          label: "Meu financeiro",
          icon: "💰",
          visible: contexto.ver_financeiro,
        },
      ],
    },
    {
      grupo: "SISTEMA",
      itens: [
        {
          to: "/profissional/minha-conta",
          label: "Minha conta",
          icon: "⚙️",
          visible: true,
        },
      ],
    },
  ];

  async function handleSair() {
    await sair();

    navigate("/login/profissional", {
      replace: true,
    });
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
              <img
                src={logoBarbearia}
                alt={`Logo de ${contexto.barbearia_nome}`}
              />
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

        <nav className="professional-sidebar-nav">
          {itens.map((grupo) => {
            const visiveis = grupo.itens.filter((item) => item.visible);

            if (!visiveis.length) {
              return null;
            }

            return (
              <section key={grupo.grupo} className="professional-sidebar-group">
                <span className="professional-sidebar-group-title">
                  {grupo.grupo}
                </span>

                {visiveis.map((item) => (
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
                    <span>{item.icon}</span>

                    <strong>{item.label}</strong>

                    <span className="professional-menu-arrow">›</span>
                  </NavLink>
                ))}
              </section>
            );
          })}
        </nav>

        <div className="professional-sidebar-footer">
          <span>Desenvolvido por</span>

          <strong>Sigma Orbitek</strong>

          <button type="button" onClick={handleSair}>
            🚪 Sair
          </button>
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
              aria-label="Notificações"
            >
              🔔
            </button>

            <div className="professional-header-profile">
              <div>
                <strong>{contexto.profissional_nome}</strong>

                <span>{contexto.barbearia_nome}</span>
              </div>

              <div className="professional-header-avatar">
                {foto ? (
                  <img
                    src={foto}
                    alt={`Foto de ${contexto.profissional_nome}`}
                  />
                ) : (
                  <span>{iniciais(contexto.profissional_nome)}</span>
                )}
              </div>
            </div>
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
