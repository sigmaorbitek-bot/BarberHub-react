import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import EmptyState from "../../../components/Painel/EmptyState/EmptyState";
import { useBarbearia } from "../../../hooks/useBarbearia";
import { supabase } from "../../../services/supabase";
import "./ProfissionaisPage.css";

const MAX_FOTO = 5 * 1024 * 1024;

const TIPOS_FOTO = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const FORM_INICIAL = {
  id: null,
  nome: "",
  telefone: "",
  foto_url: "",
  foto_path: "",
};

const ACESSO_INICIAL = {
  email: "",
  senhaTemporaria: "",
  comissaoPercentual: "0",
  ver_agendamentos: true,
  alterar_status: true,
  ver_cliente_telefone: true,
  ver_financeiro: false,
  ver_comissao: false,
  ver_agenda_equipe: false,
  ver_clientes: false,
  ver_produtos: false,
};

async function mensagemErroEdgeFunction(error) {
  const resposta = error?.context;

  if (resposta instanceof Response) {
    let detalhes = null;

    try {
      detalhes = await resposta.clone().json();
    } catch {
      // Respostas sem JSON também são tratadas.
    }

    const mensagem = [
      detalhes?.message,
      detalhes?.erro,
      detalhes?.error,
    ].find((valor) => typeof valor === "string" && valor.trim());

    if (mensagem) {
      return mensagem;
    }

    if (resposta.status === 401) {
      return "Sua sessão expirou. Entre novamente e tente outra vez.";
    }

    if (resposta.status === 403) {
      return "Seu usuário não tem permissão para liberar este acesso.";
    }

    if (resposta.status === 404) {
      return "A função de criação de acesso não foi encontrada ou o recurso solicitado não existe. Confira o deploy no Supabase.";
    }

    if (resposta.status === 409) {
      return "Este profissional ou e-mail já possui uma conta vinculada.";
    }

    return `Não foi possível criar o acesso (HTTP ${resposta.status}). Confira os logs da Edge Function no Supabase.`;
  }

  if (error?.name === "FunctionsFetchError" || error?.name === "FunctionsRelayError") {
    return "Não foi possível conectar à função do Supabase. Verifique a conexão e o deploy.";
  }

  return error?.message || "Não foi possível criar o acesso profissional.";
}

function normalizarTelefone(valor) {
  return String(valor || "")
    .replace(/\D/g, "")
    .slice(0, 15);
}

function iniciais(nome) {
  return String(nome || "P")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
}

function extensaoArquivo(arquivo) {
  const nome = String(
    arquivo?.name || "",
  );

  const ultima =
    nome.split(".").pop();

  if (ultima) {
    return ultima.toLowerCase();
  }

  if (
    arquivo?.type ===
    "image/png"
  ) {
    return "png";
  }

  if (
    arquivo?.type ===
    "image/webp"
  ) {
    return "webp";
  }

  return "jpg";
}

