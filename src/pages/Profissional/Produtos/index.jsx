import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "../../../services/supabase";
import { useProfissional } from "../useProfissional";
import "../Profissional.css";
import "./ProfissionalProdutosPage.css";

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function ProfissionalProdutosPage() {
  const { contexto } = useProfissional();
  const [produtos, setProdutos] = useState([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const carregar = useCallback(async () => {
    if (!contexto.ver_produtos) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "listar_produtos_profissional",
      );

      if (error) {
        throw error;
      }

      setProdutos(data || []);
    } catch (error) {
      console.warn("[BarberHub] Produtos profissional:", error);
      setMessage(
        error?.message ||
          "Este módulo será liberado quando a RPC de produtos do profissional for aplicada.",
      );
      setProdutos([]);
    } finally {
      setLoading(false);
    }
  }, [contexto.ver_produtos]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return produtos;
    return produtos.filter((produto) =>
      String(produto.nome || "").toLowerCase().includes(termo),
    );
  }, [produtos, busca]);

  if (!contexto.ver_produtos) {
    return (
      <section className="professional-page">
        <span className="professional-eyebrow">PRODUTOS</span>
        <h1>Produtos</h1>
        <div className="professional-empty">A barbearia não liberou este módulo para sua conta.</div>
      </section>
    );
  }

  return (
    <section className="professional-page">
      <div className="professional-page-heading">
        <div>
          <span className="professional-eyebrow">CATÁLOGO</span>
          <h1>Produtos</h1>
          <p>Consulte estoque e preços conforme sua permissão.</p>
        </div>
        <button type="button" className="professional-secondary-button" onClick={carregar} disabled={loading}>
          ↻ Atualizar
        </button>
      </div>

      <div className="professional-search-box">
        <input type="search" value={busca} placeholder="Buscar produto..." onChange={(event) => setBusca(event.target.value)} />
      </div>

      {message ? <div className="professional-message">{message}</div> : null}

      {loading ? (
        <div className="professional-empty">Carregando...</div>
      ) : filtrados.length ? (
        <div className="professional-product-grid">
          {filtrados.map((produto) => (
            <article key={produto.id} className="professional-panel-card">
              <div className="professional-product-image">
                {produto.foto_url ? <img src={produto.foto_url} alt={produto.nome} /> : <span>🛍️</span>}
              </div>
              <strong>{produto.nome}</strong>
              <span>{moeda(produto.preco)}</span>
              {produto.estoque != null ? <small>Estoque: {produto.estoque}</small> : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="professional-empty">Nenhum produto encontrado.</div>
      )}
    </section>
  );
}
