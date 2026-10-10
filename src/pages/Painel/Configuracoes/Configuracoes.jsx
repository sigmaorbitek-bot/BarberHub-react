import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useBarbearia } from "../../../hooks/useBarbearia";
import { supabase } from "../../../services/supabase";
import "./Configuracoes.css";

const PREFS = [
  ["novo_agendamento", "Novo agendamento", "Avisar quando um cliente criar um novo agendamento."],
  ["agendamento_cancelado", "Agendamento cancelado", "Avisar quando um cliente cancelar um horário."],
  ["agendamento_alterado", "Agendamento alterado", "Avisar quando houver alteração relevante no agendamento."],
  ["agendamento_confirmado", "Agendamento confirmado", "Avisar quando um agendamento for confirmado."],
  ["lembrete_agendamento", "Lembrete de agendamento", "Receber lembretes relacionados aos próximos atendimentos."],
  ["novo_pedido", "Novo pedido", "Avisar quando um novo pedido for criado."],
  ["pedido_atualizado", "Pedido atualizado", "Avisar sobre mudanças importantes no status dos pedidos."],
  ["estoque_baixo", "Estoque baixo", "Avisar quando um produto atingir o estoque mínimo."],
  ["nova_avaliacao", "Nova avaliação", "Avisar quando um cliente enviar uma avaliação."],
  ["conta_vencendo", "Conta a receber vencendo", "Avisar quando uma conta estiver próxima do vencimento."],
  ["conta_vencida", "Conta a receber vencida", "Avisar quando uma conta ficar vencida."],
  ["pagamento_recebido", "Pagamento recebido", "Avisar quando um pagamento de conta a receber for registrado."],
];

const INITIAL_BUSINESS = {
  nome: "",
  cidade: "",
  endereco: "",
  telefone: "",
  logo_url: "",
};

const INITIAL_PROFILE = {
  nome: "",
  telefone: "",
  email: "",
};

const INITIAL_PREFS = Object.fromEntries(PREFS.map(([key]) => [key, true]));

const LOGO_BUCKET = "barbearias";
const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const LOGO_EXTENSOES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// Só exclui uma logo antiga se ela pertencer comprovadamente a esta unidade.
function obterCaminhoLogoGerenciada(storage, url, barbeariaId, usuarioId) {
  if (!url || !barbeariaId || !usuarioId) return null;

  try {
    const marcador = "__validar_caminho_logo__";
    const urlModelo = storage.getPublicUrl(marcador).data?.publicUrl;
    if (!urlModelo) return null;

    const modelo = new URL(urlModelo);
    const antiga = new URL(url);
    const prefixo = modelo.pathname.slice(0, -marcador.length);

    if (antiga.origin !== modelo.origin || !antiga.pathname.startsWith(prefixo)) {
      return null;
    }

    const caminho = decodeURIComponent(antiga.pathname.slice(prefixo.length));
    const partes = caminho.split("/");
    if (partes.length !== 3) return null;

    const arquivo = partes[2];
    if (!/^logo-[0-9a-f-]+\.(png|jpe?g|webp)$/i.test(arquivo)) {
      return null;
    }

    const caminhoAtual = partes[0] === barbeariaId && partes[1] === usuarioId;
    const caminhoLegado = partes[0] === usuarioId && partes[1] === barbeariaId;
    return caminhoAtual || caminhoLegado ? caminho : null;
  } catch {
    return null;
  }
}

async function obterMensagemErroFuncao(error, alternativa) {
  const resposta = error?.context;
  if (resposta instanceof Response) {
    const detalhes = await resposta.clone().json().catch(() => null);
    return detalhes?.erro || detalhes?.error || detalhes?.message || alternativa;
  }
  return error?.message || alternativa;
}

function Feedback({ type, children }) {
  if (!children) return null;
  return <div className={`config-feedback config-feedback--${type}`}>{children}</div>;
}

