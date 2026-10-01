import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useBarbearia } from "../../../hooks/useBarbearia";
import { supabase } from "../../../services/supabase";
import "./HorariosPage.css";

const DIAS = [
  { id: 0, nome: "Domingo", curto: "DOM" },
  { id: 1, nome: "Segunda-feira", curto: "SEG" },
  { id: 2, nome: "Terça-feira", curto: "TER" },
  { id: 3, nome: "Quarta-feira", curto: "QUA" },
  { id: 4, nome: "Quinta-feira", curto: "QUI" },
  { id: 5, nome: "Sexta-feira", curto: "SEX" },
  { id: 6, nome: "Sábado", curto: "SÁB" },
];

function horarioVazio(diaSemana) {
  return {
    dia_semana: diaSemana,
    aberto: false,
    hora_inicio: "08:00",
    hora_fim: "18:00",
    intervalo_inicio: "",
    intervalo_fim: "",
  };
}

function montarSemana() {
  return DIAS.map((dia) =>
    horarioVazio(dia.id),
  );
}

function normalizarHora(valor) {
  if (!valor) {
    return "";
  }

  return String(valor).slice(0, 5);
}

function mapearHorarioGeral(item) {
  return {
    dia_semana: Number(
      item.dia_semana,
    ),
    aberto: Boolean(item.aberto),
    hora_inicio:
      normalizarHora(
        item.hora_abertura,
      ) || "08:00",
    hora_fim:
      normalizarHora(
        item.hora_fechamento,
      ) || "18:00",
    intervalo_inicio:
      normalizarHora(
        item.intervalo_inicio,
      ),
    intervalo_fim:
      normalizarHora(
        item.intervalo_fim,
      ),
  };
}

function mapearHorarioProfissional(
  item,
) {
  return {
    dia_semana: Number(
      item.dia_semana,
    ),
    aberto: Boolean(item.aberto),
    hora_inicio:
      normalizarHora(
        item.hora_inicio,
      ) || "08:00",
    hora_fim:
      normalizarHora(
        item.hora_fim,
      ) || "18:00",
    intervalo_inicio:
      normalizarHora(
        item.intervalo_inicio,
      ),
    intervalo_fim:
      normalizarHora(
        item.intervalo_fim,
      ),
  };
}

function preencherSemana(
  dados,
  mapper,
) {
  const mapa = new Map(
    (dados || []).map((item) => [
      Number(item.dia_semana),
      mapper(item),
    ]),
  );

  return DIAS.map((dia) =>
    mapa.get(dia.id) ||
    horarioVazio(dia.id),
  );
}

function validarSemana(semana) {
  for (const horario of semana) {
    if (!horario.aberto) {
      continue;
    }

    if (
      !horario.hora_inicio ||
      !horario.hora_fim
    ) {
      return "Informe abertura e fechamento dos dias abertos.";
    }

    if (
      horario.hora_inicio >=
      horario.hora_fim
    ) {
      return "O horário de abertura precisa ser menor que o de fechamento.";
    }

    const temInicioIntervalo =
      Boolean(
        horario.intervalo_inicio,
      );

    const temFimIntervalo =
      Boolean(
        horario.intervalo_fim,
      );

    if (
      temInicioIntervalo !==
      temFimIntervalo
    ) {
      return "Preencha os dois horários do intervalo ou deixe ambos vazios.";
    }

    if (
      temInicioIntervalo &&
      horario.intervalo_inicio >=
        horario.intervalo_fim
    ) {
      return "O início do intervalo precisa ser menor que o fim.";
    }

    if (
      temInicioIntervalo &&
      (
        horario.intervalo_inicio <=
          horario.hora_inicio ||
        horario.intervalo_fim >=
          horario.hora_fim
      )
    ) {
      return "O intervalo precisa ficar dentro do período de atendimento.";
    }
  }

  return "";
}

function clonarSemana(semana) {
  return semana.map((item) => ({
    ...item,
  }));
}

