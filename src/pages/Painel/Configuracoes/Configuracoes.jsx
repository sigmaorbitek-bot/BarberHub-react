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

    if (!business.nome.trim() || !business.cidade.trim()) {
      setBusinessMessage("Informe pelo menos o nome da barbearia e a cidade.");
      return;
    }

    setSavingBusiness(true);
    const { error } = await supabase.rpc("atualizar_configuracoes_barbearia_painel", {
      p_barbearia_id: barbeariaId,
      p_nome: business.nome,
      p_cidade: business.cidade,
      p_endereco: business.endereco || null,
      p_telefone: business.telefone || null,
      p_logo_url: business.logo_url || null,
    });
    setSavingBusiness(false);

    if (error) {
      console.error("[BarberHub] Erro ao salvar unidade:", error);
      setBusinessMessage(error.message || "Não foi possível salvar os dados da unidade.");
      return;
    }

    await recarregarBarbearia?.();
    setBusinessMessage("Dados da unidade atualizados com sucesso.");
  }

  async function uploadLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setBusinessMessage("Selecione um arquivo de imagem válido.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setBusinessMessage("A logo deve ter no máximo 5 MB.");
      return;
    }

    setUploadingLogo(true);
    setBusinessMessage("");

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const userId = userData.user?.id;
      if (!userId) throw new Error("Usuário não autenticado.");

      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${barbeariaId}/${userId}/logo-${Date.now()}.${ext || "png"}`;

      const { error: uploadError } = await supabase.storage
        .from("barbearias")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from("barbearias").getPublicUrl(path);
      const publicUrl = publicData?.publicUrl;
      if (!publicUrl) throw new Error("Não foi possível gerar a URL pública da logo.");

      const { error: saveError } = await supabase.rpc("atualizar_configuracoes_barbearia_painel", {
        p_barbearia_id: barbeariaId,
        p_nome: business.nome,
        p_cidade: business.cidade,
        p_endereco: business.endereco || null,
        p_telefone: business.telefone || null,
        p_logo_url: publicUrl,
      });
      if (saveError) throw saveError;

      setBusiness((current) => ({ ...current, logo_url: publicUrl }));
      await recarregarBarbearia?.();
      setBusinessMessage("Logo atualizada com sucesso.");
    } catch (error) {
      console.error("[BarberHub] Erro ao enviar logo:", error);
      setBusinessMessage(error.message || "Não foi possível atualizar a logo.");
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
          },
        },
      );

      if (error) {
        throw error;
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
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} disabled={uploadingLogo} />
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
            <button type="submit" className="config-button config-button--primary" disabled={savingBusiness}>
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
          </div>

          <Feedback type="info">{deleteMessage}</Feedback>

          <div className="config-actions config-actions--end">
            <button
              type="button"
              className="config-button config-button--danger"
              disabled={
                deletingAccount ||
                deleteConfirmation.trim() !== "APAGAR CONTA"
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
            <strong>Desenvolvido por Sigma Orbitek</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
