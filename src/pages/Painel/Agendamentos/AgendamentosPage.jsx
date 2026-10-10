import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import EmptyState from "../../../components/Painel/EmptyState/EmptyState";

import { useBarbearia } from "../../../hooks/useBarbearia";

import { supabase } from "../../../services/supabase";

import { formatarDataHora, formatarMoeda } from "../../../utils/formatters";

import "./AgendamentosPage.css";

const STATUS_OPTIONS = [
  ["todos", "Todos os status"],

  ["pendente", "Pendentes"],

  ["confirmado", "Confirmados"],

  ["concluido", "Concluídos"],

  ["cancelado", "Cancelados"],
];

function hojeLocal() {
  const agora = new Date();

  return [
    agora.getFullYear(),

    String(agora.getMonth() + 1).padStart(2, "0"),

    String(agora.getDate()).padStart(2, "0"),
  ].join("-");
}

function traduzirErro(error) {
  const mensagem = error?.message || "Não foi possível concluir a operação.";

  if (
    String(mensagem)
      .toLowerCase()

      .includes("não está mais disponível")
  ) {
    return "Esse horário acabou de ser ocupado. Escolha outro.";
  }

  return mensagem;
}

function nomeCliente(agendamento) {
  return agendamento.clientes?.nome || agendamento.cliente_nome || "Cliente";
}

