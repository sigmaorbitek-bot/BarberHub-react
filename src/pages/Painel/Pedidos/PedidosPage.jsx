import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "../../../components/Painel/EmptyState/EmptyState";
import { useBarbearia } from "../../../hooks/useBarbearia";
import { supabase } from "../../../services/supabase";
import {
  abrirWhatsAppPedido,
  gerarComprovantePedidoPdf,
} from "../../../utils/comprovantePedido";
import "./PedidosPage.css";

const PAGAMENTOS = [
  ["", "Não informado"],
  ["dinheiro", "Dinheiro"],
  ["pix", "Pix"],
  ["debito", "Cartão de débito"],
  ["credito", "Cartão de crédito"],
  ["outro", "Outro"],
];

const STATUS_LABEL = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const ORIGEM_LABEL = {
  online: "Online",
  presencial: "Presencial",
};

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataHora(valor) {
  if (!valor) {
    return "—";
  }

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return "—";
  }

  return data.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function telefone(valor) {
  const numeros = String(valor || "").replace(/\D/g, "");

  if (numeros.length === 11) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
  }

  if (numeros.length === 10) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
  }

  return valor || "Não informado";
}

function pagamentoLabel(valor) {
  return PAGAMENTOS.find(([value]) => value === valor)?.[1] || "Não informado";
}

