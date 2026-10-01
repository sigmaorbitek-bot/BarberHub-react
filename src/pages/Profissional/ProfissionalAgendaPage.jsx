import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../services/supabase";
import "./Profissional.css";

function hojeLocal() {
  const data = new Date();

  return [
    data.getFullYear(),
    String(
      data.getMonth() + 1,
    ).padStart(2, "0"),
    String(
      data.getDate(),
    ).padStart(2, "0"),
  ].join("-");
}

export default function ProfissionalAgendaPage() {
  const [
    agendamentos,
    setAgendamentos,
  ] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState("");

  const [periodo, setPeriodo] =
    useState("proximos");

  const carregar =
    useCallback(async () => {
      setLoading(true);
      setMessage("");

      try {
        const { data, error } =
          await supabase.rpc(
            "listar_agendamentos_profissional",
          );

        if (error) {
          throw error;
        }

        setAgendamentos(
          data || [],
        );
      } catch (error) {
        console.error(
          "[BarberHub] Agenda profissional:",
          error,
        );

        setMessage(
          error?.message ||
            "Não foi possível carregar sua agenda.",
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtrados = useMemo(() => {
    const agora = new Date();
    const hoje = hojeLocal();

    return agendamentos.filter(
      (item) => {
        const data =
          new Date(
            item.data_hora,
          );

        if (
          periodo === "proximos"
        ) {
          return data >= agora;
        }

        if (
          periodo === "hoje"
        ) {
          const chave = [
            data.getFullYear(),
            String(
              data.getMonth() + 1,
            ).padStart(2, "0"),
            String(
              data.getDate(),
            ).padStart(2, "0"),
          ].join("-");

          return chave === hoje;
        }

        return true;
      },
    );
  }, [
    agendamentos,
    periodo,
  ]);

  async function alterarStatus(
    item,
    status,
  ) {
    const textos = {
      confirmado:
        "Confirmar este agendamento?",
      concluido:
        "Marcar este atendimento como concluído?",
      cancelado:
        "Cancelar este agendamento?",
    };

    if (
      !window.confirm(
        textos[status],
      )
    ) {
      return;
    }

    try {
      const { error } =
        await supabase.rpc(
          "atualizar_status_agendamento_profissional",
          {
            p_agendamento_id:
              item.id,
            p_status: status,
          },
        );

      if (error) {
        throw error;
      }

      setMessage(
        "Status atualizado com sucesso.",
      );

      await carregar();
    } catch (error) {
      setMessage(
        error?.message ||
          "Não foi possível atualizar o agendamento.",
      );
    }
  }

  return (
    <section className="professional-page">
      <span className="professional-eyebrow">
        AGENDA
      </span>

      <h1>
        Meus agendamentos
      </h1>

      <p>
        Aqui aparecem somente os atendimentos vinculados ao seu perfil.
      </p>

      <div className="professional-filter-row">
        {[
          ["hoje", "Hoje"],
          [
            "proximos",
            "Próximos",
          ],
          ["todos", "Todos"],
        ].map(
          ([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                periodo === value
                  ? "professional-filter professional-filter--active"
                  : "professional-filter"
              }
              onClick={() =>
                setPeriodo(value)
              }
            >
              {label}
            </button>
          ),
        )}
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
      ) : filtrados.length ? (
        <div className="professional-appointments">
          {filtrados.map(
            (item) => (
              <article
                key={item.id}
                className="professional-appointment-card"
              >
                <div>
                  <strong>
                    {new Date(
                      item.data_hora,
                    ).toLocaleDateString(
                      "pt-BR",
                    )}
                  </strong>

                  <span>
                    {new Date(
                      item.data_hora,
                    ).toLocaleTimeString(
                      "pt-BR",
                      {
                        hour:
                          "2-digit",
                        minute:
                          "2-digit",
                      },
                    )}
                  </span>
                </div>

                <div className="professional-appointment-main">
                  <div>
                    <strong>
                      {
                        item.cliente_nome
                      }
                    </strong>

                    <span className={`professional-status professional-status--${item.status}`}>
                      {item.status}
                    </span>
                  </div>

                  <p>
                    ✂️{" "}
                    {
                      item.servico_nome
                    }{" "}
                    ·{" "}
                    {
                      item.servico_duracao
                    }{" "}
                    min
                  </p>

                  {item.cliente_telefone ? (
                    <small>
                      📱{" "}
                      {
                        item.cliente_telefone
                      }
                    </small>
                  ) : null}
                </div>

                <div className="professional-appointment-actions">
                  {item.status ===
                  "pendente" ? (
                    <button
                      type="button"
                      onClick={() =>
                        alterarStatus(
                          item,
                          "confirmado",
                        )
                      }
                    >
                      Confirmar
                    </button>
                  ) : null}

                  {item.status ===
                  "confirmado" ? (
                    <button
                      type="button"
                      onClick={() =>
                        alterarStatus(
                          item,
                          "concluido",
                        )
                      }
                    >
                      Concluir
                    </button>
                  ) : null}

                  {[
                    "pendente",
                    "confirmado",
                  ].includes(
                    item.status,
                  ) ? (
                    <button
                      type="button"
                      className="professional-danger"
                      onClick={() =>
                        alterarStatus(
                          item,
                          "cancelado",
                        )
                      }
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </article>
            ),
          )}
        </div>
      ) : (
        <div className="professional-empty">
          Nenhum agendamento encontrado.
        </div>
      )}
    </section>
  );
}
