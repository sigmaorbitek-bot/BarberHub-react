import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import { supabase } from "../../services/supabase";
import "../Login/Login.css";

const PASSWORD_MIN_LENGTH = 6;

function traduzirErroSenha(error) {
  const texto = String(error?.message || "").toLowerCase();

  if (
    texto.includes("password should be at least") ||
    texto.includes("password is too short")
  ) {
    return `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }

  if (texto.includes("same password")) {
    return "A nova senha precisa ser diferente da senha atual.";
  }

  if (
    texto.includes("session") ||
    texto.includes("jwt")
  ) {
    return "Sua sessão de recuperação expirou. Solicite um novo link.";
  }

  return error?.message || "Não foi possível alterar sua senha.";
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const tipo = searchParams.get("tipo");

  const loginDestination = useMemo(() => {
    if (tipo === "cliente") {
      return "/login/cliente";
    }

    if (tipo === "barbearia") {
      return "/login/barbearia";
    }

    return "/";
  }, [tipo]);

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const [validating, setValidating] = useState(true);
  const [sessionValid, setSessionValid] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");

  useEffect(() => {
    let active = true;

    async function validarSessao() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (!active) {
          return;
        }

        if (!session?.user) {
          setSessionValid(false);
          setMessage(
            "O link de recuperação é inválido ou expirou. Solicite um novo link.",
          );
          setMessageType("error");
          return;
        }

        setSessionValid(true);
      } catch (error) {
        console.error(
          "[BarberHub] Erro ao validar recuperação:",
          error,
        );

        if (active) {
          setSessionValid(false);
          setMessage(
            "Não foi possível validar o link de recuperação.",
          );
          setMessageType("error");
        }
      } finally {
        if (active) {
          setValidating(false);
        }
      }
    }

    validarSessao();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    setMessage("");

    if (!password) {
      setMessage("Digite sua nova senha.");
      setMessageType("error");
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      setMessage(
        `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
      );
      setMessageType("error");
      return;
    }

    if (!confirmation) {
      setMessage("Confirme sua nova senha.");
      setMessageType("error");
      return;
    }

    if (password !== confirmation) {
      setMessage("As senhas não são iguais.");
      setMessageType("error");
      return;
    }

    setSubmitting(true);

    try {
      setMessage("Alterando sua senha...");
      setMessageType("info");

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.user) {
        throw new Error(
          "Sua sessão de recuperação expirou. Solicite um novo link.",
        );
      }

      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw error;
      }

      setPassword("");
      setConfirmation("");

      setMessage("Senha alterada com sucesso!");
      setMessageType("success");

      await supabase.auth.signOut();

      window.setTimeout(() => {
        navigate(loginDestination, {
          replace: true,
        });
      }, 1200);
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao alterar senha:",
        error,
      );

      setMessage(traduzirErroSenha(error));
      setMessageType("error");
    } finally {
      setSubmitting(false);
    }
  }

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

            <p className="login-eyebrow">
              Segurança da conta
            </p>

            <h1 className="login-title">
              Nova senha
            </h1>

            <p className="login-subtitle">
              Crie uma nova senha para sua conta
            </p>
          </header>

          <div
            className="login-divider"
            aria-hidden="true"
          />

          <form
            className="login-form"
            onSubmit={handleSubmit}
            noValidate
          >
            <div className="login-field">
              <label htmlFor="new-password">
                Nova senha
              </label>

              <input
                id="new-password"
                type="password"
                value={password}
                placeholder="Digite sua nova senha"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                disabled={
                  validating ||
                  submitting ||
                  !sessionValid
                }
                onChange={(event) =>
                  setPassword(event.target.value)
                }
              />
            </div>

            <div className="login-field">
              <label htmlFor="confirm-password">
                Confirmar nova senha
              </label>

              <input
                id="confirm-password"
                type="password"
                value={confirmation}
                placeholder="Digite a senha novamente"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                disabled={
                  validating ||
                  submitting ||
                  !sessionValid
                }
                onChange={(event) =>
                  setConfirmation(event.target.value)
                }
              />
            </div>

            {validating ? (
              <div className="login-message login-message--info">
                Validando link de recuperação...
              </div>
            ) : null}

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
              disabled={
                validating ||
                submitting ||
                !sessionValid
              }
            >
              {submitting
                ? "Alterando senha..."
                : "Alterar senha"}
            </button>

            <Link
              className="login-secondary-button login-secondary-button--link"
              to={loginDestination}
            >
              ← Voltar para o login
            </Link>
          </form>

          <p className="login-footer">
            BarberHub · Desenvolvido por Sigma Orbitek
          </p>
        </div>
      </section>
    </main>
  );
}
