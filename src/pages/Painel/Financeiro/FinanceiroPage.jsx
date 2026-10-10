import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import EmptyState from "../../../components/Painel/EmptyState/EmptyState";
import { useBarbearia } from "../../../hooks/useBarbearia";
import { supabase } from "../../../services/supabase";
import {
  formatarData,
  formatarMoeda,
  obterDataISOHoje,
  obterPeriodoMesAtual,
} from "../../../utils/formatters";
import {
  abrirResumoFinanceiroWhatsapp,
  gerarRelatorioFinanceiroPdf,
} from "../../../utils/relatorioFinanceiro";
import MovimentacoesFinanceiras from "./MovimentacoesFinanceiras";
import "./FinanceiroPage.css";

const RESUMO_VAZIO = {
  servicos_concluidos: 0,
  faturamento_servicos: 0,
  vendas_produtos: 0,
  faturamento_produtos: 0,
  entradas: 0,
  despesas: 0,
  comissoes_estimadas: 0,
  resultado_liquido: 0,
};

const CATEGORIAS = [
  "Aluguel",
  "Água",
  "Energia",
  "Internet",
  "Produtos e insumos",
  "Manutenção",
  "Impostos",
  "Salários",
  "Outros",
];
const PAGAMENTOS = [
  "Dinheiro",
  "Pix",
  "Débito",
  "Crédito",
  "Boleto",
  "Transferência",
];

function formularioVazio(timezone) {
  return {
    id: null,
    descricao: "",
    valor: "",
    categoria: "",
    dataGasto: obterDataISOHoje(timezone),
    pagamento: "",
    observacao: "",
  };
}

function mensagemErro(error, fallback) {
  return typeof error?.message === "string" && error.message.trim()
    ? error.message
    : fallback;
}

function calcularMargem(resumo) {
  const entradas = Number(resumo?.entradas || 0);
  if (entradas <= 0) return 0;
  return (Number(resumo?.resultado_liquido || 0) / entradas) * 100;
}

