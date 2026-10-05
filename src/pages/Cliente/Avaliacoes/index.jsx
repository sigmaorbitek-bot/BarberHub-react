import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "../../../services/supabase";

import "./ClienteAvaliacoesPage.css";

const NOTA_LABELS = {
  1: "Ruim",
  2: "Regular",
  3: "Bom",
  4: "Muito bom",
  5: "Excelente",
};

function formatarData(data) {
  if (!data) return "Data não informada";

  const valor = new Date(data);

  if (Number.isNaN(valor.getTime())) {
    return "Data não informada";
  }

  return valor.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function estrelas(nota) {
  const valor = Math.max(0, Math.min(5, Number(nota) || 0));

  return Array.from({ length: 5 }, (_, indice) =>
    indice < valor ? "★" : "☆",
  ).join("");
}

export default function ClienteAvaliacoesPage() {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [modalAberto, setModalAberto] = useState(false);
  const [atendimentoSelecionado, setAtendimentoSelecionado] = useState(null);
  const [nota, setNota] = useState(5);
  const [comentario, setComentario] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");

    try {
      const { data, error } = await supabase.rpc(
        "listar_avaliacoes_cliente",
      );

      if (error) {
        throw error;
      }

      setItens(data || []);
    } catch (error) {
      console.error("[BarberHub] Avaliações do cliente:", error);

      setItens([]);
      setErro(
        error?.message ||
          "Não foi possível carregar suas avaliações agora.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!modalAberto) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape" && !salvando) {
        fecharModal();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalAberto, salvando]);

  const pendentes = useMemo(
    () => itens.filter((item) => !item.avaliacao_id),
    [itens],
  );

  const historico = useMemo(
    () => itens.filter((item) => Boolean(item.avaliacao_id)),
    [itens],
  );

  const media = useMemo(() => {
    if (!historico.length) return 0;

    const soma = historico.reduce(
      (total, item) => total + Number(item.nota || 0),
      0,
    );

    return soma / historico.length;
  }, [historico]);

  function abrirModal(item) {
    setAtendimentoSelecionado(item);
    setNota(5);
    setComentario("");
    setErro("");
    setMensagem("");
    setModalAberto(true);
  }

  function fecharModal() {
    if (salvando) return;

    setModalAberto(false);
    setAtendimentoSelecionado(null);
    setNota(5);
    setComentario("");
  }

  function handleOverlayMouseDown(event) {
    if (event.target === event.currentTarget) {
      fecharModal();
    }
  }

  async function enviarAvaliacao(event) {
    event.preventDefault();

    if (!atendimentoSelecionado || salvando) {
      return;
    }

    const texto = comentario.trim();

    if (texto.length > 500) {
      setErro("O comentário deve ter no máximo 500 caracteres.");
      return;
    }

    setSalvando(true);
    setErro("");
    setMensagem("");

    try {
      const { error } = await supabase.rpc(
        "enviar_avaliacao_cliente",
        {
          p_agendamento_id:
            atendimentoSelecionado.agendamento_id,
          p_nota: Number(nota),
          p_comentario: texto || null,
        },
      );

      if (error) {
        throw error;
      }

      setMensagem("Avaliação enviada com sucesso. ⭐");
      setModalAberto(false);
      setAtendimentoSelecionado(null);
      setComentario("");
      setNota(5);

      await carregar();
    } catch (error) {
      console.error("[BarberHub] Enviar avaliação:", error);

      const textoErro = String(error?.message || "");

      if (
        textoErro.toLowerCase().includes("já possui uma avaliação") ||
        error?.code === "23505"
      ) {
        setErro("Este atendimento já possui uma avaliação.");
      } else {
        setErro(
          error?.message ||
            "Não foi possível enviar sua avaliação.",
        );
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="client-reviews-page">
      <div className="client-reviews-header">
        <div>
          <span>EXPERIÊNCIA</span>
          <h1>Avaliações</h1>
          <p>
            Avalie atendimentos concluídos e acompanhe as respostas
            das barbearias.
          </p>
        </div>

        <button
          type="button"
          className="client-reviews-refresh"
          onClick={carregar}
          disabled={loading}
        >
          ↻ {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {mensagem && (
        <div
          className="client-reviews-message client-reviews-message--success"
          role="status"
        >
          {mensagem}
        </div>
      )}

      {erro && !modalAberto && (
        <div
          className="client-reviews-message client-reviews-message--error"
          role="alert"
        >
          {erro}
        </div>
      )}

      <div className="client-reviews-summary">
        <article>
          <small>AGUARDANDO AVALIAÇÃO</small>
          <strong>{loading ? "—" : pendentes.length}</strong>
          <p>Atendimentos concluídos</p>
        </article>

        <article>
          <small>AVALIAÇÕES ENVIADAS</small>
          <strong>{loading ? "—" : historico.length}</strong>
          <p>Seu histórico</p>
        </article>

        <article>
          <small>SUA MÉDIA</small>
          <strong>
            {loading || !historico.length
              ? "—"
              : media.toLocaleString("pt-BR", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
          </strong>
          <p>
            {historico.length
              ? estrelas(Math.round(media))
              : "Nenhuma nota enviada"}
          </p>
        </article>
      </div>

      <div className="client-reviews-section">
        <div className="client-reviews-section-heading">
          <div>
            <span>PARA AVALIAR</span>
            <h2>Como foi seu atendimento?</h2>
          </div>
        </div>

        {loading && (
          <div className="client-reviews-state">
            Carregando atendimentos...
          </div>
        )}

        {!loading && !erro && pendentes.length === 0 && (
          <div className="client-reviews-empty">
            <div>⭐</div>
            <strong>Nenhum atendimento aguardando avaliação</strong>
            <p>
              Quando um atendimento for concluído, ele aparecerá aqui
              para você avaliar.
            </p>
          </div>
        )}

        {!loading && pendentes.length > 0 && (
          <div className="client-reviews-pending-list">
            {pendentes.map((item) => (
              <article
                key={item.agendamento_id}
                className="client-reviews-pending-card"
              >
                <div className="client-reviews-business">
                  {item.barbearia_logo_url ? (
                    <img
                      src={item.barbearia_logo_url}
                      alt=""
                    />
                  ) : (
                    <div aria-hidden="true">💈</div>
                  )}

                  <div>
                    <strong>{item.barbearia_nome}</strong>
                    <span>
                      {item.barbearia_cidade ||
                        "Barbearia BarberHub"}
                    </span>
                  </div>
                </div>

                <div className="client-reviews-service">
                  <small>SERVIÇO</small>
                  <strong>{item.servico_nome}</strong>
                  <span>
                    {item.profissional_nome ||
                      "Profissional não informado"}
                  </span>
                </div>

                <div className="client-reviews-date">
                  <small>ATENDIMENTO</small>
                  <strong>{formatarData(item.data_atendimento)}</strong>
                </div>

                <button
                  type="button"
                  onClick={() => abrirModal(item)}
                >
                  ⭐ Avaliar atendimento
                </button>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="client-reviews-section">
        <div className="client-reviews-section-heading">
          <div>
            <span>HISTÓRICO</span>
            <h2>Minhas avaliações</h2>
          </div>
        </div>

        {!loading && !erro && historico.length === 0 && (
          <div className="client-reviews-empty client-reviews-empty--small">
            <div>💬</div>
            <strong>Você ainda não enviou avaliações</strong>
            <p>Suas avaliações aparecerão aqui.</p>
          </div>
        )}

        {!loading && historico.length > 0 && (
          <div className="client-reviews-history">
            {historico.map((item) => (
              <article
                key={item.avaliacao_id}
                className="client-reviews-history-card"
              >
                <div className="client-reviews-history-top">
                  <div className="client-reviews-business">
                    {item.barbearia_logo_url ? (
                      <img
                        src={item.barbearia_logo_url}
                        alt=""
                      />
                    ) : (
                      <div aria-hidden="true">💈</div>
                    )}

                    <div>
                      <strong>{item.barbearia_nome}</strong>
                      <span>
                        {item.servico_nome} ·{" "}
                        {formatarData(item.data_atendimento)}
                      </span>
                    </div>
                  </div>

                  <div className="client-reviews-stars">
                    {estrelas(item.nota)}
                    <small>
                      {item.nota}/5 ·{" "}
                      {NOTA_LABELS[item.nota] || "Avaliado"}
                    </small>
                  </div>
                </div>

                <div className="client-reviews-comment">
                  <small>SEU COMENTÁRIO</small>
                  <p>
                    {item.comentario ||
                      "Você enviou esta avaliação sem comentário."}
                  </p>
                </div>

                {item.resposta_barbearia && (
                  <div className="client-reviews-reply">
                    <div aria-hidden="true">↳</div>
                    <div>
                      <small>RESPOSTA DA BARBEARIA</small>
                      <p>{item.resposta_barbearia}</p>
                      {item.respondida_at && (
                        <span>
                          Respondido em{" "}
                          {formatarData(item.respondida_at)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {modalAberto && atendimentoSelecionado && (
        <div
          className="client-review-modal-backdrop"
          role="presentation"
          onMouseDown={handleOverlayMouseDown}
        >
          <div
            className="client-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-review-modal-title"
          >
            <div className="client-review-modal-header">
              <div>
                <span>AVALIAR ATENDIMENTO</span>
                <h2 id="client-review-modal-title">
                  {atendimentoSelecionado.servico_nome}
                </h2>
              </div>

              <button
                type="button"
                className="client-review-modal-close"
                onClick={fecharModal}
                disabled={salvando}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="client-review-modal-business">
              <strong>{atendimentoSelecionado.barbearia_nome}</strong>
              <span>
                {atendimentoSelecionado.profissional_nome ||
                  "Profissional não informado"}{" "}
                ·{" "}
                {formatarData(
                  atendimentoSelecionado.data_atendimento,
                )}
              </span>
            </div>

            <form onSubmit={enviarAvaliacao}>
              <div className="client-review-rating">
                <label>Sua nota</label>

                <div
                  className="client-review-stars-input"
                  role="radiogroup"
                  aria-label="Nota da avaliação"
                >
                  {[1, 2, 3, 4, 5].map((valor) => (
                    <button
                      key={valor}
                      type="button"
                      className={
                        valor <= nota
                          ? "client-review-star client-review-star--active"
                          : "client-review-star"
                      }
                      onClick={() => setNota(valor)}
                      disabled={salvando}
                      aria-label={`${valor} estrela${
                        valor > 1 ? "s" : ""
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>

                <strong>
                  {nota}/5 · {NOTA_LABELS[nota]}
                </strong>
              </div>

              <div className="client-review-field">
                <div>
                  <label htmlFor="client-review-comment">
                    Comentário
                  </label>
                  <span>{comentario.length}/500</span>
                </div>

                <textarea
                  id="client-review-comment"
                  value={comentario}
                  onChange={(event) =>
                    setComentario(event.target.value.slice(0, 500))
                  }
                  placeholder="Conte como foi sua experiência..."
                  maxLength={500}
                  rows={5}
                  disabled={salvando}
                />
              </div>

              {erro && (
                <div
                  className="client-reviews-message client-reviews-message--error"
                  role="alert"
                >
                  {erro}
                </div>
              )}

              <div className="client-review-modal-info">
                <span aria-hidden="true">🔒</span>
                <p>
                  A avaliação fica vinculada a este atendimento e só
                  pode ser enviada uma vez.
                </p>
              </div>

              <div className="client-review-modal-actions">
                <button
                  type="button"
                  className="client-review-secondary"
                  onClick={fecharModal}
                  disabled={salvando}
                >
                  Voltar
                </button>

                <button
                  type="submit"
                  className="client-review-primary"
                  disabled={salvando}
                >
                  {salvando
                    ? "Enviando..."
                    : "⭐ Enviar avaliação"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
