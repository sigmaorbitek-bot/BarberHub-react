import { useEffect, useState } from "react";

import { Link, useSearchParams } from "react-router-dom";

import { supabase } from "../../services/supabase";
import "./AuthCallbackPage.css";

const OAUTH_TYPE_KEY = "barberhub_oauth_tipo";

const VALID_TYPES = {
  barbearia: "dono",
  cliente: "cliente",
  profissional: "profissional",
};

function obterNomeUsuario(user) {
  return (
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.nome ||
    user?.email ||
    "Usuário"
  );
}

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();

  const [status, setStatus] = useState("Concluindo seu acesso com Google...");

  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let ativo = true;

    async function concluir() {
      try {
        const tipoUrl = searchParams.get("tipo");

        const tipoSalvo = localStorage.getItem(OAUTH_TYPE_KEY);

        const tipo = VALID_TYPES[tipoUrl]
          ? tipoUrl
          : VALID_TYPES[tipoSalvo]
            ? tipoSalvo
            : null;

        if (!tipo) {
          throw new Error("Não foi possível identificar a área de acesso.");
        }

        setStatus("Validando sua conta...");

        let { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!sessionData?.session) {
          const code = searchParams.get("code");

          if (code) {
            const { data, error } =
              await supabase.auth.exchangeCodeForSession(code);

            if (error) {
              throw error;
            }

            sessionData = data;
          }
        }

        const user = sessionData?.session?.user;

        if (!user) {
          throw new Error("Não encontramos uma sessão válida do Google.");
        }

        setStatus(`Preparando a conta de ${obterNomeUsuario(user)}...`);

        const { data, error } = await supabase.rpc("finalizar_login_google", {
          p_tipo: VALID_TYPES[tipo],
        });

        if (error) {
          throw error;
        }

        const resultado = Array.isArray(data) ? data[0] : data;

        if (!resultado) {
          throw new Error("O servidor não retornou os dados da conta.");
        }

        localStorage.removeItem(OAUTH_TYPE_KEY);

        let destino = "/";

        if (resultado.tipo === "dono") {
          destino = resultado.tem_barbearia
            ? "/painel"
            : "/cadastro/barbearia?oauth=google";
        } else if (resultado.tipo === "cliente") {
          destino = "/cliente";
        } else if (resultado.tipo === "profissional") {
          destino = "/profissional";
        }

        if (!ativo) {
          return;
        }

        setStatus("Tudo certo. Abrindo o BarberHub...");

        window.location.replace(destino);
      } catch (error) {
        console.error("[BarberHub] Erro no callback do Google:", error);

        if (!ativo) {
          return;
        }

        setErrorMessage(
          error?.message || "Não foi possível concluir o login com Google.",
        );

        setStatus("");
      }
    }

    concluir();

    return () => {
      ativo = false;
    };
  }, [searchParams]);

  return (
    <main className="auth-callback-page">
      <section className="auth-callback-card">
        <img src="/barber.png" alt="BarberHub" className="auth-callback-logo" />

        <span className="auth-callback-eyebrow">ACESSO SEGURO</span>

        <h1>Login com Google</h1>

        {errorMessage ? (
          <>
            <div
              className="auth-callback-message auth-callback-message--error"
              role="alert"
            >
              {errorMessage}
            </div>

            <Link className="auth-callback-button" to="/">
              Voltar ao início
            </Link>
          </>
        ) : (
          <>
            <div className="auth-callback-spinner" aria-hidden="true" />

            <p className="auth-callback-status" role="status">
              {status}
            </p>
          </>
        )}

        <small>BarberHub · Desenvolvido por Sigma Orbitek</small>
      </section>
    </main>
  );
}
