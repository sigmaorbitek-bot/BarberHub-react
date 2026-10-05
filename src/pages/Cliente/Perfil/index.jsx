import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../services/supabase";

import "./ClientePerfilPage.css";

const TIPOS_FOTO = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function formatarData(data) {
  if (!data) return "Não informado";

  const valor = new Date(data);

  if (Number.isNaN(valor.getTime())) {
    return "Não informado";
  }

  return valor.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function iniciais(nome) {
  const partes = String(nome || "Cliente")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!partes.length) return "C";

  if (partes.length === 1) {
    return partes[0].slice(0, 2).toUpperCase();
  }

  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

function gerarIdArquivo() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ClientePerfilPage() {
  const { user, profile } = useAuth();

  const inputFotoRef = useRef(null);

  const [dados, setDados] = useState(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [fotoUrl, setFotoUrl] = useState("");
  const [salvandoFoto, setSalvandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState("");

  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState("");
  const [sucessoSenha, setSucessoSenha] = useState("");

  const [modalExcluir, setModalExcluir] = useState(false);
  const [confirmacaoExclusao, setConfirmacaoExclusao] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState("");

  const montarFotoUrl = useCallback((fotoPath) => {
    if (!fotoPath) return "";

    return supabase.storage.from("clientes").getPublicUrl(fotoPath).data
      .publicUrl;
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");

    try {
      const { data, error } = await supabase.rpc("obter_perfil_cliente");

      if (error) {
        throw error;
      }

      const perfilCliente = Array.isArray(data) ? data[0] : data;

      setDados(perfilCliente || null);
      setNome(
        perfilCliente?.nome || profile?.nome || user?.user_metadata?.nome || "",
      );
      setTelefone(
        perfilCliente?.telefone ||
          profile?.telefone ||
          user?.user_metadata?.telefone ||
          "",
      );
      setFotoUrl(montarFotoUrl(perfilCliente?.foto_path));
    } catch (error) {
      console.error("[BarberHub] Perfil do cliente:", error);

      setErro(error?.message || "Não foi possível carregar seu perfil agora.");
    } finally {
      setLoading(false);
    }
  }, [
    montarFotoUrl,
    profile?.nome,
    profile?.telefone,
    user?.user_metadata?.nome,
    user?.user_metadata?.telefone,
  ]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!modalExcluir) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape" && !excluindo) {
        setModalExcluir(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalExcluir, excluindo]);

  const email = user?.email || dados?.email || "Não informado";

  const provedor = useMemo(() => {
    const provider =
      user?.app_metadata?.provider ||
      user?.identities?.[0]?.provider ||
      "email";

    if (provider === "google") return "Google";
    if (provider === "email") return "E-mail e senha";

    return provider;
  }, [user]);

  async function salvarDados(event) {
    event.preventDefault();

    if (salvando) return;

    const nomeLimpo = nome.trim();
    const telefoneLimpo = telefone.trim();

    if (!nomeLimpo) {
      setErro("Informe seu nome.");
      return;
    }

    if (nomeLimpo.length > 120) {
      setErro("O nome deve ter no máximo 120 caracteres.");
      return;
    }

    if (telefoneLimpo.length > 30) {
      setErro("O telefone deve ter no máximo 30 caracteres.");
      return;
    }

    setSalvando(true);
    setErro("");
    setSucesso("");

    try {
      const { error } = await supabase.rpc("atualizar_perfil_cliente", {
        p_nome: nomeLimpo,
        p_telefone: telefoneLimpo || null,
      });

      if (error) throw error;

      const { error: authError } = await supabase.auth.updateUser({
        data: {
          nome: nomeLimpo,
          telefone: telefoneLimpo || null,
        },
      });

      if (authError) {
        console.warn("[BarberHub] Metadata do Auth não atualizada:", authError);
      }

      setDados((atual) => ({
        ...(atual || {}),
        nome: nomeLimpo,
        telefone: telefoneLimpo || null,
      }));

      setSucesso("Dados atualizados com sucesso. ✅");

      window.dispatchEvent(
        new CustomEvent("barberhub:perfil-atualizado", {
          detail: {
            nome: nomeLimpo,
            telefone: telefoneLimpo || null,
            fotoUrl,
          },
        }),
      );
    } catch (error) {
      console.error("[BarberHub] Atualizar perfil:", error);

      setErro(error?.message || "Não foi possível atualizar seus dados.");
    } finally {
      setSalvando(false);
    }
  }

  async function selecionarFoto(event) {
    const arquivo = event.target.files?.[0];

    event.target.value = "";

    if (!arquivo || !user?.id || salvandoFoto) {
      return;
    }

    const extensao = TIPOS_FOTO[arquivo.type];

    if (!extensao) {
      setErroFoto("Escolha uma imagem JPG, PNG ou WEBP.");
      return;
    }

    if (arquivo.size > 5 * 1024 * 1024) {
      setErroFoto("A foto pode ter no máximo 5 MB.");
      return;
    }

    setSalvandoFoto(true);
    setErroFoto("");

    const caminhoAnterior = dados?.foto_path || null;
    const novoCaminho = `${user.id}/avatar-${gerarIdArquivo()}.${extensao}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("clientes")
        .upload(novoCaminho, arquivo, {
          cacheControl: "3600",
          upsert: false,
          contentType: arquivo.type,
        });

      if (uploadError) throw uploadError;

      const { error: rpcError } = await supabase.rpc("atualizar_foto_cliente", {
        p_foto_path: novoCaminho,
      });

      if (rpcError) {
        await supabase.storage.from("clientes").remove([novoCaminho]);

        throw rpcError;
      }

      if (caminhoAnterior && caminhoAnterior !== novoCaminho) {
        const { error: removerAnteriorError } = await supabase.storage
          .from("clientes")
          .remove([caminhoAnterior]);

        if (removerAnteriorError) {
          console.warn(
            "[BarberHub] Foto antiga não removida:",
            removerAnteriorError,
          );
        }
      }

      const novaUrl = montarFotoUrl(novoCaminho);

      setDados((atual) => ({
        ...(atual || {}),
        foto_path: novoCaminho,
      }));
      setFotoUrl(novaUrl);

      window.dispatchEvent(
        new CustomEvent("barberhub:perfil-atualizado", {
          detail: {
            nome,
            telefone,
            fotoUrl: novaUrl,
          },
        }),
      );
    } catch (error) {
      console.error("[BarberHub] Foto do cliente:", error);

      setErroFoto(error?.message || "Não foi possível salvar sua foto.");
    } finally {
      setSalvandoFoto(false);
    }
  }

  async function removerFoto() {
    if (!dados?.foto_path || salvandoFoto) return;

    setSalvandoFoto(true);
    setErroFoto("");

    const caminho = dados.foto_path;

    try {
      const { error: rpcError } = await supabase.rpc("atualizar_foto_cliente", {
        p_foto_path: null,
      });

      if (rpcError) throw rpcError;

      const { error: storageError } = await supabase.storage
        .from("clientes")
        .remove([caminho]);

      if (storageError) {
        console.warn(
          "[BarberHub] Foto removida do perfil, mas o arquivo não foi apagado:",
          storageError,
        );
      }

      setDados((atual) => ({
        ...(atual || {}),
        foto_path: null,
      }));
      setFotoUrl("");

      window.dispatchEvent(
        new CustomEvent("barberhub:perfil-atualizado", {
          detail: {
            nome,
            telefone,
            fotoUrl: "",
          },
        }),
      );
    } catch (error) {
      console.error("[BarberHub] Remover foto:", error);

      setErroFoto(error?.message || "Não foi possível remover sua foto.");
    } finally {
      setSalvandoFoto(false);
    }
  }

  async function alterarSenha(event) {
    event.preventDefault();

    if (salvandoSenha) return;

    setErroSenha("");
    setSucessoSenha("");

    if (senha.length < 8) {
      setErroSenha("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    if (senha !== confirmarSenha) {
      setErroSenha("As senhas não são iguais.");
      return;
    }

    setSalvandoSenha(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: senha,
      });

      if (error) throw error;

      setSenha("");
      setConfirmarSenha("");
      setSucessoSenha("Senha alterada com sucesso. 🔒");
    } catch (error) {
      console.error("[BarberHub] Alterar senha:", error);

      setErroSenha(error?.message || "Não foi possível alterar sua senha.");
    } finally {
      setSalvandoSenha(false);
    }
  }

  async function excluirConta() {
    if (confirmacaoExclusao !== "APAGAR CONTA" || excluindo) {
      return;
    }

    setExcluindo(true);
    setErroExclusao("");

    try {
      const { data, error } = await supabase.functions.invoke(
        "excluir-conta-cliente",
        {
          body: {
            confirmacao: "APAGAR CONTA",
          },
        },
      );

      if (error) throw error;

      if (!data?.sucesso) {
        throw new Error(data?.erro || "Não foi possível excluir a conta.");
      }

      try {
        await supabase.auth.signOut({
          scope: "local",
        });
      } catch {
        // A conta já pode ter sido removida do Auth.
      }

      window.location.replace("/");
    } catch (error) {
      console.error("[BarberHub] Excluir conta:", error);

      setErroExclusao(error?.message || "Não foi possível excluir a conta.");
      setExcluindo(false);
    }
  }

  return (
    <section className="client-profile-page">
      <div className="client-profile-header">
        <div>
          <span>MINHA CONTA</span>
          <h1>Meu perfil</h1>
          <p>
            Mantenha seus dados pessoais atualizados e proteja o acesso à sua
            conta BarberHub.
          </p>
        </div>

        <button type="button" onClick={carregar} disabled={loading}>
          ↻ {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {loading ? (
        <div className="client-profile-state">Carregando seu perfil...</div>
      ) : (
        <>
          <div className="client-profile-summary">
            <div className="client-profile-avatar">
              {fotoUrl ? (
                <img src={fotoUrl} alt={`Foto de ${nome || "cliente"}`} />
              ) : (
                iniciais(nome)
              )}
            </div>

            <div className="client-profile-summary-main">
              <small>CLIENTE BARBERHUB</small>
              <strong>{nome || "Cliente"}</strong>
              <span>{email}</span>

              <div className="client-profile-photo-actions">
                <input
                  ref={inputFotoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={selecionarFoto}
                  hidden
                />

                <button
                  type="button"
                  onClick={() => inputFotoRef.current?.click()}
                  disabled={salvandoFoto}
                >
                  {salvandoFoto
                    ? "Salvando..."
                    : fotoUrl
                      ? "Trocar foto"
                      : "Adicionar foto"}
                </button>

                {fotoUrl && (
                  <button
                    type="button"
                    className="client-profile-photo-remove"
                    onClick={removerFoto}
                    disabled={salvandoFoto}
                  >
                    Remover
                  </button>
                )}
              </div>

              {erroFoto && (
                <span className="client-profile-photo-error">{erroFoto}</span>
              )}
            </div>

            <div className="client-profile-summary-meta">
              <div>
                <small>CONTA CRIADA EM</small>
                <strong>{formatarData(dados?.created_at)}</strong>
              </div>

              <div>
                <small>ACESSO</small>
                <strong>{provedor}</strong>
              </div>
            </div>
          </div>

          <div className="client-profile-grid">
            <article className="client-profile-card">
              <div className="client-profile-card-heading">
                <div className="client-profile-card-icon">👤</div>

                <div>
                  <h2>Dados pessoais</h2>
                  <p>Essas informações identificam você dentro do BarberHub.</p>
                </div>
              </div>

              <form onSubmit={salvarDados}>
                <label>
                  <span>Nome completo</span>
                  <input
                    type="text"
                    value={nome}
                    onChange={(event) => setNome(event.target.value)}
                    maxLength={120}
                    autoComplete="name"
                    disabled={salvando}
                    required
                  />
                </label>

                <label>
                  <span>Telefone</span>
                  <input
                    type="tel"
                    value={telefone}
                    onChange={(event) => setTelefone(event.target.value)}
                    maxLength={30}
                    autoComplete="tel"
                    placeholder="(00) 99999-9999"
                    disabled={salvando}
                  />
                </label>

                <label>
                  <span>E-mail da conta</span>
                  <input type="email" value={email} readOnly disabled />

                  <small>
                    O e-mail é o identificador de acesso desta conta. A
                    alteração de e-mail será tratada em um fluxo separado de
                    segurança.
                  </small>
                </label>

                {erro && (
                  <div
                    className="client-profile-message client-profile-message--error"
                    role="alert"
                  >
                    {erro}
                  </div>
                )}

                {sucesso && (
                  <div
                    className="client-profile-message client-profile-message--success"
                    role="status"
                  >
                    {sucesso}
                  </div>
                )}

                <div className="client-profile-actions">
                  <button
                    type="submit"
                    className="client-profile-primary"
                    disabled={salvando}
                  >
                    {salvando ? "Salvando..." : "Salvar alterações"}
                  </button>
                </div>
              </form>
            </article>

            <article className="client-profile-card">
              <div className="client-profile-card-heading">
                <div className="client-profile-card-icon">🔐</div>

                <div>
                  <h2>Segurança</h2>
                  <p>Defina uma nova senha para proteger seu acesso.</p>
                </div>
              </div>

              <form onSubmit={alterarSenha}>
                <label>
                  <span>Nova senha</span>
                  <input
                    type="password"
                    value={senha}
                    onChange={(event) => setSenha(event.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Mínimo de 8 caracteres"
                    disabled={salvandoSenha}
                  />
                </label>

                <label>
                  <span>Confirmar nova senha</span>
                  <input
                    type="password"
                    value={confirmarSenha}
                    onChange={(event) => setConfirmarSenha(event.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Digite novamente"
                    disabled={salvandoSenha}
                  />
                </label>

                <div className="client-profile-security-note">
                  <span aria-hidden="true">🛡️</span>
                  <p>
                    Use uma senha exclusiva. Ao alterar a senha, sua sessão
                    atual permanece protegida pelo Supabase Auth.
                  </p>
                </div>

                {erroSenha && (
                  <div
                    className="client-profile-message client-profile-message--error"
                    role="alert"
                  >
                    {erroSenha}
                  </div>
                )}

                {sucessoSenha && (
                  <div
                    className="client-profile-message client-profile-message--success"
                    role="status"
                  >
                    {sucessoSenha}
                  </div>
                )}

                <div className="client-profile-actions">
                  <button
                    type="submit"
                    className="client-profile-primary"
                    disabled={salvandoSenha || !senha || !confirmarSenha}
                  >
                    {salvandoSenha ? "Alterando..." : "Alterar senha"}
                  </button>
                </div>
              </form>
            </article>
          </div>

          <article className="client-profile-info-card">
            <div>ℹ️</div>

            <div>
              <strong>Sobre seus dados</strong>
              <p>
                O nome, telefone e foto pertencem à sua conta. As barbearias
                ainda podem manter informações locais de atendimento cadastradas
                por elas.
              </p>
            </div>
          </article>

          <article className="client-profile-danger-card">
            <div className="client-profile-danger-heading">
              <div className="client-profile-danger-icon">🗑️</div>

              <div>
                <h2>Excluir minha conta</h2>
                <p>
                  Remove permanentemente sua conta BarberHub e os dados
                  relacionados a ela.
                </p>
              </div>
            </div>

            <div className="client-profile-danger-body">
              <p>
                Serão removidos seus agendamentos, pedidos, avaliações, contas a
                receber, pagamentos vinculados, notificações, vínculos com
                barbearias, foto, preferências e acesso ao BarberHub.
              </p>

              <strong>Esta ação é permanente e não pode ser desfeita.</strong>

              <button
                type="button"
                onClick={() => {
                  setConfirmacaoExclusao("");
                  setErroExclusao("");
                  setModalExcluir(true);
                }}
              >
                Excluir minha conta
              </button>
            </div>
          </article>
        </>
      )}

      {modalExcluir && (
        <div
          className="client-profile-delete-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !excluindo) {
              setModalExcluir(false);
            }
          }}
        >
          <div
            className="client-profile-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-client-title"
          >
            <div className="client-profile-delete-modal-header">
              <div>
                <span>ZONA DE PERIGO</span>
                <h2 id="delete-client-title">Excluir conta permanentemente?</h2>
              </div>

              <button
                type="button"
                onClick={() => !excluindo && setModalExcluir(false)}
                disabled={excluindo}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="client-profile-delete-warning">
              <span aria-hidden="true">⚠️</span>
              <p>
                Sua conta e os dados relacionados serão apagados. Você não
                conseguirá recuperar essas informações depois.
              </p>
            </div>

            <label className="client-profile-delete-field">
              <span>
                Digite <strong>APAGAR CONTA</strong> para confirmar
              </span>

              <input
                type="text"
                value={confirmacaoExclusao}
                onChange={(event) => setConfirmacaoExclusao(event.target.value)}
                autoComplete="off"
                disabled={excluindo}
                placeholder="APAGAR CONTA"
              />
            </label>

            {erroExclusao && (
              <div
                className="client-profile-message client-profile-message--error"
                role="alert"
              >
                {erroExclusao}
              </div>
            )}

            <div className="client-profile-delete-actions">
              <button
                type="button"
                onClick={() => setModalExcluir(false)}
                disabled={excluindo}
              >
                Manter minha conta
              </button>

              <button
                type="button"
                className="client-profile-delete-confirm"
                onClick={excluirConta}
                disabled={excluindo || confirmacaoExclusao !== "APAGAR CONTA"}
              >
                {excluindo ? "Excluindo..." : "Sim, excluir permanentemente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
