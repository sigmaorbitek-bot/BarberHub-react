import { useEffect, useMemo, useState } from "react";

import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../services/supabase";
import "./Login.css";

const OAUTH_TYPE_KEY = "barberhub_oauth_tipo";

const LOGIN_CONFIG = {
  barbearia: {
    expectedType: "dono",
    eyebrow: "Área da barbearia",
    subtitle: "Acesse o painel da sua barbearia",
    emailPlaceholder: "barbearia@email.com",
    recoveryEmailMessage: "Digite o e-mail da sua barbearia.",
    wrongTypeMessage:
      "Esta conta não é uma conta de barbearia. Use a área correta.",
    destination: "/painel",
    signupDestination: "/cadastro/barbearia",
    googleLabel: "Continuar com Google como barbearia",
    switchLinks: [
      {
        label: "Sou cliente",
        to: "/login/cliente",
      },
      {
        label: "Sou profissional",
        to: "/login/profissional",
      },
    ],
  },

  cliente: {
    expectedType: "cliente",
    eyebrow: "Área do cliente",
    subtitle: "Entre na sua conta para agendar seu horário",
    emailPlaceholder: "seu@email.com",
    recoveryEmailMessage: "Digite seu e-mail para recuperar a senha.",
    wrongTypeMessage:
      "Esta conta não é uma conta de cliente. Use a área correta.",
    destination: "/cliente",
    signupDestination: "/cadastro/cliente",
    googleLabel: "Continuar com Google como cliente",
    switchLinks: [
      {
        label: "Sou barbearia",
        to: "/login/barbearia",
      },
      {
        label: "Sou profissional",
        to: "/login/profissional",
      },
    ],
  },

  profissional: {
    expectedType: "profissional",
    eyebrow: "Área do profissional",
    subtitle: "Acesse sua agenda e seus dados profissionais",
    emailPlaceholder: "profissional@email.com",
    recoveryEmailMessage: "Digite seu e-mail profissional.",
    wrongTypeMessage:
      "Esta conta não é uma conta de profissional. Use a área correta.",
    destination: "/profissional",
    signupDestination: null,
    googleLabel: "Continuar com Google como profissional",
    switchLinks: [
      {
        label: "Sou barbearia",
        to: "/login/barbearia",
      },
      {
        label: "Sou cliente",
        to: "/login/cliente",
      },
    ],
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

async function garantirCliente({ usuario, perfil }) {
  const { data: existente, error: erroBusca } = await supabase
    .from("clientes")
    .select("id, profile_id, nome, telefone, email")
    .eq("profile_id", usuario.id)
    .maybeSingle();

  if (erroBusca) {
    throw erroBusca;
  }

  if (existente) {
    return existente;
  }

  const { data, error } = await supabase
    .from("clientes")
    .insert({
      profile_id: usuario.id,
      nome:
        perfil?.nome ||
        usuario.user_metadata?.nome ||
        usuario.email ||
        "Cliente",
      telefone: perfil?.telefone || usuario.user_metadata?.telefone || null,
      email: usuario.email || null,
    })
    .select("id, profile_id, nome, telefone, email")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export default function LoginPage() {
  const { tipo } = useParams();

  const navigate = useNavigate();

  const { authenticated, profile, loading, entrar, sair } = useAuth();

  const config = useMemo(() => LOGIN_CONFIG[tipo] ?? null, [tipo]);

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const [recovering, setRecovering] = useState(false);

  const [oauthSubmitting, setOauthSubmitting] = useState(false);

  const [message, setMessage] = useState("");

  const [messageType, setMessageType] = useState("error");

  useEffect(() => {
    setMessage("");
    setMessageType("error");
  }, [tipo]);

  if (!config) {
    return <Navigate to="/" replace />;
  }

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
        await garantirCliente({
          usuario: resultado.user,
          perfil: resultado.profile,
        });
      }

      mostrarMensagem("Login realizado com sucesso!", "success");

      navigate(config.destination, {
        replace: true,
      });
    } catch (error) {
      console.error(`[BarberHub] Erro no login de ${tipo}:`, error);

      mostrarMensagem(traduzirErroLogin(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    limparMensagem();

    setOauthSubmitting(true);

    try {
      localStorage.setItem(OAUTH_TYPE_KEY, tipo);

      const redirectTo = new URL(
        `/auth/callback?tipo=${tipo}`,
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
        `/nova-senha?tipo=${tipo}`,
        window.location.origin,
      ).href;

      const { error } = await supabase.auth.resetPasswordForEmail(
        emailNormalizado,
        {
          redirectTo,
        },
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
    <main className="login-page">
      <section className="login-container">
        <div className="login-card">
          <header className="login-header">
            <Link
              to="/"
              className="login-logo-link"
              aria-label="Voltar ao início do BarberHub"
            >
              <img
                src="/barber.png"
                alt="Logo do BarberHub"
                className="login-logo"
              />
            </Link>

            <p className="login-eyebrow">{config.eyebrow}</p>

            <h1 className="login-title">Entrar</h1>

            <p className="login-subtitle">{config.subtitle}</p>
          </header>

          <div className="login-divider" aria-hidden="true" />

          {tipo === "profissional" ? (
            <div className="login-professional-note">
              <strong>Acesso exclusivo da equipe</strong>

              <span>Use o e-mail e a senha fornecidos pela sua barbearia.</span>
            </div>
          ) : null}

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label htmlFor="login-email">E-mail</label>

              <input
                id="login-email"
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
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Senha</label>

              <input
                id="login-password"
                type="password"
                name="password"
                value={password}
                placeholder="Sua senha"
                autoComplete="current-password"
                disabled={bloqueado}
                onChange={(event) => setPassword(event.target.value)}
              />

              <button
                type="button"
                className="login-forgot-button"
                disabled={bloqueado}
                onClick={handleRecoverPassword}
              >
                {recovering ? "Enviando..." : "Esqueci minha senha"}
              </button>
            </div>

            {message ? (
              <div
                className={`login-message login-message--${messageType}`}
                role="status"
                aria-live="polite"
              >
                {message}
              </div>
            ) : null}

            <button
              type="submit"
              className="login-primary-button"
              disabled={bloqueado}
            >
              {submitting ? "Entrando..." : "Entrar"}
            </button>

            <div className="login-or" aria-hidden="true">
              <span />
              <strong>ou</strong>
              <span />
            </div>

            <button
              type="button"
              className="login-google-button"
              disabled={bloqueado}
              onClick={handleGoogleLogin}
            >
              <span className="login-google-icon" aria-hidden="true">
                G
              </span>

              <span>
                {oauthSubmitting ? "Abrindo Google..." : config.googleLabel}
              </span>
            </button>

            {config.signupDestination ? (
              <button
                type="button"
                className="login-secondary-button"
                disabled={bloqueado}
                onClick={() => navigate(config.signupDestination)}
              >
                Ainda não tenho conta
              </button>
            ) : null}

            <Link
              className="login-secondary-button login-secondary-button--link"
              to="/"
            >
              ← Voltar ao início
            </Link>
          </form>

          <div className="login-switch login-switch--multiple">
            <span>Entrou na área errada?</span>

            <div>
              {config.switchLinks.map((item) => (
                <Link key={item.to} to={item.to}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <p className="login-footer">
            BarberHub · Desenvolvido por Sigma Orbitek
          </p>
        </div>
      </section>
    </main>
  );
}
