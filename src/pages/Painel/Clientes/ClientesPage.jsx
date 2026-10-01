import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import EmptyState from "../../../components/Painel/EmptyState/EmptyState";
import { useBarbearia } from "../../../hooks/useBarbearia";
import { supabase } from "../../../services/supabase";
import "./ClientesPage.css";

const FORM_INICIAL = {
  id: null,
  nome: "",
  telefone: "",
  email: "",
  observacoes: "",
};

function normalizarTelefone(valor) {
  return String(
    valor || "",
  )
    .replace(/\D/g, "")
    .slice(0, 15);
}

function formatarTelefone(valor) {
  const numeros =
    normalizarTelefone(valor);

  if (
    numeros.length === 11
  ) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
  }

  if (
    numeros.length === 10
  ) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
  }

  return valor || "Não informado";
}

function formatarMoeda(valor) {
  return Number(
    valor || 0,
  ).toLocaleString(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    },
  );
}

function formatarData(valor) {
  if (!valor) {
    return "Sem atendimentos";
  }

  const data =
    new Date(valor);

  if (
    Number.isNaN(
      data.getTime(),
    )
  ) {
    return "—";
  }

  return data.toLocaleDateString(
    "pt-BR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );
}

function iniciais(nome) {
  return String(
    nome || "C",
  )
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(
      (parte) =>
        parte[0],
    )
    .join("")
    .toUpperCase();
}

export default function ClientesPage() {
  const {
    barbeariaId,
    barbearia,
  } = useBarbearia();

  const [
    clientes,
    setClientes,
  ] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [busca, setBusca] =
    useState("");

  const [filtro, setFiltro] =
    useState("ativos");

  const [
    modalOpen,
    setModalOpen,
  ] = useState(false);

  const [form, setForm] =
    useState(FORM_INICIAL);

  const [message, setMessage] =
    useState("");

  const [
    messageType,
    setMessageType,
  ] = useState("success");

  const carregarClientes =
    useCallback(async () => {
      if (!barbeariaId) {
        return;
      }

      setLoading(true);

      try {
        const {
          data,
          error,
        } = await supabase.rpc(
          "listar_clientes_painel",
          {
            p_barbearia_id:
              barbeariaId,
          },
        );

        if (error) {
          throw error;
        }

        setClientes(
          data || [],
        );
      } catch (error) {
        console.error(
          "[BarberHub] Erro ao carregar clientes:",
          error,
        );

        setMessageType(
          "error",
        );

        setMessage(
          error?.message ||
            "Não foi possível carregar os clientes.",
        );
      } finally {
        setLoading(false);
      }
    }, [barbeariaId]);

  useEffect(() => {
    carregarClientes();
  }, [carregarClientes]);

  const resumo = useMemo(() => {
    const ativos =
      clientes.filter(
        (item) =>
          item.ativo,
      ).length;

    const comConta =
      clientes.filter(
        (item) =>
          item.possui_conta,
      ).length;

    const faturamento =
      clientes.reduce(
        (total, item) =>
          total +
          Number(
            item.total_gerado ||
              0,
          ),
        0,
      );

    return {
      total: clientes.length,
      ativos,
      comConta,
      faturamento,
    };
  }, [clientes]);

  const filtrados = useMemo(() => {
    const termo =
      busca
        .trim()
        .toLowerCase();

    return clientes.filter(
      (cliente) => {
        if (
          filtro ===
            "ativos" &&
          !cliente.ativo
        ) {
          return false;
        }

        if (
          filtro ===
            "inativos" &&
          cliente.ativo
        ) {
          return false;
        }

        if (!termo) {
          return true;
        }

        return [
          cliente.nome,
          cliente.telefone,
          cliente.email,
        ]
          .filter(Boolean)
          .some((valor) =>
            String(valor)
              .toLowerCase()
              .includes(
                termo,
              ),
          );
      },
    );
  }, [
    clientes,
    filtro,
    busca,
  ]);

  function abrirNovo() {
    setForm(
      FORM_INICIAL,
    );
    setMessage("");
    setModalOpen(true);
  }

  function abrirEdicao(
    cliente,
  ) {
    setForm({
      id:
        cliente.cliente_id,
      nome:
        cliente.nome || "",
      telefone:
        cliente.telefone ||
        "",
      email:
        cliente.email || "",
      observacoes:
        cliente.observacoes ||
        "",
    });

    setMessage("");
    setModalOpen(true);
  }

  function fecharModal() {
    if (saving) {
      return;
    }

    setModalOpen(false);
    setForm(
      FORM_INICIAL,
    );
  }

  function alterarForm(
    event,
  ) {
    const {
      name,
      value,
    } = event.target;

    setForm((atual) => ({
      ...atual,
      [name]:
        name ===
        "telefone"
          ? normalizarTelefone(
              value,
            )
          : value,
    }));
  }

  async function salvar(
    event,
  ) {
    event.preventDefault();

    const nome =
      form.nome.trim();

    const email =
      form.email
        .trim()
        .toLowerCase();

    if (!nome) {
      setMessageType(
        "error",
      );
      setMessage(
        "Digite o nome do cliente.",
      );
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const {
        error,
      } = await supabase.rpc(
        "salvar_cliente_painel",
        {
          p_barbearia_id:
            barbeariaId,
          p_cliente_id:
            form.id || null,
          p_nome: nome,
          p_telefone:
            normalizarTelefone(
              form.telefone,
            ) || null,
          p_email:
            email || null,
          p_observacoes:
            form.observacoes
              .trim() ||
            null,
        },
      );

      if (error) {
        throw error;
      }

      setModalOpen(false);
      setForm(
        FORM_INICIAL,
      );

      setMessageType(
        "success",
      );

      setMessage(
        form.id
          ? "Cliente atualizado com sucesso."
          : "Cliente cadastrado com sucesso.",
      );

      await carregarClientes();
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao salvar cliente:",
        error,
      );

      setMessageType(
        "error",
      );

      setMessage(
        error?.message ||
          "Não foi possível salvar o cliente.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function alterarStatus(
    cliente,
  ) {
    const novoStatus =
      !cliente.ativo;

    const confirmar =
      window.confirm(
        novoStatus
          ? `Reativar ${cliente.nome}?`
          : `Desativar ${cliente.nome}? O histórico será preservado.`,
      );

    if (!confirmar) {
      return;
    }

    try {
      const {
        error,
      } = await supabase.rpc(
        "alterar_status_cliente_painel",
        {
          p_barbearia_id:
            barbeariaId,
          p_cliente_id:
            cliente.cliente_id,
          p_ativo:
            novoStatus,
        },
      );

      if (error) {
        throw error;
      }

      setMessageType(
        "success",
      );

      setMessage(
        novoStatus
          ? "Cliente reativado com sucesso."
          : "Cliente desativado com sucesso.",
      );

      await carregarClientes();
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao alterar cliente:",
        error,
      );

      setMessageType(
        "error",
      );

      setMessage(
        error?.message ||
          "Não foi possível alterar o cliente.",
      );
    }
  }

  return (
    <section className="clients-page">
      <div className="clients-heading">
        <div>
          <span className="clients-eyebrow">
            RELACIONAMENTO
          </span>

          <h1>Clientes</h1>

          <p>
            Gerencie os clientes da{" "}
            <strong>
              {barbearia?.nome ||
                "sua barbearia"}
            </strong>
            , contatos e histórico.
          </p>
        </div>

        <button
          type="button"
          className="clients-primary"
          onClick={
            abrirNovo
          }
        >
          ＋ Novo cliente
        </button>
      </div>

      {message ? (
        <div
          className={`clients-message clients-message--${messageType}`}
          role="status"
        >
          {message}
        </div>
      ) : null}

      <div className="clients-stats">
        <article>
          <span>👥</span>

          <div>
            <small>
              TOTAL
            </small>

            <strong>
              {loading
                ? "..."
                : resumo.total}
            </strong>
          </div>
        </article>

        <article>
          <span>✅</span>

          <div>
            <small>
              ATIVOS
            </small>

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
            <small>
              COM CONTA
            </small>

            <strong>
              {loading
                ? "..."
                : resumo.comConta}
            </strong>
          </div>
        </article>

        <article>
          <span>💰</span>

          <div>
            <small>
              GERADO EM SERVIÇOS
            </small>

            <strong>
              {loading
                ? "..."
                : formatarMoeda(
                    resumo.faturamento,
                  )}
            </strong>
          </div>
        </article>
      </div>

      <div className="clients-toolbar">
        <div className="clients-search">
          <span>
            ⌕
          </span>

          <input
            type="search"
            value={busca}
            placeholder="Buscar por nome, telefone ou e-mail..."
            onChange={(event) =>
              setBusca(
                event.target.value,
              )
            }
          />
        </div>

        <div className="clients-filters">
          {[
            [
              "ativos",
              "Ativos",
            ],
            [
              "todos",
              "Todos",
            ],
            [
              "inativos",
              "Inativos",
            ],
          ].map(
            ([
              value,
              label,
            ]) => (
              <button
                key={value}
                type="button"
                className={
                  filtro ===
                  value
                    ? "clients-filter clients-filter--active"
                    : "clients-filter"
                }
                onClick={() =>
                  setFiltro(
                    value,
                  )
                }
              >
                {label}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          className="clients-refresh"
          disabled={loading}
          onClick={
            carregarClientes
          }
        >
          ↻ Atualizar
        </button>
      </div>

      {loading ? (
        <div className="clients-loading">
          Carregando clientes...
        </div>
      ) : filtrados.length ? (
        <div className="clients-grid">
          {filtrados.map(
            (cliente) => (
              <article
                key={
                  cliente.cliente_id
                }
                className={[
                  "client-card",
                  !cliente.ativo
                    ? "client-card--inactive"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="client-card-top">
                  <div className="client-avatar">
                    {iniciais(
                      cliente.nome,
                    )}
                  </div>

                  <div className="client-card-badges">
                    {cliente.possui_conta ? (
                      <span className="client-account-badge">
                        Conta BarberHub
                      </span>
                    ) : null}

                    <span
                      className={
                        cliente.ativo
                          ? "client-status client-status--active"
                          : "client-status client-status--inactive"
                      }
                    >
                      {cliente.ativo
                        ? "Ativo"
                        : "Inativo"}
                    </span>
                  </div>
                </div>

                <div className="client-card-content">
                  <span className="clients-eyebrow">
                    CLIENTE
                  </span>

                  <h2>
                    {cliente.nome}
                  </h2>

                  <p>
                    📱{" "}
                    {formatarTelefone(
                      cliente.telefone,
                    )}
                  </p>

                  <p>
                    ✉️{" "}
                    {cliente.email ||
                      "E-mail não informado"}
                  </p>
                </div>

                <div className="client-history">
                  <div>
                    <small>
                      ATENDIMENTOS
                    </small>

                    <strong>
                      {
                        cliente.total_agendamentos
                      }
                    </strong>
                  </div>

                  <div>
                    <small>
                      CONCLUÍDOS
                    </small>

                    <strong>
                      {
                        cliente.concluidos
                      }
                    </strong>
                  </div>

                  <div>
                    <small>
                      GERADO
                    </small>

                    <strong>
                      {formatarMoeda(
                        cliente.total_gerado,
                      )}
                    </strong>
                  </div>
                </div>

                <div className="client-last-visit">
                  <span>
                    Último atendimento
                  </span>

                  <strong>
                    {formatarData(
                      cliente.ultimo_agendamento,
                    )}
                  </strong>
                </div>

                {cliente.observacoes ? (
                  <div className="client-notes">
                    <strong>
                      Observações
                    </strong>

                    <p>
                      {
                        cliente.observacoes
                      }
                    </p>
                  </div>
                ) : null}

                <div className="client-card-actions">
                  <button
                    type="button"
                    onClick={() =>
                      abrirEdicao(
                        cliente,
                      )
                    }
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    className={
                      cliente.ativo
                        ? "client-danger"
                        : "client-success"
                    }
                    onClick={() =>
                      alterarStatus(
                        cliente,
                      )
                    }
                  >
                    {cliente.ativo
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
          icon="👥"
          title="Nenhum cliente encontrado"
          description={
            filtro ===
            "ativos"
              ? "Cadastre o primeiro cliente ou crie um agendamento com um novo cliente."
              : "Nenhum cliente corresponde aos filtros atuais."
          }
        />
      )}

      {modalOpen ? (
        <div
          className="clients-modal-backdrop"
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
            className="clients-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="clients-modal-header">
              <div>
                <span className="clients-eyebrow">
                  {form.id
                    ? "EDITAR CLIENTE"
                    : "NOVO CLIENTE"}
                </span>

                <h2>
                  {form.id
                    ? "Editar cliente"
                    : "Cadastrar cliente"}
                </h2>

                <p>
                  Os dados editados aqui pertencem ao relacionamento desta barbearia com o cliente.
                </p>
              </div>

              <button
                type="button"
                className="clients-modal-close"
                onClick={
                  fecharModal
                }
              >
                ×
              </button>
            </div>

            <form
              className="clients-form"
              onSubmit={
                salvar
              }
              noValidate
            >
              <div className="clients-field clients-field--full">
                <label htmlFor="client-name">
                  Nome *
                </label>

                <input
                  id="client-name"
                  name="nome"
                  type="text"
                  maxLength={120}
                  value={form.nome}
                  placeholder="Ex.: João da Silva"
                  autoFocus
                  disabled={
                    saving
                  }
                  onChange={
                    alterarForm
                  }
                />
              </div>

              <div className="clients-field">
                <label htmlFor="client-phone">
                  Telefone / WhatsApp
                </label>

                <input
                  id="client-phone"
                  name="telefone"
                  type="tel"
                  inputMode="tel"
                  maxLength={15}
                  value={
                    form.telefone
                  }
                  placeholder="81999999999"
                  disabled={
                    saving
                  }
                  onChange={
                    alterarForm
                  }
                />
              </div>

              <div className="clients-field">
                <label htmlFor="client-email">
                  E-mail
                </label>

                <input
                  id="client-email"
                  name="email"
                  type="email"
                  maxLength={254}
                  value={
                    form.email
                  }
                  placeholder="cliente@email.com"
                  disabled={
                    saving
                  }
                  onChange={
                    alterarForm
                  }
                />
              </div>

              <div className="clients-field clients-field--full">
                <label htmlFor="client-notes">
                  Observações internas
                </label>

                <textarea
                  id="client-notes"
                  name="observacoes"
                  rows={4}
                  maxLength={1000}
                  value={
                    form.observacoes
                  }
                  placeholder="Preferências, observações de atendimento, informações úteis..."
                  disabled={
                    saving
                  }
                  onChange={
                    alterarForm
                  }
                />
              </div>

              <div className="clients-form-actions">
                <button
                  type="button"
                  className="clients-secondary"
                  disabled={
                    saving
                  }
                  onClick={
                    fecharModal
                  }
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="clients-primary"
                  disabled={
                    saving
                  }
                >
                  {saving
                    ? "Salvando..."
                    : form.id
                      ? "Salvar alterações"
                      : "Cadastrar cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
