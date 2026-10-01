import {
  useEffect,
  useState,
} from "react";

import {
  Navigate,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../services/supabase";
import "./Profissional.css";

export default function PrimeiroAcessoProfissionalPage() {
  const {
    profile,
    loading,
  } = useAuth();

  const navigate =
    useNavigate();

  const [senha, setSenha] =
    useState("");

  const [
    confirmarSenha,
    setConfirmarSenha,
  ] = useState("");

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [message, setMessage] =
    useState("");

  const [
    contexto,
    setContexto,
  ] = useState(null);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      const {
        data,
        error,
      } = await supabase.rpc(
        "obter_contexto_profissional",
      );

      if (!ativo) {
        return;
      }

      if (error) {
        setMessage(
          "Não foi possível validar seu acesso.",
        );
        return;
      }

      const item =
        Array.isArray(data)
          ? data[0]
          : data;

      setContexto(
        item || null,
      );

      if (
        item &&
        !item.primeiro_acesso_pendente
      ) {
        navigate(
          "/profissional",
          {
            replace: true,
          },
        );
      }
    }

    if (
      !loading &&
      profile?.tipo ===
        "profissional"
    ) {
      carregar();
    }

    return () => {
      ativo = false;
    };
  }, [
    loading,
    profile,
    navigate,
  ]);

  if (loading) {
    return (
      <main className="professional-auth-page">
        <section className="professional-auth-card">
          <div className="professional-auth-loading">
            Carregando seu acesso...
          </div>
        </section>
      </main>
    );
  }

  if (
    profile?.tipo !==
    "profissional"
  ) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  async function handleSubmit(
    event,
  ) {
    event.preventDefault();
    setMessage("");

    if (
      senha.length < 8
    ) {
      setMessage(
        "A nova senha precisa ter pelo menos 8 caracteres.",
      );
      return;
    }

    if (
      senha !==
      confirmarSenha
    ) {
      setMessage(
        "As senhas não são iguais.",
      );
      return;
    }

    setSubmitting(true);

    try {
      const {
        error: senhaError,
      } =
        await supabase.auth.updateUser({
          password:
            senha,
        });

      if (senhaError) {
        throw senhaError;
      }

      const {
        error: rpcError,
      } = await supabase.rpc(
        "concluir_primeiro_acesso_profissional",
      );

      if (rpcError) {
        throw rpcError;
      }

      navigate(
        "/profissional",
        {
          replace: true,
        },
      );
    } catch (error) {
      console.error(
        "[BarberHub] Primeiro acesso profissional:",
        error,
      );

      setMessage(
        error?.message ||
          "Não foi possível alterar sua senha.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="professional-auth-page">
      <section className="professional-auth-card">
        <header className="professional-auth-header">
          <img
            src="/barber.png"
            alt="Logo do BarberHub"
            className="professional-auth-logo"
          />

          <span className="professional-auth-eyebrow">
            PRIMEIRO ACESSO
          </span>

          <h1>
            Crie sua senha
          </h1>

          <p>
            Olá,{" "}
            <strong>
              {contexto?.profissional_nome ||
                profile?.nome ||
                "profissional"}
            </strong>
            . A senha fornecida pela barbearia é temporária.
            Defina agora sua senha pessoal.
          </p>
        </header>

        <div
          className="professional-auth-divider"
          aria-hidden="true"
        />

        <form
          onSubmit={
            handleSubmit
          }
          className="professional-auth-form"
          noValidate
        >
          <label htmlFor="professional-new-password">
            Nova senha
          </label>

          <input
            id="professional-new-password"
            type="password"
            value={senha}
            autoComplete="new-password"
            placeholder="Mínimo de 8 caracteres"
            disabled={
              submitting
            }
            onChange={(event) =>
              setSenha(
                event.target.value,
              )
            }
          />

          <label htmlFor="professional-confirm-password">
            Confirmar nova senha
          </label>

          <input
            id="professional-confirm-password"
            type="password"
            value={
              confirmarSenha
            }
            autoComplete="new-password"
            placeholder="Digite novamente"
            disabled={
              submitting
            }
            onChange={(event) =>
              setConfirmarSenha(
                event.target.value,
              )
            }
          />

          {message ? (
            <div
              className="professional-auth-error"
              role="alert"
            >
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={
              submitting
            }
          >
            {submitting
              ? "Salvando..."
              : "Salvar nova senha"}
          </button>
        </form>

        <p className="professional-auth-tip">
          Depois você também poderá entrar com Google usando o mesmo e-mail.
        </p>

        <p className="professional-auth-footer">
          BarberHub · Desenvolvido por Sigma Orbitek
        </p>
      </section>
    </main>
  );
}
