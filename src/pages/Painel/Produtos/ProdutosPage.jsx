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
import "./ProdutosPage.css";

const FORM_INICIAL = {
  id: null,
  nome: "",
  descricao: "",
  preco: "",
  estoque: "0",
  estoqueMinimo: "2",
  fotoUrl: "",
  fotoPath: "",
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function traduzirErro(error) {
  const texto = String(error?.message || "").toLowerCase();

  if (texto.includes("row-level security")) {
    return "Você não possui permissão para realizar esta operação.";
  }

  return error?.message || "Não foi possível concluir a operação.";
}

function extensaoImagem(file) {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[file?.type] || "jpg";
}

export default function ProdutosPage() {
  const { barbeariaId, barbearia } = useBarbearia();

  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("ativos");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  const [arquivoImagem, setArquivoImagem] = useState(null);
  const [previewImagem, setPreviewImagem] = useState("");
  const [removerImagem, setRemoverImagem] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const previewTemporarioRef = useRef(null);

  const carregarProdutos = useCallback(async () => {
    if (!barbeariaId) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc(
        "listar_produtos_painel",
        { p_barbearia_id: barbeariaId },
      );

      if (error) throw error;
      setProdutos(data || []);
    } catch (error) {
      console.error("[BarberHub] Erro ao carregar produtos:", error);
      setMessageType("error");
      setMessage(traduzirErro(error));
    } finally {
      setLoading(false);
    }
  }, [barbeariaId]);

  useEffect(() => {
    carregarProdutos();
  }, [carregarProdutos]);

  useEffect(() => {
    return () => {
      if (previewTemporarioRef.current) {
        URL.revokeObjectURL(previewTemporarioRef.current);
      }
    };
  }, []);

  const resumo = useMemo(() => {
    const ativos = produtos.filter((item) => item.ativo);
    const estoqueBaixo = ativos.filter((item) => {
      const atual = Number(item.estoque);
      return atual > 0 && atual <= Number(item.estoque_minimo);
    }).length;
    const semEstoque = ativos.filter((item) => Number(item.estoque) <= 0).length;
    const valorEstoque = ativos.reduce(
      (total, item) => total + Number(item.preco || 0) * Number(item.estoque || 0),
      0,
    );

    return {
      total: produtos.length,
      ativos: ativos.length,
      estoqueBaixo,
      semEstoque,
      valorEstoque,
    };
  }, [produtos]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return produtos.filter((produto) => {
      const estoque = Number(produto.estoque);
      const minimo = Number(produto.estoque_minimo);

      if (filtro === "ativos" && !produto.ativo) return false;
      if (filtro === "inativos" && produto.ativo) return false;
      if (filtro === "baixo" && !(produto.ativo && estoque > 0 && estoque <= minimo)) {
        return false;
      }
      if (filtro === "zerado" && !(produto.ativo && estoque <= 0)) return false;

      if (!termo) return true;

      return [produto.nome, produto.descricao]
        .filter(Boolean)
        .some((valor) => String(valor).toLowerCase().includes(termo));
    });
  }, [produtos, busca, filtro]);

  function limparPreviewTemporario() {
    if (previewTemporarioRef.current) {
      URL.revokeObjectURL(previewTemporarioRef.current);
      previewTemporarioRef.current = null;
    }
  }

  function abrirNovo() {
    limparPreviewTemporario();
    setForm(FORM_INICIAL);
    setArquivoImagem(null);
    setPreviewImagem("");
    setRemoverImagem(false);
    setMessage("");
    setModalOpen(true);
  }

  function abrirEdicao(produto) {
    limparPreviewTemporario();
    setForm({
      id: produto.produto_id,
      nome: produto.nome || "",
      descricao: produto.descricao || "",
      preco: String(produto.preco ?? ""),
      estoque: String(produto.estoque ?? 0),
      estoqueMinimo: String(produto.estoque_minimo ?? 2),
      fotoUrl: produto.foto_url || "",
      fotoPath: produto.foto_path || "",
    });
    setArquivoImagem(null);
    setPreviewImagem(produto.foto_url || "");
    setRemoverImagem(false);
    setMessage("");
    setModalOpen(true);
  }

  function fecharModal() {
    if (saving) return;

    limparPreviewTemporario();
    setModalOpen(false);
    setForm(FORM_INICIAL);
    setArquivoImagem(null);
    setPreviewImagem("");
    setRemoverImagem(false);
  }

  function alterarForm(event) {
    const { name, value } = event.target;
    setForm((atual) => ({ ...atual, [name]: value }));
  }

  function selecionarImagem(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!IMAGE_TYPES.includes(file.type)) {
      setMessageType("error");
      setMessage("A imagem precisa ser JPG, PNG ou WEBP.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setMessageType("error");
      setMessage("A imagem pode ter no máximo 5 MB.");
      event.target.value = "";
      return;
    }

    limparPreviewTemporario();
    const preview = URL.createObjectURL(file);
    previewTemporarioRef.current = preview;
    setArquivoImagem(file);
    setPreviewImagem(preview);
    setRemoverImagem(false);
    setMessage("");
  }

  function marcarRemoverImagem() {
    limparPreviewTemporario();
    setArquivoImagem(null);
    setPreviewImagem("");
    setRemoverImagem(true);
  }

  async function uploadImagem() {
    if (!arquivoImagem) {
      return {
        fotoUrl: removerImagem ? null : form.fotoUrl || null,
        fotoPath: removerImagem ? null : form.fotoPath || null,
        novoUpload: false,
      };
    }

    const path = `${barbeariaId}/${crypto.randomUUID()}.${extensaoImagem(arquivoImagem)}`;
    const { error } = await supabase.storage
      .from("produtos")
      .upload(path, arquivoImagem, { cacheControl: "3600", upsert: false });

    if (error) throw error;

    const { data } = supabase.storage.from("produtos").getPublicUrl(path);

    return {
      fotoUrl: data.publicUrl,
      fotoPath: path,
      novoUpload: true,
    };
  }

  async function removerArquivo(path) {
    if (!path) return;

    const { error } = await supabase.storage.from("produtos").remove([path]);
    if (error) {
      console.warn("[BarberHub] Não foi possível remover imagem do produto:", error);
    }
  }

  async function salvar(event) {
    event.preventDefault();

    const nome = form.nome.trim();
    const preco = Number(String(form.preco).replace(",", "."));
    const estoque = Number(form.estoque);
    const estoqueMinimo = Number(form.estoqueMinimo);

    if (!nome) {
      setMessageType("error");
      setMessage("Digite o nome do produto.");
      return;
    }

    if (!Number.isFinite(preco) || preco < 0) {
      setMessageType("error");
      setMessage("Informe um preço válido.");
      return;
    }

    if (!Number.isInteger(estoque) || estoque < 0) {
      setMessageType("error");
      setMessage("O estoque precisa ser um número inteiro igual ou maior que zero.");
      return;
    }

    if (!Number.isInteger(estoqueMinimo) || estoqueMinimo < 0) {
      setMessageType("error");
      setMessage("O estoque mínimo precisa ser um número inteiro igual ou maior que zero.");
      return;
    }

    setSaving(true);
    setMessage("");
    let imagem = null;

    try {
      imagem = await uploadImagem();

      const { error } = await supabase.rpc("salvar_produto_painel", {
        p_barbearia_id: barbeariaId,
        p_produto_id: form.id || null,
        p_nome: nome,
        p_descricao: form.descricao.trim() || null,
        p_preco: preco,
        p_estoque: estoque,
        p_estoque_minimo: estoqueMinimo,
        p_foto_url: imagem.fotoUrl,
        p_foto_path: imagem.fotoPath,
      });

      if (error) throw error;

      if ((imagem.novoUpload || removerImagem) && form.fotoPath) {
        await removerArquivo(form.fotoPath);
      }

      limparPreviewTemporario();
      setModalOpen(false);
      setForm(FORM_INICIAL);
      setArquivoImagem(null);
      setPreviewImagem("");
      setRemoverImagem(false);
      setMessageType("success");
      setMessage(form.id ? "Produto atualizado com sucesso." : "Produto cadastrado com sucesso.");
      await carregarProdutos();
    } catch (error) {
      console.error("[BarberHub] Erro ao salvar produto:", error);

      if (imagem?.novoUpload && imagem.fotoPath) {
        await removerArquivo(imagem.fotoPath);
      }

      setMessageType("error");
      setMessage(traduzirErro(error));
    } finally {
      setSaving(false);
    }
  }

  async function alterarStatus(produto) {
    const novoStatus = !produto.ativo;
    const confirmou = window.confirm(
      novoStatus
        ? `Reativar "${produto.nome}"?`
        : `Desativar "${produto.nome}"? O histórico será preservado.`,
    );

    if (!confirmou) return;

    try {
      const { error } = await supabase.rpc("alterar_status_produto_painel", {
        p_barbearia_id: barbeariaId,
        p_produto_id: produto.produto_id,
        p_ativo: novoStatus,
      });

      if (error) throw error;

      setMessageType("success");
      setMessage(novoStatus ? "Produto reativado com sucesso." : "Produto desativado com sucesso.");
      await carregarProdutos();
    } catch (error) {
      console.error("[BarberHub] Erro ao alterar status do produto:", error);
      setMessageType("error");
      setMessage(traduzirErro(error));
    }
  }

  function statusEstoque(produto) {
    const atual = Number(produto.estoque);
    const minimo = Number(produto.estoque_minimo);

    if (atual <= 0) return { classe: "stock-zero", texto: "Sem estoque" };
    if (atual <= minimo) return { classe: "stock-low", texto: "Estoque baixo" };
    return { classe: "stock-ok", texto: "Estoque normal" };
  }

  return (
    <section className="products-page">
      <div className="products-heading">
        <div>
          <span className="products-eyebrow">VENDAS</span>
          <h1>Produtos</h1>
          <p>
            Gerencie produtos, preços e estoque da{" "}
            <strong>{barbearia?.nome || "sua barbearia"}</strong>.
          </p>
        </div>

        <button type="button" className="products-primary" onClick={abrirNovo}>
          ＋ Novo produto
        </button>
      </div>

      {message ? (
        <div className={`products-message products-message--${messageType}`} role="status">
          {message}
        </div>
      ) : null}

      <div className="products-stats">
        <article><span>🛍️</span><div><small>PRODUTOS</small><strong>{loading ? "..." : resumo.total}</strong></div></article>
        <article><span>✅</span><div><small>ATIVOS</small><strong>{loading ? "..." : resumo.ativos}</strong></div></article>
        <article><span>⚠️</span><div><small>ESTOQUE BAIXO</small><strong>{loading ? "..." : resumo.estoqueBaixo}</strong></div></article>
        <article><span>📦</span><div><small>SEM ESTOQUE</small><strong>{loading ? "..." : resumo.semEstoque}</strong></div></article>
        <article><span>💰</span><div><small>VALOR EM ESTOQUE</small><strong>{loading ? "..." : formatarMoeda(resumo.valorEstoque)}</strong></div></article>
      </div>

      <div className="products-toolbar">
        <div className="products-search">
          <span>⌕</span>
          <input
            type="search"
            value={busca}
            placeholder="Buscar produto..."
            onChange={(event) => setBusca(event.target.value)}
          />
        </div>

        <div className="products-filters">
          {[
            ["ativos", "Ativos"],
            ["todos", "Todos"],
            ["baixo", "Estoque baixo"],
            ["zerado", "Sem estoque"],
            ["inativos", "Inativos"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filtro === value ? "products-filter products-filter--active" : "products-filter"}
              onClick={() => setFiltro(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <button type="button" className="products-refresh" disabled={loading} onClick={carregarProdutos}>
          ↻ Atualizar
        </button>
      </div>

      {loading ? (
        <div className="products-loading">Carregando produtos...</div>
      ) : filtrados.length ? (
        <div className="products-grid">
          {filtrados.map((produto) => {
            const estoqueStatus = statusEstoque(produto);

            return (
              <article
                key={produto.produto_id}
                className={`product-card${produto.ativo ? "" : " product-card--inactive"}`}
              >
                <div className="product-image-wrap">
                  {produto.foto_url ? (
                    <img src={produto.foto_url} alt={`Foto de ${produto.nome}`} className="product-image" />
                  ) : (
                    <div className="product-image product-image--empty">🛍️</div>
                  )}

                  <div className="product-badges">
                    <span className={produto.ativo ? "product-active-badge" : "product-inactive-badge"}>
                      {produto.ativo ? "Ativo" : "Inativo"}
                    </span>
                    {produto.ativo ? (
                      <span className={`product-stock-badge ${estoqueStatus.classe}`}>
                        {estoqueStatus.texto}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="product-card-content">
                  <span className="products-eyebrow">PRODUTO</span>
                  <h2>{produto.nome}</h2>
                  <p className={`product-description${produto.descricao ? "" : " product-description--muted"}`}>
                    {produto.descricao || "Sem descrição."}
                  </p>
                  <strong className="product-price">{formatarMoeda(produto.preco)}</strong>
                </div>

                <div className="product-stock-grid">
                  <div><small>ESTOQUE</small><strong>{produto.estoque}</strong></div>
                  <div><small>MÍNIMO</small><strong>{produto.estoque_minimo}</strong></div>
                  <div><small>VENDIDOS</small><strong>{produto.unidades_vendidas}</strong></div>
                </div>

                <div className="product-revenue">
                  <span>Faturamento confirmado</span>
                  <strong>{formatarMoeda(produto.faturamento)}</strong>
                </div>

                <div className="product-card-actions">
                  <button type="button" onClick={() => abrirEdicao(produto)}>Editar</button>
                  <button
                    type="button"
                    className={produto.ativo ? "product-danger" : "product-success"}
                    onClick={() => alterarStatus(produto)}
                  >
                    {produto.ativo ? "Desativar" : "Reativar"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon="🛍️"
          title="Nenhum produto encontrado"
          description={
            filtro === "ativos"
              ? "Cadastre o primeiro produto da barbearia."
              : "Nenhum produto corresponde aos filtros atuais."
          }
        />
      )}

      {modalOpen ? (
        <div
          className="products-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) fecharModal();
          }}
        >
          <div className="products-modal" role="dialog" aria-modal="true">
            <div className="products-modal-header">
              <div>
                <span className="products-eyebrow">{form.id ? "EDITAR PRODUTO" : "NOVO PRODUTO"}</span>
                <h2>{form.id ? "Editar produto" : "Cadastrar produto"}</h2>
                <p>Cadastre preço, estoque e uma foto opcional do produto.</p>
              </div>
              <button type="button" className="products-modal-close" onClick={fecharModal}>×</button>
            </div>

            <form className="products-form" onSubmit={salvar} noValidate>
              <div className="products-image-section">
                <div className="products-preview">
                  {previewImagem ? <img src={previewImagem} alt="Prévia do produto" /> : <span>🛍️</span>}
                </div>

                <div className="products-image-actions">
                  <label htmlFor="product-image" className="products-image-button">
                    {previewImagem ? "Trocar foto" : "Adicionar foto"}
                  </label>
                  <input
                    id="product-image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={saving}
                    onChange={selecionarImagem}
                  />
                  {previewImagem ? (
                    <button type="button" className="products-remove-image" disabled={saving} onClick={marcarRemoverImagem}>
                      Remover foto
                    </button>
                  ) : null}
                  <small>JPG, PNG ou WEBP · máximo 5 MB</small>
                </div>
              </div>

              <div className="products-field products-field--full">
                <label htmlFor="product-name">Nome *</label>
                <input
                  id="product-name"
                  name="nome"
                  type="text"
                  maxLength={120}
                  value={form.nome}
                  placeholder="Ex.: Pomada modeladora"
                  autoFocus
                  disabled={saving}
                  onChange={alterarForm}
                />
              </div>

              <div className="products-field products-field--full">
                <label htmlFor="product-description">Descrição</label>
                <textarea
                  id="product-description"
                  name="descricao"
                  rows={3}
                  maxLength={800}
                  value={form.descricao}
                  placeholder="Descrição opcional do produto..."
                  disabled={saving}
                  onChange={alterarForm}
                />
              </div>

              <div className="products-field">
                <label htmlFor="product-price">Preço *</label>
                <input
                  id="product-price"
                  name="preco"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.preco}
                  placeholder="0,00"
                  disabled={saving}
                  onChange={alterarForm}
                />
              </div>

              <div className="products-field">
                <label htmlFor="product-stock">Estoque atual *</label>
                <input
                  id="product-stock"
                  name="estoque"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={form.estoque}
                  disabled={saving}
                  onChange={alterarForm}
                />
              </div>

              <div className="products-field">
                <label htmlFor="product-min-stock">Estoque mínimo *</label>
                <input
                  id="product-min-stock"
                  name="estoqueMinimo"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={form.estoqueMinimo}
                  disabled={saving}
                  onChange={alterarForm}
                />
                <small>O painel avisa quando o estoque chegar neste valor.</small>
              </div>

              <div className="products-form-actions">
                <button type="button" className="products-secondary" disabled={saving} onClick={fecharModal}>
                  Cancelar
                </button>
                <button type="submit" className="products-primary" disabled={saving}>
                  {saving ? "Salvando..." : form.id ? "Salvar alterações" : "Cadastrar produto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
