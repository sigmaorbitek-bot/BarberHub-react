import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../services/supabase";
import "./Home.css";

const OAUTH_TYPE_KEY = "barberhub_oauth_tipo";

function BarbeariaIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10h16" />
      <path d="M5 10v9h14v-9" />
      <path d="M7 10V6h10v4" />
      <path d="M9 19v-5h6v5" />
      <path d="M8 6V4h8v2" />
    </svg>
  );
}

function ClienteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c.8-4.2 3.4-6.3 8-6.3S19.2 15.8 20 20" />
    </svg>
  );
}

function ProfissionalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="18" cy="7" r="2.5" />
      <path d="m8 8.5 8 9" />
      <path d="m16 8.5-8 9" />
      <path d="M10.4 11.1 19 3" />
      <path d="m13.6 11.1-8.6-8" />
    </svg>
  );
}

const ACCESS_TYPES = [
  { key: "barbearia", label: "Barbearia", Icon: BarbeariaIcon },
  { key: "cliente", label: "Cliente", Icon: ClienteIcon },
  { key: "profissional", label: "Profissional", Icon: ProfissionalIcon },
];

const ACCESS_CONFIG = {
  barbearia: {
    expectedType: "dono",
    eyebrow: "Área da barbearia",
    title: "Gerencie sua barbearia",
    subtitle: "Acesse o painel administrativo do BarberHub.",
    emailPlaceholder: "barbearia@email.com",
    recoveryEmailMessage: "Digite o e-mail da sua barbearia.",
    wrongTypeMessage:
      "Esta conta não é uma conta de barbearia. Escolha a área correta.",
    destination: "/painel",
    signupDestination: "/cadastro/barbearia",
    googleLabel: "Continuar com Google como barbearia",
  },
  cliente: {
    expectedType: "cliente",
    eyebrow: "Área do cliente",
    title: "Agende com facilidade",
    subtitle: "Entre para agendar horários, acompanhar pedidos e muito mais.",
    emailPlaceholder: "seu@email.com",
    recoveryEmailMessage: "Digite seu e-mail para recuperar a senha.",
    wrongTypeMessage:
      "Esta conta não é uma conta de cliente. Escolha a área correta.",
    destination: "/cliente",
    signupDestination: "/cadastro/cliente",
    googleLabel: "Continuar com Google como cliente",
  },
  profissional: {
    expectedType: "profissional",
    eyebrow: "Área do profissional",
    title: "Sua rotina profissional",
    subtitle: "Acesse sua agenda e os recursos liberados pela barbearia.",
    emailPlaceholder: "profissional@email.com",
    recoveryEmailMessage: "Digite seu e-mail profissional.",
    wrongTypeMessage:
      "Esta conta não é uma conta de profissional. Escolha a área correta.",
    destination: "/profissional",
    signupDestination: null,
    googleLabel: "Continuar com Google como profissional",
  },
};

function traduzirErroLogin(error) {
  const texto = String(error?.message || "").toLowerCase();

  if (texto.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }

  if (texto.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar.";
  }

  if (texto.includes("rate limit") || texto.includes("too many")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }

  return error?.message || "Não foi possível entrar.";
}