export default function Configuracoes() {
  const navigate = useNavigate();
  const { barbeariaId, recarregarBarbearia } = useBarbearia();

  const [loading, setLoading] = useState(true);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteEmailConfirmation, setDeleteEmailConfirmation] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");

  const [business, setBusiness] = useState(INITIAL_BUSINESS);
  const [profile, setProfile] = useState(INITIAL_PROFILE);
  const [prefs, setPrefs] = useState(INITIAL_PREFS);
  const [passwords, setPasswords] = useState({ nova: "", confirmar: "" });

  const [pageError, setPageError] = useState("");
  const [businessMessage, setBusinessMessage] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [prefsMessage, setPrefsMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");

  const logoPreview = useMemo(() => business.logo_url || "/barber.png", [business.logo_url]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!barbeariaId) return;
      setLoading(true);
      setPageError("");

      const { data, error } = await supabase.rpc("obter_configuracoes_painel", {
        p_barbearia_id: barbeariaId,
      });

      if (!active) return;

      if (error) {
        console.error("[BarberHub] Erro ao carregar configurações:", error);
        setPageError("Não foi possível carregar as configurações desta unidade.");
        setLoading(false);
        return;
      }

      const payload = data || {};
      setBusiness({ ...INITIAL_BUSINESS, ...(payload.barbearia || {}) });
      setProfile({ ...INITIAL_PROFILE, ...(payload.perfil || {}), email: payload.email || "" });
      setPrefs({ ...INITIAL_PREFS, ...(payload.preferencias || {}) });
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [barbeariaId]);

  function updateBusiness(field, value) {
    setBusiness((current) => ({ ...current, [field]: value }));
  }

  function updateProfile(field, value) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function saveBusiness(event) {
    event.preventDefault();
    setBusinessMessage("");

    if (uploadingLogo || savingBusiness) {
      setBusinessMessage("Aguarde a operação em andamento antes de salvar.");
      return;
    }

    if (!barbeariaId) {
      setBusinessMessage("Barbearia não identificada. Atualize a página.");
      return;
    }

    if (!business.nome.trim() || !business.cidade.trim()) {
      setBusinessMessage("Informe pelo menos o nome da barbearia e a cidade.");
      return;
    }

    setSavingBusiness(true);
    try {
      const { error } = await supabase.rpc("atualizar_configuracoes_barbearia_painel", {
        p_barbearia_id: barbeariaId,
        p_nome: business.nome.trim(),
        p_cidade: business.cidade.trim(),
        p_endereco: business.endereco?.trim() || null,
        p_telefone: business.telefone?.trim() || null,
        p_logo_url: business.logo_url || null,
      });
      if (error) throw error;

      try {
        await recarregarBarbearia?.();
      } catch (refreshError) {
        console.warn("[BarberHub] Dados salvos, mas o cabeçalho não atualizou:", refreshError);
      }
      setBusinessMessage("Dados da unidade atualizados com sucesso.");
    } catch (error) {
      console.error("[BarberHub] Erro ao salvar unidade:", error);
      setBusinessMessage(error?.message || "Não foi possível atualizar a unidade.");
    } finally {
      setSavingBusiness(false);
    }
  }

  async function uploadLogo(event) {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (!arquivo || uploadingLogo || savingBusiness) return;

    const extensao = LOGO_EXTENSOES[arquivo.type];
    if (!extensao) {
      setBusinessMessage("Use uma imagem PNG, JPG ou WebP.");
      return;
    }

    if (arquivo.size === 0 || arquivo.size > LOGO_MAX_BYTES) {
      setBusinessMessage("A logo precisa ter entre 1 byte e 5 MB.");
      return;
    }

    if (!barbeariaId) {
      setBusinessMessage("Barbearia não identificada. Atualize a página.");
      return;
    }

    setUploadingLogo(true);
    setBusinessMessage("");

    const storage = supabase.storage.from(LOGO_BUCKET);
    let novoCaminho = null;
    let uploadConcluido = false;
    let logoVinculadaAoBanco = false;

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const usuarioId = userData?.user?.id;
      if (!usuarioId) throw new Error("Sua sessão expirou. Entre novamente.");

      const imagemAnterior = business.logo_url;
      const caminhoAntigo = obterCaminhoLogoGerenciada(
        storage,
        imagemAnterior,
        barbeariaId,
        usuarioId,
      );

      // A regra 026c aceita: <barbearia_id>/<usuario_id>/logo-<dígitos>.<ext>.
      const aleatorio = crypto.getRandomValues(new Uint32Array(1))[0];
      novoCaminho = `${barbeariaId}/${usuarioId}/logo-${Date.now()}${aleatorio}.${extensao}`;

      const { error: uploadError } = await storage.upload(novoCaminho, arquivo, {
        cacheControl: "3600",
        contentType: arquivo.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploadConcluido = true;

      const novaUrl = storage.getPublicUrl(novoCaminho).data?.publicUrl;
      if (!novaUrl) throw new Error("Não foi possível obter a URL da nova logo.");

      const { error: saveError } = await supabase.rpc(
        "atualizar_configuracoes_barbearia_painel",
        {
          p_barbearia_id: barbeariaId,
          p_nome: business.nome.trim(),
          p_cidade: business.cidade.trim(),
          p_endereco: business.endereco?.trim() || null,
          p_telefone: business.telefone?.trim() || null,
          p_logo_url: novaUrl,
        },
      );
      if (saveError) throw saveError;

      // Só removemos a imagem anterior após a nova URL ser salva no banco.
      logoVinculadaAoBanco = true;
      setBusiness((atual) => ({ ...atual, logo_url: novaUrl }));

      if (caminhoAntigo && caminhoAntigo !== novoCaminho) {
        try {
          const { error: cleanupError } = await storage.remove([caminhoAntigo]);
          if (cleanupError) {
            console.warn("[BarberHub] Não foi possível limpar a logo antiga:", cleanupError);
          }
        } catch (cleanupError) {
          console.warn("[BarberHub] Falha ao excluir a logo antiga:", cleanupError);
        }
      }

      try {
        await recarregarBarbearia?.();
      } catch (refreshError) {
        console.warn("[BarberHub] Logo salva, mas a atualização do cabeçalho falhou:", refreshError);
      }

      setBusinessMessage("Logo atualizada com sucesso.");
    } catch (error) {
      console.error("[BarberHub] Erro ao atualizar logo:", error);

      // Evita deixar uma imagem órfã caso o banco rejeite a nova URL.
      if (novoCaminho && uploadConcluido && !logoVinculadaAoBanco) {
        try {
          const { error: rollbackError } = await storage.remove([novoCaminho]);
          if (rollbackError) {
            console.warn("[BarberHub] Não foi possível limpar o upload incompleto:", rollbackError);
          }
        } catch (rollbackError) {
          console.warn("[BarberHub] Falha ao limpar o upload incompleto:", rollbackError);
        }
      }

      setBusinessMessage(error?.message || "Não foi possível atualizar a logo.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setProfileMessage("");

    if (!profile.nome.trim()) {
      setProfileMessage("Informe o nome do administrador.");
      return;
    }

    setSavingProfile(true);
    const { error } = await supabase.rpc("atualizar_perfil_dono_painel", {
      p_nome: profile.nome,
      p_telefone: profile.telefone || null,
    });
    setSavingProfile(false);

    if (error) {
      console.error("[BarberHub] Erro ao salvar perfil:", error);
      setProfileMessage(error.message || "Não foi possível atualizar o perfil.");
      return;
    }

    setProfileMessage("Dados do administrador atualizados com sucesso.");
  }

  async function savePrefs() {
    setPrefsMessage("");
    setSavingPrefs(true);

    const args = { p_barbearia_id: barbeariaId };
    for (const [key] of PREFS) args[`p_${key}`] = Boolean(prefs[key]);

    const { error } = await supabase.rpc("salvar_preferencias_notificacoes_painel", args);
    setSavingPrefs(false);

    if (error) {
      console.error("[BarberHub] Erro ao salvar preferências:", error);
      setPrefsMessage(error.message || "Não foi possível salvar as preferências.");
      return;
    }

    setPrefsMessage("Preferências de notificações salvas.");
  }

  async function updatePassword(event) {
    event.preventDefault();
    setPasswordMessage("");

    if (passwords.nova.length < 8) {
      setPasswordMessage("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (passwords.nova !== passwords.confirmar) {
      setPasswordMessage("As senhas informadas não coincidem.");
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: passwords.nova });
    setSavingPassword(false);

    if (error) {
      console.error("[BarberHub] Erro ao alterar senha:", error);
      setPasswordMessage(error.message || "Não foi possível alterar a senha.");
      return;
    }

    setPasswords({ nova: "", confirmar: "" });
    setPasswordMessage("Senha alterada com sucesso.");
  }

  async function deleteAccount() {
    setDeleteMessage("");

    if (deleteConfirmation.trim() !== "APAGAR CONTA") {
      setDeleteMessage('Digite exatamente "APAGAR CONTA" para confirmar.');
      return;
    }

    if (deleteEmailConfirmation.trim().toLowerCase() !== String(profile.email || "").toLowerCase()) {
      setDeleteMessage("Digite também o e-mail exato da sua conta.");
      return;
    }

    const confirmed = window.confirm(
      "Esta ação é definitiva.\n\n" +
        "Sua conta de administrador, todas as barbearias que você possui e os dados dessas unidades serão apagados.\n\n" +
        "Clientes e contas pessoais de terceiros não serão apagados, mas os vínculos e dados dessas barbearias serão removidos.\n\n" +
        "Deseja continuar?",
    );

    if (!confirmed) {
      return;
    }

    setDeletingAccount(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "excluir-conta",
        {
          body: {
            confirmacao: "APAGAR CONTA",
            emailConfirmacao: deleteEmailConfirmation.trim(),
          },
        },
      );

      if (error) {
        throw new Error(
          await obterMensagemErroFuncao(error, "Não foi possível excluir a conta."),
        );
      }

      if (data?.pendente) {
        setDeleteMessage(
          data.error || "Os dados da barbearia foram removidos, mas a finalização exige suporte técnico.",
        );
        return;
      }

      if (!data?.ok) {
        throw new Error(
          data?.error ||
            "Não foi possível excluir a conta.",
        );
      }

      try {
        await supabase.auth.signOut({
          scope: "local",
        });
      } catch (signOutError) {
        console.warn(
          "[BarberHub] Sessão local já estava encerrada:",
          signOutError,
        );
      }

      navigate("/login/barbearia", {
        replace: true,
      });

      window.location.reload();
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao excluir conta:",
        error,
      );

      setDeleteMessage(
        error?.message ||
          "Não foi possível excluir a conta. Tente novamente.",
      );
    } finally {
      setDeletingAccount(false);
    }
  }

  if (loading) {
    return <div className="config-state">Carregando configurações...</div>;
  }

  if (pageError) {
    return (
      <div className="config-state config-state--error">
        <strong>Não foi possível abrir Configurações.</strong>
        <span>{pageError}</span>
      </div>
    );
  }

  return (
    <section className="config-page">
      <header className="config-page-header">
        <div>
          <span className="config-eyebrow">SISTEMA</span>
          <h1>Configurações</h1>
          <p>Gerencie os dados da unidade, notificações, conta administrativa e segurança.</p>
        </div>
      </header>

      <div className="config-grid">
        <form className="config-card config-card--wide" onSubmit={saveBusiness}>
          <div className="config-card-header">
            <div>
              <span className="config-card-icon">💈</span>
              <div>
                <h2>Dados da unidade</h2>
                <p>Informações usadas no painel, comprovantes e contato com clientes.</p>
              </div>
            </div>
          </div>

          <div className="config-business-layout">
            <div className="config-logo-box">
              <img src={logoPreview} alt={`Logo de ${business.nome || "Barbearia"}`} />
              <label className="config-upload-button">
                {uploadingLogo ? "Enviando..." : "Trocar logo"}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} disabled={uploadingLogo || savingBusiness} />
              </label>
              <small>PNG, JPG ou WebP. Máximo de 5 MB.</small>
            </div>

            <div className="config-fields">
              <label>
                <span>Nome da barbearia *</span>
                <input value={business.nome} onChange={(e) => updateBusiness("nome", e.target.value)} maxLength={120} required />
              </label>
              <label>
                <span>Cidade *</span>
                <input value={business.cidade} onChange={(e) => updateBusiness("cidade", e.target.value)} maxLength={120} required />
              </label>
              <label className="config-field--full">
                <span>Endereço</span>
                <input value={business.endereco || ""} onChange={(e) => updateBusiness("endereco", e.target.value)} maxLength={240} placeholder="Rua, número, bairro" />
              </label>
              <label>
                <span>Telefone / WhatsApp</span>
                <input value={business.telefone || ""} onChange={(e) => updateBusiness("telefone", e.target.value)} maxLength={30} placeholder="(81) 99999-9999" />
              </label>
            </div>
          </div>

          <Feedback type={businessMessage.includes("sucesso") ? "success" : "info"}>{businessMessage}</Feedback>

          <div className="config-actions">
            <button type="button" className="config-button config-button--secondary" onClick={() => navigate(`/painel/${barbeariaId}/horarios`)}>
              🕐 Gerenciar horários
            </button>
            <button type="submit" className="config-button config-button--primary" disabled={savingBusiness || uploadingLogo}>
              {savingBusiness ? "Salvando..." : "Salvar dados da unidade"}
            </button>
          </div>
        </form>

        <div className="config-card config-card--wide">
          <div className="config-card-header">
            <div>
              <span className="config-card-icon">🔔</span>
              <div>
                <h2>Preferências de notificações</h2>
                <p>Escolha quais eventos devem gerar avisos para o administrador.</p>
              </div>
            </div>
          </div>

          <div className="config-toggle-list">
            {PREFS.map(([key, title, description]) => (
              <label className="config-toggle-row" key={key}>
                <div>
                  <strong>{title}</strong>
                  <span>{description}</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(prefs[key])}
                  onChange={(e) => setPrefs((current) => ({ ...current, [key]: e.target.checked }))}
                  aria-label={title}
                />
              </label>
            ))}
          </div>

          <Feedback type={prefsMessage.includes("salvas") ? "success" : "info"}>{prefsMessage}</Feedback>

          <div className="config-actions config-actions--end">
            <button type="button" className="config-button config-button--primary" onClick={savePrefs} disabled={savingPrefs}>
              {savingPrefs ? "Salvando..." : "Salvar preferências"}
            </button>
          </div>
        </div>

        <form className="config-card" onSubmit={saveProfile}>
          <div className="config-card-header">
            <div>
              <span className="config-card-icon">👤</span>
              <div>
                <h2>Administrador</h2>
                <p>Dados da conta responsável pela unidade.</p>
              </div>
            </div>
          </div>

          <div className="config-fields config-fields--single">
            <label>
              <span>Nome</span>
              <input value={profile.nome} onChange={(e) => updateProfile("nome", e.target.value)} maxLength={120} required />
            </label>
            <label>
              <span>Telefone</span>
              <input value={profile.telefone || ""} onChange={(e) => updateProfile("telefone", e.target.value)} maxLength={30} />
            </label>
            <label>
              <span>E-mail</span>
              <input value={profile.email || ""} readOnly disabled />
            </label>
          </div>

          <Feedback type={profileMessage.includes("sucesso") ? "success" : "info"}>{profileMessage}</Feedback>

          <div className="config-actions config-actions--end">
            <button type="submit" className="config-button config-button--primary" disabled={savingProfile}>
              {savingProfile ? "Salvando..." : "Salvar administrador"}
            </button>
          </div>
        </form>

        <form className="config-card" onSubmit={updatePassword}>
          <div className="config-card-header">
            <div>
              <span className="config-card-icon">🔐</span>
              <div>
                <h2>Segurança</h2>
                <p>Altere a senha da conta administrativa.</p>
              </div>
            </div>
          </div>

          <div className="config-fields config-fields--single">
            <label>
              <span>Nova senha</span>
              <input type="password" value={passwords.nova} onChange={(e) => setPasswords((current) => ({ ...current, nova: e.target.value }))} autoComplete="new-password" minLength={8} />
            </label>
            <label>
              <span>Confirmar nova senha</span>
              <input type="password" value={passwords.confirmar} onChange={(e) => setPasswords((current) => ({ ...current, confirmar: e.target.value }))} autoComplete="new-password" minLength={8} />
            </label>
          </div>

          <Feedback type={passwordMessage.includes("sucesso") ? "success" : "info"}>{passwordMessage}</Feedback>

          <div className="config-actions config-actions--end">
            <button type="submit" className="config-button config-button--primary" disabled={savingPassword || !passwords.nova || !passwords.confirmar}>
              {savingPassword ? "Alterando..." : "Alterar senha"}
            </button>
          </div>
        </form>

        <div className="config-card config-card--wide config-danger-card">
          <div className="config-card-header">
            <div>
              <span className="config-card-icon config-card-icon--danger">⚠️</span>
              <div>
                <h2>Excluir conta</h2>
                <p>
                  Apaga definitivamente sua conta de administrador e todas as
                  barbearias pertencentes a ela, incluindo agenda, serviços,
                  produtos, pedidos, financeiro, avaliações e demais dados das
                  unidades.
                </p>
              </div>
            </div>
          </div>

          <div className="config-danger-content">
            <div>
              <strong>Esta ação não pode ser desfeita.</strong>
              <span>
                Contas pessoais de clientes e profissionais não são apagadas
                silenciosamente; apenas os vínculos e dados pertencentes às suas
                barbearias são removidos.
              </span>
            </div>

            <label className="config-danger-confirmation">
              <span>
                Para confirmar, digite <strong>APAGAR CONTA</strong>
              </span>

              <input
                type="text"
                value={deleteConfirmation}
                onChange={(event) =>
                  setDeleteConfirmation(event.target.value)
                }
                placeholder="APAGAR CONTA"
                autoComplete="off"
                disabled={deletingAccount}
              />
            </label>

            <label className="config-danger-confirmation">
              <span>Confirme o e-mail da conta: <strong>{profile.email || ""}</strong></span>
              <input
                type="email"
                value={deleteEmailConfirmation}
                onChange={(event) => setDeleteEmailConfirmation(event.target.value)}
                placeholder="Digite seu e-mail para confirmar"
                autoComplete="off"
                disabled={deletingAccount}
              />
            </label>
          </div>

          <Feedback type="info">{deleteMessage}</Feedback>

          <div className="config-actions config-actions--end">
            <button
              type="button"
              className="config-button config-button--danger"
              disabled={
                deletingAccount ||
                deleteConfirmation.trim() !== "APAGAR CONTA" ||
                deleteEmailConfirmation.trim().toLowerCase() !== String(profile.email || "").toLowerCase()
              }
              onClick={deleteAccount}
            >
              {deletingAccount
                ? "Excluindo conta..."
                : "Excluir minha conta e todos os dados"}
            </button>
          </div>
        </div>

        <div className="config-card config-card--wide config-system-card">
          <div>
            <span className="config-card-icon">⚙️</span>
            <div>
              <h2>BarberHub</h2>
              <p>Gestão profissional para barbearias.</p>
            </div>
          </div>
          <div className="config-system-meta">
            <span>Ambiente seguro com autenticação e dados separados por unidade.</span>
            <strong>Desenvolvido por AASORB — Soluções Digitais</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
