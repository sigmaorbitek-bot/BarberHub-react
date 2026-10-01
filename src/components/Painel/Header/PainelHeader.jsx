import { useNavigate } from "react-router-dom";

import { useAuth } from "../../../hooks/useAuth";
import { useBarbearia } from "../../../hooks/useBarbearia";
import "./PainelHeader.css";

export default function PainelHeader({ onOpenMenu }) {
  const navigate = useNavigate();

  const { profile } = useAuth();

  const { barbeariaId, barbearia } = useBarbearia();

  const inicialBarbearia = String(barbearia?.nome || "B")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <header className="panel-header">
      <div className="panel-header-left">
        <button
          type="button"
          className="panel-header-menu"
          aria-label="Abrir menu"
          onClick={onOpenMenu}
        >
          ☰
        </button>

        <div className="panel-header-business">
          <span className="panel-header-business-eyebrow">
            PAINEL ADMINISTRATIVO
          </span>

          <div className="panel-header-business-name">
            <strong>{barbearia?.nome || "Barbearia"}</strong>

            {barbearia?.cidade ? <span>· {barbearia.cidade}</span> : null}
          </div>
        </div>
      </div>

      <div className="panel-header-actions">
        <button
          type="button"
          className="panel-header-secondary"
          onClick={() => navigate("/painel")}
        >
          ⇄<span>Trocar unidade</span>
        </button>

        <button
          type="button"
          className="panel-header-icon-button"
          title="Notificações"
          aria-label="Notificações"
          onClick={() => navigate(`/painel/${barbeariaId}`)}
        >
          🔔
        </button>

        <div className="panel-header-user">
          <div className="panel-header-user-info">
            <strong>{barbearia?.nome || "Barbearia"}</strong>
            <span>{profile?.nome || "Administrador"}</span>
          </div>

          <span className="panel-header-avatar" aria-hidden="true">
            {barbearia?.logo_url ? (
              <img
                src={barbearia.logo_url}
                alt={`Logo de ${barbearia?.nome || "Barbearia"}`}
                className="panel-header-avatar-image"
              />
            ) : (
              inicialBarbearia
            )}
          </span>
        </div>
      </div>
    </header>
  );
}
