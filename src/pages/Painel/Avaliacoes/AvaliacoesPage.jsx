import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import EmptyState from "../../../components/Painel/EmptyState/EmptyState";
import { useBarbearia } from "../../../hooks/useBarbearia";
import { supabase } from "../../../services/supabase";
import "./AvaliacoesPage.css";

function dataHora(valor) {
  if (!valor) {
    return "—";
  }

  const data = new Date(valor);

  if (
    Number.isNaN(
      data.getTime(),
    )
  ) {
    return "—";
  }

  return data.toLocaleString(
    "pt-BR",
    {
      dateStyle: "short",
      timeStyle: "short",
    },
  );
}

function estrelas(nota) {
  const segura = Math.max(
    0,
    Math.min(
      5,
      Number(nota) || 0,
    ),
  );

  return Array.from(
    {
      length: 5,
    },
    (_, index) =>
      index < segura
        ? "★"
        : "☆",
  ).join("");
}

export default function AvaliacoesPage() {
  const {
    barbeariaId,
    barbearia,
  } = useBarbearia();

  const [
    avaliacoes,
    setAvaliacoes,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    filtroNota,
    setFiltroNota,
  ] = useState("todas");

  const [
    filtroResposta,
    setFiltroResposta,
  ] = useState("todas");

  const [
    busca,
    setBusca,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    messageType,
    setMessageType,
  ] = useState("success");

  const [
    modal,
    setModal,
  ] = useState(false);

  const [
    selecionada,
    setSelecionada,
  ] = useState(null);

  const [
    resposta,
    setResposta,
  ] = useState("");

  const carregar =
    useCallback(
      async () => {
        if (!barbeariaId) {
          return;
        }

        setLoading(true);

        try {
          const {
            data,
            error,
          } =
            await supabase.rpc(
              "listar_avaliacoes_painel",
              {
                p_barbearia_id:
                  barbeariaId,
              },
            );

          if (error) {
            throw error;
          }

          setAvaliacoes(
            data || [],
          );
        } catch (error) {
          console.error(
            "[BarberHub] Erro ao carregar avaliações:",
            error,
          );

          setMessageType(
            "error",
          );

          setMessage(
            error?.message ||
              "Não foi possível carregar as avaliações.",
          );
        } finally {
          setLoading(false);
        }
      },
      [barbeariaId],
    );

  useEffect(() => {
    carregar();
  }, [carregar]);

  const resumo =
    useMemo(() => {
      const total =
        avaliacoes.length;

      const soma =
        avaliacoes.reduce(
          (
            acumulado,
            item,
          ) =>
            acumulado +
            Number(
              item.nota ||
                0,
            ),
          0,
        );

      const media =
        total
          ? soma / total
          : 0;

      const distribuicao = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      };

      let respondidas = 0;

      for (
        const item
        of avaliacoes
      ) {
        if (
          distribuicao[
            item.nota
          ] !== undefined
        ) {
          distribuicao[
            item.nota
          ] += 1;
        }

        if (
          item.resposta_barbearia
        ) {
          respondidas += 1;
        }
      }

      return {
        total,
        media,
        distribuicao,
        respondidas,
        semResposta:
          total -
          respondidas,
      };
    }, [avaliacoes]);

  const filtradas =
    useMemo(() => {
      const termo =
        busca
          .trim()
          .toLowerCase();

      return avaliacoes.filter(
        (item) => {
          if (
            filtroNota !==
              "todas" &&
            Number(
              item.nota,
            ) !==
              Number(
                filtroNota,
              )
          ) {
            return false;
          }

          if (
            filtroResposta ===
              "respondidas" &&
            !item.resposta_barbearia
          ) {
            return false;
          }

          if (
            filtroResposta ===
              "pendentes" &&
            item.resposta_barbearia
          ) {
            return false;
          }

          if (!termo) {
            return true;
          }

          return [
            item.cliente_nome,
            item.comentario,
            item.servico_nome,
            item.profissional_nome,
          ]
            .filter(Boolean)
            .some(
              (valor) =>
                String(valor)
                  .toLowerCase()
                  .includes(
                    termo,
                  ),
            );
        },
      );
    }, [
      avaliacoes,
      busca,
      filtroNota,
      filtroResposta,
    ]);

  function abrirResposta(
    item,
  ) {
    setSelecionada(
      item,
    );

    setResposta(
      item.resposta_barbearia ||
        "",
    );

    setMessage("");
    setModal(true);
  }

  async function salvarResposta(
    event,
  ) {
    event.preventDefault();

    if (!selecionada) {
      return;
    }

    if (
      resposta.length >
      1000
    ) {
      setMessageType(
        "error",
      );
      setMessage(
        "A resposta deve ter no máximo 1000 caracteres.",
      );
      return;
    }

    setSaving(true);

    try {
      const { error } =
        await supabase.rpc(
          "responder_avaliacao_painel",
          {
            p_barbearia_id:
              barbeariaId,
            p_avaliacao_id:
              selecionada.avaliacao_id,
            p_resposta:
              resposta.trim() ||
              null,
          },
        );

      if (error) {
        throw error;
      }

      setModal(false);
      setMessageType(
        "success",
      );

      setMessage(
        resposta.trim()
          ? "Resposta salva com sucesso."
          : "Resposta removida.",
      );

      await carregar();
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao responder avaliação:",
        error,
      );

      setMessageType(
        "error",
      );

      setMessage(
        error?.message ||
          "Não foi possível salvar a resposta.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="reviews-page">
      <div className="reviews-heading">
        <div>
          <span className="reviews-eyebrow">
            EXPERIÊNCIA DO CLIENTE
          </span>

          <h1>
            Avaliações
          </h1>

          <p>
            Acompanhe notas e comentários recebidos pela{" "}
            <strong>
              {barbearia?.nome ||
                "sua barbearia"}
            </strong>
            .
          </p>
        </div>

        <button
          type="button"
          className="reviews-refresh"
          disabled={loading}
          onClick={carregar}
        >
          ↻ Atualizar
        </button>
      </div>

      {message ? (
        <div
          className={`reviews-message reviews-message--${messageType}`}
          role="status"
        >
          {message}
        </div>
      ) : null}

      <div className="reviews-overview">
        <article className="reviews-score-card">
          <span>
            NOTA MÉDIA
          </span>

          <strong>
            {resumo.media.toLocaleString(
              "pt-BR",
              {
                minimumFractionDigits:
                  1,
                maximumFractionDigits:
                  1,
              },
            )}
          </strong>

          <div className="reviews-stars reviews-stars--large">
            {estrelas(
              Math.round(
                resumo.media,
              ),
            )}
          </div>

          <small>
            {resumo.total} avaliação(ões)
          </small>
        </article>

        <article className="reviews-stat-card">
          <span>
            💬
          </span>
          <div>
            <small>
              TOTAL
            </small>
            <strong>
              {
                resumo.total
              }
            </strong>
          </div>
        </article>

        <article className="reviews-stat-card">
          <span>
            ✅
          </span>
          <div>
            <small>
              RESPONDIDAS
            </small>
            <strong>
              {
                resumo.respondidas
              }
            </strong>
          </div>
        </article>

        <article className="reviews-stat-card">
          <span>
            ⏳
          </span>
          <div>
            <small>
              SEM RESPOSTA
            </small>
            <strong>
              {
                resumo.semResposta
              }
            </strong>
          </div>
        </article>

        <article className="reviews-distribution-card">
          <span className="reviews-distribution-title">
            DISTRIBUIÇÃO DAS NOTAS
          </span>

          {[5, 4, 3, 2, 1].map(
            (nota) => {
              const quantidade =
                resumo.distribuicao[
                  nota
                ];

              const percentual =
                resumo.total
                  ? (
                      quantidade /
                      resumo.total
                    ) *
                    100
                  : 0;

              return (
                <div
                  className="reviews-distribution-row"
                  key={
                    nota
                  }
                >
                  <span>
                    {nota} ★
                  </span>

                  <div>
                    <i
                      style={{
                        width: `${percentual}%`,
                      }}
                    />
                  </div>

                  <strong>
                    {
                      quantidade
                    }
                  </strong>
                </div>
              );
            },
          )}
        </article>
      </div>

      <div className="reviews-toolbar">
        <div className="reviews-search">
          <span>⌕</span>

          <input
            type="search"
            value={busca}
            placeholder="Buscar cliente, comentário, serviço ou profissional..."
            onChange={(
              event,
            ) =>
              setBusca(
                event.target.value,
              )
            }
          />
        </div>

        <select
          value={
            filtroNota
          }
          onChange={(
            event,
          ) =>
            setFiltroNota(
              event.target.value,
            )
          }
        >
          <option value="todas">
            Todas as notas
          </option>
          <option value="5">
            5 estrelas
          </option>
          <option value="4">
            4 estrelas
          </option>
          <option value="3">
            3 estrelas
          </option>
          <option value="2">
            2 estrelas
          </option>
          <option value="1">
            1 estrela
          </option>
        </select>

        <select
          value={
            filtroResposta
          }
          onChange={(
            event,
          ) =>
            setFiltroResposta(
              event.target.value,
            )
          }
        >
          <option value="todas">
            Todas
          </option>
          <option value="pendentes">
            Sem resposta
          </option>
          <option value="respondidas">
            Respondidas
          </option>
        </select>
      </div>

      {loading ? (
        <div className="reviews-loading">
          Carregando avaliações...
        </div>
      ) : filtradas.length ? (
        <div className="reviews-list">
          {filtradas.map(
            (item) => (
              <article
                key={
                  item.avaliacao_id
                }
                className="review-card"
              >
                <div className="review-card-top">
                  <div className="review-avatar">
                    {String(
                      item.cliente_nome ||
                        "C",
                    )
                      .trim()
                      .slice(
                        0,
                        2,
                      )
                      .toUpperCase()}
                  </div>

                  <div className="review-client">
                    <strong>
                      {
                        item.cliente_nome
                      }
                    </strong>

                    <span>
                      Avaliado em{" "}
                      {dataHora(
                        item.created_at,
                      )}
                    </span>
                  </div>

                  <div className="review-score">
                    <span className="reviews-stars">
                      {estrelas(
                        item.nota,
                      )}
                    </span>

                    <strong>
                      {item.nota}/5
                    </strong>
                  </div>
                </div>

                <div className="review-context">
                  <div>
                    <small>
                      ATENDIMENTO
                    </small>
                    <span>
                      {dataHora(
                        item.data_atendimento,
                      )}
                    </span>
                  </div>

                  <div>
                    <small>
                      SERVIÇO
                    </small>
                    <span>
                      {
                        item.servico_nome
                      }
                    </span>
                  </div>

                  <div>
                    <small>
                      PROFISSIONAL
                    </small>
                    <span>
                      {
                        item.profissional_nome
                      }
                    </span>
                  </div>
                </div>

                <div className="review-comment">
                  <small>
                    COMENTÁRIO DO CLIENTE
                  </small>

                  <p>
                    {item.comentario?.trim() ||
                      "O cliente não deixou comentário."}
                  </p>
                </div>

                {item.resposta_barbearia ? (
                  <div className="review-response">
                    <div>
                      <span>
                        RESPOSTA DA BARBEARIA
                      </span>

                      <small>
                        {dataHora(
                          item.respondida_at,
                        )}
                      </small>
                    </div>

                    <p>
                      {
                        item.resposta_barbearia
                      }
                    </p>
                  </div>
                ) : null}

                <div className="review-actions">
                  <button
                    type="button"
                    onClick={() =>
                      abrirResposta(
                        item,
                      )
                    }
                  >
                    {item.resposta_barbearia
                      ? "Editar resposta"
                      : "Responder"}
                  </button>
                </div>
              </article>
            ),
          )}
        </div>
      ) : (
        <EmptyState
          icon="⭐"
          title="Nenhuma avaliação encontrada"
          description="As avaliações dos atendimentos concluídos aparecerão aqui."
        />
      )}

      {modal &&
      selecionada ? (
        <div
          className="reviews-modal-backdrop"
          onMouseDown={(
            event,
          ) => {
            if (
              event.target ===
                event.currentTarget &&
              !saving
            ) {
              setModal(
                false,
              );
            }
          }}
        >
          <div
            className="reviews-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="reviews-modal-header">
              <div>
                <span className="reviews-eyebrow">
                  AVALIAÇÃO
                </span>

                <h2>
                  Responder cliente
                </h2>

                <p>
                  {
                    selecionada.cliente_nome
                  }{" "}
                  ·{" "}
                  {
                    selecionada.nota
                  }{" "}
                  estrela(s)
                </p>
              </div>

              <button
                type="button"
                disabled={
                  saving
                }
                onClick={() =>
                  setModal(
                    false,
                  )
                }
              >
                ×
              </button>
            </div>

            <div className="reviews-original-comment">
              <span>
                COMENTÁRIO
              </span>

              <p>
                {selecionada.comentario?.trim() ||
                  "O cliente não deixou comentário."}
              </p>
            </div>

            <form
              onSubmit={
                salvarResposta
              }
            >
              <label>
                Resposta da barbearia
              </label>

              <textarea
                rows={6}
                maxLength={1000}
                value={
                  resposta
                }
                disabled={
                  saving
                }
                placeholder="Agradeça o cliente ou responda ao comentário..."
                onChange={(
                  event,
                ) =>
                  setResposta(
                    event.target.value,
                  )
                }
              />

              <small>
                {
                  resposta.length
                }
                /1000
              </small>

              <div className="reviews-modal-actions">
                <button
                  type="button"
                  className="reviews-secondary"
                  disabled={
                    saving
                  }
                  onClick={() =>
                    setModal(
                      false,
                    )
                  }
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="reviews-primary"
                  disabled={
                    saving
                  }
                >
                  {saving
                    ? "Salvando..."
                    : "Salvar resposta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