async function buscarClienteAtual(usuarioId) {
  const { data, error } = await supabase
    .from("clientes")
    .select("id")
    .eq("profile_id", usuarioId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export default function HomePage() {
  const { tipo } = useParams();
  const navigate = useNavigate();
  const { authenticated, profile, loading, entrar, sair } = useAuth();

  const tipoInicial = ACCESS_CONFIG[tipo] ? tipo : "barbearia";
  const [tipoSelecionado, setTipoSelecionado] = useState(tipoInicial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [oauthSubmitting, setOauthSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");

  const config = useMemo(
    () => ACCESS_CONFIG[tipoSelecionado],
    [tipoSelecionado],
  );

  useEffect(() => {
    if (ACCESS_CONFIG[tipo]) {
      setTipoSelecionado(tipo);
    }
  }, [tipo]);

  useEffect(() => {
    setMessage("");
    setMessageType("error");
  }, [tipoSelecionado]);

  if (!loading && authenticated && profile?.tipo === config.expectedType) {
    return <Navigate to={config.destination} replace />;
  }

  function mostrarMensagem(texto, tipoMensagem = "error") {
    setMessage(texto);
    setMessageType(tipoMensagem);
  }

  function limparMensagem() {
    setMessage("");
    setMessageType("error");
  }

  function selecionarTipo(novoTipo) {
    if (!ACCESS_CONFIG[novoTipo]) {
      return;
    }

    setTipoSelecionado(novoTipo);
    navigate(`/login/${novoTipo}`, { replace: true });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    limparMensagem();

    const emailNormalizado = email.trim().toLowerCase();

    if (!emailNormalizado) {
      mostrarMensagem("Digite seu e-mail.");
      return;
    }

    if (!password) {
      mostrarMensagem("Digite sua senha.");
      return;
    }

    setSubmitting(true);

    try {
      mostrarMensagem("Entrando...", "info");

      const resultado = await entrar({
        email: emailNormalizado,
        password,
      });

      if (!resultado?.profile) {
        await sair();
        mostrarMensagem("Seu perfil não foi encontrado.");
        return;
      }

      if (resultado.profile.tipo !== config.expectedType) {
        await sair();
        mostrarMensagem(config.wrongTypeMessage);
        return;
      }

      if (config.expectedType === "cliente") {
        const cliente = await buscarClienteAtual(resultado.user.id);

        if (!cliente?.id) {
          navigate("/cadastro/cliente", { replace: true });
          return;
        }
      }

      mostrarMensagem("Login realizado com sucesso!", "success");
      navigate(config.destination, { replace: true });
    } catch (error) {
      console.error(
        `[BarberHub] Erro no login de ${tipoSelecionado}:`,
        error,
      );
      mostrarMensagem(traduzirErroLogin(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    limparMensagem();
    setOauthSubmitting(true);

    try {
      localStorage.setItem(OAUTH_TYPE_KEY, tipoSelecionado);

      const redirectTo = new URL(
        `/auth/callback?tipo=${tipoSelecionado}`,
        window.location.origin,
      ).href;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("[BarberHub] Erro no login com Google:", error);
      localStorage.removeItem(OAUTH_TYPE_KEY);
      mostrarMensagem(
        error?.message || "Não foi possível iniciar o login com Google.",
      );
      setOauthSubmitting(false);
    }
  }

  async function handleRecoverPassword() {
    limparMensagem();

    const emailNormalizado = email.trim().toLowerCase();

    if (!emailNormalizado) {
      mostrarMensagem(config.recoveryEmailMessage);
      return;
    }

    setRecovering(true);

    try {
      mostrarMensagem("Enviando link de recuperação...", "info");

      const redirectTo = new URL(
        `/nova-senha?tipo=${tipoSelecionado}`,
        window.location.origin,
      ).href;

      const { error } = await supabase.auth.resetPasswordForEmail(
        emailNormalizado,
        { redirectTo },
      );

      if (error) {
        throw error;
      }

      mostrarMensagem(
        "Enviamos um link de recuperação para seu e-mail.",
        "success",
      );
    } catch (error) {
      console.error("[BarberHub] Erro na recuperação de senha:", error);
      mostrarMensagem("Não foi possível enviar o link de recuperação.");
    } finally {
      setRecovering(false);
    }
  }

  const bloqueado = submitting || recovering || oauthSubmitting;

  return (
    <main className="access-page">
      <section className="access-shell">
        <div className="access-card">
          <header className="access-header">
            <img
              src="/barber.png"
              alt="Logo do BarberHub"
              className="access-logo"
            />

            <p className="access-brand-kicker">BARBERHUB</p>
            <h1>Bem-vindo</h1>
            <p>Escolha como deseja acessar o sistema.</p>
          </header>

          <div className="access-divider" aria-hidden="true" />

          <div
            className="access-type-selector"
            role="tablist"
            aria-label="Tipo de acesso"
          >
            {ACCESS_TYPES.map(({ key, label, Icon }) => {
              const ativo = key === tipoSelecionado;

              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={ativo}
                  className={`access-type-button${
                    ativo ? " access-type-button--active" : ""
                  }`}
                  disabled={bloqueado}
                  onClick={() => selecionarTipo(key)}
                >
                  <span className="access-type-icon">
                    <Icon />
                  </span>
                  <strong>{label}</strong>
                </button>
              );
            })}
          </div>

          <section className="access-context" aria-live="polite">
            <span>{config.eyebrow}</span>
            <h2>{config.title}</h2>
            <p>{config.subtitle}</p>
          </section>

          {tipoSelecionado === "profissional" ? (
            <div className="access-professional-note">
              <strong>Acesso exclusivo da equipe</strong>
              <span>Use o e-mail e a senha liberados pela sua barbearia.</span>
            </div>
          ) : null}

          <form className="access-form" onSubmit={handleSubmit} noValidate>
            <label className="access-field">
              <span>E-mail</span>
              <input
                type="email"
                name="email"
                value={email}
                placeholder={config.emailPlaceholder}
                autoComplete="email"
                inputMode="email"
                maxLength={254}
                disabled={bloqueado}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label className="access-field">
              <span>Senha</span>
              <input
                type="password"
                name="password"
                value={password}
                placeholder="Sua senha"
                autoComplete="current-password"
                disabled={bloqueado}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            <button
              type="button"
              className="access-forgot"
              disabled={bloqueado}
              onClick={handleRecoverPassword}
            >
              {recovering ? "Enviando..." : "Esqueci minha senha"}
            </button>

            {message ? (
              <div
                className={`access-message access-message--${messageType}`}
                role="status"
                aria-live="polite"
              >
                {message}
              </div>
            ) : null}

            <button
              type="submit"
              className="access-primary-button"
              disabled={bloqueado}
            >
              {submitting ? "Entrando..." : "Entrar"}
            </button>

            <div className="access-or" aria-hidden="true">
              <span />
              <strong>ou</strong>
              <span />
            </div>

            <button
              type="button"
              className="access-google-button"
              disabled={bloqueado}
              onClick={handleGoogleLogin}
            >
              <span className="access-google-icon" aria-hidden="true">
                G
              </span>
              <span>
                {oauthSubmitting ? "Abrindo Google..." : config.googleLabel}
              </span>
            </button>

            {config.signupDestination ? (
              <button
                type="button"
                className="access-secondary-button"
                disabled={bloqueado}
                onClick={() => navigate(config.signupDestination)}
              >
                Ainda não tenho conta
              </button>
            ) : null}
          </form>

          <footer className="access-footer">
            <span>BarberHub</span>
            <span aria-hidden="true">•</span>
            <span>Desenvolvido por AASORB — Soluções Digitais</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
