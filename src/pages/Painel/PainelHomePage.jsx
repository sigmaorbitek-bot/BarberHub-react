import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../services/supabase";
import "./PainelHomePage.css";

function obterInicial(nome) {
  return String(nome || "B")
    .trim()
    .charAt(0)
    .toUpperCase();
}

function BarbeariaCard({
  barbearia,
  onEnter,
}) {
  return (
    <article className="barbershops-card">
      <div className="barbershops-card-top">
        <div className="barbershops-card-logo">
          {barbearia.logo_url ? (
            <img
              src={barbearia.logo_url}
              alt={`Logo de ${barbearia.nome}`}
              loading="lazy"
            />
          ) : (
            <span aria-hidden="true">
              {obterInicial(barbearia.nome)}
            </span>
          )}
        </div>

        <div className="barbershops-card-status">
          <span />
          Ativa
        </div>
      </div>

      <div className="barbershops-card-content">
        <span className="barbershops-card-eyebrow">
          UNIDADE
        </span>

        <h2>
          {barbearia.nome || "Barbearia"}
        </h2>

        <div className="barbershops-card-details">
          <p>
            <span aria-hidden="true">📍</span>
            {barbearia.cidade || "Cidade não informada"}
          </p>

          {barbearia.endereco ? (
            <p>
              <span aria-hidden="true">⌂</span>
              {barbearia.endereco}
            </p>
          ) : null}

          {barbearia.telefone ? (
            <p>
              <span aria-hidden="true">☎</span>
              {barbearia.telefone}
            </p>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        className="barbershops-card-enter"
        onClick={() => onEnter(barbearia.id)}
      >
        <span>
          Entrar no painel
        </span>

        <span aria-hidden="true">
          →
        </span>
      </button>
    </article>
  );
}

export default function PainelHomePage() {
  const navigate = useNavigate();

  const {
    user,
    profile,
    sair,
  } = useAuth();

  const [barbearias, setBarbearias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const nomeUsuario = useMemo(
    () =>
      profile?.nome ||
      user?.user_metadata?.nome ||
      "Administrador",
    [
      profile?.nome,
      user?.user_metadata?.nome,
    ],
  );

  const carregarBarbearias = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("barbearias")
        .select(
          `
            id,
            dono_id,
            nome,
            cidade,
            endereco,
            telefone,
            logo_url,
            horario_abertura,
            horario_fechamento,
            created_at
          `,
        )
        .eq("dono_id", user.id)
        .order("created_at", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      setBarbearias(data || []);
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao carregar barbearias:",
        error,
      );

      setBarbearias([]);
      setErrorMessage(
        "Não foi possível carregar suas barbearias.",
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    carregarBarbearias();
  }, [carregarBarbearias]);

  function entrarNaBarbearia(id) {
    if (!id) {
      return;
    }

    navigate(`/painel/${id}`);
  }

  function cadastrarNovaBarbearia() {
    navigate(
      "/cadastro/barbearia?modo=nova-barbearia",
    );
  }

  async function handleLogout() {
    try {
      await sair();

      navigate(
        "/login/barbearia",
        {
          replace: true,
        },
      );
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao sair:",
        error,
      );
    }
  }

  return (
    <main className="barbershops-page">
      <header className="barbershops-topbar">
        <Link
          to="/"
          className="barbershops-brand"
          aria-label="Ir para o início do BarberHub"
        >
          <img
            src="/barber.png"
            alt="BarberHub"
          />

          <div>
            <strong>BarberHub</strong>
            <span>Gestão da barbearia</span>
          </div>
        </Link>

        <div className="barbershops-topbar-actions">
          <div className="barbershops-user">
            <div>
              <strong>
                {nomeUsuario}
              </strong>

              <span>Administrador</span>
            </div>

            <span
              className="barbershops-user-avatar"
              aria-hidden="true"
            >
              {obterInicial(nomeUsuario)}
            </span>
          </div>

          <button
            type="button"
            className="barbershops-logout"
            onClick={handleLogout}
          >
            Sair
          </button>
        </div>
      </header>

      <section className="barbershops-content">
        <div className="barbershops-heading">
          <div>
            <span className="barbershops-eyebrow">
              SUAS UNIDADES
            </span>

            <h1>
              Suas barbearias
            </h1>

            <p>
              Escolha a unidade que deseja administrar
              ou cadastre uma nova barbearia.
            </p>
          </div>

          <button
            type="button"
            className="barbershops-create-button"
            onClick={cadastrarNovaBarbearia}
          >
            <span aria-hidden="true">
              ＋
            </span>

            Nova barbearia
          </button>
        </div>

        <div className="barbershops-summary">
          <div className="barbershops-summary-icon">
            💈
          </div>

          <div>
            <span>
              TOTAL DE UNIDADES
            </span>

            <strong>
              {loading
                ? "..."
                : barbearias.length}
            </strong>
          </div>

          <p>
            {barbearias.length === 1
              ? "1 barbearia vinculada à sua conta."
              : `${barbearias.length} barbearias vinculadas à sua conta.`}
          </p>
        </div>

        {errorMessage ? (
          <div className="barbershops-alert">
            <span>
              {errorMessage}
            </span>

            <button
              type="button"
              onClick={carregarBarbearias}
            >
              Tentar novamente
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="barbershops-loading">
            <div className="barbershops-loading-spinner" />

            <strong>
              Carregando suas barbearias...
            </strong>

            <span>
              Estamos preparando suas unidades.
            </span>
          </div>
        ) : barbearias.length ? (
          <div className="barbershops-grid">
            {barbearias.map((barbearia) => (
              <BarbeariaCard
                key={barbearia.id}
                barbearia={barbearia}
                onEnter={entrarNaBarbearia}
              />
            ))}

            <button
              type="button"
              className="barbershops-add-card"
              onClick={cadastrarNovaBarbearia}
            >
              <span
                className="barbershops-add-card-icon"
                aria-hidden="true"
              >
                ＋
              </span>

              <strong>
                Adicionar barbearia
              </strong>

              <small>
                Cadastre uma nova unidade para gerenciar
                tudo pela mesma conta.
              </small>
            </button>
          </div>
        ) : (
          <div className="barbershops-empty">
            <div
              className="barbershops-empty-icon"
              aria-hidden="true"
            >
              💈
            </div>

            <span className="barbershops-eyebrow">
              PRIMEIRA UNIDADE
            </span>

            <h2>
              Você ainda não possui uma barbearia
            </h2>

            <p>
              Cadastre sua primeira unidade para começar
              a usar o BarberHub.
            </p>

            <button
              type="button"
              className="barbershops-create-button"
              onClick={cadastrarNovaBarbearia}
            >
              ＋ Cadastrar barbearia
            </button>
          </div>
        )}

        <div className="barbershops-bottom">
          <Link to="/">
            ← Voltar ao início
          </Link>

          <span>
            BarberHub · Desenvolvido por Sigma Orbitek
          </span>
        </div>
      </section>
    </main>
  );
}
