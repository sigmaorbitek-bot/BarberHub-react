import { useRef, useState } from "react";

import { supabase } from "../../../services/supabase";
import { useProfissional } from "../useProfissional";
import "../Profissional.css";
import "./ProfissionalContaPage.css";

const MAX_FOTO_BYTES = 5 * 1024 * 1024;
const FOTO_MIMES = ["image/jpeg", "image/png", "image/webp"];

function extensaoDaFoto(file) {
  const porNome = file.name.split(".").pop()?.toLowerCase();

  if (["jpg", "jpeg", "png", "webp"].includes(porNome)) {
    return porNome === "jpeg" ? "jpg" : porNome;
  }

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export default function ProfissionalContaPage() {
  const { contexto, recarregar } = useProfissional();
  const inputFotoRef = useRef(null);

  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [fotoMessage, setFotoMessage] = useState("");
  const [savingFoto, setSavingFoto] = useState(false);

  const [confirmacaoExclusao, setConfirmacaoExclusao] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function alterarSenha(event) {
    event.preventDefault();
    setMessage("");

    if (senha.length < 8) {
      setMessage("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    if (senha !== confirmar) {
      setMessage("As senhas não são iguais.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: senha });

      if (error) {
        throw error;
      }

      setSenha("");
      setConfirmar("");
      setMessage("Senha alterada com sucesso.");
    } catch (error) {
      setMessage(error?.message || "Não foi possível alterar a senha.");
    } finally {
      setSaving(false);
    }
  }

  async function alterarFoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setFotoMessage("");

    if (!FOTO_MIMES.includes(file.type)) {
      setFotoMessage("Use uma imagem JPG, PNG ou WEBP.");
      return;
    }

    if (file.size > MAX_FOTO_BYTES) {
      setFotoMessage("A imagem deve ter no máximo 5 MB.");
      return;
    }

    if (!contexto?.barbearia_id || !contexto?.profissional_id) {
      setFotoMessage("Não foi possível identificar seu perfil profissional.");
      return;
    }

    setSavingFoto(true);

    const extensao = extensaoDaFoto(file);
    const novoPath = `${contexto.barbearia_id}/${contexto.profissional_id}/${crypto.randomUUID()}.${extensao}`;
    const fotoPathAnterior = contexto.profissional_foto_path || null;

    try {
      const { error: uploadError } = await supabase.storage
        .from("profissionais")
        .upload(novoPath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from("profissionais")
        .getPublicUrl(novoPath);

      const fotoUrl = publicUrlData?.publicUrl;

      if (!fotoUrl) {
        await supabase.storage.from("profissionais").remove([novoPath]);
        throw new Error("Não foi possível gerar a URL pública da foto.");
      }

      const { error: rpcError } = await supabase.rpc(
        "atualizar_foto_profissional",
        {
          p_foto_url: fotoUrl,
          p_foto_path: novoPath,
        },
      );

      if (rpcError) {
        await supabase.storage.from("profissionais").remove([novoPath]);
        throw rpcError;
      }

      if (fotoPathAnterior && fotoPathAnterior !== novoPath) {
        const { error: removeError } = await supabase.storage
          .from("profissionais")
          .remove([fotoPathAnterior]);

        if (removeError) {
          console.warn(
            "[BarberHub] Foto anterior não removida:",
            removeError,
          );
        }
      }

      await recarregar();
      setFotoMessage("Foto atualizada com sucesso.");
    } catch (error) {
      console.error("[BarberHub] Alterar foto profissional:", error);
      setFotoMessage(error?.message || "Não foi possível atualizar sua foto.");
    } finally {
      setSavingFoto(false);
    }
  }

  async function excluirConta() {
    if (confirmacaoExclusao !== "APAGAR CONTA") {
      setDeleteMessage('Digite exatamente "APAGAR CONTA" para confirmar.');
      return;
    }

    const confirmou = window.confirm(
      "Sua conta de acesso será excluída. O histórico profissional da barbearia será preservado. Deseja continuar?",
    );

    if (!confirmou) return;

    setDeleting(true);
    setDeleteMessage("");

    try {
      const { data, error } = await supabase.functions.invoke(
        "excluir-conta-profissional",
        {
          body: {
            confirmacao: "APAGAR CONTA",
          },
        },
      );

      if (error) {
        throw error;
      }

      if (!data?.sucesso) {
        throw new Error(data?.erro || "Não foi possível excluir sua conta.");
      }

      await supabase.auth.signOut({ scope: "local" }).catch(() => null);
      window.location.replace("/");
    } catch (error) {
      console.error("[BarberHub] Excluir conta profissional:", error);
      setDeleteMessage(
        error?.message || "Não foi possível excluir sua conta.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const iniciais = String(contexto?.profissional_nome || "P")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");

  return (
    <section className="professional-page">
      <div className="professional-page-heading">
        <div>
          <span className="professional-eyebrow">CONTA</span>
          <h1>Minha conta</h1>
          <p>Dados de acesso vinculados ao seu perfil profissional.</p>
        </div>
      </div>

      <div className="professional-account-grid">
        <section className="professional-panel-card professional-profile-card">
          <span className="professional-eyebrow">PERFIL</span>

          <div className="professional-profile-photo-area">
            <div className="professional-profile-photo">
              {contexto.profissional_foto_url ? (
                <img
                  src={contexto.profissional_foto_url}
                  alt={`Foto de ${contexto.profissional_nome}`}
                />
              ) : (
                <span>{iniciais}</span>
              )}
            </div>

            <div className="professional-profile-photo-info">
              <h2>{contexto.profissional_nome}</h2>
              <p>JPG, PNG ou WEBP. Máximo de 5 MB.</p>

              <input
                ref={inputFotoRef}
                className="professional-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={savingFoto}
                onChange={alterarFoto}
              />

              <button
                className="professional-secondary-button"
                type="button"
                disabled={savingFoto}
                onClick={() => inputFotoRef.current?.click()}
              >
                {savingFoto ? "Enviando foto..." : "Alterar foto"}
              </button>
            </div>
          </div>

          {fotoMessage ? (
            <div className="professional-message">{fotoMessage}</div>
          ) : null}

          <dl className="professional-account-details">
            <div>
              <dt>Barbearia</dt>
              <dd>{contexto.barbearia_nome}</dd>
            </div>
            <div>
              <dt>E-mail de acesso</dt>
              <dd>{contexto.email_acesso || "Não informado"}</dd>
            </div>
            <div>
              <dt>Comissão</dt>
              <dd>
                {Number(contexto.comissao_percentual || 0).toLocaleString(
                  "pt-BR",
                )}
                %
              </dd>
            </div>
          </dl>
        </section>

        <form className="professional-account-form" onSubmit={alterarSenha}>
          <div>
            <span className="professional-eyebrow">SEGURANÇA</span>
            <h2>Alterar senha</h2>
          </div>

          <label>
            Nova senha
            <input
              type="password"
              autoComplete="new-password"
              value={senha}
              disabled={saving}
              onChange={(event) => setSenha(event.target.value)}
            />
          </label>

          <label>
            Confirmar nova senha
            <input
              type="password"
              autoComplete="new-password"
              value={confirmar}
              disabled={saving}
              onChange={(event) => setConfirmar(event.target.value)}
            />
          </label>

          {message ? (
            <div className="professional-message">{message}</div>
          ) : null}

          <button type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Alterar senha"}
          </button>
        </form>
      </div>

      <div className="professional-info-box">
        Você também pode entrar usando Google em{" "}
        <strong>/login/profissional</strong>, desde que use o mesmo e-mail
        vinculado pela barbearia.
      </div>

      <section className="professional-danger-zone">
        <div className="professional-danger-zone-copy">
          <span className="professional-danger-eyebrow">ZONA DE PERIGO</span>
          <h2>Excluir minha conta</h2>
          <p>
            Seu acesso ao BarberHub será removido. O registro comercial e o
            histórico de atendimentos permanecerão na barbearia, mas sua conta
            autenticada, notificações e permissões de acesso serão removidas.
          </p>
        </div>

        <div className="professional-danger-zone-action">
          <label>
            Digite <strong>APAGAR CONTA</strong> para confirmar
            <input
              type="text"
              autoComplete="off"
              value={confirmacaoExclusao}
              disabled={deleting}
              onChange={(event) => {
                setConfirmacaoExclusao(event.target.value);
                setDeleteMessage("");
              }}
            />
          </label>

          {deleteMessage ? (
            <div className="professional-danger-message">{deleteMessage}</div>
          ) : null}

          <button
            className="professional-delete-account-button"
            type="button"
            disabled={
              deleting || confirmacaoExclusao !== "APAGAR CONTA"
            }
            onClick={excluirConta}
          >
            {deleting ? "Excluindo conta..." : "Excluir minha conta"}
          </button>
        </div>
      </section>
    </section>
  );
}
