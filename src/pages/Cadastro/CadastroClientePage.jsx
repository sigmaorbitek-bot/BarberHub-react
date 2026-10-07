import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../services/supabase";
import "./Cadastro.css";

const SENHA_MINIMA = 6;

function normalizarTelefone(valor) {
  return String(valor || "")
    .replace(/\D/g, "")
    .trim();
}

function nomeDaConta(user) {
  return String(
    user?.user_metadata?.nome ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      "",
  ).trim();
}

function telefoneDaConta(user) {
  return normalizarTelefone(
    user?.user_metadata?.telefone || user?.user_metadata?.phone || "",
  );
}

function traduzirErro(error) {
  const texto = String(error?.message || "").toLowerCase();

  if (
    texto.includes("already registered") ||
    texto.includes("already exists") ||
    texto.includes("user already registered")
  ) {
    return "Este e-mail já está cadastrado.";
  }

  if (texto.includes("invalid email")) {
    return "Digite um e-mail válido.";
  }

  if (
    texto.includes("password") &&
    (texto.includes("weak") || texto.includes("short"))
  ) {
    return "A senha escolhida é muito fraca.";
  }

  if (texto.includes("rate limit") || texto.includes("too many")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }

  if (
    texto.includes("outro tipo de acesso") ||
    texto.includes("mudança de perfil")
  ) {
    return "Esta conta está vinculada a outro tipo de acesso. Use o fluxo de mudança de perfil.";
  }

  return error?.message || "Não foi possível realizar o cadastro.";
}

async function finalizarCliente({ nome, telefone }) {
  const { data, error } = await supabase.rpc("finalizar_cadastro_cliente", {
    p_nome: nome.trim(),
    p_telefone: normalizarTelefone(telefone) || null,
  });

  if (error) {
    throw error;
  }

  if (!data?.id) {
    throw new Error("O Supabase não retornou o cadastro do cliente.");
  }

  return data;
}