export default function HorariosPage() {
  const {
    barbeariaId,
    barbearia,
  } = useBarbearia();

  const [aba, setAba] =
    useState("geral");

  const [
    horariosGerais,
    setHorariosGerais,
  ] = useState(montarSemana());

  const [
    horariosProfissional,
    setHorariosProfissional,
  ] = useState(montarSemana());

  const [
    profissionais,
    setProfissionais,
  ] = useState([]);

  const [
    profissionalId,
    setProfissionalId,
  ] = useState("");

  const [
    profissionalTemHorario,
    setProfissionalTemHorario,
  ] = useState(false);

  const [loading, setLoading] =
    useState(true);

  const [
    loadingProfessional,
    setLoadingProfessional,
  ] = useState(false);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [
    messageType,
    setMessageType,
  ] = useState("success");

  const profissionalSelecionado =
    useMemo(
      () =>
        profissionais.find(
          (item) =>
            item.id ===
            profissionalId,
        ) || null,
      [
        profissionais,
        profissionalId,
      ],
    );

  const carregarBase =
    useCallback(async () => {
      if (!barbeariaId) {
        return;
      }

      setLoading(true);
      setMessage("");

      try {
        const [
          respostaHorarios,
          respostaProfissionais,
        ] = await Promise.all([
          supabase
            .from(
              "horarios_funcionamento",
            )
            .select(
              `
                id,
                dia_semana,
                aberto,
                hora_abertura,
                hora_fechamento,
                intervalo_inicio,
                intervalo_fim
              `,
            )
            .eq(
              "barbearia_id",
              barbeariaId,
            )
            .order(
              "dia_semana",
              {
                ascending: true,
              },
            ),

          supabase
            .from("profissionais")
            .select(
              "id, nome, ativo",
            )
            .eq(
              "barbearia_id",
              barbeariaId,
            )
            .eq("ativo", true)
            .order("nome", {
              ascending: true,
            }),
        ]);

        if (
          respostaHorarios.error
        ) {
          throw respostaHorarios.error;
        }

        if (
          respostaProfissionais.error
        ) {
          throw respostaProfissionais.error;
        }

        setHorariosGerais(
          preencherSemana(
            respostaHorarios.data,
            mapearHorarioGeral,
          ),
        );

        const lista =
          respostaProfissionais.data ||
          [];

        setProfissionais(lista);

        setProfissionalId(
          (atual) =>
            lista.some(
              (item) =>
                item.id === atual,
            )
              ? atual
              : lista[0]?.id || "",
        );
      } catch (error) {
        console.error(
          "[BarberHub] Erro ao carregar horários:",
          error,
        );

        setMessageType("error");
        setMessage(
          "Não foi possível carregar os horários.",
        );
      } finally {
        setLoading(false);
      }
    }, [barbeariaId]);

  useEffect(() => {
    carregarBase();
  }, [carregarBase]);

  const carregarHorarioProfissional =
    useCallback(async () => {
      if (!profissionalId) {
        setProfissionalTemHorario(
          false,
        );
        setHorariosProfissional(
          clonarSemana(
            horariosGerais,
          ),
        );
        return;
      }

      setLoadingProfessional(
        true,
      );

      try {
        const { data, error } =
          await supabase
            .from(
              "horarios_profissionais",
            )
            .select(
              `
                id,
                dia_semana,
                aberto,
                hora_inicio,
                hora_fim,
                intervalo_inicio,
                intervalo_fim
              `,
            )
            .eq(
              "profissional_id",
              profissionalId,
            )
            .order(
              "dia_semana",
              {
                ascending: true,
              },
            );

        if (error) {
          throw error;
        }

        const temHorario =
          Boolean(
            data?.length,
          );

        setProfissionalTemHorario(
          temHorario,
        );

        setHorariosProfissional(
          temHorario
            ? preencherSemana(
                data,
                mapearHorarioProfissional,
              )
            : clonarSemana(
                horariosGerais,
              ),
        );
      } catch (error) {
        console.error(
          "[BarberHub] Erro ao carregar horário do profissional:",
          error,
        );

        setMessageType("error");
        setMessage(
          "Não foi possível carregar o horário do profissional.",
        );
      } finally {
        setLoadingProfessional(
          false,
        );
      }
    }, [
      profissionalId,
      horariosGerais,
    ]);

  useEffect(() => {
    if (aba === "profissionais") {
      carregarHorarioProfissional();
    }
  }, [
    aba,
    carregarHorarioProfissional,
  ]);

  function alterarHorario(
    setter,
    diaSemana,
    campo,
    valor,
  ) {
    setter((atual) =>
      atual.map((item) =>
        item.dia_semana ===
        diaSemana
          ? {
              ...item,
              [campo]:
                campo ===
                "aberto"
                  ? Boolean(valor)
                  : valor,
            }
          : item,
      ),
    );
  }

  function payloadSemana(
    semana,
  ) {
    return semana.map(
      (item) => ({
        dia_semana:
          item.dia_semana,
        aberto: item.aberto,
        hora_inicio:
          item.aberto
            ? item.hora_inicio
            : null,
        hora_fim:
          item.aberto
            ? item.hora_fim
            : null,
        intervalo_inicio:
          item.aberto &&
          item.intervalo_inicio
            ? item.intervalo_inicio
            : null,
        intervalo_fim:
          item.aberto &&
          item.intervalo_fim
            ? item.intervalo_fim
            : null,
      }),
    );
  }

  async function salvarGeral() {
    const erro =
      validarSemana(
        horariosGerais,
      );

    if (erro) {
      setMessageType("error");
      setMessage(erro);
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const { error } =
        await supabase.rpc(
          "salvar_horarios_barbearia",
          {
            p_barbearia_id:
              barbeariaId,
            p_horarios:
              payloadSemana(
                horariosGerais,
              ),
          },
        );

      if (error) {
        throw error;
      }

      setMessageType("success");
      setMessage(
        "Horário geral salvo com sucesso.",
      );

      await carregarBase();
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao salvar horário geral:",
        error,
      );

      setMessageType("error");
      setMessage(
        error?.message ||
          "Não foi possível salvar o horário geral.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function salvarProfissional() {
    if (!profissionalId) {
      return;
    }

    const erro =
      validarSemana(
        horariosProfissional,
      );

    if (erro) {
      setMessageType("error");
      setMessage(erro);
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const { error } =
        await supabase.rpc(
          "salvar_horarios_profissional",
          {
            p_profissional_id:
              profissionalId,
            p_horarios:
              payloadSemana(
                horariosProfissional,
              ),
          },
        );

      if (error) {
        throw error;
      }

      setProfissionalTemHorario(
        true,
      );

      setMessageType("success");
      setMessage(
        `Horário de ${profissionalSelecionado?.nome || "profissional"} salvo com sucesso.`,
      );

      await carregarHorarioProfissional();
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao salvar horário do profissional:",
        error,
      );

      setMessageType("error");
      setMessage(
        error?.message ||
          "Não foi possível salvar o horário do profissional.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function usarHorarioGeral() {
    if (!profissionalId) {
      return;
    }

    const confirmar =
      window.confirm(
        `Remover os horários próprios de ${profissionalSelecionado?.nome || "este profissional"} e voltar a usar o horário geral da barbearia?`,
      );

    if (!confirmar) {
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const { error } =
        await supabase.rpc(
          "resetar_horarios_profissional",
          {
            p_profissional_id:
              profissionalId,
          },
        );

      if (error) {
        throw error;
      }

      setProfissionalTemHorario(
        false,
      );

      setHorariosProfissional(
        clonarSemana(
          horariosGerais,
        ),
      );

      setMessageType("success");
      setMessage(
        `${profissionalSelecionado?.nome || "O profissional"} voltou a usar o horário geral.`,
      );
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao restaurar horário geral:",
        error,
      );

      setMessageType("error");
      setMessage(
        error?.message ||
          "Não foi possível restaurar o horário geral.",
      );
    } finally {
      setSaving(false);
    }
  }

  const semanaAtual =
    aba === "geral"
      ? horariosGerais
      : horariosProfissional;

  const setSemanaAtual =
    aba === "geral"
      ? setHorariosGerais
      : setHorariosProfissional;

  return (
    <section className="hours-page">
      <div className="hours-heading">
        <div>
          <span className="hours-eyebrow">
            DISPONIBILIDADE
          </span>

          <h1>Horários</h1>

          <p>
            Defina quando{" "}
            <strong>
              {barbearia?.nome ||
                "sua barbearia"}
            </strong>{" "}
            e seus profissionais
            atendem.
          </p>
        </div>
      </div>

      <div className="hours-tabs">
        <button
          type="button"
          className={
            aba === "geral"
              ? "hours-tab hours-tab--active"
              : "hours-tab"
          }
          onClick={() =>
            setAba("geral")
          }
        >
          🏪 Horário geral
        </button>

        <button
          type="button"
          className={
            aba ===
            "profissionais"
              ? "hours-tab hours-tab--active"
              : "hours-tab"
          }
          onClick={() =>
            setAba(
              "profissionais",
            )
          }
        >
          💈 Por profissional
        </button>
      </div>

      {message ? (
        <div
          className={`hours-message hours-message--${messageType}`}
          role="status"
        >
          {message}
        </div>
      ) : null}

      {aba === "geral" ? (
        <div className="hours-context-card">
          <div>
            <span>🏪</span>
          </div>

          <div>
            <strong>
              Horário geral da barbearia
            </strong>

            <p>
              Define os limites de funcionamento.
              Nenhum profissional poderá receber agendamentos fora desse período.
            </p>
          </div>
        </div>
      ) : (
        <div className="hours-professional-panel">
          <div className="hours-professional-select">
            <label htmlFor="hours-professional">
              Profissional
            </label>

            <select
              id="hours-professional"
              value={profissionalId}
              disabled={
                loading ||
                !profissionais.length
              }
              onChange={(event) =>
                setProfissionalId(
                  event.target.value,
                )
              }
            >
              {!profissionais.length ? (
                <option value="">
                  Nenhum profissional ativo
                </option>
              ) : null}

              {profissionais.map(
                (item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.nome}
                  </option>
                ),
              )}
            </select>
          </div>

          {profissionalId ? (
            <div
              className={
                profissionalTemHorario
                  ? "hours-mode-badge hours-mode-badge--custom"
                  : "hours-mode-badge"
              }
            >
              {profissionalTemHorario
                ? "Horário personalizado"
                : "Usando horário geral"}
            </div>
          ) : null}

          {profissionalTemHorario ? (
            <button
              type="button"
              className="hours-reset-button"
              disabled={saving}
              onClick={
                usarHorarioGeral
              }
            >
              Usar horário geral
            </button>
          ) : null}
        </div>
      )}

      {loading ||
      (
        aba === "profissionais" &&
        loadingProfessional
      ) ? (
        <div className="hours-loading">
          Carregando horários...
        </div>
      ) : (
        <>
          <div className="hours-week">
            {semanaAtual.map(
              (horario) => {
                const dia =
                  DIAS.find(
                    (item) =>
                      item.id ===
                      horario.dia_semana,
                  );

                return (
                  <article
                    key={
                      horario.dia_semana
                    }
                    className={
                      horario.aberto
                        ? "hours-day hours-day--open"
                        : "hours-day"
                    }
                  >
                    <div className="hours-day-head">
                      <div className="hours-day-name">
                        <span>
                          {dia?.curto}
                        </span>

                        <strong>
                          {dia?.nome}
                        </strong>
                      </div>

                      <label className="hours-switch">
                        <input
                          type="checkbox"
                          checked={
                            horario.aberto
                          }
                          onChange={(
                            event,
                          ) =>
                            alterarHorario(
                              setSemanaAtual,
                              horario.dia_semana,
                              "aberto",
                              event.target
                                .checked,
                            )
                          }
                        />

                        <span />

                        <em>
                          {horario.aberto
                            ? "Aberto"
                            : "Fechado"}
                        </em>
                      </label>
                    </div>

                    <div className="hours-day-grid">
                      <div className="hours-field">
                        <label>
                          Início
                        </label>

                        <input
                          type="time"
                          value={
                            horario.hora_inicio
                          }
                          disabled={
                            !horario.aberto
                          }
                          onChange={(
                            event,
                          ) =>
                            alterarHorario(
                              setSemanaAtual,
                              horario.dia_semana,
                              "hora_inicio",
                              event.target
                                .value,
                            )
                          }
                        />
                      </div>

                      <div className="hours-field">
                        <label>
                          Fim
                        </label>

                        <input
                          type="time"
                          value={
                            horario.hora_fim
                          }
                          disabled={
                            !horario.aberto
                          }
                          onChange={(
                            event,
                          ) =>
                            alterarHorario(
                              setSemanaAtual,
                              horario.dia_semana,
                              "hora_fim",
                              event.target
                                .value,
                            )
                          }
                        />
                      </div>

                      <div className="hours-field">
                        <label>
                          Intervalo
                        </label>

                        <input
                          type="time"
                          value={
                            horario.intervalo_inicio
                          }
                          disabled={
                            !horario.aberto
                          }
                          onChange={(
                            event,
                          ) =>
                            alterarHorario(
                              setSemanaAtual,
                              horario.dia_semana,
                              "intervalo_inicio",
                              event.target
                                .value,
                            )
                          }
                        />
                      </div>

                      <div className="hours-field">
                        <label>
                          Até
                        </label>

                        <input
                          type="time"
                          value={
                            horario.intervalo_fim
                          }
                          disabled={
                            !horario.aberto
                          }
                          onChange={(
                            event,
                          ) =>
                            alterarHorario(
                              setSemanaAtual,
                              horario.dia_semana,
                              "intervalo_fim",
                              event.target
                                .value,
                            )
                          }
                        />
                      </div>
                    </div>
                  </article>
                );
              },
            )}
          </div>

          <div className="hours-footer">
            <div>
              <strong>
                {aba === "geral"
                  ? "Salvar horário geral"
                  : profissionalSelecionado
                    ? `Salvar horário de ${profissionalSelecionado.nome}`
                    : "Selecione um profissional"}
              </strong>

              <p>
                Os horários disponíveis dos agendamentos serão recalculados automaticamente.
              </p>
            </div>

            <button
              type="button"
              className="hours-save-button"
              disabled={
                saving ||
                (
                  aba ===
                    "profissionais" &&
                  !profissionalId
                )
              }
              onClick={
                aba === "geral"
                  ? salvarGeral
                  : salvarProfissional
              }
            >
              {saving
                ? "Salvando..."
                : "💾 Salvar horários"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