export default function PedidosPage() {
  const { barbeariaId, barbearia } = useBarbearia();

  const [pedidos, setPedidos] = useState([]);

  const [clientes, setClientes] = useState([]);

  const [produtos, setProdutos] = useState([]);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [busca, setBusca] = useState("");

  const [filtro, setFiltro] = useState("abertos");

  const [message, setMessage] = useState("");

  const [messageType, setMessageType] = useState("success");

  const [modalNovo, setModalNovo] = useState(false);

  const [modalDetalhes, setModalDetalhes] = useState(false);

  const [pedidoSelecionado, setPedidoSelecionado] = useState(null);

  const [novo, setNovo] = useState({
    clienteId: "",
    produtoId: "",
    quantidade: "1",
    formaPagamento: "",
    observacoes: "",
  });

  const [conclusao, setConclusao] = useState(null);
  const [recebimento, setRecebimento] = useState({
    tipo: "recebido",
    forma: "",
    vencimento: "",
  });

  const [detalhes, setDetalhes] = useState({
    formaPagamento: "",
    observacoes: "",
  });

  const carregar = useCallback(async () => {
    if (!barbeariaId) {
      return;
    }

    setLoading(true);

    try {
      const [respostaPedidos, respostaClientes, respostaProdutos] =
        await Promise.all([
          supabase.rpc("listar_pedidos_painel", {
            p_barbearia_id: barbeariaId,
          }),
          supabase.rpc("listar_clientes_painel", {
            p_barbearia_id: barbeariaId,
          }),
          supabase.rpc("listar_produtos_painel", {
            p_barbearia_id: barbeariaId,
          }),
        ]);

      if (respostaPedidos.error) {
        throw respostaPedidos.error;
      }

      if (respostaClientes.error) {
        throw respostaClientes.error;
      }

      if (respostaProdutos.error) {
        throw respostaProdutos.error;
      }

      setPedidos(respostaPedidos.data || []);

      setClientes((respostaClientes.data || []).filter((item) => item.ativo));

      setProdutos((respostaProdutos.data || []).filter((item) => item.ativo));
    } catch (error) {
      console.error("[BarberHub] Erro ao carregar pedidos:", error);

      setMessageType("error");

      setMessage(error?.message || "Não foi possível carregar os pedidos.");
    } finally {
      setLoading(false);
    }
  }, [barbeariaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const resumo = useMemo(() => {
    const ativos = pedidos.filter((item) => !item.arquivado);

    const pendentes = ativos.filter(
      (item) => item.status === "pendente",
    ).length;

    const confirmados = ativos.filter(
      (item) => item.status === "confirmado",
    ).length;

    const concluidos = pedidos.filter((item) => item.status === "concluido");

    const faturamento = concluidos.reduce(
      (total, item) => total + Number(item.total || 0),
      0,
    );

    return {
      total: ativos.length,
      pendentes,
      confirmados,
      concluidos: concluidos.length,
      faturamento,
    };
  }, [pedidos]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return pedidos.filter((pedido) => {
      if (
        filtro === "abertos" &&
        (pedido.arquivado ||
          !["pendente", "confirmado"].includes(pedido.status))
      ) {
        return false;
      }

      if (filtro === "arquivados" && !pedido.arquivado) {
        return false;
      }

      if (
        ["pendente", "confirmado", "concluido", "cancelado"].includes(filtro) &&
        (pedido.arquivado || pedido.status !== filtro)
      ) {
        return false;
      }

      if (filtro === "todos" && pedido.arquivado) {
        return false;
      }

      if (!termo) {
        return true;
      }

      return [
        pedido.cliente_nome,
        pedido.cliente_telefone,
        pedido.cliente_email,
        pedido.produto_nome,
        pedido.pedido_id,
      ]
        .filter(Boolean)
        .some((valor) => String(valor).toLowerCase().includes(termo));
    });
  }, [pedidos, filtro, busca]);

  const produtoNovo = produtos.find(
    (item) => item.produto_id === novo.produtoId,
  );

  function abrirNovo() {
    setNovo({
      clienteId: "",
      produtoId: "",
      quantidade: "1",
      formaPagamento: "",
      observacoes: "",
    });

    setMessage("");
    setModalNovo(true);
  }

  function abrirDetalhes(pedido) {
    setPedidoSelecionado(pedido);

    setDetalhes({
      formaPagamento: pedido.forma_pagamento || "",
      observacoes: pedido.observacoes || "",
    });

    setMessage("");
    setModalDetalhes(true);
  }

  async function criarPedido(event) {
    event.preventDefault();

    const quantidade = Number(novo.quantidade);

    if (!novo.clienteId) {
      setMessageType("error");
      setMessage("Selecione o cliente.");
      return;
    }

    if (!novo.produtoId) {
      setMessageType("error");
      setMessage("Selecione o produto.");
      return;
    }

    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      setMessageType("error");
      setMessage("Informe uma quantidade válida.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.rpc("criar_pedido_painel", {
        p_barbearia_id: barbeariaId,
        p_cliente_id: novo.clienteId,
        p_produto_id: novo.produtoId,
        p_quantidade: quantidade,
        p_forma_pagamento: novo.formaPagamento || null,
        p_observacoes: novo.observacoes.trim() || null,
      });

      if (error) {
        throw error;
      }

      setModalNovo(false);
      setMessageType("success");
      setMessage("Pedido presencial criado com sucesso.");

      await carregar();
    } catch (error) {
      console.error("[BarberHub] Erro ao criar pedido:", error);

      setMessageType("error");
      setMessage(error?.message || "Não foi possível criar o pedido.");
    } finally {
      setSaving(false);
    }
  }

  function abrirConclusao(pedido) {
    setConclusao(pedido);
    setRecebimento({ tipo: "recebido", forma: "", vencimento: "" });
    setMessage("");
  }

  async function concluirComRecebimento(event) {
    event.preventDefault();
    if (!conclusao || saving) return;
    if (recebimento.tipo === "recebido" && !recebimento.forma) {
      setMessageType("error");
      setMessage("Selecione a forma como o pagamento foi recebido.");
      return;
    }
    if (recebimento.tipo === "a_receber" && !recebimento.vencimento) {
      setMessageType("error");
      setMessage("Informe a data de vencimento da conta a receber.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("concluir_pedido_financeiro_050", {
        p_barbearia_id: barbeariaId,
        p_pedido_id: conclusao.pedido_id,
        p_recebimento: recebimento.tipo,
        p_forma_pagamento:
          recebimento.tipo === "recebido" ? recebimento.forma : null,
        p_vencimento:
          recebimento.tipo === "a_receber" ? recebimento.vencimento : null,
      });
      if (error) throw error;
      setConclusao(null);
      setMessageType("success");
      setMessage(
        recebimento.tipo === "recebido"
          ? "Pedido concluído com recebimento registrado no financeiro."
          : "Pedido concluído com conta a receber criada.",
      );
      await carregar();
    } catch (error) {
      console.error("[BarberHub] Concluir pedido com pagamento:", error);
      setMessageType("error");
      setMessage(error?.message || "Não foi possível concluir o pedido.");
    } finally {
      setSaving(false);
    }
  }

  async function alterarStatus(pedido, status) {
    if (status === "concluido") {
      abrirConclusao(pedido);
      return;
    }
    const acao =
      status === "confirmado"
        ? "confirmar"
        : status === "concluido"
          ? "concluir"
          : "cancelar";

    const aviso =
      status === "cancelado" ? " O estoque reservado será devolvido." : "";

    const confirmou = window.confirm(`Deseja ${acao} este pedido?${aviso}`);

    if (!confirmou) {
      return;
    }

    try {
      const { error } = await supabase.rpc("alterar_status_pedido_painel", {
        p_barbearia_id: barbeariaId,
        p_pedido_id: pedido.pedido_id,
        p_status: status,
      });

      if (error) {
        throw error;
      }

      setMessageType("success");

      setMessage(
        status === "confirmado"
          ? "Pedido confirmado."
          : status === "concluido"
            ? "Pedido concluído."
            : "Pedido cancelado e estoque devolvido.",
      );

      await carregar();
    } catch (error) {
      console.error("[BarberHub] Erro ao alterar pedido:", error);

      setMessageType("error");

      setMessage(error?.message || "Não foi possível alterar o pedido.");
    }
  }

  async function salvarDetalhes(event) {
    event.preventDefault();

    if (!pedidoSelecionado) {
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.rpc("atualizar_detalhes_pedido_painel", {
        p_barbearia_id: barbeariaId,
        p_pedido_id: pedidoSelecionado.pedido_id,
        p_forma_pagamento: detalhes.formaPagamento || null,
        p_observacoes: detalhes.observacoes.trim() || null,
      });

      if (error) {
        throw error;
      }

      setModalDetalhes(false);
      setMessageType("success");
      setMessage("Detalhes do pedido atualizados.");

      await carregar();
    } catch (error) {
      console.error("[BarberHub] Erro ao atualizar pedido:", error);

      setMessageType("error");

      setMessage(error?.message || "Não foi possível atualizar o pedido.");
    } finally {
      setSaving(false);
    }
  }

  async function arquivar(pedido) {
    const confirmou = window.confirm(
      "Arquivar este pedido? Ele continuará salvo no histórico.",
    );

    if (!confirmou) {
      return;
    }

    try {
      const { error } = await supabase.rpc("arquivar_pedido_painel", {
        p_barbearia_id: barbeariaId,
        p_pedido_id: pedido.pedido_id,
      });

      if (error) {
        throw error;
      }

      setMessageType("success");
      setMessage("Pedido arquivado com sucesso.");

      await carregar();
    } catch (error) {
      console.error("[BarberHub] Erro ao arquivar pedido:", error);

      setMessageType("error");

      setMessage(error?.message || "Não foi possível arquivar o pedido.");
    }
  }

  async function gerarComprovante(pedido) {
    try {
      await gerarComprovantePedidoPdf({
        pedido,
        barbearia,
      });

      setMessageType("success");
      setMessage("Comprovante em PDF gerado com sucesso.");
    } catch (error) {
      console.error("[BarberHub] Erro ao gerar comprovante:", error);

      setMessageType("error");
      setMessage(
        error?.message || "Não foi possível gerar o comprovante em PDF.",
      );
    }
  }

  function enviarWhatsApp(pedido) {
    try {
      abrirWhatsAppPedido({
        pedido,
        barbearia,
      });
    } catch (error) {
      console.error("[BarberHub] Erro ao abrir WhatsApp:", error);

      setMessageType("error");
      setMessage(
        error?.message ||
          "Não foi possível abrir o WhatsApp para este cliente.",
      );
    }
  }

  return (
    <section className="orders-page">
      <div className="orders-heading">
        <div>
          <span className="orders-eyebrow">VENDAS</span>

          <h1>Pedidos</h1>

          <p>
            Acompanhe pedidos de produtos da{" "}
            <strong>{barbearia?.nome || "sua barbearia"}</strong>.
          </p>
        </div>

        <button type="button" className="orders-primary" onClick={abrirNovo}>
          ＋ Novo pedido
        </button>
      </div>

      {message ? (
        <div
          className={`orders-message orders-message--${messageType}`}
          role="status"
        >
          {message}
        </div>
      ) : null}

      <div className="orders-stats">
        <article>
          <span>🧾</span>
          <div>
            <small>PEDIDOS ABERTOS</small>
            <strong>{loading ? "..." : resumo.total}</strong>
          </div>
        </article>

        <article>
          <span>⏳</span>
          <div>
            <small>PENDENTES</small>
            <strong>{loading ? "..." : resumo.pendentes}</strong>
          </div>
        </article>

        <article>
          <span>✅</span>
          <div>
            <small>CONFIRMADOS</small>
            <strong>{loading ? "..." : resumo.confirmados}</strong>
          </div>
        </article>

        <article>
          <span>📦</span>
          <div>
            <small>CONCLUÍDOS</small>
            <strong>{loading ? "..." : resumo.concluidos}</strong>
          </div>
        </article>

        <article>
          <span>💰</span>
          <div>
            <small>VENDAS CONCLUÍDAS</small>
            <strong>{loading ? "..." : moeda(resumo.faturamento)}</strong>
          </div>
        </article>
      </div>

      <div className="orders-toolbar">
        <div className="orders-search">
          <span>⌕</span>
          <input
            type="search"
            value={busca}
            placeholder="Buscar cliente, produto, telefone ou pedido..."
            onChange={(event) => setBusca(event.target.value)}
          />
        </div>

        <div className="orders-filters">
          {[
            ["abertos", "Abertos"],
            ["todos", "Todos"],
            ["pendente", "Pendentes"],
            ["confirmado", "Confirmados"],
            ["concluido", "Concluídos"],
            ["cancelado", "Cancelados"],
            ["arquivados", "Arquivados"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                filtro === value
                  ? "orders-filter orders-filter--active"
                  : "orders-filter"
              }
              onClick={() => setFiltro(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="orders-refresh"
          disabled={loading}
          onClick={carregar}
        >
          ↻ Atualizar
        </button>
      </div>

      {loading ? (
        <div className="orders-loading">Carregando pedidos...</div>
      ) : filtrados.length ? (
        <div className="orders-list">
          {filtrados.map((pedido) => (
            <article key={pedido.pedido_id} className="order-card">
              <div className="order-product">
                {pedido.produto_foto_url ? (
                  <img
                    src={pedido.produto_foto_url}
                    alt={pedido.produto_nome}
                  />
                ) : (
                  <div className="order-product-empty">🛍️</div>
                )}

                <div>
                  <span className="orders-eyebrow">
                    {ORIGEM_LABEL[pedido.origem_pedido] || "Pedido"}
                  </span>

                  <h2>{pedido.produto_nome}</h2>

                  <p>Pedido #{String(pedido.pedido_id).slice(0, 8)}</p>
                </div>
              </div>

              <div className="order-client">
                <small>CLIENTE</small>

                <strong>{pedido.cliente_nome}</strong>

                <span>📱 {telefone(pedido.cliente_telefone)}</span>

                <span>✉️ {pedido.cliente_email || "Não informado"}</span>
              </div>

              <div className="order-values">
                <div>
                  <small>QUANTIDADE</small>
                  <strong>{pedido.quantidade}</strong>
                </div>

                <div>
                  <small>UNITÁRIO</small>
                  <strong>{moeda(pedido.preco_unitario)}</strong>
                </div>

                <div>
                  <small>TOTAL</small>
                  <strong>{moeda(pedido.total)}</strong>
                </div>
              </div>

              <div className="order-meta">
                <div>
                  <small>CRIADO EM</small>
                  <span>{dataHora(pedido.created_at)}</span>
                </div>

                <div>
                  <small>PAGAMENTO</small>
                  <span>{pagamentoLabel(pedido.forma_pagamento)}</span>
                </div>

                <span className={`order-status order-status--${pedido.status}`}>
                  {STATUS_LABEL[pedido.status]}
                </span>
              </div>

              {pedido.observacoes ? (
                <div className="order-notes">
                  <strong>Observações</strong>
                  <p>{pedido.observacoes}</p>
                </div>
              ) : null}

              <div className="order-actions">
                {!pedido.arquivado && pedido.status === "pendente" ? (
                  <>
                    <button
                      type="button"
                      className="order-action-confirm"
                      onClick={() => alterarStatus(pedido, "confirmado")}
                    >
                      Confirmar
                    </button>

                    <button
                      type="button"
                      className="order-action-cancel"
                      onClick={() => alterarStatus(pedido, "cancelado")}
                    >
                      Cancelar
                    </button>
                  </>
                ) : null}

                {!pedido.arquivado && pedido.status === "confirmado" ? (
                  <>
                    <button
                      type="button"
                      className="order-action-confirm"
                      onClick={() => alterarStatus(pedido, "concluido")}
                    >
                      Concluir
                    </button>

                    <button
                      type="button"
                      className="order-action-cancel"
                      onClick={() => alterarStatus(pedido, "cancelado")}
                    >
                      Cancelar
                    </button>
                  </>
                ) : null}

                {!pedido.arquivado ? (
                  <button type="button" onClick={() => abrirDetalhes(pedido)}>
                    Detalhes
                  </button>
                ) : null}

                {!pedido.arquivado &&
                ["concluido", "cancelado"].includes(pedido.status) ? (
                  <button type="button" onClick={() => arquivar(pedido)}>
                    Arquivar
                  </button>
                ) : null}

                {pedido.status === "concluido" ? (
                  <>
                    <button
                      type="button"
                      className="order-action-whatsapp"
                      onClick={() => enviarWhatsApp(pedido)}
                    >
                      📲 WhatsApp
                    </button>

                    <button
                      type="button"
                      className="order-action-pdf"
                      onClick={() => gerarComprovante(pedido)}
                    >
                      🧾 Comprovante PDF
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="🧾"
          title="Nenhum pedido encontrado"
          description="Quando houver pedidos de produtos, eles aparecerão aqui."
        />
      )}

      {modalNovo ? (
        <div
          className="orders-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setModalNovo(false);
            }
          }}
        >
          <div className="orders-modal" role="dialog" aria-modal="true">
            <div className="orders-modal-header">
              <div>
                <span className="orders-eyebrow">VENDA PRESENCIAL</span>
                <h2>Novo pedido</h2>
                <p>O estoque é reservado assim que o pedido é criado.</p>
              </div>

              <button type="button" onClick={() => setModalNovo(false)}>
                ×
              </button>
            </div>

            <form className="orders-form" onSubmit={criarPedido}>
              <div className="orders-field orders-field--full">
                <label>Cliente *</label>

                <select
                  value={novo.clienteId}
                  disabled={saving}
                  onChange={(event) =>
                    setNovo((atual) => ({
                      ...atual,
                      clienteId: event.target.value,
                    }))
                  }
                >
                  <option value="">Selecione...</option>

                  {clientes.map((cliente) => (
                    <option key={cliente.cliente_id} value={cliente.cliente_id}>
                      {cliente.nome}
                      {cliente.telefone
                        ? ` · ${telefone(cliente.telefone)}`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="orders-field orders-field--full">
                <label>Produto *</label>

                <select
                  value={novo.produtoId}
                  disabled={saving}
                  onChange={(event) =>
                    setNovo((atual) => ({
                      ...atual,
                      produtoId: event.target.value,
                    }))
                  }
                >
                  <option value="">Selecione...</option>

                  {produtos.map((produto) => (
                    <option
                      key={produto.produto_id}
                      value={produto.produto_id}
                      disabled={Number(produto.estoque) <= 0}
                    >
                      {produto.nome}
                      {" · "}
                      {moeda(produto.preco)}
                      {" · "}
                      estoque {produto.estoque}
                    </option>
                  ))}
                </select>
              </div>

              <div className="orders-field">
                <label>Quantidade *</label>

                <input
                  type="number"
                  min="1"
                  step="1"
                  value={novo.quantidade}
                  disabled={saving}
                  onChange={(event) =>
                    setNovo((atual) => ({
                      ...atual,
                      quantidade: event.target.value,
                    }))
                  }
                />

                {produtoNovo ? (
                  <small>Disponível: {produtoNovo.estoque}</small>
                ) : null}
              </div>

              <div className="orders-field">
                <label>Forma prevista (não confirma recebimento)</label>

                <select
                  value={novo.formaPagamento}
                  disabled={saving}
                  onChange={(event) =>
                    setNovo((atual) => ({
                      ...atual,
                      formaPagamento: event.target.value,
                    }))
                  }
                >
                  {PAGAMENTOS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {produtoNovo ? (
                <div className="orders-total-preview orders-field--full">
                  <span>Total do pedido</span>

                  <strong>
                    {moeda(
                      Number(novo.quantidade || 0) *
                        Number(produtoNovo.preco || 0),
                    )}
                  </strong>
                </div>
              ) : null}

              <div className="orders-field orders-field--full">
                <label>Observações</label>

                <textarea
                  rows={4}
                  maxLength={1000}
                  value={novo.observacoes}
                  disabled={saving}
                  onChange={(event) =>
                    setNovo((atual) => ({
                      ...atual,
                      observacoes: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="orders-form-actions">
                <button
                  type="button"
                  className="orders-secondary"
                  disabled={saving}
                  onClick={() => setModalNovo(false)}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="orders-primary"
                  disabled={saving}
                >
                  {saving ? "Criando..." : "Criar pedido"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {conclusao && (
        <div className="orders-modal-backdrop" role="presentation">
          <div
            className="orders-modal orders-modal--small"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bh050-title"
          >
            <div className="orders-modal-header">
              <div>
                <span className="orders-eyebrow">CONCLUSÃO FINANCEIRA</span>
                <h2 id="bh050-title">Concluir pedido</h2>
                <p>
                  {conclusao.produto_nome} · {moeda(conclusao.total)}
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setConclusao(null)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <form className="orders-form" onSubmit={concluirComRecebimento}>
              <fieldset
                className="orders-field orders-field--full orders-payment-choices"
                disabled={saving}
              >
                <legend>O pagamento já foi recebido?</legend>
                <label>
                  <input
                    type="radio"
                    name="recebimento-bh050"
                    checked={recebimento.tipo === "recebido"}
                    onChange={() =>
                      setRecebimento((v) => ({ ...v, tipo: "recebido" }))
                    }
                  />
                  Sim, recebi o pagamento
                </label>
                <label>
                  <input
                    type="radio"
                    name="recebimento-bh050"
                    checked={recebimento.tipo === "a_receber"}
                    onChange={() =>
                      setRecebimento((v) => ({ ...v, tipo: "a_receber" }))
                    }
                  />
                  Não, registrar em Contas a Receber
                </label>
              </fieldset>
              {recebimento.tipo === "recebido" ? (
                <div className="orders-field orders-field--full">
                  <label htmlFor="bh050-payment">
                    Forma do pagamento recebido *
                  </label>
                  <select
                    id="bh050-payment"
                    required
                    disabled={saving}
                    value={recebimento.forma}
                    onChange={(e) =>
                      setRecebimento((v) => ({ ...v, forma: e.target.value }))
                    }
                  >
                    {PAGAMENTOS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="orders-field orders-field--full">
                  <label htmlFor="bh050-due">Vencimento da conta *</label>
                  <input
                    id="bh050-due"
                    type="date"
                    required
                    disabled={saving}
                    min={(() => {
                      const d = new Date();
                      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    })()}
                    value={recebimento.vencimento}
                    onChange={(e) =>
                      setRecebimento((v) => ({
                        ...v,
                        vencimento: e.target.value,
                      }))
                    }
                  />
                  <small>
                    O recebimento posterior será feito em Contas a Receber.
                  </small>
                </div>
              )}
              <p className="orders-payment-explain orders-field--full">
                Ao confirmar, o pedido será concluído e o lançamento financeiro
                ficará vinculado ao pedido. Esta ação não pode ser repetida.
              </p>
              <div className="orders-form-actions">
                <button
                  type="button"
                  className="orders-secondary"
                  disabled={saving}
                  onClick={() => setConclusao(null)}
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="orders-primary"
                  disabled={saving}
                >
                  {saving
                    ? "Registrando..."
                    : "Concluir com registro financeiro"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalDetalhes && pedidoSelecionado ? (
        <div className="orders-modal-backdrop">
          <div
            className="orders-modal orders-modal--small"
            role="dialog"
            aria-modal="true"
          >
            <div className="orders-modal-header">
              <div>
                <span className="orders-eyebrow">PEDIDO</span>
                <h2>Detalhes</h2>
                <p>
                  {pedidoSelecionado.produto_nome} ·{" "}
                  {pedidoSelecionado.cliente_nome}
                </p>
              </div>

              <button type="button" onClick={() => setModalDetalhes(false)}>
                ×
              </button>
            </div>

            <form className="orders-form" onSubmit={salvarDetalhes}>
              <div className="orders-field orders-field--full">
                <label>Forma de pagamento (registrada na conclusão)</label>

                <select
                  value={detalhes.formaPagamento}
                  disabled={saving || pedidoSelecionado.status === "concluido"}
                  onChange={(event) =>
                    setDetalhes((atual) => ({
                      ...atual,
                      formaPagamento: event.target.value,
                    }))
                  }
                >
                  {PAGAMENTOS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="orders-field orders-field--full">
                <label>Observações</label>

                <textarea
                  rows={5}
                  maxLength={1000}
                  value={detalhes.observacoes}
                  disabled={saving}
                  onChange={(event) =>
                    setDetalhes((atual) => ({
                      ...atual,
                      observacoes: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="orders-form-actions">
                <button
                  type="button"
                  className="orders-secondary"
                  disabled={saving}
                  onClick={() => setModalDetalhes(false)}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="orders-primary"
                  disabled={saving}
                >
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
