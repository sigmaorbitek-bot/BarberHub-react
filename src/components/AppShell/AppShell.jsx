import { Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";

export default function AppShell({ area }) {
  const { profile, sair } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await sair();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("[BarberHub] Erro ao sair:", error);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <span className="brand-mark">B</span>
          <div>
            <strong>BarberHub</strong>
            <small>{area}</small>
          </div>
        </div>

        <div className="app-header-user">
          <span>{profile?.nome || "Usuário"}</span>
          <button type="button" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
