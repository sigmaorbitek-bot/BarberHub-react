import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { supabase } from "../../../services/supabase";
import "./ClienteAgendamentosPage.css";

const STATUS = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarDataHora(valor) {
  if (!valor) {
    return {
      data: "—",
      hora: "—",
    };
  }

  const data = new Date(valor);

  return {
    data: data.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    hora: data.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function podeCancelar(item) {
  if (!["pendente", "confirmado"].includes(item.status)) {
    return false;
  }

  if (!item.data_hora) {
    return false;
  }

  return new Date(item.data_hora).getTime() > Date.now();
}

function ordenarMaisProximo(a, b) {
  return new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime();
}

function ordenarMaisRecente(a, b) {
  return new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime();
}

export default function ClienteAgendamentosPage() {
  const [agendamentos, setAgendamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelandoId, setCancelandoId] = useState("");
  const [filtro, setFiltro] = useState("proximos");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const carregarAgendamentos = useCallback(async () => {
    setLoading(true);
    setErro("");

    try {
      const { data, error } = await supabase
        .from("agendamentos")
        .select(`
          id,
          barbearia_id,
          servico_id,
          profissional_id,
          data_hora,
          status,
          arquivado,
          created_at,
          barbearias (
            id,
            nome,
            cidade,
            endereco,
            telefone,
            logo_url
          ),
          servicos (
            id,
            nome,
            preco,
            duracao
          ),
          profissionais (
            id,
            nome,
            foto_url
          )
        `)
        .order("data_hora", {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      setAgendamentos(
        (data || []).filter((item) => !item.arquivado),
      );
    } catch (error) {
      console.error(
        "[BarberHub] Meus agendamentos:",
        error,
      );

      setAgendamentos([]);
      setErro(
        "Não foi possível carregar seus agendamentos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarAgendamentos();
  }, [carregarAgendamentos]);

  const proximos = useMemo(() => {
    return agendamentos
      .filter((item) => {
        if (!["pendente", "confirmado"].includes(item.status)) {
          return false;
        }

        return (
          item.data_hora &&
          new Date(item.data_hora).getTime() > Date.now()
        );
      })
      .sort(ordenarMaisProximo);
  }, [agendamentos]);

  const historico = useMemo(() => {
    return agendamentos
      .filter((item) => {
        if (["concluido", "cancelado"].includes(item.status)) {
          return true;
        }

        return (
          item.data_hora &&
          new Date(item.data_hora).getTime() <= Date.now()
        );
      })
      .sort(ordenarMaisRecente);
  }, [agendamentos]);

  const exibidos =
    filtro === "proximos"
      ? proximos
      : filtro === "historico"
        ? historico
        : [...agendamentos].sort(ordenarMaisRecente);

  async function cancelarAgendamento(item) {
    if (!podeCancelar(item)) {
      setErro(
        "Este agendamento não pode mais ser cancelado.",
      );
      return;
    }

    const confirmado = window.confirm(
      `Cancelar o agendamento de ${item.servicos?.nome || "serviço"} em ${
        item.barbearias?.nome || "barbearia"
      }?`,
    );

    if (!confirmado) {
      return;
    }

    setCancelandoId(item.id);
    setErro("");
    setSucesso("");

    try {
      const { error } = await supabase.rpc(
        "cancelar_agendamento_cliente",
        {
          p_agendamento_id: item.id,
        },
      );

      if (error) {
        throw error;
      }

      setSucesso(
        "Agendamento cancelado com sucesso.",
      );

      await carregarAgendamentos();
    } catch (error) {
      console.error(
        "[BarberHub] Cancelar agendamento do cliente:",
        error,
      );

      setErro(
        error?.message ||
          "Não foi possível cancelar o agendamento.",
      );
    } finally {
      setCancelandoId("");
    }
  }

  return (
    <section className="client-appointments">
      <div className="client-page-heading">
        <div>
          <span>MINHA AGENDA</span>
          <h1>Meus agendamentos</h1>
          <p>
            Acompanhe horários pendentes, confirmados,
            concluídos e cancelados.
          </p>
        </div>

        <Link
          to="/cliente/agendar"
          className="client-appointments-new"
        >
          ＋ Agendar horário
        </Link>
      </div>

      {erro ? (
        <div className="client-appointments-message client-appointments-message--error">
          {erro}
        </div>
      ) : null}

      {sucesso ? (
        <div className="client-appointments-message client-appointments-message--success">
          {sucesso}
        </div>
      ) : null}

      <div className="client-appointments-summary">
        <article>
          <small>PRÓXIMOS</small>
          <strong>{proximos.length}</strong>
          <p>Horários futuros</p>
        </article>

        <article>
          <small>CONFIRMADOS</small>
          <strong>
            {
              proximos.filter(
                (item) => item.status === "confirmado",
              ).length
            }
          </strong>
          <p>Confirmados pela barbearia</p>
        </article>

        <article>
          <small>HISTÓRICO</small>
          <strong>{historico.length}</strong>
          <p>Concluídos e cancelados</p>
        </article>
      </div>

      <div className="client-appointments-toolbar">
        <div className="client-appointments-tabs">
          <button
            type="button"
            className={
              filtro === "proximos"
                ? "client-appointments-tab client-appointments-tab--active"
                : "client-appointments-tab"
            }
            onClick={() => setFiltro("proximos")}
          >
            Próximos
          </button>

          <button
            type="button"
            className={
              filtro === "historico"
                ? "client-appointments-tab client-appointments-tab--active"
                : "client-appointments-tab"
            }
            onClick={() => setFiltro("historico")}
          >
            Histórico
          </button>

          <button
            type="button"
            className={
              filtro === "todos"
                ? "client-appointments-tab client-appointments-tab--active"
                : "client-appointments-tab"
            }
            onClick={() => setFiltro("todos")}
          >
            Todos
          </button>
        </div>

        <button
          type="button"
          className="client-appointments-refresh"
          onClick={carregarAgendamentos}
          disabled={loading}
        >
          ↻ Atualizar
        </button>
      </div>

      {loading ? (
        <div className="client-appointments-empty">
          Carregando seus agendamentos...
        </div>
      ) : exibidos.length === 0 ? (
        <div className="client-appointments-empty">
          <span aria-hidden="true">📅</span>

          <strong>
            {filtro === "proximos"
              ? "Nenhum próximo agendamento"
              : filtro === "historico"
                ? "Seu histórico ainda está vazio"
                : "Nenhum agendamento encontrado"}
          </strong>

          <p>
            {filtro === "proximos"
              ? "Escolha uma barbearia e marque seu próximo horário."
              : "Seus atendimentos aparecerão aqui."}
          </p>

          {filtro === "proximos" ? (
            <Link to="/cliente/agendar">
              Agendar horário
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="client-appointments-list">
          {exibidos.map((item) => {
            const quando = formatarDataHora(
              item.data_hora,
            );

            const status =
              STATUS[item.status] || item.status;

            return (
              <article
                className={`client-appointment-card client-appointment-card--${item.status}`}
                key={item.id}
              >
                <div className="client-appointment-main">
                  <div className="client-appointment-business">
                    {item.barbearias?.logo_url ? (
                      <img
                        src={item.barbearias.logo_url}
                        alt=""
                      />
                    ) : (
                      <span aria-hidden="true">💈</span>
                    )}

                    <div>
                      <small>BARBEARIA</small>
                      <strong>
                        {item.barbearias?.nome ||
                          "Barbearia"}
                      </strong>
                      <p>
                        {item.barbearias?.cidade ||
                          item.barbearias?.endereco ||
                          ""}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`client-appointment-status client-appointment-status--${item.status}`}
                  >
                    {status}
                  </span>
                </div>

                <div className="client-appointment-details">
                  <div>
                    <small>Serviço</small>
                    <strong>
                      {item.servicos?.nome ||
                        "Serviço"}
                    </strong>
                  </div>

                  <div>
                    <small>Profissional</small>
                    <strong>
                      {item.profissionais?.nome ||
                        "A definir"}
                    </strong>
                  </div>

                  <div>
                    <small>Data</small>
                    <strong>{quando.data}</strong>
                  </div>

                  <div>
                    <small>Horário</small>
                    <strong>{quando.hora}</strong>
                  </div>

                  <div>
                    <small>Duração</small>
                    <strong>
                      {Number(item.servicos?.duracao) ||
                        30}{" "}
                      min
                    </strong>
                  </div>

                  <div>
                    <small>Valor</small>
                    <strong className="client-appointment-price">
                      {moeda(item.servicos?.preco)}
                    </strong>
                  </div>
                </div>

                <div className="client-appointment-footer">
                  <div>
                    {item.status === "pendente" ? (
                      <p>
                        Aguardando confirmação da
                        barbearia.
                      </p>
                    ) : null}

                    {item.status === "confirmado" ? (
                      <p>
                        Seu horário está confirmado.
                      </p>
                    ) : null}

                    {item.status === "concluido" ? (
                      <p>
                        Atendimento concluído.
                      </p>
                    ) : null}

                    {item.status === "cancelado" ? (
                      <p>
                        Este agendamento foi
                        cancelado.
                      </p>
                    ) : null}
                  </div>

                  {podeCancelar(item) ? (
                    <button
                      type="button"
                      className="client-appointment-cancel"
                      disabled={
                        cancelandoId === item.id
                      }
                      onClick={() =>
                        cancelarAgendamento(item)
                      }
                    >
                      {cancelandoId === item.id
                        ? "Cancelando..."
                        : "Cancelar agendamento"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