export default function AgendamentosPage() {
  const {
    barbeariaId,

    barbearia,
  } = useBarbearia();

  const [agendamentos, setAgendamentos] = useState([]);

  const [servicos, setServicos] = useState([]);

  const [profissionais, setProfissionais] = useState([]);

  const [clientes, setClientes] = useState([]);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  const [filtroStatus, setFiltroStatus] = useState("todos");

  const [filtroPeriodo, setFiltroPeriodo] = useState("proximos");

  const [busca, setBusca] = useState("");

  const [modalOpen, setModalOpen] = useState(false);

  const [modalFinanceiro, setModalFinanceiro] = useState(null);
  const financeiroDialogRef = useRef(null);
  const solicitarDadosFinanceirosRef = useRef(0);
  const [dadosFinanceiros, setDadosFinanceiros] = useState(null);
  const [carregandoFinanceiro, setCarregandoFinanceiro] = useState(false);
  const [pagamentoFinanceiro, setPagamentoFinanceiro] = useState({
    tipo: "recebido", forma: "", vencimento: hojeLocal(),
  });

  const [tipoCliente, setTipoCliente] = useState("existente");

  const [form, setForm] = useState({
    clienteId: "",

    clienteNome: "",

    clienteTelefone: "",

    servicoId: "",

    profissionalId: "",

    data: hojeLocal(),

    dataHora: "",
  });

  const [horarios, setHorarios] = useState([]);

  const [loadingHorarios, setLoadingHorarios] = useState(false);

  const carregarDados = useCallback(async () => {
    if (!barbeariaId) {
      return;
    }

    setLoading(true);

    setErrorMessage("");

    try {
      const [
        agendamentosResult,

        servicosResult,

        profissionaisResult,

        clientesResult,
      ] = await Promise.all([
        supabase

          .from("agendamentos")

          .select(
            `

              id,

              cliente_id,

              servico_id,

              profissional_id,

              data_hora,

              status,

              cliente_nome,

              cliente_telefone,

              arquivado,

              created_at,

              clientes:cliente_id (

                id,

                nome,

                telefone,

                email

              ),

              servicos:servico_id (

                id,

                nome,

                preco,

                duracao

              ),

              profissionais:profissional_id (

                id,

                nome,

                ativo

              )

            `,
          )

          .eq("barbearia_id", barbeariaId)

          .eq("arquivado", false)

          .order("data_hora", {
            ascending: true,
          }),

        supabase

          .from("servicos")

          .select("id, nome, preco, duracao")

          .eq("barbearia_id", barbeariaId)

          .eq("ativo", true)
          .order("nome", {
            ascending: true,
          }),

        supabase

          .from("profissionais")

          .select("id, nome, ativo")

          .eq("barbearia_id", barbeariaId)

          .eq("ativo", true)

          .order("nome", {
            ascending: true,
          }),

        supabase

          .from("clientes_barbearias")

          .select(
            `

              cliente_id,

              clientes:cliente_id (

                id,

                nome,

                telefone,

                email

              )

            `,
          )

          .eq("barbearia_id", barbeariaId),
      ]);

      const resultados = [
        agendamentosResult,

        servicosResult,

        profissionaisResult,

        clientesResult,
      ];

      const primeiroErro = resultados.find((item) => item.error)?.error;

      if (primeiroErro) {
        throw primeiroErro;
      }

      setAgendamentos(agendamentosResult.data || []);

      setServicos(servicosResult.data || []);

      setProfissionais(profissionaisResult.data || []);

      setClientes(
        (clientesResult.data || [])

          .map((item) => item.clientes)

          .filter(Boolean)

          .sort((a, b) =>
            String(a.nome || "").localeCompare(
              String(b.nome || ""),

              "pt-BR",
            ),
          ),
      );
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao carregar agendamentos:",

        error,
      );

      setErrorMessage("Não foi possível carregar os agendamentos.");
    } finally {
      setLoading(false);
    }
  }, [barbeariaId]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const agendamentosFiltrados = useMemo(() => {
    const agora = new Date();

    return agendamentos.filter((item) => {
      if (filtroStatus !== "todos" && item.status !== filtroStatus) {
        return false;
      }

      const data = new Date(item.data_hora);

      if (filtroPeriodo === "proximos" && data < agora) {
        return false;
      }

      if (filtroPeriodo === "hoje") {
        const hoje = hojeLocal();

        const dataItem = [
          data.getFullYear(),

          String(data.getMonth() + 1).padStart(2, "0"),

          String(data.getDate()).padStart(2, "0"),
        ].join("-");

        if (dataItem !== hoje) {
          return false;
        }
      }

      const termo = busca.trim().toLowerCase();

      if (!termo) {
        return true;
      }

      return [
        nomeCliente(item),

        item.servicos?.nome,

        item.profissionais?.nome,

        item.cliente_telefone,
      ]

        .filter(Boolean)

        .some((valor) =>
          String(valor)
            .toLowerCase()

            .includes(termo),
        );
    });
  }, [agendamentos, filtroStatus, filtroPeriodo, busca]);

  async function carregarHorarios() {
    if (!form.data || !form.servicoId || !form.profissionalId) {
      setHorarios([]);

      return;
    }

    setLoadingHorarios(true);

    setErrorMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "buscar_horarios_disponiveis_painel",

        {
          p_barbearia_id: barbeariaId,

          p_profissional_id: form.profissionalId,

          p_servico_id: form.servicoId,

          p_data: form.data,
        },
      );

      if (error) {
        throw error;
      }

      setHorarios(data || []);

      setForm((atual) => ({
        ...atual,

        dataHora: "",
      }));
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao carregar horários:",

        error,
      );

      setHorarios([]);

      setErrorMessage(traduzirErro(error));
    } finally {
      setLoadingHorarios(false);
    }
  }

  useEffect(() => {
    if (!modalOpen) {
      return;
    }

    carregarHorarios();
  }, [modalOpen, form.data, form.servicoId, form.profissionalId]);

  function abrirNovoAgendamento() {
    setSuccessMessage("");

    setErrorMessage("");

    setTipoCliente(clientes.length ? "existente" : "novo");

    setForm({
      clienteId: "",

      clienteNome: "",

      clienteTelefone: "",

      servicoId: "",

      profissionalId: "",

      data: hojeLocal(),

      dataHora: "",
    });

    setHorarios([]);

    setModalOpen(true);
  }

  function fecharModal() {
    if (saving) {
      return;
    }

    setModalOpen(false);
  }

  function alterarForm(event) {
    const {
      name,

      value,
    } = event.target;

    setForm((atual) => ({
      ...atual,

      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setErrorMessage("");

    setSuccessMessage("");

    if (tipoCliente === "existente" && !form.clienteId) {
      setErrorMessage("Selecione um cliente.");

      return;
    }

    if (tipoCliente === "novo" && !form.clienteNome.trim()) {
      setErrorMessage("Informe o nome do cliente.");

      return;
    }

    if (!form.servicoId) {
      setErrorMessage("Selecione o serviço.");

      return;
    }

    if (!form.profissionalId) {
      setErrorMessage("Selecione o profissional.");

      return;
    }

    if (!form.dataHora) {
      setErrorMessage("Selecione um horário disponível.");

      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.rpc(
        "criar_agendamento_painel",

        {
          p_barbearia_id: barbeariaId,

          p_cliente_id: tipoCliente === "existente" ? form.clienteId : null,

          p_cliente_nome:
            tipoCliente === "novo" ? form.clienteNome.trim() : null,

          p_cliente_telefone:
            tipoCliente === "novo" ? form.clienteTelefone.trim() : null,

          p_servico_id: form.servicoId,

          p_profissional_id: form.profissionalId,

          p_data_hora: form.dataHora,
        },
      );

      if (error) {
        throw error;
      }

      setModalOpen(false);

      setSuccessMessage("Agendamento criado com sucesso.");

      await carregarDados();
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao criar agendamento:",

        error,
      );

      setErrorMessage(traduzirErro(error));

      await carregarHorarios();
    } finally {
      setSaving(false);
    }
  }

  function fecharConclusaoFinanceira() {
    if (saving) return;
    solicitarDadosFinanceirosRef.current += 1;
    setModalFinanceiro(null);
    setDadosFinanceiros(null);
    setCarregandoFinanceiro(false);
    setErrorMessage("");
  }

  useEffect(() => {
    if (!modalFinanceiro) return undefined;

    const anterior = document.activeElement;
    financeiroDialogRef.current?.focus();
    function aoPressionarTecla(event) {
      if (event.key === "Escape" && !saving) fecharConclusaoFinanceira();
    }
    document.addEventListener("keydown", aoPressionarTecla);
    return () => {
      document.removeEventListener("keydown", aoPressionarTecla);
      if (anterior instanceof HTMLElement && anterior.isConnected) anterior.focus();
    };
  }, [modalFinanceiro, saving]);

  async function abrirConclusaoFinanceira(agendamento) {
    if (saving || carregandoFinanceiro) return;
    setErrorMessage("");
    setSuccessMessage("");
    setModalFinanceiro(agendamento);
    setDadosFinanceiros(null);
    setCarregandoFinanceiro(true);
    setPagamentoFinanceiro({ tipo: "recebido", forma: "", vencimento: hojeLocal() });
    const sequencia = ++solicitarDadosFinanceirosRef.current;
    try {
      const { data, error } = await supabase.rpc(
        "obter_dados_conclusao_agendamento_051",
        { p_agendamento_id: agendamento.id },
      );
      if (sequencia !== solicitarDadosFinanceirosRef.current) return;
      if (error) throw error;
      if (!data?.length) throw new Error("Este agendamento não está mais disponível para conclusão.");
      setDadosFinanceiros(data[0]);
      if (Number(data[0].valor) === 0) {
        setPagamentoFinanceiro((anterior) => ({ ...anterior, tipo: "gratuito" }));
      }
    } catch (error) {
      if (sequencia === solicitarDadosFinanceirosRef.current) {
        console.error("[BarberHub] Carregar dados financeiros do atendimento:", error);
        setErrorMessage(traduzirErro(error));
      }
    } finally {
      if (sequencia === solicitarDadosFinanceirosRef.current) {
        setCarregandoFinanceiro(false);
      }
    }
  }

  async function concluirFinanceiramente(event) {
    event.preventDefault();
    if (!modalFinanceiro || !dadosFinanceiros || saving) return;
    const gratis = Number(dadosFinanceiros.valor) === 0;
    const tipo = gratis ? "gratuito" : pagamentoFinanceiro.tipo;
    if (tipo === "recebido" && !pagamentoFinanceiro.forma) {
      setErrorMessage("Selecione uma forma de pagamento.");
      return;
    }
    if (tipo === "a_receber" && (!pagamentoFinanceiro.vencimento ||
        pagamentoFinanceiro.vencimento < hojeLocal())) {
      setErrorMessage("Informe uma data de vencimento válida.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    try {
      const { error } = await supabase.rpc("concluir_agendamento_financeiro_051", {
        p_agendamento_id: modalFinanceiro.id,
        p_recebimento: tipo,
        p_forma_pagamento: tipo === "recebido" ? pagamentoFinanceiro.forma : null,
        p_vencimento: tipo === "a_receber" ? pagamentoFinanceiro.vencimento : null,
      });
      if (error) throw error;
      setModalFinanceiro(null);
      setDadosFinanceiros(null);
      setSuccessMessage(gratis
        ? "Atendimento gratuito concluído."
        : tipo === "recebido"
          ? "Atendimento concluído e pagamento registrado."
          : "Atendimento concluído e conta a receber criada.");
      await carregarDados();
    } catch (error) {
      console.error("[BarberHub] Conclusão financeira do atendimento:", error);
      setErrorMessage(traduzirErro(error));
    } finally {
      setSaving(false);
    }
  }

  async function atualizarStatus(
    agendamento,

    novoStatus,
  ) {
    if (novoStatus === "concluido") {
      await abrirConclusaoFinanceira(agendamento);
      return;
    }
    const mensagens = {
      confirmado: "Confirmar este agendamento?",

      cancelado: "Cancelar este agendamento?",
    };

    if (mensagens[novoStatus] && !window.confirm(mensagens[novoStatus])) {
      return;
    }

    setErrorMessage("");

    setSuccessMessage("");

    try {
      const { error } = await supabase.rpc(
        "atualizar_status_agendamento_painel",

        {
          p_agendamento_id: agendamento.id,

          p_status: novoStatus,
        },
      );

      if (error) {
        throw error;
      }

      setSuccessMessage("Status atualizado com sucesso.");

      await carregarDados();
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao atualizar agendamento:",

        error,
      );

      setErrorMessage(traduzirErro(error));
    }
  }

  return (
    <section className="appointments-page">
      <div className="appointments-heading">
        <div>
          <span className="appointments-eyebrow">AGENDA</span>

          <h1>Agendamentos</h1>

          <p>
            Gerencie os horários de{" "}
            <strong>{barbearia?.nome || "sua barbearia"}</strong>.
          </p>
        </div>

        <button
          type="button"
          className="appointments-primary-button"
          onClick={abrirNovoAgendamento}
        >
          ＋ Novo agendamento
        </button>
      </div>

      {errorMessage ? (
        <div className="appointments-message appointments-message--error">
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {successMessage ? (
        <div className="appointments-message appointments-message--success">
          <span>{successMessage}</span>
        </div>
      ) : null}

      <div className="appointments-toolbar">
        <div className="appointments-search">
          <span aria-hidden="true">⌕</span>

          <input
            type="search"
            value={busca}
            placeholder="Buscar cliente, serviço ou profissional..."
            onChange={(event) => setBusca(event.target.value)}
          />
        </div>

        <div className="appointments-filter-group">
          <button
            type="button"
            className={
              filtroPeriodo === "hoje"
                ? "appointments-filter appointments-filter--active"
                : "appointments-filter"
            }
            onClick={() => setFiltroPeriodo("hoje")}
          >
            Hoje
          </button>

          <button
            type="button"
            className={
              filtroPeriodo === "proximos"
                ? "appointments-filter appointments-filter--active"
                : "appointments-filter"
            }
            onClick={() => setFiltroPeriodo("proximos")}
          >
            Próximos
          </button>

          <button
            type="button"
            className={
              filtroPeriodo === "todos"
                ? "appointments-filter appointments-filter--active"
                : "appointments-filter"
            }
            onClick={() => setFiltroPeriodo("todos")}
          >
            Todos
          </button>
        </div>

        <select
          className="appointments-select"
          value={filtroStatus}
          onChange={(event) => setFiltroStatus(event.target.value)}
        >
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="appointments-refresh"
          onClick={carregarDados}
          disabled={loading}
        >
          ↻ Atualizar
        </button>
      </div>

      <div className="appointments-summary">
        <div>
          <span>EXIBINDO</span>

          <strong>{loading ? "..." : agendamentosFiltrados.length}</strong>
        </div>

        <p>Agendamentos encontrados com os filtros atuais.</p>
      </div>

      {loading ? (
        <div className="appointments-loading">Carregando agendamentos...</div>
      ) : agendamentosFiltrados.length ? (
        <div className="appointments-list">
          {agendamentosFiltrados.map((item) => (
            <article className="appointments-card" key={item.id}>
              <div className="appointments-card-date">
                <strong>
                  {new Date(item.data_hora).toLocaleDateString(
                    "pt-BR",

                    {
                      day: "2-digit",

                      month: "short",
                    },
                  )}
                </strong>

                <span>
                  {new Date(item.data_hora).toLocaleTimeString(
                    "pt-BR",

                    {
                      hour: "2-digit",

                      minute: "2-digit",
                    },
                  )}
                </span>
              </div>

              <div className="appointments-card-main">
                <div className="appointments-card-title">
                  <strong>{nomeCliente(item)}</strong>

                  <span
                    className={`appointments-status appointments-status--${item.status}`}
                  >
                    {item.status}
                  </span>
                </div>

                <div className="appointments-card-details">
                  <span>✂️ {item.servicos?.nome || "Serviço"}</span>

                  <span>💈 {item.profissionais?.nome || "Profissional"}</span>

                  <span>⏱ {item.servicos?.duracao || 30} min</span>

                  <span>💰 {formatarMoeda(item.servicos?.preco)}</span>
                </div>

                <small>{formatarDataHora(item.data_hora)}</small>
              </div>

              <div className="appointments-card-actions">
                {item.status === "pendente" ? (
                  <button
                    type="button"
                    className="appointments-action appointments-action--confirm"
                    onClick={() =>
                      atualizarStatus(
                        item,

                        "confirmado",
                      )
                    }
                  >
                    Confirmar
                  </button>
                ) : null}

                {item.status === "confirmado" ? (
                  <button
                    type="button"
                    className="appointments-action appointments-action--finish"
                    onClick={() =>
                      abrirConclusaoFinanceira(item)
                    }
                  >
                    Concluir
                  </button>
                ) : null}

                {["pendente", "confirmado"].includes(item.status) ? (
                  <button
                    type="button"
                    className="appointments-action appointments-action--cancel"
                    onClick={() =>
                      atualizarStatus(
                        item,

                        "cancelado",
                      )
                    }
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="📅"
          title="Nenhum agendamento encontrado"
          description="Altere os filtros ou crie um novo agendamento."
        />
      )}

      {modalFinanceiro ? (
        <div className="appointments-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) {
            fecharConclusaoFinanceira();
          }
        }}>
          <div className="appointments-modal appointments-finance-modal" role="dialog"
            aria-modal="true" aria-labelledby="appointments-finance-title"
            aria-describedby="appointments-finance-description"
            ref={financeiroDialogRef} tabIndex={-1}>
            <div className="appointments-modal-header">
              <div>
                <span className="appointments-eyebrow">CONCLUSÃO FINANCEIRA</span>
                <h2 id="appointments-finance-title">Concluir atendimento</h2>
                <p id="appointments-finance-description">
                  {nomeCliente(modalFinanceiro)} · {dadosFinanceiros?.servico_nome || modalFinanceiro.servicos?.nome || "Serviço"}
                </p>
              </div>
              <button className="appointments-modal-close" type="button"
                disabled={saving} aria-label="Fechar"
                onClick={fecharConclusaoFinanceira}>×</button>
            </div>
            {carregandoFinanceiro ? (
              <p className="appointments-finance-help" role="status">
                Consultando o valor original contratado...
              </p>
            ) : !dadosFinanceiros ? (
              <div className="appointments-finance-load-error" role="alert">
                <p>{errorMessage || "Não foi possível consultar os dados financeiros deste atendimento."}</p>
                <button type="button" className="appointments-secondary-button"
                  onClick={() => abrirConclusaoFinanceira(modalFinanceiro)}>
                  ↻ Tentar novamente
                </button>
              </div>
            ) : (
              <form className="appointments-finance-form" onSubmit={concluirFinanceiramente}>
                <div className="appointments-finance-total">
                  <span>Valor registrado no agendamento</span>
                  <strong>{formatarMoeda(dadosFinanceiros.valor)}</strong>
                </div>
                {Number(dadosFinanceiros.valor) > 0 ? (
                  <>
                    <fieldset className="appointments-finance-choices" disabled={saving}>
                      <legend>Como será recebido o valor deste atendimento?</legend>
                      <label>
                        <input type="radio" name="tipoPagamentoAgendamento" value="recebido"
                          checked={pagamentoFinanceiro.tipo === "recebido"}
                          onChange={() => setPagamentoFinanceiro((a) => ({ ...a, tipo: "recebido" }))}/>
                        Pagamento recebido agora
                      </label>
                      <label>
                        <input type="radio" name="tipoPagamentoAgendamento" value="a_receber"
                          checked={pagamentoFinanceiro.tipo === "a_receber"}
                          onChange={() => setPagamentoFinanceiro((a) => ({ ...a, tipo: "a_receber" }))}/>
                        Receber depois (Contas a Receber)
                      </label>
                    </fieldset>
                    {pagamentoFinanceiro.tipo === "recebido" ? (
                      <div className="appointments-field">
                        <label htmlFor="appointments-finance-forma">Forma de pagamento recebida *</label>
                        <select id="appointments-finance-forma" value={pagamentoFinanceiro.forma}
                          required disabled={saving}
                          onChange={(e) => setPagamentoFinanceiro((a) => ({ ...a, forma: e.target.value }))}>
                          <option value="">Selecione...</option>
                          <option value="dinheiro">Dinheiro</option>
                          <option value="pix">Pix</option>
                          <option value="debito">Cartão de débito</option>
                          <option value="credito">Cartão de crédito</option>
                          <option value="outro">Outro</option>
                        </select>
                      </div>
                    ) : (
                      <div className="appointments-field">
                        <label htmlFor="appointments-finance-vencimento">Data de vencimento *</label>
                        <input id="appointments-finance-vencimento" type="date"
                          min={hojeLocal()} value={pagamentoFinanceiro.vencimento}
                          disabled={saving} required
                          onChange={(e) => setPagamentoFinanceiro((a) => ({ ...a, vencimento: e.target.value }))}/>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="appointments-finance-help">Este atendimento é gratuito. Não haverá lançamento de recebimento.</p>
                )}
                <p className="appointments-finance-help">
                  O status e o lançamento financeiro serão salvos juntos. Essa conclusão não pode ser repetida.
                </p>
                {errorMessage ? <p role="alert" className="appointments-finance-error">{errorMessage}</p> : null}
                <div className="appointments-form-actions">
                  <button type="button" className="appointments-secondary-button"
                    onClick={fecharConclusaoFinanceira} disabled={saving}>Voltar</button>
                  <button type="submit" className="appointments-primary-button" disabled={saving}>
                    {saving ? "Concluindo..." : "Concluir com registro financeiro"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div
          className="appointments-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              fecharModal();
            }
          }}
        >
          <div
            className="appointments-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointments-modal-title"
          >
            <div className="appointments-modal-header">
              <div>
                <span className="appointments-eyebrow">NOVO HORÁRIO</span>

                <h2 id="appointments-modal-title">Novo agendamento</h2>

                <p>
                  Selecione cliente, serviço, profissional e um horário
                  realmente disponível.
                </p>
              </div>

              <button
                type="button"
                className="appointments-modal-close"
                aria-label="Fechar"
                onClick={fecharModal}
              >
                ×
              </button>
            </div>

            <form
              className="appointments-form"
              onSubmit={handleSubmit}
              noValidate
            >
              <div className="appointments-client-type">
                <button
                  type="button"
                  className={
                    tipoCliente === "existente"
                      ? "appointments-client-type-button appointments-client-type-button--active"
                      : "appointments-client-type-button"
                  }
                  onClick={() => setTipoCliente("existente")}
                  disabled={!clientes.length}
                >
                  Cliente existente
                </button>

                <button
                  type="button"
                  className={
                    tipoCliente === "novo"
                      ? "appointments-client-type-button appointments-client-type-button--active"
                      : "appointments-client-type-button"
                  }
                  onClick={() => setTipoCliente("novo")}
                >
                  Novo cliente
                </button>
              </div>

              {tipoCliente === "existente" ? (
                <div className="appointments-field appointments-field--full">
                  <label htmlFor="appointment-client">Cliente *</label>

                  <select
                    id="appointment-client"
                    name="clienteId"
                    value={form.clienteId}
                    onChange={alterarForm}
                    disabled={saving}
                  >
                    <option value="">Selecione...</option>

                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.nome}

                        {cliente.telefone ? ` · ${cliente.telefone}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="appointments-field">
                    <label htmlFor="appointment-client-name">
                      Nome do cliente *
                    </label>

                    <input
                      id="appointment-client-name"
                      name="clienteNome"
                      type="text"
                      value={form.clienteNome}
                      placeholder="Nome completo"
                      maxLength={120}
                      disabled={saving}
                      onChange={alterarForm}
                    />
                  </div>

                  <div className="appointments-field">
                    <label htmlFor="appointment-client-phone">
                      Telefone / WhatsApp
                    </label>

                    <input
                      id="appointment-client-phone"
                      name="clienteTelefone"
                      type="tel"
                      value={form.clienteTelefone}
                      placeholder="(81) 99999-9999"
                      maxLength={20}
                      disabled={saving}
                      onChange={alterarForm}
                    />
                  </div>
                </>
              )}

              <div className="appointments-field">
                <label htmlFor="appointment-service">Serviço *</label>

                <select
                  id="appointment-service"
                  name="servicoId"
                  value={form.servicoId}
                  onChange={alterarForm}
                  disabled={saving}
                >
                  <option value="">Selecione...</option>

                  {servicos.map((servico) => (
                    <option key={servico.id} value={servico.id}>
                      {servico.nome} · {servico.duracao} min ·{" "}
                      {formatarMoeda(servico.preco)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="appointments-field">
                <label htmlFor="appointment-professional">Profissional *</label>

                <select
                  id="appointment-professional"
                  name="profissionalId"
                  value={form.profissionalId}
                  onChange={alterarForm}
                  disabled={saving}
                >
                  <option value="">Selecione...</option>

                  {profissionais.map((profissional) => (
                    <option key={profissional.id} value={profissional.id}>
                      {profissional.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="appointments-field">
                <label htmlFor="appointment-date">Data *</label>

                <input
                  id="appointment-date"
                  name="data"
                  type="date"
                  min={hojeLocal()}
                  value={form.data}
                  disabled={saving}
                  onChange={alterarForm}
                />
              </div>

              <div className="appointments-field">
                <label htmlFor="appointment-time">Horário *</label>

                <select
                  id="appointment-time"
                  name="dataHora"
                  value={form.dataHora}
                  disabled={
                    saving ||
                    loadingHorarios ||
                    !form.servicoId ||
                    !form.profissionalId
                  }
                  onChange={alterarForm}
                >
                  <option value="">
                    {loadingHorarios ? "Carregando..." : "Selecione..."}
                  </option>

                  {horarios.map((horario) => (
                    <option key={horario.data_hora} value={horario.data_hora}>
                      {horario.hora}
                    </option>
                  ))}
                </select>

                {!loadingHorarios &&
                form.servicoId &&
                form.profissionalId &&
                !horarios.length ? (
                  <small>Nenhum horário disponível para esta data.</small>
                ) : null}
              </div>

              <div className="appointments-form-actions">
                <button
                  type="button"
                  className="appointments-secondary-button"
                  onClick={fecharModal}
                  disabled={saving}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="appointments-primary-button"
                  disabled={saving}
                >
                  {saving ? "Salvando..." : "Confirmar agendamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
