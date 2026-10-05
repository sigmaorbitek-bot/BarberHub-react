import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../services/supabase";

import "./ClienteLayout.css";

const MENU = [
  ["", "⌂", "Início"],
  ["agendar", "📅", "Agendar"],
  ["agendamentos", "🗓️", "Agendamentos"],
  ["produtos", "🛍️", "Produtos"],
  ["pedidos", "📦", "Pedidos"],
  ["contas", "💰", "Minhas contas"],
  ["avaliacoes", "⭐", "Avaliações"],
  ["notificacoes", "🔔", "Notificações"],
  ["perfil", "👤", "Meu perfil"],
];

const MOBILE_MENU = [
  ["", "⌂", "Início"],
  ["agendar", "📅", "Agendar"],
  ["agendamentos", "🗓️", "Agenda"],
  ["notificacoes", "🔔", "Avisos"],
  ["perfil", "👤", "Perfil"],
];

function initials(name) {
  const parts = String(name || "Cliente")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "C";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function NotificationBadge({ count }) {
  if (!count) {
    return null;
  }

  return (
    <span
      className="client-notification-badge"
      aria-label={`${count} notificação${
        count === 1 ? "" : "ões"
      } não lida${count === 1 ? "" : "s"}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function ClienteLayout() {
  const navigate = useNavigate();
  const { profile, sair } = useAuth();

  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [clientName, setClientName] = useState(profile?.nome || "Cliente");
  const [clientPhotoUrl, setClientPhotoUrl] = useState("");



  const loadClientVisualProfile = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("obter_perfil_cliente");

      if (error) {
        throw error;
      }

      const client = Array.isArray(data) ? data[0] : data;

      setClientName(client?.nome || profile?.nome || "Cliente");

      if (client?.foto_path) {
        const publicUrl = supabase.storage
          .from("clientes")
          .getPublicUrl(client.foto_path)
          .data.publicUrl;

        setClientPhotoUrl(publicUrl || "");
      } else {
        setClientPhotoUrl("");
      }
    } catch (error) {
      console.warn(
        "[BarberHub] Não foi possível carregar o visual do perfil do cliente:",
        error,
      );

      if (profile?.nome) {
        setClientName(profile.nome);
      }
    }
  }, [profile?.nome]);

  const refreshUnreadNotifications = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc(
        "contar_notificacoes_cliente_nao_lidas",
      );

      if (error) {
        throw error;
      }

      setUnreadNotifications(Math.max(0, Number(data || 0)));
    } catch (error) {
      console.warn("[BarberHub] Contador de notificações do cliente:", error);
    }
  }, []);



  useEffect(() => {
    loadClientVisualProfile();
  }, [loadClientVisualProfile]);

  useEffect(() => {
    function onProfileChanged(event) {
      const detail = event?.detail || {};

      if (detail.nome) {
        setClientName(detail.nome);
      }

      if (Object.prototype.hasOwnProperty.call(detail, "fotoUrl")) {
        setClientPhotoUrl(detail.fotoUrl || "");
      } else {
        loadClientVisualProfile();
      }
    }

    window.addEventListener(
      "barberhub:perfil-atualizado",
      onProfileChanged,
    );

    return () => {
      window.removeEventListener(
        "barberhub:perfil-atualizado",
        onProfileChanged,
      );
    };
  }, [loadClientVisualProfile]);


  useEffect(() => {
    refreshUnreadNotifications();

    const intervalId = window.setInterval(refreshUnreadNotifications, 30000);

    function onFocus() {
      refreshUnreadNotifications();
      loadClientVisualProfile();
    }

    function onNotificationsChanged() {
      refreshUnreadNotifications();
    }

    window.addEventListener("focus", onFocus);

    window.addEventListener(
      "barberhub:notificacoes-atualizadas",
      onNotificationsChanged,
    );

    return () => {
      window.clearInterval(intervalId);

      window.removeEventListener("focus", onFocus);

      window.removeEventListener(
        "barberhub:notificacoes-atualizadas",
        onNotificationsChanged,
      );
    };
  }, [loadClientVisualProfile, refreshUnreadNotifications]);

  async function logout() {
    try {
      await sair();
    } finally {
      navigate("/login/cliente", {
        replace: true,
      });
    }
  }

  return (
    <div className="client-shell">
      <aside className="client-sidebar">
        <NavLink
          to="/cliente"
          end
          className="client-brand"
          aria-label="Início do BarberHub"
        >
          <img src="/barber.png" alt="" className="client-brand-logo" />

          <div>
            <strong>BarberHub</strong>
            <span>Área do cliente</span>
          </div>
        </NavLink>

        <div className="client-user-card">
          <div className="client-avatar" aria-hidden="true">
            {clientPhotoUrl ? (
              <img src={clientPhotoUrl} alt="" />
            ) : (
              initials(clientName)
            )}
          </div>

          <div>
            <small>Olá</small>
            <strong>{clientName || "Cliente"}</strong>
          </div>
        </div>

        <nav className="client-menu" aria-label="Navegação do cliente">
          {MENU.map(([path, icon, label]) => {
            const isNotifications = path === "notificacoes";

            return (
              <NavLink
                key={path || "inicio"}
                to={path ? `/cliente/${path}` : "/cliente"}
                end={!path}
                className={({ isActive }) =>
                  `client-menu-link${
                    isActive ? " client-menu-link--active" : ""
                  }`
                }
              >
                <span className="client-menu-icon" aria-hidden="true">
                  {icon}

                  {isNotifications ? (
                    <NotificationBadge count={unreadNotifications} />
                  ) : null}
                </span>

                <strong>{label}</strong>

                <b aria-hidden="true">›</b>
              </NavLink>
            );
          })}
        </nav>

        <div className="client-sidebar-footer">
          <button type="button" onClick={logout}>
            ↪ Sair
          </button>

          <p>
            BarberHub
            <span>Desenvolvido por Sigma Orbitek</span>
          </p>
        </div>
      </aside>

      <div className="client-main">
        <header className="client-topbar">
          <NavLink to="/cliente" className="client-topbar-brand">
            <img src="/barber.png" alt="" />
            <strong>BarberHub</strong>
          </NavLink>

          <div className="client-topbar-actions">
            <NavLink
              to="/cliente/notificacoes"
              className="client-icon-button client-icon-button--notifications"
              aria-label={
                unreadNotifications > 0
                  ? `Abrir notificações. ${unreadNotifications} não lida${
                      unreadNotifications === 1 ? "" : "s"
                    }.`
                  : "Abrir notificações"
              }
              title="Notificações"
            >
              <span aria-hidden="true">🔔</span>

              <NotificationBadge count={unreadNotifications} />
            </NavLink>

            <NavLink to="/cliente/perfil" className="client-topbar-user">
              <span className="client-topbar-avatar">
                {clientPhotoUrl ? (
                  <img src={clientPhotoUrl} alt="" />
                ) : (
                  initials(clientName)
                )}
              </span>

              <div>
                <strong>{clientName || "Cliente"}</strong>
                <small>Minha conta</small>
              </div>
            </NavLink>
          </div>
        </header>

        <main className="client-content">
          <Outlet />
        </main>
      </div>

      <nav
        className="client-bottom-nav"
        aria-label="Navegação rápida do cliente"
      >
        {MOBILE_MENU.map(([path, icon, label]) => {
          const isNotifications = path === "notificacoes";

          return (
            <NavLink
              key={path || "inicio"}
              to={path ? `/cliente/${path}` : "/cliente"}
              end={!path}
              className={({ isActive }) =>
                `client-bottom-link${
                  isActive ? " client-bottom-link--active" : ""
                }`
              }
            >
              <span className="client-bottom-icon" aria-hidden="true">
                {icon}

                {isNotifications ? (
                  <NotificationBadge count={unreadNotifications} />
                ) : null}
              </span>

              <small>{label}</small>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
