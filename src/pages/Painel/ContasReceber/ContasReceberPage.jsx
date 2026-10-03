import { useCallback, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";

import { useBarbearia } from "../../../hooks/useBarbearia";
import { supabase } from "../../../services/supabase";

import "./ContasReceberPage.css";

const STATUS_LABEL = {
  pendente: "Pendente",
  parcial: "Parcial",
  pago: "Pago",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

const FORMA_LABEL = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Débito",
  credito: "Crédito",
  outro: "Outro",
};

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataBR(valor) {
  if (!valor) return "—";
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function dataHoraBR(valor) {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function somenteDigitos(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function mensagemErro(error) {
  const texto = error?.message || "Não foi possível concluir a operação.";
  return texto;
}

async function imagemParaDataUrl(url) {
  if (!url) return null;

  try {
    const resposta = await fetch(url);
    if (!resposta.ok) return null;

    const blob = await resposta.blob();

    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export default function ContasReceberPage() {
  const { barbeariaId, barbearia } = useBarbearia();

  const [contas, setContas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [origens, setOrigens] = useState([]);
  const [pagamentos, setPagamentos] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingOrigens, setLoadingOrigens] = useState(false);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("abertas");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [modalNova, setModalNova] = useState(false);
  const [modalPagamento, setModalPagamento] = useState(false);
  const [modalHistorico, setModalHistorico] = useState(false);

  const [contaAtual, setContaAtual] = useState(null);

  const [formConta, setFormConta] = useState({
    clienteId: "",
    origemTipo: "manual",
    referenciaId: "",
    descricao: "",
    valor: "",
    vencimento: "",
    observacao: "",
  });

  const [formPagamento, setFormPagamento] = useState({
    valor: "",
    formaPagamento: "pix",
    pagoEm: new Date().toISOString().slice(0, 16),
    observacao: "",
  });

  const carregarDados = useCallback(async () => {
    if (!barbeariaId) return;

    setLoading(true);
    setErro("");

    try {
      const [contasResult, clientesResult] = await Promise.all([
        supabase.rpc("listar_contas_receber_painel", {
          p_barbearia_id: barbeariaId,
        }),
        supabase.rpc("listar_clientes_painel", {
          p_barbearia_id: barbeariaId,
        }),
      ]);

      if (contasResult.error) throw contasResult.error;
      if (clientesResult.error) throw clientesResult.error;

      setContas(contasResult.data || []);
      setClientes((clientesResult.data || []).filter((item) => item.ativo));
    } catch (error) {
      console.error("[BarberHub] Contas a receber:", error);
      setErro("Não foi possível carregar as contas a receber.");
    } finally {
      setLoading(false);
    }
  }, [barbeariaId]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const resumo = useMemo(() => {
    return contas.reduce(
      (acc, item) => {
        if (item.arquivada || item.status === "cancelado") return acc;

        if (item.status !== "pago") {
          acc.aReceber += Number(item.saldo || 0);
          acc.abertas += 1;
        }

        if (item.status === "vencido") {
          acc.vencido += Number(item.saldo || 0);
          acc.vencidas += 1;
        }

        if (item.status === "parcial") {
          acc.parciais += 1;
        }

        return acc;
      },
      {
        aReceber: 0,
        vencido: 0,
        abertas: 0,
        vencidas: 0,
        parciais: 0,
      },
    );
  }, [contas]);

  const contasFiltradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");

    return contas.filter((item) => {
      if (filtro === "abertas") {
        if (item.arquivada || ["pago", "cancelado"].includes(item.status)) return false;
      } else if (filtro === "arquivadas") {
        if (!item.arquivada) return false;
      } else if (filtro !== "todas" && item.status !== filtro) {
        return false;
      }

      if (!termo) return true;

      return [
        item.cliente_nome,
        item.cliente_telefone,
        item.descricao,
        item.status,
      ]
        .filter(Boolean)
        .some((valor) =>
          String(valor).toLocaleLowerCase("pt-BR").includes(termo),
        );
    });
  }, [contas, busca, filtro]);

  async function carregarOrigens(clienteId) {
    if (!clienteId) {
      setOrigens([]);
      return;
    }

    setLoadingOrigens(true);

    try {
      const { data, error } = await supabase.rpc(
        "listar_origens_conta_receber_painel",
        {
          p_barbearia_id: barbeariaId,
          p_cliente_id: clienteId,
        },
      );

      if (error) throw error;
      setOrigens(data || []);
    } catch (error) {
      console.error("[BarberHub] Origens de conta:", error);
      setOrigens([]);
      setErro("Não foi possível carregar os atendimentos e pedidos do cliente.");
    } finally {
      setLoadingOrigens(false);
    }
  }

  function abrirNovaConta() {
    setErro("");
    setSucesso("");
    setOrigens([]);
    setFormConta({
      clienteId: "",
      origemTipo: "manual",
      referenciaId: "",
      descricao: "",
      valor: "",
      vencimento: "",
      observacao: "",
    });
    setModalNova(true);
  }

  async function alterarCliente(clienteId) {
    setFormConta((atual) => ({
      ...atual,
      clienteId,
      referenciaId: "",
      descricao: "",
      valor: "",
    }));

    await carregarOrigens(clienteId);
  }

  function alterarOrigemTipo(origemTipo) {
    setFormConta((atual) => ({
      ...atual,
      origemTipo,
      referenciaId: "",
      descricao: "",
      valor: "",
    }));
  }

  function selecionarReferencia(referenciaId) {
    const item = origens.find(
      (origem) =>
        origem.origem_tipo === formConta.origemTipo &&
        origem.referencia_id === referenciaId,
    );

    setFormConta((atual) => ({
      ...atual,
      referenciaId,
      descricao: item?.titulo || "",
      valor: item?.valor ? String(item.valor) : "",
    }));
  }

  async function salvarConta(event) {
    event.preventDefault();
    setErro("");
    setSucesso("");

    if (!formConta.clienteId) {
      setErro("Selecione o cliente.");
      return;
    }

    if (!formConta.vencimento) {
      setErro("Informe o vencimento.");
      return;
    }

    if (
      ["agendamento", "pedido"].includes(formConta.origemTipo) &&
      !formConta.referenciaId
    ) {
      setErro("Selecione o atendimento ou pedido que ficou pendente.");
      return;
    }

    if (
      ["manual", "outro"].includes(formConta.origemTipo) &&
      (!formConta.descricao.trim() || Number(formConta.valor) <= 0)
    ) {
      setErro("Informe a descrição e um valor maior que zero.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.rpc("criar_conta_receber_painel", {
        p_barbearia_id: barbeariaId,
        p_cliente_id: formConta.clienteId,
        p_origem_tipo: formConta.origemTipo,
        p_referencia_id: formConta.referenciaId || null,
        p_descricao: formConta.descricao || null,
        p_valor_original: formConta.valor ? Number(formConta.valor) : null,
        p_vencimento: formConta.vencimento,
        p_observacao: formConta.observacao || null,
      });

      if (error) throw error;

      setModalNova(false);
      setSucesso("Conta a receber criada com sucesso.");
      await carregarDados();
    } catch (error) {
      console.error("[BarberHub] Criar conta:", error);
      setErro(mensagemErro(error));
    } finally {
      setSaving(false);
    }
  }

  function abrirPagamento(conta) {
    setContaAtual(conta);
    setErro("");
    setSucesso("");
    setFormPagamento({
      valor: Number(conta.saldo || 0).toFixed(2),
      formaPagamento: "pix",
      pagoEm: new Date().toISOString().slice(0, 16),
      observacao: "",
    });
    setModalPagamento(true);
  }

  async function registrarPagamento(event) {
    event.preventDefault();

    if (!contaAtual) return;

    const valor = Number(formPagamento.valor);

    if (!valor || valor <= 0) {
      setErro("Informe um valor de pagamento maior que zero.");
      return;
    }

    if (valor > Number(contaAtual.saldo || 0)) {
      setErro("O pagamento não pode ser maior que o saldo.");
      return;
    }

    setSaving(true);
    setErro("");
    setSucesso("");

    try {
      const { data: pagamentoId, error } = await supabase.rpc(
        "registrar_pagamento_conta_receber_painel",
        {
          p_barbearia_id: barbeariaId,
          p_conta_id: contaAtual.conta_id,
          p_valor: valor,
          p_forma_pagamento: formPagamento.formaPagamento,
          p_pago_em: new Date(formPagamento.pagoEm).toISOString(),
          p_observacao: formPagamento.observacao || null,
        },
      );

      if (error) throw error;

      const saldoDepois = Math.max(Number(contaAtual.saldo) - valor, 0);

      setModalPagamento(false);
      setSucesso(
        saldoDepois <= 0
          ? "Pagamento registrado. A conta foi quitada."
          : "Pagamento parcial registrado com sucesso.",
      );

      await carregarDados();

      const comprovante = {
        pagamento_id: pagamentoId,
        valor,
        forma_pagamento: formPagamento.formaPagamento,
        pago_em: new Date(formPagamento.pagoEm).toISOString(),
        observacao: formPagamento.observacao,
      };

      await gerarComprovante(contaAtual, comprovante, saldoDepois);
    } catch (error) {
      console.error("[BarberHub] Registrar pagamento:", error);
      setErro(mensagemErro(error));
    } finally {
      setSaving(false);
    }
  }

  async function carregarHistorico(conta) {
    setContaAtual(conta);
    setModalHistorico(true);
    setPagamentos([]);
    setLoadingHistorico(true);
    setErro("");

    try {
      const { data, error } = await supabase.rpc(
        "listar_pagamentos_conta_receber_painel",
        {
          p_barbearia_id: barbeariaId,
          p_conta_id: conta.conta_id,
        },
      );

      if (error) throw error;
      setPagamentos(data || []);
    } catch (error) {
      console.error("[BarberHub] Histórico conta:", error);
      setErro("Não foi possível carregar o histórico de pagamentos.");
    } finally {
      setLoadingHistorico(false);
    }
  }

  async function cancelarConta(conta) {
    if (
      !window.confirm(
        `Cancelar a conta de ${conta.cliente_nome}?\n\nSó é permitido cancelar contas sem pagamentos.`,
      )
    ) {
      return;
    }

    setErro("");
    setSucesso("");

    try {
      const { error } = await supabase.rpc("cancelar_conta_receber_painel", {
        p_barbearia_id: barbeariaId,
        p_conta_id: conta.conta_id,
      });

      if (error) throw error;

      setSucesso("Conta cancelada sem apagar o histórico.");
      await carregarDados();
    } catch (error) {
      setErro(mensagemErro(error));
    }
  }

  async function arquivarConta(conta) {
    if (!window.confirm("Arquivar esta conta no histórico?")) return;

    setErro("");
    setSucesso("");

    try {
      const { error } = await supabase.rpc("arquivar_conta_receber_painel", {
        p_barbearia_id: barbeariaId,
        p_conta_id: conta.conta_id,
      });

      if (error) throw error;

      setSucesso("Conta arquivada com sucesso.");
      await carregarDados();
    } catch (error) {
      setErro(mensagemErro(error));
    }
  }

  async function gerarComprovante(conta, pagamento, saldoDepois = null) {
    const doc = new jsPDF();
    const margem = 18;
    const largura = doc.internal.pageSize.getWidth();
    let y = 18;

    const logo = await imagemParaDataUrl(barbearia?.logo_url);

    if (logo) {
      try {
        doc.addImage(logo, "PNG", margem, y, 24, 24);
      } catch {
        // O comprovante continua válido mesmo se o navegador não conseguir converter a logo.
      }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(barbearia?.nome || "BarberHub", logo ? margem + 30 : margem, y + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    if (barbearia?.endereco) {
      doc.text(String(barbearia.endereco), logo ? margem + 30 : margem, y + 13);
    }
    if (barbearia?.telefone) {
      doc.text(`Contato: ${barbearia.telefone}`, logo ? margem + 30 : margem, y + 18);
    }

    y += 34;
    doc.setDrawColor(190);
    doc.line(margem, y, largura - margem, y);
    y += 10;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("COMPROVANTE DE PAGAMENTO", margem, y);
    y += 9;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Referência: ${String(pagamento.pagamento_id || "").slice(0, 8).toUpperCase()}`, margem, y);
    y += 6;
    doc.text(`Data: ${dataHoraBR(pagamento.pago_em)}`, margem, y);
    y += 10;

    doc.setFont("helvetica", "bold");
    doc.text("Cliente", margem, y);
    doc.setFont("helvetica", "normal");
    doc.text(conta.cliente_nome || "Cliente", margem + 35, y);
    y += 7;

    doc.setFont("helvetica", "bold");
    doc.text("Conta", margem, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(conta.descricao || "Conta a receber").slice(0, 85), margem + 35, y);
    y += 7;

    doc.setFont("helvetica", "bold");
    doc.text("Valor original", margem, y);
    doc.setFont("helvetica", "normal");
    doc.text(moeda(conta.valor_original), margem + 35, y);
    y += 7;

    doc.setFont("helvetica", "bold");
    doc.text("Pagamento", margem, y);
    doc.setFont("helvetica", "normal");
    doc.text(moeda(pagamento.valor), margem + 35, y);
    y += 7;

    doc.setFont("helvetica", "bold");
    doc.text("Forma", margem, y);
    doc.setFont("helvetica", "normal");
    doc.text(FORMA_LABEL[pagamento.forma_pagamento] || pagamento.forma_pagamento, margem + 35, y);
    y += 7;

    const saldoFinal =
      saldoDepois === null
        ? Math.max(Number(conta.saldo || 0) - Number(pagamento.valor || 0), 0)
        : saldoDepois;

    doc.setFont("helvetica", "bold");
    doc.text("Saldo restante", margem, y);
    doc.setFont("helvetica", "normal");
    doc.text(moeda(saldoFinal), margem + 35, y);
    y += 10;

    if (pagamento.observacao) {
      doc.setFont("helvetica", "bold");
      doc.text("Observação", margem, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      const linhas = doc.splitTextToSize(String(pagamento.observacao), largura - margem * 2);
      doc.text(linhas, margem, y);
      y += linhas.length * 5 + 5;
    }

    doc.setFontSize(8.5);
    doc.setTextColor(90);
    const aviso = doc.splitTextToSize(
      "Este comprovante registra um pagamento no BarberHub e não substitui documento fiscal quando exigível.",
      largura - margem * 2,
    );
    doc.text(aviso, margem, y + 4);

    doc.setFontSize(8);
    doc.text(
      "BarberHub • Desenvolvido por Sigma Orbitek",
      largura / 2,
      287,
      { align: "center" },
    );

    doc.save(
      `comprovante-${String(conta.cliente_nome || "cliente")
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, "-")}.pdf`,
    );
  }

  function enviarWhatsApp(conta) {
    const telefone = somenteDigitos(conta.cliente_telefone);

    if (!telefone) {
      setErro("Este cliente não possui telefone cadastrado.");
      return;
    }

    const numero =
      telefone.startsWith("55") ? telefone : `55${telefone}`;

    const texto = [
      `Olá, ${conta.cliente_nome}!`,
      "",
      `Aqui é ${barbearia?.nome || "a barbearia"}.`,
      `Conta: ${conta.descricao}`,
      `Valor original: ${moeda(conta.valor_original)}`,
      `Total pago: ${moeda(conta.valor_pago)}`,
      `Saldo atual: ${moeda(conta.saldo)}`,
      `Vencimento: ${dataBR(conta.vencimento)}`,
      `Status: ${STATUS_LABEL[conta.status] || conta.status}`,
      "",
      "Mensagem enviada pelo BarberHub.",
    ].join("\n");

    window.open(
      `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <section className="receivables-page">
      <div className="receivables-heading">
        <div>
          <span className="receivables-eyebrow">RESULTADOS</span>
          <h1>Contas a receber</h1>
          <p>
            Controle clientes que ficaram devendo sem misturar valores pendentes
            com dinheiro realmente recebido.
          </p>
        </div>

        <button
          type="button"
          className="receivables-primary"
          onClick={abrirNovaConta}
        >
          ＋ Nova conta
        </button>
      </div>

      {erro ? (
        <div className="receivables-message receivables-message--error">
          {erro}
        </div>
      ) : null}

      {sucesso ? (
        <div className="receivables-message receivables-message--success">
          {sucesso}
        </div>
      ) : null}

      <div className="receivables-stats">
        <article>
          <span>💰</span>
          <div>
            <small>A RECEBER</small>
            <strong>{moeda(resumo.aReceber)}</strong>
            <p>{resumo.abertas} conta(s) aberta(s)</p>
          </div>
        </article>

        <article className="receivables-stat--danger">
          <span>⚠️</span>
          <div>
            <small>VENCIDO</small>
            <strong>{moeda(resumo.vencido)}</strong>
            <p>{resumo.vencidas} vencida(s)</p>
          </div>
        </article>

        <article>
          <span>🧾</span>
          <div>
            <small>PARCIAIS</small>
            <strong>{resumo.parciais}</strong>
            <p>Com pagamento parcial</p>
          </div>
        </article>
      </div>

      <div className="receivables-toolbar">
        <div className="receivables-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar cliente, telefone ou descrição"
            aria-label="Buscar contas a receber"
          />
        </div>

        <select
          className="receivables-filter"
          value={filtro}
          onChange={(event) => setFiltro(event.target.value)}
          aria-label="Filtrar contas"
        >
          <option value="abertas">Contas abertas</option>
          <option value="vencido">Vencidas</option>
          <option value="pendente">Pendentes</option>
          <option value="parcial">Parciais</option>
          <option value="pago">Pagas</option>
          <option value="cancelado">Canceladas</option>
          <option value="arquivadas">Arquivadas</option>
          <option value="todas">Todas</option>
        </select>

        <button
          type="button"
          className="receivables-secondary"
          onClick={carregarDados}
        >
          ↻ Atualizar
        </button>
      </div>

      {loading ? (
        <div className="receivables-empty">Carregando contas...</div>
      ) : contasFiltradas.length === 0 ? (
        <div className="receivables-empty">
          <span>💰</span>
          <strong>Nenhuma conta encontrada</strong>
          <p>Quando um cliente ficar devendo, registre a conta aqui.</p>
        </div>
      ) : (
        <div className="receivables-list">
          {contasFiltradas.map((conta) => (
            <article
              className={`receivable-card receivable-card--${conta.status}`}
              key={conta.conta_id}
            >
              <div className="receivable-card-top">
                <div>
                  <span className={`receivable-status receivable-status--${conta.status}`}>
                    {STATUS_LABEL[conta.status] || conta.status}
                  </span>
                  <h2>{conta.cliente_nome}</h2>
                  <p>{conta.descricao}</p>
                </div>

                <div className="receivable-balance">
                  <small>SALDO</small>
                  <strong>{moeda(conta.saldo)}</strong>
                </div>
              </div>

              <div className="receivable-values">
                <div>
                  <small>Valor original</small>
                  <strong>{moeda(conta.valor_original)}</strong>
                </div>
                <div>
                  <small>Já pago</small>
                  <strong>{moeda(conta.valor_pago)}</strong>
                </div>
                <div>
                  <small>Vencimento</small>
                  <strong>{dataBR(conta.vencimento)}</strong>
                </div>
                <div>
                  <small>Origem</small>
                  <strong>
                    {conta.origem_tipo === "agendamento"
                      ? "Serviço"
                      : conta.origem_tipo === "pedido"
                        ? "Pedido"
                        : conta.origem_tipo === "outro"
                          ? "Outro"
                          : "Manual"}
                  </strong>
                </div>
              </div>

              {conta.observacao ? (
                <p className="receivable-note">{conta.observacao}</p>
              ) : null}

              <div className="receivable-actions">
                {!["pago", "cancelado"].includes(conta.status) && !conta.arquivada ? (
                  <button type="button" onClick={() => abrirPagamento(conta)}>
                    💵 Registrar pagamento
                  </button>
                ) : null}

                <button type="button" onClick={() => carregarHistorico(conta)}>
                  🧾 Histórico
                </button>

                <button type="button" onClick={() => enviarWhatsApp(conta)}>
                  💬 WhatsApp
                </button>

                {conta.status === "pendente" && !conta.arquivada ? (
                  <button
                    type="button"
                    className="receivable-action-danger"
                    onClick={() => cancelarConta(conta)}
                  >
                    Cancelar
                  </button>
                ) : null}

                {["pago", "cancelado"].includes(conta.status) && !conta.arquivada ? (
                  <button type="button" onClick={() => arquivarConta(conta)}>
                    Arquivar
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {modalNova ? (
        <div className="receivables-modal-backdrop" role="presentation">
          <div className="receivables-modal" role="dialog" aria-modal="true">
            <div className="receivables-modal-header">
              <div>
                <span>NOVA CONTA</span>
                <h2>Registrar valor a receber</h2>
                <p>Vincule a dívida ao cliente e preserve o histórico.</p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setModalNova(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={salvarConta}>
              <div className="receivables-field">
                <label htmlFor="conta-cliente">Cliente *</label>
                <select
                  id="conta-cliente"
                  value={formConta.clienteId}
                  onChange={(event) => alterarCliente(event.target.value)}
                  required
                >
                  <option value="">Selecione</option>
                  {clientes.map((cliente) => (
                    <option value={cliente.cliente_id} key={cliente.cliente_id}>
                      {cliente.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="receivables-field">
                <label htmlFor="conta-origem">Origem *</label>
                <select
                  id="conta-origem"
                  value={formConta.origemTipo}
                  onChange={(event) => alterarOrigemTipo(event.target.value)}
                >
                  <option value="manual">Lançamento manual</option>
                  <option value="agendamento">Serviço concluído</option>
                  <option value="pedido">Pedido concluído</option>
                  <option value="outro">Outro</option>
                </select>
              </div>

              {["agendamento", "pedido"].includes(formConta.origemTipo) ? (
                <div className="receivables-field receivables-field--full">
                  <label htmlFor="conta-referencia">
                    {formConta.origemTipo === "agendamento"
                      ? "Atendimento que ficou devendo *"
                      : "Pedido que ficou devendo *"}
                  </label>
                  <select
                    id="conta-referencia"
                    value={formConta.referenciaId}
                    onChange={(event) => selecionarReferencia(event.target.value)}
                    disabled={!formConta.clienteId || loadingOrigens}
                  >
                    <option value="">
                      {loadingOrigens ? "Carregando..." : "Selecione"}
                    </option>
                    {origens
                      .filter((item) => item.origem_tipo === formConta.origemTipo)
                      .map((item) => (
                        <option
                          value={item.referencia_id}
                          key={item.referencia_id}
                        >
                          {item.titulo} — {moeda(item.valor)} —{" "}
                          {dataHoraBR(item.data_referencia)}
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}

              <div className="receivables-field receivables-field--full">
                <label htmlFor="conta-descricao">Descrição *</label>
                <input
                  id="conta-descricao"
                  value={formConta.descricao}
                  onChange={(event) =>
                    setFormConta((atual) => ({
                      ...atual,
                      descricao: event.target.value,
                    }))
                  }
                  disabled={["agendamento", "pedido"].includes(formConta.origemTipo)}
                  maxLength={180}
                  required
                />
              </div>

              <div className="receivables-field">
                <label htmlFor="conta-valor">Valor original *</label>
                <input
                  id="conta-valor"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={formConta.valor}
                  onChange={(event) =>
                    setFormConta((atual) => ({
                      ...atual,
                      valor: event.target.value,
                    }))
                  }
                  disabled={["agendamento", "pedido"].includes(formConta.origemTipo)}
                  required
                />
              </div>

              <div className="receivables-field">
                <label htmlFor="conta-vencimento">Vencimento *</label>
                <input
                  id="conta-vencimento"
                  type="date"
                  value={formConta.vencimento}
                  onChange={(event) =>
                    setFormConta((atual) => ({
                      ...atual,
                      vencimento: event.target.value,
                    }))
                  }
                  required
                />
              </div>

              <div className="receivables-field receivables-field--full">
                <label htmlFor="conta-observacao">Observação</label>
                <textarea
                  id="conta-observacao"
                  value={formConta.observacao}
                  onChange={(event) =>
                    setFormConta((atual) => ({
                      ...atual,
                      observacao: event.target.value,
                    }))
                  }
                  maxLength={500}
                  rows={3}
                />
              </div>

              <div className="receivables-modal-actions">
                <button
                  type="button"
                  className="receivables-secondary"
                  onClick={() => setModalNova(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="receivables-primary"
                  disabled={saving}
                >
                  {saving ? "Salvando..." : "Salvar conta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {modalPagamento && contaAtual ? (
        <div className="receivables-modal-backdrop" role="presentation">
          <div className="receivables-modal receivables-modal--small" role="dialog" aria-modal="true">
            <div className="receivables-modal-header">
              <div>
                <span>PAGAMENTO</span>
                <h2>{contaAtual.cliente_nome}</h2>
                <p>Saldo atual: {moeda(contaAtual.saldo)}</p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setModalPagamento(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={registrarPagamento}>
              <div className="receivables-field">
                <label htmlFor="pagamento-valor">Valor recebido *</label>
                <input
                  id="pagamento-valor"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={Number(contaAtual.saldo)}
                  value={formPagamento.valor}
                  onChange={(event) =>
                    setFormPagamento((atual) => ({
                      ...atual,
                      valor: event.target.value,
                    }))
                  }
                  required
                />
              </div>

              <div className="receivables-field">
                <label htmlFor="pagamento-forma">Forma *</label>
                <select
                  id="pagamento-forma"
                  value={formPagamento.formaPagamento}
                  onChange={(event) =>
                    setFormPagamento((atual) => ({
                      ...atual,
                      formaPagamento: event.target.value,
                    }))
                  }
                >
                  <option value="pix">Pix</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="debito">Débito</option>
                  <option value="credito">Crédito</option>
                  <option value="outro">Outro</option>
                </select>
              </div>

              <div className="receivables-field receivables-field--full">
                <label htmlFor="pagamento-data">Data e hora *</label>
                <input
                  id="pagamento-data"
                  type="datetime-local"
                  value={formPagamento.pagoEm}
                  onChange={(event) =>
                    setFormPagamento((atual) => ({
                      ...atual,
                      pagoEm: event.target.value,
                    }))
                  }
                  required
                />
              </div>

              <div className="receivables-field receivables-field--full">
                <label htmlFor="pagamento-observacao">Observação</label>
                <textarea
                  id="pagamento-observacao"
                  rows={3}
                  maxLength={500}
                  value={formPagamento.observacao}
                  onChange={(event) =>
                    setFormPagamento((atual) => ({
                      ...atual,
                      observacao: event.target.value,
                    }))
                  }
                />
              </div>

              <p className="receivables-payment-note">
                Após salvar, o pagamento entra no Financeiro na data em que foi
                realmente recebido.
              </p>

              <div className="receivables-modal-actions">
                <button
                  type="button"
                  className="receivables-secondary"
                  onClick={() => setModalPagamento(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="receivables-primary"
                  disabled={saving}
                >
                  {saving ? "Registrando..." : "Registrar pagamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {modalHistorico && contaAtual ? (
        <div className="receivables-modal-backdrop" role="presentation">
          <div className="receivables-modal receivables-modal--small" role="dialog" aria-modal="true">
            <div className="receivables-modal-header">
              <div>
                <span>HISTÓRICO</span>
                <h2>{contaAtual.cliente_nome}</h2>
                <p>{contaAtual.descricao}</p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setModalHistorico(false)}
              >
                ×
              </button>
            </div>

            <div className="receivables-history-summary">
              <div>
                <small>Original</small>
                <strong>{moeda(contaAtual.valor_original)}</strong>
              </div>
              <div>
                <small>Pago</small>
                <strong>{moeda(contaAtual.valor_pago)}</strong>
              </div>
              <div>
                <small>Saldo</small>
                <strong>{moeda(contaAtual.saldo)}</strong>
              </div>
            </div>

            {loadingHistorico ? (
              <div className="receivables-empty">Carregando histórico...</div>
            ) : pagamentos.length === 0 ? (
              <div className="receivables-empty">
                Nenhum pagamento registrado.
              </div>
            ) : (
              <div className="receivables-history-list">
                {pagamentos.map((pagamento) => (
                  <div className="receivables-history-item" key={pagamento.pagamento_id}>
                    <div>
                      <strong>{moeda(pagamento.valor)}</strong>
                      <span>
                        {FORMA_LABEL[pagamento.forma_pagamento] ||
                          pagamento.forma_pagamento}
                      </span>
                    </div>
                    <div>
                      <small>{dataHoraBR(pagamento.pago_em)}</small>
                      {pagamento.observacao ? (
                        <p>{pagamento.observacao}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => gerarComprovante(contaAtual, pagamento)}
                    >
                      PDF
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="receivables-modal-actions">
              <button
                type="button"
                className="receivables-secondary"
                onClick={() => setModalHistorico(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
