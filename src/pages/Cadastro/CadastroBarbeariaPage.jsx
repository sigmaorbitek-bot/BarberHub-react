import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../services/supabase";
import "./Cadastro.css";

const PENDING_KEY = "barberhub_cadastro_barbearia_pendente";
const MAX_LOGO_SIZE = 5 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];

const DAYS = [
  ["dom", "Domingo", 0],
  ["seg", "Segunda", 1],
  ["ter", "Terça", 2],
  ["qua", "Quarta", 3],
  ["qui", "Quinta", 4],
  ["sex", "Sexta", 5],
  ["sab", "Sábado", 6],
];

const EMPTY_FORM = {
  nome: "",
  telefone: "",
  cidade: "",
  endereco: "",
  horarioAbertura: "",
  horarioFechamento: "",
  dias: [],
  email: "",
  senha: "",
  confirmarSenha: "",
};

function normalizarTelefone(valor) {
  return String(valor || "")
    .replace(/\D/g, "")
    .trim();
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

  return error?.message || "Não foi possível realizar o cadastro.";
}

function lerPendente() {
  try {
    const salvo = localStorage.getItem(PENDING_KEY);
    return salvo ? JSON.parse(salvo) : null;
  } catch {
    return null;
  }
}

function salvarPendente(dados) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(dados));
}

function limparPendente() {
  localStorage.removeItem(PENDING_KEY);
}

async function criarBarbearia(dados, requestId) {
  const diasNumericos = dados.dias
    .map((sigla) => DAYS.find(([d]) => d === sigla)?.[2])
    .filter((dia) => Number.isInteger(dia));

  const { data, error } = await supabase.rpc("criar_barbearia_com_horarios", {
    p_nome: dados.nome.trim(),
    p_cidade: dados.cidade.trim(),
    p_endereco: dados.endereco.trim() || null,
    p_telefone: normalizarTelefone(dados.telefone) || null,
    p_horario_abertura: dados.horarioAbertura || null,
    p_horario_fechamento: dados.horarioFechamento || null,
    p_dias: diasNumericos,
    p_chave_criacao: requestId,
  });

  if (error) {
    throw error;
  }

  return data;
}