export default function FinanceiroPage() {
  const { barbeariaId, barbearia } = useBarbearia();
  const timezone = barbearia?.timezone || "America/Recife";
  const [filtros, setFiltros] = useState(() => obterPeriodoMesAtual());
  const [periodoConsulta, setPeriodoConsulta] = useState(() =>
    obterPeriodoMesAtual(),
  );
  const [resumo, setResumo] = useState(RESUMO_VAZIO);
  const [gastos, setGastos] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [carregado, setCarregado] = useState(null);
  const [erroConsulta, setErroConsulta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [arquivandoId, setArquivandoId] = useState(null);
  const [exportando, setExportando] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(() => formularioVazio("America/Recife"));
  const [erroFormulario, setErroFormulario] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const modalRef = useRef(null);
  const abrirModalRef = useRef(null);
  const sequenciaRequisicaoRef = useRef(0);

  const periodoValido = Boolean(
    filtros.inicial && filtros.final && filtros.inicial <= filtros.final,
  );
  const filtrosAplicados =
    filtros.inicial === periodoConsulta.inicial &&
    filtros.final === periodoConsulta.final;
  const prontoParaExportar =
    Boolean(barbeariaId) &&
    !loading &&
    !erroConsulta &&
    !exportando &&
    !saving &&
    !arquivandoId &&
    filtrosAplicados &&
    carregado?.barbeariaId === barbeariaId &&
    carregado?.inicial === periodoConsulta.inicial &&
    carregado?.final === periodoConsulta.final;

  const mostrarMensagem = useCallback((tipo, conteudo) => {
    setMessageType(tipo);
    setMessage(conteudo);
  }, []);

  const carregar = useCallback(async () => {
    const requisicao = ++sequenciaRequisicaoRef.current;
    if (!barbeariaId) {
      setLoading(false);
      setResumo(RESUMO_VAZIO);
      setGastos([]);
      setMovimentacoes([]);
      setCarregado(null);
      return false;
    }
    setLoading(true);
    setErroConsulta(false);
    try {
      const parametros = {
        p_barbearia_id: barbeariaId,
        p_data_inicial: periodoConsulta.inicial,
        p_data_final: periodoConsulta.final,
      };
      const respostas = await Promise.all([
        supabase.rpc("obter_financeiro_painel", parametros),
        supabase.rpc("listar_gastos_painel", parametros),
        supabase.rpc("listar_movimentacoes_financeiras_painel", parametros),
      ]);
      for (const resposta of respostas) {
        if (resposta.error) throw resposta.error;
      }
      if (requisicao !== sequenciaRequisicaoRef.current) return false;
      const [respostaResumo, respostaGastos, respostaMovimentacoes] = respostas;
      setResumo({ ...RESUMO_VAZIO, ...(respostaResumo.data?.[0] || {}) });
      setGastos(respostaGastos.data || []);
      setMovimentacoes(respostaMovimentacoes.data || []);
      setCarregado({ barbeariaId, ...periodoConsulta });
      setMessage("");
      return true;
    } catch (error) {
      if (requisicao !== sequenciaRequisicaoRef.current) return false;
      console.error("[BarberHub] Falha ao consultar financeiro:", error);
      setResumo(RESUMO_VAZIO);
      setGastos([]);
      setMovimentacoes([]);
      setCarregado(null);
      setErroConsulta(true);
      mostrarMensagem(
        "error",
        mensagemErro(error, "Não foi possível carregar o financeiro."),
      );
      return false;
    } finally {
      if (requisicao === sequenciaRequisicaoRef.current) setLoading(false);
    }
  }, [barbeariaId, periodoConsulta, mostrarMensagem]);

  useEffect(() => {
    void carregar();
    return () => {
      sequenciaRequisicaoRef.current += 1;
    };
  }, [carregar]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    const anterior = document.activeElement;
    modalRef.current?.querySelector("input")?.focus();
    return () => {
      if (anterior instanceof HTMLElement && anterior.isConnected)
        anterior.focus();
    };
  }, [modalOpen]);

  const margem = useMemo(() => calcularMargem(resumo), [resumo]);
  const ocupado = saving || Boolean(arquivandoId);

  function mudarFiltro(campo, valor) {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
    setMessage("");
  }

  function atualizarPeriodo() {
    if (!periodoValido) {
      mostrarMensagem(
        "error",
        "Informe um período válido (data inicial até data final).",
      );
      return;
    }
    setPeriodoConsulta({ ...filtros });
  }

  function abrirNovo() {
    setForm(formularioVazio(timezone));
    setErroFormulario("");
    setMessage("");
    setModalOpen(true);
  }

  function editarGasto(gasto) {
    setForm({
      id: gasto.gasto_id,
      descricao: gasto.descricao || "",
      valor: String(gasto.valor ?? ""),
      categoria: gasto.categoria || "",
      dataGasto: gasto.data_gasto || obterDataISOHoje(timezone),
      pagamento: gasto.pagamento || "",
      observacao: gasto.observacao || "",
    });
    setErroFormulario("");
    setMessage("");
    setModalOpen(true);
  }

  function fecharModal() {
    if (!saving) setModalOpen(false);
  }

  function tratarTecladoModal(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      fecharModal();
    }
    if (event.key !== "Tab") return;
    const elementos = Array.from(
      modalRef.current?.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) || [],
    );
    if (!elementos.length) return;
    const primeiro = elementos[0];
    const ultimo = elementos[elementos.length - 1];
    if (event.shiftKey && document.activeElement === primeiro) {
      event.preventDefault();
      ultimo.focus();
    } else if (!event.shiftKey && document.activeElement === ultimo) {
      event.preventDefault();
      primeiro.focus();
    }
  }

  async function salvarGasto(event) {
    event.preventDefault();
    if (saving || !barbeariaId) return;
    const descricao = form.descricao.trim();
    const valor = Number(String(form.valor).replace(",", "."));
    if (!descricao || descricao.length > 160) {
      setErroFormulario("Informe uma descrição de até 160 caracteres.");
      return;
    }
    if (!Number.isFinite(valor) || valor <= 0 || valor > 99999999.99) {
      setErroFormulario("Informe um valor válido, maior que zero.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dataGasto)) {
      setErroFormulario("Informe a data do gasto.");
      return;
    }
    const editando = Boolean(form.id);
    setErroFormulario("");
    setSaving(true);
    try {
      const { error } = await supabase.rpc("salvar_gasto_painel", {
        p_barbearia_id: barbeariaId,
        p_gasto_id: form.id,
        p_descricao: descricao,
        p_valor: valor,
        p_categoria: form.categoria.trim() || null,
        p_data_gasto: form.dataGasto,
        p_pagamento: form.pagamento.trim() || null,
        p_observacao: form.observacao.trim() || null,
      });
      if (error) throw error;
      setModalOpen(false);
      const atualizado = await carregar();
      if (atualizado)
        mostrarMensagem(
          "success",
          editando
            ? "Gasto atualizado com sucesso."
            : "Gasto registrado com sucesso.",
        );
    } catch (error) {
      console.error("[BarberHub] Falha ao salvar gasto:", error);
      setErroFormulario(
        mensagemErro(error, "Não foi possível salvar o gasto."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function arquivarGasto(gasto) {
    if (!barbeariaId || ocupado) return;
    const confirmou = window.confirm(
      `Arquivar o gasto "${gasto.descricao}"? Ele sairá da lista de edição, mas CONTINUARÁ nos totais e no histórico financeiro.`,
    );
    if (!confirmou) return;
    setArquivandoId(gasto.gasto_id);
    try {
      const { error } = await supabase.rpc("arquivar_gasto_painel", {
        p_barbearia_id: barbeariaId,
        p_gasto_id: gasto.gasto_id,
      });
      if (error) throw error;
      const atualizado = await carregar();
      if (atualizado)
        mostrarMensagem(
          "success",
          "Gasto arquivado. Ele permanece nos cálculos financeiros.",
        );
    } catch (error) {
      console.error("[BarberHub] Falha ao arquivar gasto:", error);
      mostrarMensagem(
        "error",
        mensagemErro(error, "Não foi possível arquivar o gasto."),
      );
    } finally {
      setArquivandoId(null);
    }
  }

  async function gerarPdf() {
    if (!prontoParaExportar) return;
    setExportando(true);
    try {
      await gerarRelatorioFinanceiroPdf({
        barbearia,
        periodo: { ...periodoConsulta },
        resumo,
        gastos,
        movimentacoes,
      });
    } catch (error) {
      console.error("[BarberHub] Falha ao gerar PDF:", error);
      mostrarMensagem(
        "error",
        "Não foi possível gerar o PDF. Tente novamente.",
      );
    } finally {
      setExportando(false);
    }
  }

  function enviarWhatsapp() {
    if (!prontoParaExportar) return;
    try {
      abrirResumoFinanceiroWhatsapp({
        barbearia,
        periodo: { ...periodoConsulta },
        resumo,
        movimentacoes,
      });
    } catch (error) {
      console.error("[BarberHub] Falha ao abrir WhatsApp:", error);
      mostrarMensagem("error", "Não foi possível abrir o WhatsApp.");
    }
  }

  return (
    <section className="finance-page">
      <div className="finance-heading">
        <div>
          <span className="finance-eyebrow">RESULTADOS</span>
          <h1>Financeiro</h1>
          <p>
            Visão operacional de{" "}
            <strong>{barbearia?.nome || "sua barbearia"}</strong>. Valores de
            atendimentos concluídos não representam necessariamente pagamentos
            recebidos.
          </p>
        </div>
        <button
          ref={abrirModalRef}
          type="button"
          className="finance-primary"
          disabled={!barbeariaId || ocupado}
          onClick={abrirNovo}
        >
          ＋ Registrar gasto
        </button>
      </div>

      {message && (
        <div
          className={`finance-message finance-message--${messageType}`}
          role={messageType === "error" ? "alert" : "status"}
        >
          {message}
        </div>
      )}

      <div className="finance-period">
        <div>
          <label htmlFor="finance-start">Data inicial</label>
          <input
            id="finance-start"
            type="date"
            value={filtros.inicial}
            onChange={(e) => mudarFiltro("inicial", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="finance-end">Data final</label>
          <input
            id="finance-end"
            type="date"
            value={filtros.final}
            onChange={(e) => mudarFiltro("final", e.target.value)}
          />
        </div>
        <button
          type="button"
          className="finance-secondary"
          disabled={loading || !barbeariaId || !periodoValido}
          onClick={atualizarPeriodo}
        >
          ↻ Atualizar
        </button>
        <button
          type="button"
          className="finance-secondary"
          disabled={!prontoParaExportar}
          onClick={enviarWhatsapp}
        >
          📲 WhatsApp
        </button>
        <button
          type="button"
          className="finance-secondary"
          disabled={!prontoParaExportar}
          onClick={() => {
            void gerarPdf();
          }}
        >
          {exportando ? "Gerando PDF..." : "📄 Relatório PDF"}
        </button>
      </div>

      {!filtrosAplicados && (
        <p className="finance-notice" role="status">
          Período alterado. Clique em <strong>Atualizar</strong> para consultar
          os dados e habilitar os relatórios.
        </p>
      )}
      {!barbeariaId && (
        <div className="finance-loading" role="status">
          Selecione uma barbearia para consultar seu financeiro.
        </div>
      )}

      <div className="finance-stats" aria-busy={loading}>
        {[
          [
            "✂️",
            "SERVIÇOS RECEBIDOS*",
            formatarMoeda(resumo.faturamento_servicos),
            `${resumo.servicos_concluidos} concluído(s)`,
          ],
          [
            "🛍️",
            "PRODUTOS RECEBIDOS",
            formatarMoeda(resumo.faturamento_produtos),
            `${resumo.vendas_produtos} venda(s)`,
          ],
          [
            "📈",
            "ENTRADAS",
            formatarMoeda(resumo.entradas),
            "Recebimentos registrados no período",
          ],
          [
            "📉",
            "DESPESAS",
            formatarMoeda(resumo.despesas),
            "Inclui gastos arquivados",
          ],
          [
            "👤",
            "COMISSÕES",
            formatarMoeda(resumo.comissoes_estimadas),
            "Estimativa dos profissionais",
          ],
          [
            "💰",
            "RESULTADO OPERACIONAL",
            formatarMoeda(resumo.resultado_liquido),
            `Margem ${margem.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
          ],
        ].map(([icone, titulo, valor, legenda], index) => (
          <article
            key={titulo}
            className={index === 5 ? "finance-result-card" : undefined}
          >
            <span aria-hidden="true">{icone}</span>
            <div>
              <small>{titulo}</small>
              <strong>{loading ? "..." : valor}</strong>
              <p>{legenda}</p>
            </div>
          </article>
        ))}
      </div>

      <p className="finance-notice">
        * Os atendimentos ainda dependem da etapa de conciliação 051. A
        migration 050 corrige somente a confirmação financeira de pedidos; não
        considere serviços antigos com estado padrão “pago” como comprovados.
      </p>

      <MovimentacoesFinanceiras
        movimentacoes={movimentacoes}
        timezone={timezone}
        loading={loading}
        error={erroConsulta}
      />

      <section
        className="finance-section"
        aria-labelledby="finance-gastos-titulo"
      >
        <div className="finance-section-heading">
          <div>
            <span className="finance-eyebrow">SAÍDAS</span>
            <h2 id="finance-gastos-titulo">Gastos ativos do período</h2>
            <p>
              {formatarData(periodoConsulta.inicial)} até{" "}
              {formatarData(periodoConsulta.final)} — gastos arquivados
              permanecem nos totais.
            </p>
          </div>
          <strong>{loading ? "..." : formatarMoeda(resumo.despesas)}</strong>
        </div>
        {loading ? (
          <div className="finance-loading" role="status">
            Carregando gastos...
          </div>
        ) : erroConsulta ? (
          <div className="finance-loading">
            Não foi possível carregar os gastos. Tente atualizar.
          </div>
        ) : gastos.length ? (
          <div className="finance-expenses">
            {gastos.map((gasto) => (
              <article key={gasto.gasto_id} className="finance-expense">
                <div className="finance-expense-icon" aria-hidden="true">
                  📉
                </div>
                <div className="finance-expense-main">
                  <span className="finance-eyebrow">
                    {gasto.categoria || "GASTO"}
                  </span>
                  <h3>{gasto.descricao}</h3>
                  <p>
                    {formatarData(gasto.data_gasto)}
                    {gasto.pagamento ? ` · ${gasto.pagamento}` : ""}
                  </p>
                  {gasto.observacao && <small>{gasto.observacao}</small>}
                </div>
                <strong className="finance-expense-value">
                  {formatarMoeda(gasto.valor)}
                </strong>
                <div className="finance-expense-actions">
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => editarGasto(gasto)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="finance-danger"
                    disabled={ocupado}
                    onClick={() => {
                      void arquivarGasto(gasto);
                    }}
                  >
                    {arquivandoId === gasto.gasto_id
                      ? "Arquivando..."
                      : "Arquivar"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="📉"
            title="Nenhum gasto ativo no período"
            description="Gastos arquivados não aparecem nesta lista, mas permanecem nos cálculos financeiros."
          />
        )}
      </section>

      {modalOpen && (
        <div
          className="finance-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) fecharModal();
          }}
        >
          <div
            ref={modalRef}
            className="finance-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finance-modal-title"
            onKeyDown={tratarTecladoModal}
          >
            <div className="finance-modal-header">
              <div>
                <span className="finance-eyebrow">
                  {form.id ? "EDITAR GASTO" : "NOVO GASTO"}
                </span>
                <h2 id="finance-modal-title">
                  {form.id ? "Editar gasto" : "Registrar gasto"}
                </h2>
                <p>
                  Esta despesa será contabilizada no resultado operacional.
                  Alterações ficam registradas no histórico de auditoria.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar formulário"
                disabled={saving}
                onClick={fecharModal}
              >
                ×
              </button>
            </div>
            {erroFormulario && (
              <div
                className="finance-message finance-message--error"
                role="alert"
              >
                {erroFormulario}
              </div>
            )}
            <form
              className="finance-form"
              onSubmit={(e) => {
                void salvarGasto(e);
              }}
            >
              <div className="finance-field finance-field--full">
                <label htmlFor="gasto-descricao">Descrição *</label>
                <input
                  id="gasto-descricao"
                  required
                  maxLength={160}
                  type="text"
                  value={form.descricao}
                  disabled={saving}
                  placeholder="Ex.: Conta de energia"
                  onChange={(e) =>
                    setForm((a) => ({ ...a, descricao: e.target.value }))
                  }
                />
              </div>
              <div className="finance-field">
                <label htmlFor="gasto-valor">Valor (R$) *</label>
                <input
                  id="gasto-valor"
                  required
                  type="number"
                  min="0.01"
                  max="99999999.99"
                  step="0.01"
                  inputMode="decimal"
                  value={form.valor}
                  disabled={saving}
                  placeholder="0,00"
                  onChange={(e) =>
                    setForm((a) => ({ ...a, valor: e.target.value }))
                  }
                />
              </div>
              <div className="finance-field">
                <label htmlFor="gasto-data">Data *</label>
                <input
                  id="gasto-data"
                  required
                  type="date"
                  value={form.dataGasto}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((a) => ({ ...a, dataGasto: e.target.value }))
                  }
                />
              </div>
              <div className="finance-field">
                <label htmlFor="gasto-categoria">Categoria</label>
                <select
                  id="gasto-categoria"
                  value={form.categoria}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((a) => ({ ...a, categoria: e.target.value }))
                  }
                >
                  <option value="">Selecione...</option>
                  {form.categoria && !CATEGORIAS.includes(form.categoria) && (
                    <option value={form.categoria}>{form.categoria}</option>
                  )}
                  {CATEGORIAS.map((categoria) => (
                    <option key={categoria} value={categoria}>
                      {categoria}
                    </option>
                  ))}
                </select>
              </div>
              <div className="finance-field">
                <label htmlFor="gasto-pagamento">Pagamento</label>
                <select
                  id="gasto-pagamento"
                  value={form.pagamento}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((a) => ({ ...a, pagamento: e.target.value }))
                  }
                >
                  <option value="">Não informado</option>
                  {form.pagamento && !PAGAMENTOS.includes(form.pagamento) && (
                    <option value={form.pagamento}>{form.pagamento}</option>
                  )}
                  {PAGAMENTOS.map((pagamento) => (
                    <option key={pagamento} value={pagamento}>
                      {pagamento}
                    </option>
                  ))}
                </select>
              </div>
              <div className="finance-field finance-field--full">
                <label htmlFor="gasto-observacao">Observação</label>
                <textarea
                  id="gasto-observacao"
                  rows={4}
                  maxLength={1000}
                  value={form.observacao}
                  disabled={saving}
                  placeholder="Informações adicionais..."
                  onChange={(e) =>
                    setForm((a) => ({ ...a, observacao: e.target.value }))
                  }
                />
              </div>
              <div className="finance-form-actions">
                <button
                  className="finance-secondary"
                  type="button"
                  disabled={saving}
                  onClick={fecharModal}
                >
                  Cancelar
                </button>
                <button
                  className="finance-primary"
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? "Salvando..."
                    : form.id
                      ? "Salvar alterações"
                      : "Registrar gasto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
