import { useState } from "react";
import { Link, Outlet } from "react-router-dom";

import LoadingScreen from "../../components/LoadingScreen/LoadingScreen";
import PainelHeader from "../../components/Painel/Header/PainelHeader";
import PainelSidebar from "../../components/Painel/Sidebar/PainelSidebar";
import { BarbeariaProvider } from "../../contexts/BarbeariaContext";
import { useBarbearia } from "../../hooks/useBarbearia";

import "./PainelLayout.css";

function PainelLayoutContent() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const {
    loadingBarbearia,
    barbeariaError,
  } = useBarbearia();

  if (loadingBarbearia) {
    return (
      <LoadingScreen text="Carregando sua barbearia..." />
    );
  }

  if (barbeariaError) {
    return (
      <div className="feedback-page">
        <h1>Não foi possível abrir o painel</h1>
        <p>{barbeariaError}</p>

        <Link
          className="button button--primary"
          to="/painel"
        >
          Voltar para minhas barbearias
        </Link>
      </div>
    );
  }

  return (
    <div className="panel-layout">
      <PainelSidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="panel-layout-content">
        <PainelHeader
          onOpenMenu={() => setMobileOpen(true)}
        />

        <main className="panel-layout-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function PainelLayout() {
  return (
    <BarbeariaProvider>
      <PainelLayoutContent />
    </BarbeariaProvider>
  );
}