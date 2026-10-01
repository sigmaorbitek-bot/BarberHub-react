import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { supabase } from "../../services/supabase";
import "./Cadastro.css";

const SENHA_MINIMA = 6;

function normalizarTelefone(valor) {
  return String(valor || "").replace(/\D/g, "").trim();
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

  if (
    texto.includes("rate limit") ||
    texto.includes("too many")
  ) {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }

  return error?.message || "Não foi possível realizar o cadastro.";
}

async function garantirCliente({
  usuarioId,
  nome,
  telefone,
  email,
}) {
  const { data: existente, error: erroBusca } = await supabase
    .from("clientes")
    .select("id")
    .eq("profile_id", usuarioId)
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
      profile_id: usuarioId,
      nome,
      telefone: telefone || null,
      email,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export default function CadastroClientePage() {
  const navigate = useNavigate();

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

  async function handleSubmit(event) {
    event.preventDefault();

    const nome = form.nome.trim();
    const telefone = normalizarTelefone(form.telefone);
    const email = form.email.trim().toLowerCase();

    setMessage("");

    if (!nome) {
      mostrarMensagem("Digite seu nome.");
      return;
    }

    if (!email) {
      mostrarMensagem("Digite seu e-mail.");
      return;
    }

    if (!form.senha) {
      mostrarMensagem("Digite uma senha.");
      return;
    }

    if (form.senha.length < SENHA_MINIMA) {
      mostrarMensagem(
        `A senha deve ter pelo menos ${SENHA_MINIMA} caracteres.`,
      );
      return;
    }

    if (form.senha !== form.confirmarSenha) {
      mostrarMensagem("As senhas não coincidem.");
      return;
    }

    setSubmitting(true);

    try {
      mostrarMensagem("Criando sua conta...", "info");

      const { data, error } = await supabase.auth.signUp({
        email,
        password: form.senha,
        options: {
          emailRedirectTo: `${window.location.origin}/login/cliente`,
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
          "Conta criada! Verifique seu e-mail para confirmar o cadastro e depois faça login.",
          "success",
        );

        setForm({
          nome: "",
          telefone: "",
          email: "",
          senha: "",
          confirmarSenha: "",
        });

        return;
      }

      await garantirCliente({
        usuarioId: data.user.id,
        nome,
        telefone,
        email,
      });

      mostrarMensagem(
        "Cadastro realizado com sucesso!",
        "success",
      );

      navigate("/cliente", {
        replace: true,
      });
    } catch (error) {
      console.error(
        "[BarberHub] Erro no cadastro do cliente:",
        error,
      );

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

            <p className="cadastro-eyebrow">
              Área do cliente
            </p>

            <h1>Cadastro de cliente</h1>

            <p>
              Crie sua conta para encontrar barbearias, agendar horários
              e acompanhar seus atendimentos.
            </p>
          </header>

          <div className="cadastro-divider" />

          <form
            className="cadastro-form"
            onSubmit={handleSubmit}
            noValidate
          >
            <div className="cadastro-section-heading">
              <h2>Seus dados</h2>
              <p>Informe seus dados para utilizar o BarberHub.</p>
            </div>

            <div className="cadastro-field">
              <label htmlFor="cliente-nome">
                Nome completo *
              </label>
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
              <label htmlFor="cliente-telefone">
                Telefone / WhatsApp
              </label>
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
                Usaremos esse número para facilitar o contato com a
                barbearia.
              </small>
            </div>

            <div className="cadastro-divider" />

            <div className="cadastro-section-heading">
              <h2>Dados da conta</h2>
              <p>Use seu e-mail e senha para acessar sua área.</p>
            </div>

            <div className="cadastro-field">
              <label htmlFor="cliente-email">
                E-mail *
              </label>
              <input
                id="cliente-email"
                name="email"
                type="email"
                value={form.email}
                onChange={alterarCampo}
                placeholder="cliente@email.com"
                autoComplete="email"
                inputMode="email"
                maxLength={254}
                disabled={submitting}
              />
            </div>

            <div className="cadastro-field">
              <label htmlFor="cliente-senha">
                Senha *
              </label>
              <input
                id="cliente-senha"
                name="senha"
                type="password"
                value={form.senha}
                onChange={alterarCampo}
                placeholder="Mínimo de 6 caracteres"
                autoComplete="new-password"
                disabled={submitting}
              />
              <small>Use pelo menos 6 caracteres.</small>
            </div>

            <div className="cadastro-field">
              <label htmlFor="cliente-confirmar">
                Confirmar senha *
              </label>
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
              disabled={submitting}
            >
              {submitting
                ? "Criando conta..."
                : "+ Confirmar cadastro"}
            </button>

            <Link
              to="/login/cliente"
              className="cadastro-secondary-button"
            >
              ← Voltar para o login
            </Link>
          </form>

          <p className="cadastro-footer">
            BarberHub · Desenvolvido por Sigma Orbitek
          </p>
        </div>
      </section>
    </main>
  );
}
