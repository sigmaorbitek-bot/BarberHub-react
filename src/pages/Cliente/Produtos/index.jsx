import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { supabase } from "../../../services/supabase";

import "./ClienteProdutosPage.css";

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function textoErro(error) {
  const mensagem = String(error?.message || "");

  if (mensagem.toLowerCase().includes("estoque insuficiente")) {
    return "A quantidade escolhida não está mais disponível em estoque.";
  }

  if (mensagem.toLowerCase().includes("produto não encontrado")) {
    return "Este produto não está mais disponível para compra.";
  }

  return mensagem || "Não foi possível concluir a operação.";
}

export default function ClienteProdutosPage() {
  const [produtos, setProdutos] = useState([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [quantidade, setQuantidade] = useState(1);
  const [comprando, setComprando] = useState(false);
  const [mensagemModal, setMensagemModal] = useState("");
  const [pedidoCriado, setPedidoCriado] = useState(false);

  async function carregarProdutos() {
    setLoading(true);
    setErro("");

    try {
      const { data, error } = await supabase.rpc("listar_produtos_cliente", {
        p_busca: null,
      });

      if (error) {
        throw error;
      }

      setProdutos(data || []);
    } catch (error) {
      console.error("[BarberHub] Produtos do cliente:", error);
      setProdutos([]);
      setErro("Não foi possível carregar os produtos agora.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarProdutos();
  }, []);

  useEffect(() => {
    if (!produtoSelecionado) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        fecharCompra();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [produtoSelecionado, comprando]);

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) {
      return produtos;
    }

    return produtos.filter((produto) => {
      const texto = [
        produto.nome,
        produto.descricao,
        produto.barbearia_nome,
        produto.barbearia_cidade,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return texto.includes(termo);
    });
  }, [busca, produtos]);

  function abrirCompra(produto) {
    if (Number(produto.estoque || 0) <= 0) {
      return;
    }

    setProdutoSelecionado(produto);
    setQuantidade(1);
    setMensagemModal("");
    setPedidoCriado(false);
  }

  function fecharCompra() {
    if (comprando) {
      return;
    }

    setProdutoSelecionado(null);
    setQuantidade(1);
    setMensagemModal("");
    setPedidoCriado(false);
  }

  function alterarQuantidade(valor) {
    if (!produtoSelecionado) {
      return;
    }

    const estoque = Number(produtoSelecionado.estoque || 0);
    const novaQuantidade = Math.max(1, Math.min(Number(valor) || 1, estoque));

    setQuantidade(novaQuantidade);
  }

  async function confirmarCompra() {
    if (!produtoSelecionado || comprando) {
      return;
    }

    setComprando(true);
    setMensagemModal("");

    try {
      const { error } = await supabase.rpc("criar_pedido", {
        p_produto_id: produtoSelecionado.produto_id,
        p_quantidade: quantidade,
      });

      if (error) {
        throw error;
      }

      setPedidoCriado(true);
      setMensagemModal(
        "Pedido enviado com sucesso. A barbearia já pode acompanhar sua solicitação.",
      );

      await carregarProdutos();
    } catch (error) {
      console.error("[BarberHub] Criar pedido do cliente:", error);
      setMensagemModal(textoErro(error));
    } finally {
      setComprando(false);
    }
  }

  return (
    <section className="client-products-page">
      <div className="client-products-header">
        <div>
          <span>LOJA</span>
          <h1>Produtos</h1>
          <p>
            Encontre produtos disponíveis nas barbearias e faça seu pedido com
            estoque reservado no momento da compra.
          </p>
        </div>

        <Link to="/cliente/pedidos" className="client-products-orders-link">
          📦 Meus pedidos
        </Link>
      </div>

      <div className="client-products-toolbar">
        <label className="client-products-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Buscar produto ou barbearia..."
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
        </label>

        <button type="button" onClick={carregarProdutos} disabled={loading}>
          ↻ Atualizar
        </button>
      </div>

      {loading && (
        <div className="client-products-state">Carregando produtos...</div>
      )}

      {!loading && erro && (
        <div className="client-products-state client-products-state--error">
          <strong>Não foi possível carregar o catálogo</strong>
          <p>{erro}</p>
          <button type="button" onClick={carregarProdutos}>
            Tentar novamente
          </button>
        </div>
      )}

      {!loading && !erro && produtosFiltrados.length === 0 && (
        <div className="client-products-state">
          <strong>Nenhum produto encontrado</strong>
          <p>Altere sua busca ou tente novamente mais tarde.</p>
        </div>
      )}

      {!loading && !erro && produtosFiltrados.length > 0 && (
        <div className="client-products-grid">
          {produtosFiltrados.map((produto) => {
            const estoque = Number(produto.estoque || 0);
            const semEstoque = estoque <= 0;
            const ultimasUnidades = estoque > 0 && estoque <= 3;

            return (
              <article
                key={produto.produto_id}
                className={`client-product-card${
                  semEstoque ? " client-product-card--out" : ""
                }`}
              >
                <div className="client-product-image-wrap">
                  {produto.foto_url ? (
                    <img
                      src={produto.foto_url}
                      alt={produto.nome}
                      className="client-product-image"
                    />
                  ) : (
                    <div
                      className="client-product-image-placeholder"
                      aria-hidden="true"
                    >
                      🧴
                    </div>
                  )}

                  <span
                    className={`client-product-stock${
                      semEstoque
                        ? " client-product-stock--out"
                        : ultimasUnidades
                          ? " client-product-stock--low"
                          : ""
                    }`}
                  >
                    {semEstoque
                      ? "Sem estoque"
                      : ultimasUnidades
                        ? `Últimas ${estoque} unidade${estoque === 1 ? "" : "s"}`
                        : `${estoque} em estoque`}
                  </span>
                </div>

                <div className="client-product-body">
                  <div className="client-product-shop">
                    {produto.barbearia_logo_url ? (
                      <img src={produto.barbearia_logo_url} alt="" />
                    ) : (
                      <span aria-hidden="true">✂️</span>
                    )}

                    <div>
                      <strong>{produto.barbearia_nome}</strong>
                      {produto.barbearia_cidade && (
                        <small>{produto.barbearia_cidade}</small>
                      )}
                    </div>
                  </div>

                  <h2>{produto.nome}</h2>

                  <p className="client-product-description">
                    {produto.descricao || "Produto disponível para compra."}
                  </p>

                  <div className="client-product-footer">
                    <strong>{moeda(produto.preco)}</strong>

                    <button
                      type="button"
                      disabled={semEstoque}
                      onClick={() => abrirCompra(produto)}
                    >
                      {semEstoque ? "Indisponível" : "Comprar"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {produtoSelecionado && (
        <div
          className="client-product-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              fecharCompra();
            }
          }}
        >
          <div
            className="client-product-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-product-modal-title"
          >
            <div className="client-product-modal-header">
              <div>
                <span>CONFIRMAR PEDIDO</span>
                <h2 id="client-product-modal-title">
                  {produtoSelecionado.nome}
                </h2>
              </div>

              <button
                type="button"
                onClick={fecharCompra}
                disabled={comprando}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="client-product-modal-product">
              {produtoSelecionado.foto_url ? (
                <img
                  src={produtoSelecionado.foto_url}
                  alt={produtoSelecionado.nome}
                />
              ) : (
                <div
                  className="client-product-modal-product-placeholder"
                  aria-hidden="true"
                >
                  🧴
                </div>
              )}

              <div>
                <small>PRODUTO</small>
                <strong>{produtoSelecionado.nome}</strong>
                <span>{moeda(produtoSelecionado.preco)} por unidade</span>
              </div>
            </div>

            <div className="client-product-modal-shop">
              {produtoSelecionado.barbearia_logo_url ? (
                <img src={produtoSelecionado.barbearia_logo_url} alt="" />
              ) : (
                <span aria-hidden="true">✂️</span>
              )}

              <div>
                <small>BARBEARIA</small>
                <strong>{produtoSelecionado.barbearia_nome}</strong>
              </div>
            </div>

            {!pedidoCriado && (
              <>
                <div className="client-product-quantity-row">
                  <div>
                    <small>QUANTIDADE</small>
                    <strong>
                      Disponível: {produtoSelecionado.estoque} unidade(s)
                    </strong>
                  </div>

                  <div className="client-product-quantity">
                    <button
                      type="button"
                      onClick={() => alterarQuantidade(quantidade - 1)}
                      disabled={quantidade <= 1 || comprando}
                    >
                      −
                    </button>

                    <input
                      type="number"
                      min="1"
                      max={produtoSelecionado.estoque}
                      value={quantidade}
                      onChange={(event) =>
                        alterarQuantidade(event.target.value)
                      }
                      disabled={comprando}
                    />

                    <button
                      type="button"
                      onClick={() => alterarQuantidade(quantidade + 1)}
                      disabled={
                        quantidade >= Number(produtoSelecionado.estoque) ||
                        comprando
                      }
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="client-product-summary">
                  <div>
                    <span>Total do pedido</span>
                    <small>
                      {quantidade} × {moeda(produtoSelecionado.preco)}
                    </small>
                  </div>

                  <strong>
                    {moeda(Number(produtoSelecionado.preco) * quantidade)}
                  </strong>
                </div>

                <div className="client-product-reservation-note">
                  <span aria-hidden="true">🔒</span>
                  <p>
                    Ao confirmar, o estoque será reservado imediatamente e o
                    pedido ficará como <strong>Pendente</strong> até a barbearia
                    confirmar.
                  </p>
                </div>
              </>
            )}

            {mensagemModal && (
              <div
                className={`client-product-message${
                  pedidoCriado ? " client-product-message--success" : ""
                }`}
              >
                {mensagemModal}
              </div>
            )}

            <div className="client-product-modal-actions">
              {pedidoCriado ? (
                <>
                  <button type="button" onClick={fecharCompra}>
                    Continuar comprando
                  </button>

                  <Link to="/cliente/pedidos">Ver meus pedidos</Link>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="client-product-cancel"
                    onClick={fecharCompra}
                    disabled={comprando}
                  >
                    Voltar
                  </button>

                  <button
                    type="button"
                    className="client-product-confirm"
                    onClick={confirmarCompra}
                    disabled={comprando}
                  >
                    {comprando ? "Enviando..." : "Confirmar pedido"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
