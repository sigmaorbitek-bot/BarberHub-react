import {
  useEffect,
  useState,
} from "react";

import { supabase } from "../../services/supabase";
import "./Profissional.css";

function primeiroDiaMes() {
  const agora = new Date();

  return [
    agora.getFullYear(),
    String(
      agora.getMonth() + 1,
    ).padStart(2, "0"),
    "01",
  ].join("-");
}

function hoje() {
  const agora = new Date();

  return [
    agora.getFullYear(),
    String(
      agora.getMonth() + 1,
    ).padStart(2, "0"),
    String(
      agora.getDate(),
    ).padStart(2, "0"),
  ].join("-");
}

function moeda(valor) {
  return Number(
    valor || 0,
  ).toLocaleString(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    },
  );
}

export default function ProfissionalFinanceiroPage() {
  const [inicio, setInicio] =
    useState(primeiroDiaMes());

  const [fim, setFim] =
    useState(hoje());

  const [dados, setDados] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState("");

  async function carregar() {
    setLoading(true);
    setMessage("");

    try {
      const { data, error } =
        await supabase.rpc(
          "obter_financeiro_profissional",
          {
            p_data_inicial:
              inicio,
            p_data_final: fim,
          },
        );

      if (error) {
        throw error;
      }

      const item =
        Array.isArray(data)
          ? data[0]
          : data;

      setDados(item || null);
    } catch (error) {
      console.error(
        "[BarberHub] Financeiro profissional:",
        error,
      );

      setDados(null);

      setMessage(
        error?.message ||
          "Não foi possível carregar seu financeiro.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <section className="professional-page">
      <span className="professional-eyebrow">
        RESULTADOS
      </span>

      <h1>
        Meu financeiro
      </h1>

      <p>
        Resumo dos seus atendimentos concluídos no período.
      </p>

      <div className="professional-period">
        <label>
          De
          <input
            type="date"
            value={inicio}
            onChange={(event) =>
              setInicio(
                event.target.value,
              )
            }
          />
        </label>

        <label>
          Até
          <input
            type="date"
            value={fim}
            onChange={(event) =>
              setFim(
                event.target.value,
              )
            }
          />
        </label>

        <button
          type="button"
          onClick={carregar}
        >
          Atualizar
        </button>
      </div>

      {message ? (
        <div className="professional-message">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="professional-empty">
          Carregando...
        </div>
      ) : dados ? (
        <div className="professional-finance-grid">
          <article>
            <small>
              ATENDIMENTOS CONCLUÍDOS
            </small>

            <strong>
              {
                dados.atendimentos_concluidos
              }
            </strong>
          </article>

          <article>
            <small>
              FATURAMENTO GERADO
            </small>

            <strong>
              {moeda(
                dados.faturamento,
              )}
            </strong>
          </article>

          {dados.mostrar_comissao ? (
            <>
              <article>
                <small>
                  COMISSÃO
                </small>

                <strong>
                  {Number(
                    dados.comissao_percentual ||
                      0,
                  ).toLocaleString(
                    "pt-BR",
                  )}
                  %
                </strong>
              </article>

              <article>
                <small>
                  COMISSÃO ESTIMADA
                </small>

                <strong>
                  {moeda(
                    dados.comissao_estimada,
                  )}
                </strong>
              </article>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