async function enviarLogo({ usuarioId, barbeariaId, arquivo }) {
  if (!arquivo) {
    return null;
  }

  const extensao = arquivo.name.split(".").pop()?.toLowerCase() || "png";

  const caminho = `${usuarioId}/${barbeariaId}/logo-${crypto.randomUUID()}.${extensao}`;

  const { error: uploadError } = await supabase.storage
    .from("barbearias")
    .upload(caminho, arquivo, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from("barbearias").getPublicUrl(caminho);

  const logoUrl = data?.publicUrl || null;

  if (!logoUrl) {
    throw new Error("Não foi possível obter a URL pública da logo.");
  }

  const { error: updateError } = await supabase
    .from("barbearias")
    .update({
      logo_url: logoUrl,
    })
    .eq("id", barbeariaId)
    .eq("dono_id", usuarioId);

  if (updateError) {
    throw updateError;
  }

  return logoUrl;
}

export default function CadastroBarbeariaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { user, profile, authenticated, loading: authLoading } = useAuth();

  const modoNovaBarbearia = searchParams.get("modo") === "nova-barbearia";

  const pending = useMemo(() => lerPendente(), []);

  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    ...(pending?.dados || {}),
  }));

  const requestIdRef = useRef(pending?.requestId || crypto.randomUUID());

  const [logo, setLogo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(
    pending
      ? "Sua conta foi confirmada. Confira os dados, selecione a logo novamente se desejar e conclua o cadastro."
      : "",
  );
  const [messageType, setMessageType] = useState(pending ? "info" : "error");

  const contaExistente = authenticated && profile?.tipo === "dono";

  const aguardandoConfirmacao = Boolean(pending) && !contaExistente;

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (pending && authenticated && profile?.tipo !== "dono") {
      setMessage("A conta autenticada não é uma conta de barbearia.");
      setMessageType("error");
    }
  }, [authLoading, authenticated, profile?.tipo, pending]);

  function mostrarMensagem(texto, tipo = "error") {
    setMessage(texto);
    setMessageType(tipo);
  }

  function alterarCampo(event) {
    const { name, value } = event.target;

    setForm((atual) => ({
      ...atual,
      [name]: value,
    }));
  }

  function alternarDia(sigla) {
    setForm((atual) => ({
      ...atual,
      dias: atual.dias.includes(sigla)
        ? atual.dias.filter((dia) => dia !== sigla)
        : [...atual.dias, sigla],
    }));
  }

  function validar(dados, contaJaAutenticada) {
    if (!dados.nome.trim()) {
      return "Digite o nome da barbearia.";
    }

    if (!dados.cidade.trim()) {
      return "Digite a cidade.";
    }

    if (!contaJaAutenticada) {
      if (!dados.email.trim()) {
        return "Digite o e-mail.";
      }

      if (!dados.senha) {
        return "Digite uma senha.";
      }

      if (dados.senha.length < 6) {
        return "A senha precisa ter pelo menos 6 caracteres.";
      }

      if (dados.senha !== dados.confirmarSenha) {
        return "As senhas não são iguais.";
      }
    }

    if (
      dados.dias.length > 0 &&
      (!dados.horarioAbertura || !dados.horarioFechamento)
    ) {
      return "Informe os horários de abertura e fechamento.";
    }

    if (
      (dados.horarioAbertura || dados.horarioFechamento) &&
      dados.dias.length === 0
    ) {
      return "Selecione pelo menos um dia de funcionamento.";
    }

    if (
      dados.horarioAbertura &&
      dados.horarioFechamento &&
      dados.horarioAbertura >= dados.horarioFechamento
    ) {
      return "O horário de fechamento precisa ser depois da abertura.";
    }

    if (logo) {
      if (!ALLOWED_LOGO_TYPES.includes(logo.type)) {
        return "A logo precisa ser JPG, PNG ou WEBP.";
      }

      if (logo.size > MAX_LOGO_SIZE) {
        return "A logo pode ter no máximo 5 MB.";
      }
    }

    return null;
  }

  async function finalizarCadastro(usuarioId) {
    const barbearia = await criarBarbearia(form, requestIdRef.current);

    let logoFalhou = false;

    if (logo) {
      try {
        await enviarLogo({
          usuarioId,
          barbeariaId: barbearia.id,
          arquivo: logo,
        });
      } catch (error) {
        logoFalhou = true;

        console.warn("[BarberHub] Barbearia criada, mas a logo falhou:", error);
      }
    }

    limparPendente();

    mostrarMensagem(
      logoFalhou
        ? "Barbearia criada. A logo não pôde ser enviada, mas você poderá adicioná-la pelo painel."
        : "Barbearia criada com sucesso!",
      "success",
    );

    navigate(`/painel/${barbearia.id}`, {
      replace: true,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (aguardandoConfirmacao) {
      mostrarMensagem("Confirme seu e-mail antes de concluir o cadastro.");
      return;
    }

    const erroValidacao = validar(form, contaExistente);

    if (erroValidacao) {
      mostrarMensagem(erroValidacao);
      return;
    }

    setSubmitting(true);

    try {
      if (contaExistente) {
        await finalizarCadastro(user.id);
        return;
      }

      mostrarMensagem("Criando sua conta...", "info");

      const email = form.email.trim().toLowerCase();

      const dadosPendentes = {
        requestId: requestIdRef.current,
        dados: {
          nome: form.nome.trim(),
          telefone: normalizarTelefone(form.telefone),
          cidade: form.cidade.trim(),
          endereco: form.endereco.trim(),
          horarioAbertura: form.horarioAbertura,
          horarioFechamento: form.horarioFechamento,
          dias: form.dias,
        },
      };

      const { data, error } = await supabase.auth.signUp({
        email,
        password: form.senha,
        options: {
          emailRedirectTo: `${window.location.origin}/cadastro/barbearia`,
          data: {
            nome: form.nome.trim(),
            telefone: normalizarTelefone(form.telefone) || null,
            tipo: "dono",
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
        salvarPendente(dadosPendentes);

        setMessage(
          "Conta criada! Confirme seu e-mail. Depois volte para esta página, selecione a logo novamente e conclua o cadastro.",
        );
        setMessageType("success");
        return;
      }

      await finalizarCadastro(data.user.id);
    } catch (error) {
      console.error("[BarberHub] Erro no cadastro da barbearia:", error);

      mostrarMensagem(traduzirErro(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="cadastro-page">
      <section className="cadastro-container">
        <div className="cadastro-card cadastro-card--wide">
          <header className="cadastro-header">
            <Link to="/" className="cadastro-logo-link">
              <img
                src="/barber.png"
                alt="Logo do BarberHub"
                className="cadastro-logo"
              />
            </Link>

            <p className="cadastro-eyebrow">
              {modoNovaBarbearia ? "Nova unidade" : "Área da barbearia"}
            </p>

            <h1>
              {pending
                ? "Concluir cadastro"
                : modoNovaBarbearia
                  ? "Nova barbearia"
                  : "Cadastre sua barbearia"}
            </h1>

            <p>
              {pending
                ? "Sua conta já foi criada. Revise os dados e conclua a criação da barbearia."
                : "Cadastre sua barbearia para gerenciar clientes, profissionais, serviços, agendamentos e produtos."}
            </p>
          </header>

          <div className="cadastro-divider" />

          <form className="cadastro-form" onSubmit={handleSubmit} noValidate>
            <div className="cadastro-section-heading">
              <h2>Dados da barbearia</h2>
              <p>Essas informações serão exibidas para os clientes.</p>
            </div>

            <div className="cadastro-field">
              <label htmlFor="barbearia-logo">Logo da barbearia</label>

              <input
                id="barbearia-logo"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                disabled={submitting}
                onChange={(event) => setLogo(event.target.files?.[0] || null)}
              />

              <small>
                JPG, PNG ou WEBP. Tamanho máximo de 5 MB.
                {pending
                  ? " Por segurança, selecione o arquivo novamente após confirmar o e-mail."
                  : ""}
              </small>
            </div>

            <div className="cadastro-grid">
              <div className="cadastro-field">
                <label htmlFor="barbearia-nome">Nome da barbearia *</label>
                <input
                  id="barbearia-nome"
                  name="nome"
                  type="text"
                  value={form.nome}
                  onChange={alterarCampo}
                  placeholder="Ex.: Barbearia Imperial"
                  autoComplete="organization"
                  maxLength={150}
                  disabled={submitting}
                />
              </div>

              <div className="cadastro-field">
                <label htmlFor="barbearia-telefone">Telefone / WhatsApp</label>
                <input
                  id="barbearia-telefone"
                  name="telefone"
                  type="tel"
                  value={form.telefone}
                  onChange={alterarCampo}
                  placeholder="(87) 99999-9999"
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={20}
                  disabled={submitting}
                />
              </div>

              <div className="cadastro-field">
                <label htmlFor="barbearia-cidade">Cidade *</label>
                <input
                  id="barbearia-cidade"
                  name="cidade"
                  type="text"
                  value={form.cidade}
                  onChange={alterarCampo}
                  placeholder="Ex.: Caruaru"
                  autoComplete="address-level2"
                  maxLength={100}
                  disabled={submitting}
                />
              </div>

              <div className="cadastro-field">
                <label htmlFor="barbearia-endereco">Endereço</label>
                <input
                  id="barbearia-endereco"
                  name="endereco"
                  type="text"
                  value={form.endereco}
                  onChange={alterarCampo}
                  placeholder="Rua, número, bairro..."
                  autoComplete="street-address"
                  maxLength={250}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="cadastro-divider" />

            <div className="cadastro-section-heading">
              <h2>Horário de funcionamento</h2>
              <p>
                Informe o horário padrão. Depois você poderá personalizar cada
                dia no painel.
              </p>
            </div>

            <div className="cadastro-grid cadastro-grid--two">
              <div className="cadastro-field">
                <label htmlFor="abertura">Abertura</label>
                <input
                  id="abertura"
                  name="horarioAbertura"
                  type="time"
                  value={form.horarioAbertura}
                  onChange={alterarCampo}
                  disabled={submitting}
                />
              </div>

              <div className="cadastro-field">
                <label htmlFor="fechamento">Fechamento</label>
                <input
                  id="fechamento"
                  name="horarioFechamento"
                  type="time"
                  value={form.horarioFechamento}
                  onChange={alterarCampo}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="cadastro-field">
              <label>Dias de funcionamento</label>

              <div className="cadastro-days">
                {DAYS.map(([sigla, label]) => {
                  const selecionado = form.dias.includes(sigla);

                  return (
                    <button
                      key={sigla}
                      type="button"
                      className={
                        selecionado
                          ? "cadastro-day cadastro-day--active"
                          : "cadastro-day"
                      }
                      aria-pressed={selecionado}
                      disabled={submitting}
                      onClick={() => alternarDia(sigla)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {!contaExistente && !pending ? (
              <>
                <div className="cadastro-divider" />

                <div className="cadastro-section-heading">
                  <h2>Dados da conta</h2>
                  <p>Esses dados serão usados para acessar o painel.</p>
                </div>

                <div className="cadastro-field">
                  <label htmlFor="barbearia-email">E-mail *</label>
                  <input
                    id="barbearia-email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={alterarCampo}
                    placeholder="barbearia@email.com"
                    autoComplete="email"
                    inputMode="email"
                    maxLength={254}
                    disabled={submitting}
                  />
                </div>

                <div className="cadastro-grid cadastro-grid--two">
                  <div className="cadastro-field">
                    <label htmlFor="barbearia-senha">Senha *</label>
                    <input
                      id="barbearia-senha"
                      name="senha"
                      type="password"
                      value={form.senha}
                      onChange={alterarCampo}
                      placeholder="Mínimo de 6 caracteres"
                      autoComplete="new-password"
                      disabled={submitting}
                    />
                  </div>

                  <div className="cadastro-field">
                    <label htmlFor="barbearia-confirmar">
                      Confirmar senha *
                    </label>
                    <input
                      id="barbearia-confirmar"
                      name="confirmarSenha"
                      type="password"
                      value={form.confirmarSenha}
                      onChange={alterarCampo}
                      placeholder="Digite a senha novamente"
                      autoComplete="new-password"
                      disabled={submitting}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="cadastro-account-connected">
                <strong>🔐 Conta já conectada</strong>
                <p>
                  Esta barbearia será vinculada automaticamente à sua conta
                  atual.
                </p>
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
              disabled={submitting || aguardandoConfirmacao}
            >
              {submitting
                ? "Processando..."
                : pending
                  ? "Concluir cadastro"
                  : "+ Cadastrar barbearia"}
            </button>

            <Link
              to={contaExistente ? "/painel" : "/login/barbearia"}
              className="cadastro-secondary-button"
            >
              ← Voltar
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