export default function CadastroClientePage() {
  const navigate = useNavigate();
  const { user, profile, authenticated, loading: authLoading } = useAuth();

  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    email: "",
    senha: "",
    confirmarSenha: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("error");

  const usuarioAutenticado = authenticated && Boolean(user?.id);
  const perfilCliente = usuarioAutenticado && profile?.tipo === "cliente";
  const onboardingGoogle = usuarioAutenticado && !profile;
  const contaCompativel = perfilCliente || onboardingGoogle;
  const perfilIncompativel =
    usuarioAutenticado && Boolean(profile) && profile?.tipo !== "cliente";

  useEffect(() => {
    if (authLoading || !usuarioAutenticado) {
      return;
    }

    setForm((atual) => ({
      ...atual,
      nome: atual.nome || profile?.nome || nomeDaConta(user),
      telefone: atual.telefone || telefoneDaConta(user),
      email: user?.email || atual.email,
    }));
  }, [authLoading, usuarioAutenticado, profile?.nome, user]);

  useEffect(() => {
    if (authLoading || !perfilIncompativel) {
      return;
    }

    setMessage(
      "Esta conta está vinculada a outro tipo de acesso. Use o fluxo de mudança de perfil para continuar como cliente.",
    );
    setMessageType("error");
  }, [authLoading, perfilIncompativel]);

  function alterarCampo(event) {
    const { name, value } = event.target;

    setForm((atual) => ({
      ...atual,
      [name]: value,
    }));
  }

  function mostrarMensagem(texto, tipo = "error") {
    setMessage(texto);
    setMessageType(tipo);
  }

  function validar() {
    const nome = form.nome.trim();
    const email = form.email.trim();

    if (!nome) {
      return "Digite seu nome.";
    }

    if (!usuarioAutenticado) {
      if (!email) {
        return "Digite seu e-mail.";
      }

      if (!form.senha) {
        return "Digite uma senha.";
      }

      if (form.senha.length < SENHA_MINIMA) {
        return `A senha deve ter pelo menos ${SENHA_MINIMA} caracteres.`;
      }

      if (form.senha !== form.confirmarSenha) {
        return "As senhas não coincidem.";
      }
    }

    return null;
  }

  async function concluirCadastro() {
    await finalizarCliente({
      nome: form.nome,
      telefone: form.telefone,
    });

    mostrarMensagem("Cadastro realizado com sucesso!", "success");
    navigate("/cliente", { replace: true });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (authLoading) {
      mostrarMensagem("Aguarde enquanto verificamos sua conta.", "info");
      return;
    }

    if (perfilIncompativel) {
      mostrarMensagem(
        "Esta conta está vinculada a outro tipo de acesso. Use o fluxo de mudança de perfil.",
      );
      return;
    }

    const erroValidacao = validar();

    if (erroValidacao) {
      mostrarMensagem(erroValidacao);
      return;
    }

    setSubmitting(true);

    try {
      if (contaCompativel) {
        await concluirCadastro();
        return;
      }

      mostrarMensagem("Criando sua conta...", "info");

      const nome = form.nome.trim();
      const telefone = normalizarTelefone(form.telefone);
      const email = form.email.trim().toLowerCase();

      const { data, error } = await supabase.auth.signUp({
        email,
        password: form.senha,
        options: {
          emailRedirectTo: `${window.location.origin}/cadastro/cliente`,
          data: {
            nome,
            telefone: telefone || null,
            tipo: "cliente",
          },
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.user) {
        throw new Error("O Supabase não retornou o usuário criado.");
      }

      if (!data.session) {
        mostrarMensagem(
          "Conta criada! Confirme seu e-mail. Depois você será direcionado para concluir o cadastro.",
          "success",
        );

        setForm((atual) => ({
          ...atual,
          senha: "",
          confirmarSenha: "",
        }));
        return;
      }

      await concluirCadastro();
    } catch (error) {
      console.error("[BarberHub] Erro no cadastro do cliente:", error);
      mostrarMensagem(traduzirErro(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="cadastro-page">
      <section className="cadastro-container">
        <div className="cadastro-card">
          <header className="cadastro-header">
            <Link to="/" className="cadastro-logo-link">
              <img
                src="/barber.png"
                alt="Logo do BarberHub"
                className="cadastro-logo"
              />
            </Link>

            <p className="cadastro-eyebrow">Área do cliente</p>
            <h1>
              {contaCompativel ? "Concluir cadastro" : "Cadastro de cliente"}
            </h1>

            <p>
              Crie sua conta para encontrar barbearias, agendar horários e
              acompanhar seus atendimentos.
            </p>
          </header>

          <div className="cadastro-divider" />

          <form className="cadastro-form" onSubmit={handleSubmit} noValidate>
            <div className="cadastro-section-heading">
              <h2>Seus dados</h2>
              <p>Informe seus dados para utilizar o BarberHub.</p>
            </div>

            <div className="cadastro-field">
              <label htmlFor="cliente-nome">Nome completo *</label>
              <input
                id="cliente-nome"
                name="nome"
                type="text"
                value={form.nome}
                onChange={alterarCampo}
                placeholder="Ex.: João da Silva"
                autoComplete="name"
                maxLength={120}
                disabled={submitting}
              />
            </div>

            <div className="cadastro-field">
              <label htmlFor="cliente-telefone">Telefone / WhatsApp</label>
              <input
                id="cliente-telefone"
                name="telefone"
                type="tel"
                value={form.telefone}
                onChange={alterarCampo}
                placeholder="(81) 99999-9999"
                autoComplete="tel"
                inputMode="tel"
                maxLength={20}
                disabled={submitting}
              />
              <small>
                Usaremos esse número para facilitar o contato com a barbearia.
              </small>
            </div>

            <div className="cadastro-divider" />

            <div className="cadastro-section-heading">
              <h2>Dados da conta</h2>
              <p>
                {usuarioAutenticado
                  ? "Sua conta autenticada será usada para acessar a área do cliente."
                  : "Use seu e-mail e senha para acessar sua área."}
              </p>
            </div>

            <div className="cadastro-field">
              <label htmlFor="cliente-email">E-mail *</label>
              <input
                id="cliente-email"
                name="email"
                type="email"
                value={usuarioAutenticado ? user?.email || "" : form.email}
                onChange={alterarCampo}
                placeholder="cliente@email.com"
                autoComplete="email"
                inputMode="email"
                maxLength={254}
                readOnly={usuarioAutenticado}
                disabled={submitting}
              />
              {usuarioAutenticado ? (
                <small>E-mail confirmado pela conta autenticada.</small>
              ) : null}
            </div>

            {!usuarioAutenticado ? (
              <>
                <div className="cadastro-field">
                  <label htmlFor="cliente-senha">Senha *</label>
                  <input
                    id="cliente-senha"
                    name="senha"
                    type="password"
                    value={form.senha}
                    onChange={alterarCampo}
                    placeholder={`Mínimo de ${SENHA_MINIMA} caracteres`}
                    autoComplete="new-password"
                    disabled={submitting}
                  />
                  <small>Use pelo menos {SENHA_MINIMA} caracteres.</small>
                </div>

                <div className="cadastro-field">
                  <label htmlFor="cliente-confirmar">Confirmar senha *</label>
                  <input
                    id="cliente-confirmar"
                    name="confirmarSenha"
                    type="password"
                    value={form.confirmarSenha}
                    onChange={alterarCampo}
                    placeholder="Digite a senha novamente"
                    autoComplete="new-password"
                    disabled={submitting}
                  />
                </div>
              </>
            ) : (
              <div className="cadastro-account-connected">
                <strong>🔐 Conta conectada</strong>
                <p>Seu cadastro será vinculado automaticamente a esta conta.</p>
              </div>
            )}

            {message ? (
              <div
                className={`cadastro-message cadastro-message--${messageType}`}
                role="status"
                aria-live="polite"
              >
                {message}
              </div>
            ) : null}

            <button
              type="submit"
              className="cadastro-primary-button"
              disabled={submitting || perfilIncompativel}
            >
              {submitting
                ? "Processando..."
                : contaCompativel
                  ? "Concluir cadastro"
                  : "+ Confirmar cadastro"}
            </button>

            <Link to="/login/cliente" className="cadastro-secondary-button">
              ← Voltar para o login
            </Link>
          </form>

          <p className="cadastro-footer">
            BarberHub · Desenvolvido por AASORB — Soluções Digitais
          </p>
        </div>
      </section>
    </main>
  );
}