export default function ProfissionaisPage() {
  const {
    barbeariaId,
    barbearia,
  } = useBarbearia();

  const fotoInputRef =
    useRef(null);

  const [
    profissionais,
    setProfissionais,
  ] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [
    savingAccess,
    setSavingAccess,
  ] = useState(false);

  const [busca, setBusca] =
    useState("");

  const [filtro, setFiltro] =
    useState("ativos");

  const [
    modalOpen,
    setModalOpen,
  ] = useState(false);

  const [
    accessModalOpen,
    setAccessModalOpen,
  ] = useState(false);

  const [form, setForm] =
    useState(FORM_INICIAL);

  const [
    fotoArquivo,
    setFotoArquivo,
  ] = useState(null);

  const [
    fotoPreview,
    setFotoPreview,
  ] = useState("");

  const [
    accessProfessional,
    setAccessProfessional,
  ] = useState(null);

  const [
    accessForm,
    setAccessForm,
  ] = useState(ACESSO_INICIAL);

  const [message, setMessage] =
    useState("");

  const [
    messageType,
    setMessageType,
  ] = useState("success");

  const carregarProfissionais =
    useCallback(async () => {
      if (!barbeariaId) {
        return;
      }

      setLoading(true);

      try {
        const {
          data,
          error,
        } = await supabase
          .from("profissionais")
          .select(
            `
              id,
              barbearia_id,
              usuario_id,
              nome,
              telefone,
              foto_url,
              foto_path,
              ativo,
              email_acesso,
              primeiro_acesso_pendente,
              comissao_percentual,
              created_at
            `,
          )
          .eq(
            "barbearia_id",
            barbeariaId,
          )
          .order("ativo", {
            ascending: false,
          })
          .order("nome", {
            ascending: true,
          });

        if (error) {
          throw error;
        }

        setProfissionais(
          data || [],
        );
      } catch (error) {
        console.error(
          "[BarberHub] Erro ao carregar profissionais:",
          error,
        );

        setMessageType("error");
        setMessage(
          "Não foi possível carregar os profissionais.",
        );
      } finally {
        setLoading(false);
      }
    }, [barbeariaId]);

  useEffect(() => {
    carregarProfissionais();
  }, [carregarProfissionais]);

  useEffect(() => {
    return () => {
      if (
        fotoPreview?.startsWith(
          "blob:",
        )
      ) {
        URL.revokeObjectURL(
          fotoPreview,
        );
      }
    };
  }, [fotoPreview]);

  const listaFiltrada =
    useMemo(() => {
      const termo =
        busca.trim().toLowerCase();

      return profissionais.filter(
        (profissional) => {
          if (
            filtro === "ativos" &&
            !profissional.ativo
          ) {
            return false;
          }

          if (
            filtro === "inativos" &&
            profissional.ativo
          ) {
            return false;
          }

          if (!termo) {
            return true;
          }

          return [
            profissional.nome,
            profissional.telefone,
            profissional.email_acesso,
          ]
            .filter(Boolean)
            .some((valor) =>
              String(valor)
                .toLowerCase()
                .includes(termo),
            );
        },
      );
    }, [
      profissionais,
      busca,
      filtro,
    ]);

  const resumo = useMemo(() => {
    const ativos =
      profissionais.filter(
        (item) => item.ativo,
      ).length;

    const comAcesso =
      profissionais.filter(
        (item) =>
          Boolean(
            item.usuario_id,
          ),
      ).length;

    return {
      total: profissionais.length,
      ativos,
      inativos:
        profissionais.length -
        ativos,
      comAcesso,
    };
  }, [profissionais]);

  function resetFoto() {
    setFotoArquivo(null);

    if (
      fotoPreview?.startsWith(
        "blob:",
      )
    ) {
      URL.revokeObjectURL(
        fotoPreview,
      );
    }

    setFotoPreview("");

    if (fotoInputRef.current) {
      fotoInputRef.current.value =
        "";
    }
  }

  function abrirNovo() {
    setForm(FORM_INICIAL);
    resetFoto();
    setMessage("");
    setModalOpen(true);
  }

  function abrirEdicao(
    profissional,
  ) {
    setForm({
      id: profissional.id,
      nome:
        profissional.nome || "",
      telefone:
        profissional.telefone ||
        "",
      foto_url:
        profissional.foto_url ||
        "",
      foto_path:
        profissional.foto_path ||
        "",
    });

    resetFoto();

    setFotoPreview(
      profissional.foto_url ||
        "",
    );

    setMessage("");
    setModalOpen(true);
  }

  function fecharModal() {
    if (saving) {
      return;
    }

    setModalOpen(false);
    setForm(FORM_INICIAL);
    resetFoto();
  }

  function alterarForm(event) {
    const {
      name,
      value,
    } = event.target;

    setForm((atual) => ({
      ...atual,
      [name]:
        name === "telefone"
          ? normalizarTelefone(
              value,
            )
          : value,
    }));
  }

  function escolherFoto(event) {
    const arquivo =
      event.target.files?.[0] ||
      null;

    if (!arquivo) {
      return;
    }

    if (
      !TIPOS_FOTO.includes(
        arquivo.type,
      )
    ) {
      setMessageType("error");
      setMessage(
        "Use uma imagem JPG, PNG ou WEBP.",
      );
      event.target.value = "";
      return;
    }

    if (
      arquivo.size > MAX_FOTO
    ) {
      setMessageType("error");
      setMessage(
        "A foto pode ter no máximo 5 MB.",
      );
      event.target.value = "";
      return;
    }

    if (
      fotoPreview?.startsWith(
        "blob:",
      )
    ) {
      URL.revokeObjectURL(
        fotoPreview,
      );
    }

    setFotoArquivo(arquivo);
    setFotoPreview(
      URL.createObjectURL(
        arquivo,
      ),
    );

    setMessage("");
  }

  async function enviarFoto({
    profissionalId,
    arquivo,
  }) {
    const extensao =
      extensaoArquivo(arquivo);

    const caminho =
      `${barbeariaId}/${profissionalId}/${crypto.randomUUID()}.${extensao}`;

    const {
      error: uploadError,
    } = await supabase.storage
      .from("profissionais")
      .upload(
        caminho,
        arquivo,
        {
          cacheControl:
            "3600",
          upsert: false,
          contentType:
            arquivo.type,
        },
      );

    if (uploadError) {
      throw uploadError;
    }

    const {
      data: publicData,
    } = supabase.storage
      .from("profissionais")
      .getPublicUrl(caminho);

    if (
      !publicData?.publicUrl
    ) {
      throw new Error(
        "Não foi possível obter a URL da foto.",
      );
    }

    return {
      path: caminho,
      url:
        publicData.publicUrl,
    };
  }

  async function salvar(
    event,
  ) {
    event.preventDefault();

    const nome =
      form.nome.trim();

    const telefone =
      normalizarTelefone(
        form.telefone,
      );

    if (!nome) {
      setMessageType("error");
      setMessage(
        "Digite o nome do profissional.",
      );
      return;
    }

    setSaving(true);
    setMessage("");

    let idProfissional =
      form.id;

    let novaFoto = null;

    try {
      if (!idProfissional) {
        const {
          data,
          error,
        } = await supabase
          .from("profissionais")
          .insert({
            barbearia_id:
              barbeariaId,
            nome,
            telefone:
              telefone || null,
            ativo: true,
          })
          .select(
            "id, foto_path",
          )
          .single();

        if (error) {
          throw error;
        }

        idProfissional =
          data.id;
      }

      if (fotoArquivo) {
        novaFoto =
          await enviarFoto({
            profissionalId:
              idProfissional,
            arquivo:
              fotoArquivo,
          });
      }

      const {
        error: updateError,
      } = await supabase
        .from("profissionais")
        .update({
          nome,
          telefone:
            telefone || null,
          ...(novaFoto
            ? {
                foto_url:
                  novaFoto.url,
                foto_path:
                  novaFoto.path,
              }
            : {}),
        })
        .eq(
          "id",
          idProfissional,
        )
        .eq(
          "barbearia_id",
          barbeariaId,
        );

      if (updateError) {
        throw updateError;
      }

      if (
        novaFoto &&
        form.foto_path &&
        form.foto_path !==
          novaFoto.path
      ) {
        await supabase.storage
          .from(
            "profissionais",
          )
          .remove([
            form.foto_path,
          ]);
      }

      setMessageType("success");
      setMessage(
        form.id
          ? "Profissional atualizado com sucesso."
          : "Profissional cadastrado com sucesso.",
      );

      setModalOpen(false);
      setForm(FORM_INICIAL);
      resetFoto();

      await carregarProfissionais();
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao salvar profissional:",
        error,
      );

      setMessageType("error");
      setMessage(
        error?.message ||
          "Não foi possível salvar o profissional.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function alterarStatus(
    profissional,
  ) {
    const ativo =
      !profissional.ativo;

    const confirmar =
      window.confirm(
        ativo
          ? `Reativar ${profissional.nome}?`
          : `Desativar ${profissional.nome}? Ele deixará de aparecer em novos agendamentos.`,
      );

    if (!confirmar) {
      return;
    }

    try {
      const { error } =
        await supabase
          .from("profissionais")
          .update({ ativo })
          .eq(
            "id",
            profissional.id,
          )
          .eq(
            "barbearia_id",
            barbeariaId,
          );

      if (error) {
        throw error;
      }

      setMessageType("success");
      setMessage(
        ativo
          ? "Profissional reativado com sucesso."
          : "Profissional desativado com sucesso.",
      );

      await carregarProfissionais();
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao alterar status:",
        error,
      );

      setMessageType("error");
      setMessage(
        error?.message ||
          "Não foi possível alterar o status.",
      );
    }
  }

  async function abrirAcesso(
    profissional,
  ) {
    setAccessProfessional(
      profissional,
    );

    setMessage("");

    let permissoes = null;

    if (
      profissional.usuario_id
    ) {
      const {
        data,
        error,
      } = await supabase
        .from(
          "permissoes_profissionais",
        )
        .select(
          `
            ver_agendamentos,
            alterar_status,
            ver_cliente_telefone,
            ver_financeiro,
            ver_comissao,
            ver_agenda_equipe,
            ver_clientes,
            ver_produtos
          `,
        )
        .eq(
          "profissional_id",
          profissional.id,
        )
        .maybeSingle();

      if (error) {
        console.error(
          "[BarberHub] Erro ao carregar permissões:",
          error,
        );
      }

      permissoes = data;
    }

    setAccessForm({
      ...ACESSO_INICIAL,
      email:
        profissional.email_acesso ||
        "",
      senhaTemporaria: "",
      comissaoPercentual:
        String(
          profissional.comissao_percentual ??
            0,
        ),
      ver_agendamentos:
        permissoes
          ?.ver_agendamentos ??
        true,
      alterar_status:
        permissoes
          ?.alterar_status ??
        true,
      ver_cliente_telefone:
        permissoes
          ?.ver_cliente_telefone ??
        true,
      ver_financeiro:
        permissoes
          ?.ver_financeiro ??
        false,
      ver_comissao:
        permissoes
          ?.ver_comissao ??
        false,
      ver_agenda_equipe:
        permissoes
          ?.ver_agenda_equipe ??
        false,
      ver_clientes:
        permissoes
          ?.ver_clientes ??
        false,
      ver_produtos:
        permissoes
          ?.ver_produtos ??
        false,
    });

    setAccessModalOpen(true);
  }

  function fecharAcesso() {
    if (savingAccess) {
      return;
    }

    setAccessModalOpen(false);
    setAccessProfessional(null);
    setAccessForm(
      ACESSO_INICIAL,
    );
  }

  function alterarAcesso(
    event,
  ) {
    const {
      name,
      value,
      checked,
      type,
    } = event.target;

    setAccessForm((atual) => ({
      ...atual,
      [name]:
        type === "checkbox"
          ? checked
          : value,
    }));
  }

  async function salvarAcesso(
    event,
  ) {
    event.preventDefault();

    if (!accessProfessional) {
      return;
    }

    const comissao =
      Number(
        accessForm
          .comissaoPercentual,
      );

    if (
      !Number.isFinite(
        comissao,
      ) ||
      comissao < 0 ||
      comissao > 100
    ) {
      setMessageType("error");
      setMessage(
        "A comissão precisa estar entre 0 e 100%.",
      );
      return;
    }

    setSavingAccess(true);
    setMessage("");

    try {
      if (
        !accessProfessional
          .usuario_id
      ) {
        const email =
          accessForm.email
            .trim()
            .toLowerCase();

        if (
          !email ||
          !email.includes("@")
        ) {
          throw new Error(
            "Digite um e-mail válido.",
          );
        }

        if (
          accessForm
            .senhaTemporaria
            .length < 8
        ) {
          throw new Error(
            "A senha temporária precisa ter pelo menos 8 caracteres.",
          );
        }

        const {
          data,
          error,
        } =
          await supabase.functions.invoke(
            "criar-acesso-profissional",
            {
              body: {
                profissionalId:
                  accessProfessional.id,
                email,
                senhaTemporaria:
                  accessForm
                    .senhaTemporaria,
                comissaoPercentual:
                  comissao,
                permissoes: {
                  ver_agendamentos:
                    accessForm
                      .ver_agendamentos,
                  alterar_status:
                    accessForm
                      .alterar_status,
                  ver_cliente_telefone:
                    accessForm
                      .ver_cliente_telefone,
                  ver_financeiro:
                    accessForm
                      .ver_financeiro,
                  ver_comissao:
                    accessForm
                      .ver_comissao,
                  ver_agenda_equipe:
                    accessForm
                      .ver_agenda_equipe,
                  ver_clientes:
                    accessForm
                      .ver_clientes,
                  ver_produtos:
                    accessForm
                      .ver_produtos,
                },
              },
            },
          );

        if (error) {
          throw new Error(await mensagemErroEdgeFunction(error));
        }

        // Confirmação explícita: resposta vazia não significa sucesso.
        if (data?.ok !== true) {
          throw new Error(
            data?.message ||
              "Não foi possível criar o acesso.",
          );
        }

        setMessageType("success");
        setMessage(
          "Acesso profissional criado com sucesso. Entregue a senha temporária ao profissional.",
        );
      } else {
        const {
          error,
        } = await supabase.rpc(
          "salvar_acesso_profissional",
          {
            p_profissional_id:
              accessProfessional.id,
            p_ver_agendamentos:
              accessForm
                .ver_agendamentos,
            p_alterar_status:
              accessForm
                .alterar_status,
            p_ver_cliente_telefone:
              accessForm
                .ver_cliente_telefone,
            p_ver_financeiro:
              accessForm
                .ver_financeiro,
            p_ver_comissao:
              accessForm
                .ver_comissao,
            p_ver_agenda_equipe:
              accessForm
                .ver_agenda_equipe,
            p_ver_clientes:
              accessForm
                .ver_clientes,
            p_ver_produtos:
              accessForm
                .ver_produtos,
            p_comissao_percentual:
              comissao,
          },
        );

        if (error) {
          throw error;
        }

        setMessageType("success");
        setMessage(
          "Permissões atualizadas com sucesso.",
        );
      }

      setAccessModalOpen(false);
      setAccessProfessional(null);

      await carregarProfissionais();
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao salvar acesso:",
        error,
      );

      setMessageType("error");
      setMessage(
        error?.message ||
          "Não foi possível salvar o acesso profissional.",
      );
    } finally {
      setSavingAccess(false);
    }
  }

  return (
    <section className="professionals-page">
      <div className="professionals-heading">
        <div>
          <span className="professionals-eyebrow">
            EQUIPE
          </span>

          <h1>Profissionais</h1>

          <p>
            Gerencie quem realiza
            atendimentos em{" "}
            <strong>
              {barbearia?.nome ||
                "sua barbearia"}
            </strong>
            .
          </p>
        </div>

        <button
          type="button"
          className="professionals-primary"
          onClick={abrirNovo}
        >
          ＋ Novo profissional
        </button>
      </div>

      <div className="professionals-owner-note">
        <span aria-hidden="true">
          🔐
        </span>

        <div>
          <strong>
            O proprietário não é um profissional automaticamente.
          </strong>

          <p>
            A conta do dono serve para administrar o BarberHub.
            Apenas pessoas cadastradas aqui entram na agenda.
          </p>
        </div>
      </div>

      {message ? (
        <div
          className={`professionals-message professionals-message--${messageType}`}
          role="status"
        >
          {message}
        </div>
      ) : null}

      <div className="professionals-stats">
        <article>
          <span>👥</span>
          <div>
            <small>TOTAL</small>
            <strong>
              {loading
                ? "..."
                : resumo.total}
            </strong>
          </div>
        </article>

        <article>
          <span>💈</span>
          <div>
            <small>ATIVOS</small>
            <strong>
              {loading
                ? "..."
                : resumo.ativos}
            </strong>
          </div>
        </article>

        <article>
          <span>🔐</span>
          <div>
            <small>COM ACESSO</small>
            <strong>
              {loading
                ? "..."
                : resumo.comAcesso}
            </strong>
          </div>
        </article>

        <article>
          <span>◌</span>
          <div>
            <small>INATIVOS</small>
            <strong>
              {loading
                ? "..."
                : resumo.inativos}
            </strong>
          </div>
        </article>
      </div>

      <div className="professionals-toolbar">
        <div className="professionals-search">
          <span aria-hidden="true">
            ⌕
          </span>

          <input
            type="search"
            value={busca}
            placeholder="Buscar profissional..."
            onChange={(event) =>
              setBusca(
                event.target.value,
              )
            }
          />
        </div>

        <div className="professionals-filters">
          {[
            ["ativos", "Ativos"],
            ["todos", "Todos"],
            ["inativos", "Inativos"],
          ].map(
            ([value, label]) => (
              <button
                key={value}
                type="button"
                className={
                  filtro === value
                    ? "professionals-filter professionals-filter--active"
                    : "professionals-filter"
                }
                onClick={() =>
                  setFiltro(value)
                }
              >
                {label}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          className="professionals-refresh"
          disabled={loading}
          onClick={
            carregarProfissionais
          }
        >
          ↻ Atualizar
        </button>
      </div>

      {loading ? (
        <div className="professionals-loading">
          Carregando profissionais...
        </div>
      ) : listaFiltrada.length ? (
        <div className="professionals-grid">
          {listaFiltrada.map(
            (profissional) => (
              <article
                key={profissional.id}
                className={[
                  "professional-card",
                  !profissional.ativo
                    ? "professional-card--inactive"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="professional-card-top">
                  <div className="professional-avatar">
                    {profissional.foto_url ? (
                      <img
                        src={
                          profissional.foto_url
                        }
                        alt={`Foto de ${profissional.nome}`}
                      />
                    ) : (
                      <span>
                        {iniciais(
                          profissional.nome,
                        )}
                      </span>
                    )}
                  </div>

                  <span
                    className={
                      profissional.ativo
                        ? "professional-status professional-status--active"
                        : "professional-status professional-status--inactive"
                    }
                  >
                    {profissional.ativo
                      ? "Ativo"
                      : "Inativo"}
                  </span>
                </div>

                <div className="professional-card-content">
                  <span className="professionals-eyebrow">
                    PROFISSIONAL
                  </span>

                  <h2>
                    {profissional.nome}
                  </h2>

                  <p>
                    {profissional.telefone
                      ? `📱 ${profissional.telefone}`
                      : "Telefone não informado"}
                  </p>

                  <div className="professional-access-summary">
                    <span>
                      {profissional.usuario_id
                        ? "🟢 Conta vinculada"
                        : "⚪ Sem acesso"}
                    </span>

                    {profissional.email_acesso ? (
                      <small>
                        {profissional.email_acesso}
                      </small>
                    ) : null}

                    {profissional.primeiro_acesso_pendente ? (
                      <small className="professional-pending">
                        Primeiro acesso pendente
                      </small>
                    ) : null}
                  </div>
                </div>

                <div className="professional-card-actions">
                  <button
                    type="button"
                    onClick={() =>
                      abrirEdicao(
                        profissional,
                      )
                    }
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    className="professional-access-button"
                    disabled={
                      !profissional.ativo
                    }
                    onClick={() =>
                      abrirAcesso(
                        profissional,
                      )
                    }
                  >
                    {profissional.usuario_id
                      ? "Acesso e permissões"
                      : "Dar acesso"}
                  </button>

                  <button
                    type="button"
                    className={
                      profissional.ativo
                        ? "professional-danger"
                        : "professional-success"
                    }
                    onClick={() =>
                      alterarStatus(
                        profissional,
                      )
                    }
                  >
                    {profissional.ativo
                      ? "Desativar"
                      : "Reativar"}
                  </button>
                </div>
              </article>
            ),
          )}
        </div>
      ) : (
        <EmptyState
          icon="💈"
          title="Nenhum profissional encontrado"
          description={
            filtro === "ativos"
              ? "Cadastre o primeiro profissional para liberar os agendamentos."
              : "Nenhum profissional corresponde aos filtros atuais."
          }
        />
      )}

      {modalOpen ? (
        <div
          className="professionals-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              fecharModal();
            }
          }}
        >
          <div
            className="professionals-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="professionals-modal-header">
              <div>
                <span className="professionals-eyebrow">
                  {form.id
                    ? "EDITAR"
                    : "NOVO PROFISSIONAL"}
                </span>

                <h2>
                  {form.id
                    ? "Editar profissional"
                    : "Cadastrar profissional"}
                </h2>

                <p>
                  Cadastre somente pessoas que realmente realizam atendimentos.
                </p>
              </div>

              <button
                type="button"
                className="professionals-modal-close"
                onClick={fecharModal}
              >
                ×
              </button>
            </div>

            <form
              className="professionals-form"
              onSubmit={salvar}
              noValidate
            >
              <div className="professionals-photo-field professionals-field--full">
                <div className="professionals-photo-preview">
                  {fotoPreview ? (
                    <img
                      src={fotoPreview}
                      alt="Prévia da foto do profissional"
                    />
                  ) : (
                    <span>
                      {iniciais(
                        form.nome,
                      )}
                    </span>
                  )}
                </div>

                <div>
                  <label
                    className="professionals-photo-button"
                    htmlFor="professional-photo-file"
                  >
                    📷 Escolher foto
                  </label>

                  <input
                    ref={fotoInputRef}
                    id="professional-photo-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    disabled={saving}
                    onChange={escolherFoto}
                  />

                  <small>
                    JPG, PNG ou WEBP · máximo 5 MB
                  </small>
                </div>
              </div>

              <div className="professionals-field">
                <label htmlFor="professional-name">
                  Nome *
                </label>

                <input
                  id="professional-name"
                  name="nome"
                  type="text"
                  value={form.nome}
                  maxLength={120}
                  placeholder="Ex.: João Silva"
                  autoFocus
                  disabled={saving}
                  onChange={alterarForm}
                />
              </div>

              <div className="professionals-field">
                <label htmlFor="professional-phone">
                  Telefone / WhatsApp
                </label>

                <input
                  id="professional-phone"
                  name="telefone"
                  type="tel"
                  inputMode="tel"
                  value={form.telefone}
                  maxLength={15}
                  placeholder="81999999999"
                  disabled={saving}
                  onChange={alterarForm}
                />
              </div>

              <div className="professionals-form-actions">
                <button
                  type="button"
                  className="professionals-secondary"
                  disabled={saving}
                  onClick={fecharModal}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="professionals-primary"
                  disabled={saving}
                >
                  {saving
                    ? "Salvando..."
                    : form.id
                      ? "Salvar alterações"
                      : "Cadastrar profissional"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {accessModalOpen &&
      accessProfessional ? (
        <div
          className="professionals-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              fecharAcesso();
            }
          }}
        >
          <div
            className="professionals-modal professionals-access-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="professionals-modal-header">
              <div>
                <span className="professionals-eyebrow">
                  ACESSO PROFISSIONAL
                </span>

                <h2>
                  {accessProfessional.usuario_id
                    ? "Acesso e permissões"
                    : "Dar acesso"}
                </h2>

                <p>
                  {accessProfessional.nome}
                </p>
              </div>

              <button
                type="button"
                className="professionals-modal-close"
                onClick={fecharAcesso}
              >
                ×
              </button>
            </div>

            <form
              className="professionals-form"
              onSubmit={
                salvarAcesso
              }
            >
              <div className="professionals-field">
                <label>
                  E-mail de acesso *
                </label>

                <input
                  name="email"
                  type="email"
                  value={
                    accessForm.email
                  }
                  disabled={
                    savingAccess ||
                    Boolean(
                      accessProfessional.usuario_id,
                    )
                  }
                  onChange={
                    alterarAcesso
                  }
                />
              </div>

              {!accessProfessional.usuario_id ? (
                <div className="professionals-field">
                  <label>
                    Senha temporária *
                  </label>

                  <input
                    name="senhaTemporaria"
                    type="password"
                    minLength={8}
                    value={
                      accessForm.senhaTemporaria
                    }
                    disabled={
                      savingAccess
                    }
                    onChange={
                      alterarAcesso
                    }
                  />

                  <small>
                    Mínimo 8 caracteres. O profissional será obrigado a criar uma senha pessoal.
                  </small>
                </div>
              ) : null}

              <div className="professionals-field">
                <label>
                  Comissão (%)
                </label>

                <input
                  name="comissaoPercentual"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={
                    accessForm.comissaoPercentual
                  }
                  disabled={
                    savingAccess
                  }
                  onChange={
                    alterarAcesso
                  }
                />
              </div>

              <div className="professionals-permissions professionals-field--full">
                <strong>
                  O que este profissional pode ver/fazer
                </strong>

                {[
                  [
                    "ver_agendamentos",
                    "Ver meus agendamentos",
                  ],
                  [
                    "alterar_status",
                    "Confirmar/concluir atendimentos",
                  ],
                  [
                    "ver_cliente_telefone",
                    "Ver telefone do cliente",
                  ],
                  [
                    "ver_financeiro",
                    "Ver meu financeiro",
                  ],
                  [
                    "ver_comissao",
                    "Ver minha comissão",
                  ],
                  [
                    "ver_agenda_equipe",
                    "Ver agenda da equipe",
                  ],
                  [
                    "ver_clientes",
                    "Ver clientes da barbearia",
                  ],
                  [
                    "ver_produtos",
                    "Ver produtos",
                  ],
                ].map(
                  ([name, label]) => (
                    <label
                      key={name}
                      className="professionals-permission-row"
                    >
                      <input
                        name={name}
                        type="checkbox"
                        checked={
                          Boolean(
                            accessForm[
                              name
                            ],
                          )
                        }
                        disabled={
                          savingAccess
                        }
                        onChange={
                          alterarAcesso
                        }
                      />

                      <span>
                        {label}
                      </span>
                    </label>
                  ),
                )}
              </div>

              <div className="professionals-form-actions">
                <button
                  type="button"
                  className="professionals-secondary"
                  disabled={
                    savingAccess
                  }
                  onClick={
                    fecharAcesso
                  }
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="professionals-primary"
                  disabled={
                    savingAccess
                  }
                >
                  {savingAccess
                    ? "Salvando..."
                    : accessProfessional.usuario_id
                      ? "Salvar permissões"
                      : "Criar acesso"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
