import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { supabase } from "../../../services/supabase";

import "./ClientePedidosPage.css";

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

  return new Date(valor).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS = {
  pendente: { label: "Pendente", icon: "🕒", className: "pending" },
  confirmado: { label: "Confirmado", icon: "✅", className: "confirmed" },
  concluido: { label: "Concluído", icon: "📦", className: "done" },
  cancelado: { label: "Cancelado", icon: "✕", className: "cancelled" },
};

const FILTROS = [
  { value: "todos", label: "Todos" },
  { value: "pendente", label: "Pendentes" },
  { value: "confirmado", label: "Confirmados" },
  { value: "concluido", label: "Concluídos" },
  { value: "cancelado", label: "Cancelados" },
];

export default function ClientePedidosPage() {
  const [pedidos, setPedidos] = useState([]);
  const [filtro, setFiltro] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [cancelandoId, setCancelandoId] = useState("");
  const [pedidoCancelar, setPedidoCancelar] = useState(null);
  const [mensagem, setMensagem] = useState("");
  const [tipoMensagem, setTipoMensagem] = useState("");

  async function carregarPedidos() {
    setLoading(true);
    setErro("");

    try {
      const { data, error } = await supabase.rpc("listar_pedidos_cliente");

      if (error) {
        throw error;
      }

      setPedidos(data || []);
    } catch (error) {
      console.error("[BarberHub] Pedidos do cliente:", error);
      setPedidos([]);
      setErro("Não foi possível carregar seus pedidos agora.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarPedidos();
  }, []);

  const resumo = useMemo(() => {
    return pedidos.reduce(
      (acc, pedido) => {
        acc.total += 1;

        if (pedido.status === "pendente" || pedido.status === "confirmado") {
          acc.ativos += 1;
        }

        if (pedido.status === "concluido") {
          acc.concluidos += 1;
          acc.gasto += Number(pedido.total || 0);
        }

        return acc;
      },
      {
        total: 0,
        ativos: 0,
        concluidos: 0,
        gasto: 0,
      },
    );
  }, [pedidos]);

  const pedidosFiltrados = useMemo(() => {
    if (filtro === "todos") {
      return pedidos;
    }

    return pedidos.filter((pedido) => pedido.status === filtro);
  }, [filtro, pedidos]);

  function abrirCancelamento(pedido) {
    if (pedido.status !== "pendente" || cancelandoId) {
      return;
    }

    setPedidoCancelar(pedido);
    setMensagem("");
    setTipoMensagem("");
  }

  function fecharCancelamento() {
    if (cancelandoId) {
      return;
    }

    setPedidoCancelar(null);
  }

  async function confirmarCancelamento() {
    if (!pedidoCancelar || cancelandoId) {
      return;
    }

    setCancelandoId(pedidoCancelar.pedido_id);
    setMensagem("");
    setTipoMensagem("");

    try {
      const { error } = await supabase.rpc("cancelar_pedido_cliente", {
        p_pedido_id: pedidoCancelar.pedido_id,
      });

      if (error) {
        throw error;
      }

      setMensagem("Pedido cancelado com sucesso e estoque devolvido.");
      setTipoMensagem("success");
      setPedidoCancelar(null);
      await carregarPedidos();
    } catch (error) {
      console.error("[BarberHub] Cancelar pedido do cliente:", error);
      setMensagem(error?.message || "Não foi possível cancelar este pedido.");
      setTipoMensagem("error");
    } finally {
      setCancelandoId("");
    }
  }

  return (
    <section className="client-orders-page">
      <div className="client-orders-header">
        <div>
          <span>COMPRAS</span>
          <h1>Meus pedidos</h1>
          <p>
            Acompanhe a confirmação, conclusão e o histórico das suas compras.
          </p>
        </div>

        <Link to="/cliente/produtos">🛍️ Ver produtos</Link>
      </div>

      <div className="client-orders-summary">
        <article>
          <small>PEDIDOS</small>
          <strong>{loading ? "—" : resumo.total}</strong>
          <span>Total registrado</span>
        </article>

        <article>
          <small>EM ANDAMENTO</small>
          <strong>{loading ? "—" : resumo.ativos}</strong>
          <span>Pendente ou confirmado</span>
        </article>

        <article>
          <small>CONCLUÍDOS</small>
          <strong>{loading ? "—" : resumo.concluidos}</strong>
          <span>Compras finalizadas</span>
        </article>

        <article>
          <small>TOTAL CONCLUÍDO</small>
          <strong>{loading ? "—" : moeda(resumo.gasto)}</strong>
          <span>Somente pedidos concluídos</span>
        </article>
      </div>

      <div className="client-orders-toolbar">
        <div className="client-orders-filters">
          {FILTROS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={filtro === item.value ? "active" : ""}
              onClick={() => setFiltro(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <button type="button" onClick={carregarPedidos} disabled={loading}>
          ↻ Atualizar
        </button>
      </div>

      {mensagem && (
        <div
          className={`client-orders-message${
            tipoMensagem ? ` client-orders-message--${tipoMensagem}` : ""
          }`}
          role="status"
        >
          {mensagem}
        </div>
      )}

      {loading && (
        <div className="client-orders-state">Carregando seus pedidos...</div>
      )}

      {!loading && erro && (
        <div className="client-orders-state client-orders-state--error">
          <strong>Não foi possível carregar os pedidos</strong>
          <p>{erro}</p>
          <button type="button" onClick={carregarPedidos}>
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && !erro && pedidosFiltrados.length === 0 && (
        <div className="client-orders-state">
          <strong>Nenhum pedido nesta categoria</strong>
          <p>
            {pedidos.length === 0
              ? "Quando você comprar um produto, o pedido aparecerá aqui."
              : "Escolha outro filtro para visualizar seus pedidos."}
          </p>
          {pedidos.length === 0 && (
            <Link to="/cliente/produtos">Ver produtos</Link>
          )}
        </div>
      )}

      {!loading && !erro && pedidosFiltrados.length > 0 && (
        <div className="client-orders-list">
          {pedidosFiltrados.map((pedido) => {
            const status = STATUS[pedido.status] || {
              label: pedido.status,
              icon: "•",
              className: "",
            };

            return (
              <article key={pedido.pedido_id} className="client-order-card">
                <div className="client-order-product">
                  {pedido.produto_foto_url ? (
                    <img
                      src={pedido.produto_foto_url}
                      alt={pedido.produto_nome}
                    />
                  ) : (
                    <div
                      className="client-order-product-placeholder"
                      aria-hidden="true"
                    >
                      🧴
                    </div>
                  )}

                  <div>
                    <span className="client-order-shop">
                      {pedido.barbearia_logo_url ? (
                        <img src={pedido.barbearia_logo_url} alt="" />
                      ) : (
                        <span aria-hidden="true">✂️</span>
                      )}
                      {pedido.barbearia_nome}
                    </span>

                    <h2>{pedido.produto_nome}</h2>
                    <p>
                      Pedido #
                      {String(pedido.pedido_id).slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                </div>

                <div className="client-order-status-wrap">
                  <span className={`client-order-status ${status.className}`}>
                    {status.icon} {status.label}
                  </span>
                  <small>{dataHora(pedido.created_at)}</small>
                </div>

                <div className="client-order-details">
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

                  <div>
                    <small>ORIGEM</small>
                    <strong>
                      {pedido.origem_pedido === "online"
                        ? "Online"
                        : "Presencial"}
                    </strong>
                  </div>
                </div>

                {(pedido.forma_pagamento || pedido.observacoes) && (
                  <div className="client-order-extra">
                    {pedido.forma_pagamento && (
                      <div className="client-order-payment-row">
                        <small>PAGAMENTO</small>
                        <span className="client-order-payment-badge">
                          {String(pedido.forma_pagamento)
                            .charAt(0)
                            .toUpperCase() +
                            String(pedido.forma_pagamento).slice(1)}
                        </span>
                      </div>
                    )}

                    {pedido.observacoes && (
                      <p>
                        <strong>Observações:</strong> {pedido.observacoes}
                      </p>
                    )}
                  </div>
                )}

                {pedido.status === "pendente" && (
                  <div className="client-order-actions">
                    <button
                      type="button"
                      onClick={() => abrirCancelamento(pedido)}
                      disabled={cancelandoId === pedido.pedido_id}
                    >
                      {cancelandoId === pedido.pedido_id
                        ? "Cancelando..."
                        : "Cancelar pedido"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {pedidoCancelar && (
        <div
          className="client-order-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              fecharCancelamento();
            }
          }}
        >
          <div
            className="client-order-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-order-cancel-title"
          >
            <div className="client-order-modal-header">
              <div>
                <span>CANCELAR PEDIDO</span>
                <h2 id="client-order-cancel-title">Confirmar cancelamento?</h2>
              </div>

              <button
                type="button"
                onClick={fecharCancelamento}
                disabled={Boolean(cancelandoId)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="client-order-modal-product">
              {pedidoCancelar.produto_foto_url ? (
                <img
                  src={pedidoCancelar.produto_foto_url}
                  alt={pedidoCancelar.produto_nome}
                />
              ) : (
                <div
                  className="client-order-product-placeholder"
                  aria-hidden="true"
                >
                  🧴
                </div>
              )}

              <div>
                <strong>{pedidoCancelar.produto_nome}</strong>
                <span>{pedidoCancelar.barbearia_nome}</span>
                <small>
                  {pedidoCancelar.quantidade} ×{" "}
                  {moeda(pedidoCancelar.preco_unitario)}
                </small>
              </div>
            </div>

            <div className="client-order-cancel-warning">
              <span aria-hidden="true">↩️</span>
              <p>
                O pedido será cancelado e a quantidade reservada voltará
                automaticamente para o estoque. Esta ação não poderá ser
                desfeita.
              </p>
            </div>

            <div className="client-order-modal-total">
              <span>Total do pedido</span>
              <strong>{moeda(pedidoCancelar.total)}</strong>
            </div>

            <div className="client-order-modal-actions">
              <button
                type="button"
                className="client-order-modal-back"
                onClick={fecharCancelamento}
                disabled={Boolean(cancelandoId)}
              >
                Manter pedido
              </button>

              <button
                type="button"
                className="client-order-modal-confirm"
                onClick={confirmarCancelamento}
                disabled={Boolean(cancelandoId)}
              >
                {cancelandoId ? "Cancelando..." : "Sim, cancelar pedido"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
