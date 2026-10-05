import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { supabase } from "../../../services/supabase";
import "./ClienteAgendarPage.css";

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function hojeLocal() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function dataLimite(dias = 60) {
  const data = new Date();
  data.setDate(data.getDate() + dias);

  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function dataBR(valor) {
  if (!valor) return "—";

  const [ano, mes, dia] = String(valor).split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarTelefone(valor) {
  const digitos = String(valor || "").replace(/\D/g, "");

  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }

  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }

  return valor || "";
}

function mensagemErro(error) {
  const texto = String(error?.message || "");

  if (texto.includes("não está mais disponível")) {
    return "Esse horário acabou de ser ocupado. Escolha outro horário.";
  }

  if (texto.includes("fora do expediente")) {
    return "Esse horário não está dentro do expediente.";
  }

  if (texto.includes("não atende neste dia")) {
    return "A barbearia ou o profissional não atende neste dia.";
  }

  if (texto.includes("cadastro de cliente")) {
    return "Sua conta ainda não possui cadastro de cliente. Saia e entre novamente.";
  }

  return texto || "Não foi possível concluir o agendamento.";
}

export default function ClienteAgendarPage() {
  const navigate = useNavigate();

  const [barbearias, setBarbearias] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [profissionais, setProfissionais] = useState([]);
  const [horarios, setHorarios] = useState([]);

  const [barbeariaId, setBarbeariaId] = useState("");
  const [servicoId, setServicoId] = useState("");
  const [profissionalId, setProfissionalId] = useState("");
  const [data, setData] = useState(hojeLocal());
  const [horario, setHorario] = useState("");

  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingCatalogo, setLoadingCatalogo] = useState(false);
  const [loadingHorarios, setLoadingHorarios] = useState(false);
  const [saving, setSaving] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  const barbearia = useMemo(
    () => barbearias.find((item) => item.id === barbeariaId) || null,
    [barbearias, barbeariaId],
  );

  const servico = useMemo(
    () => servicos.find((item) => item.id === servicoId) || null,
    [servicos, servicoId],
  );

  const profissionalEscolhido = useMemo(() => {
    if (profissionalId) {
      return profissionais.find((item) => item.id === profissionalId) || null;
    }

    const slot = horarios.find((item) => item.hora === horario);
    const primeiroId = slot?.profissionais?.[0];

    return profissionais.find((item) => item.id === primeiroId) || null;
  }, [profissionais, profissionalId, horarios, horario]);

  useEffect(() => {
    let ativo = true;

    async function carregarBarbearias() {
      setLoadingBase(true);
      setErrorMessage("");

      const { data: registros, error } = await supabase
        .from("barbearias")
        .select("id, nome, cidade, endereco, telefone, logo_url, timezone")
        .order("nome", { ascending: true });

      if (!ativo) return;

      if (error) {
        console.error("[BarberHub] Barbearias para cliente:", error);
        setErrorMessage("Não foi possível carregar as barbearias.");
        setBarbearias([]);
      } else {
        setBarbearias(registros || []);
      }

      setLoadingBase(false);
    }

    carregarBarbearias();

    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    let ativo = true;

    async function carregarCatalogo() {
      setServicos([]);
      setProfissionais([]);
      setServicoId("");
      setProfissionalId("");
      setHorario("");
      setHorarios([]);
      setErrorMessage("");
      setSuccessMessage("");
      setConfirmation(null);

      if (!barbeariaId) {
        return;
      }

      setLoadingCatalogo(true);

      const [servicosResult, profissionaisResult] = await Promise.all([
        supabase
          .from("servicos")
          .select("id, nome, preco, duracao, ativo")
          .eq("barbearia_id", barbeariaId)
          .eq("ativo", true)
          .order("nome", { ascending: true }),

        supabase
          .from("profissionais")
          .select("id, nome, foto_url, ativo")
          .eq("barbearia_id", barbeariaId)
          .eq("ativo", true)
          .order("nome", { ascending: true }),
      ]);

      if (!ativo) return;

      if (servicosResult.error) {
        console.error("[BarberHub] Serviços para cliente:", servicosResult.error);
        setErrorMessage("Não foi possível carregar os serviços da barbearia.");
      }

      if (profissionaisResult.error) {
        console.error(
          "[BarberHub] Profissionais para cliente:",
          profissionaisResult.error,
        );
        setErrorMessage("Não foi possível carregar os profissionais.");
      }

      setServicos(servicosResult.data || []);
      setProfissionais(profissionaisResult.data || []);
      setLoadingCatalogo(false);
    }

    carregarCatalogo();

    return () => {
      ativo = false;
    };
  }, [barbeariaId]);

  useEffect(() => {
    let ativo = true;

    async function carregarHorarios() {
      setHorario("");
      setHorarios([]);
      setErrorMessage("");
      setSuccessMessage("");
      setConfirmation(null);

      if (!barbeariaId || !servico || !data || profissionais.length === 0) {
        return;
      }

      setLoadingHorarios(true);

      try {
        if (profissionalId) {
          const { data: slots, error } = await supabase.rpc(
            "buscar_horarios_disponiveis",
            {
              p_barbearia_id: barbeariaId,
              p_profissional_id: profissionalId,
              p_data: data,
              p_duracao: Number(servico.duracao) || 30,
            },
          );

          if (error) throw error;

          if (!ativo) return;

          setHorarios(
            (slots || []).map((slot) => ({
              hora: slot.hora,
              profissionais: [profissionalId],
            })),
          );
        } else {
          const resultados = await Promise.all(
            profissionais.map(async (profissional) => {
              const { data: slots, error } = await supabase.rpc(
                "buscar_horarios_disponiveis",
                {
                  p_barbearia_id: barbeariaId,
                  p_profissional_id: profissional.id,
                  p_data: data,
                  p_duracao: Number(servico.duracao) || 30,
                },
              );

              if (error) {
                console.warn(
                  `[BarberHub] Horários de ${profissional.nome}:`,
                  error,
                );
                return [];
              }

              return (slots || []).map((slot) => ({
                hora: slot.hora,
                profissionalId: profissional.id,
              }));
            }),
          );

          if (!ativo) return;

          const mapa = new Map();

          resultados.flat().forEach((slot) => {
            const atual = mapa.get(slot.hora) || {
              hora: slot.hora,
              profissionais: [],
            };

            atual.profissionais.push(slot.profissionalId);
            mapa.set(slot.hora, atual);
          });

          setHorarios(
            Array.from(mapa.values()).sort((a, b) =>
              a.hora.localeCompare(b.hora),
            ),
          );
        }
      } catch (error) {
        console.error("[BarberHub] Horários disponíveis:", error);

        if (ativo) {
          setErrorMessage(
            "Não foi possível calcular os horários disponíveis.",
          );
        }
      } finally {
        if (ativo) {
          setLoadingHorarios(false);
        }
      }
    }

    carregarHorarios();

    return () => {
      ativo = false;
    };
  }, [
    barbeariaId,
    servico,
    profissionalId,
    data,
    profissionais,
  ]);

  async function confirmarAgendamento(event) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");
    setConfirmation(null);

    if (!barbeariaId) {
      setErrorMessage("Escolha a barbearia.");
      return;
    }

    if (!servicoId || !servico) {
      setErrorMessage("Escolha o serviço.");
      return;
    }

    if (!data) {
      setErrorMessage("Escolha a data.");
      return;
    }

    if (!horario) {
      setErrorMessage("Escolha um horário disponível.");
      return;
    }

    const slot = horarios.find((item) => item.hora === horario);
    const profissionalFinalId =
      profissionalId || slot?.profissionais?.[0] || null;

    if (!profissionalFinalId) {
      setErrorMessage(
        "Nenhum profissional está disponível nesse horário.",
      );
      return;
    }

    const dataHoraLocal = `${data}T${horario}:00`;

    setSaving(true);

    try {
      const { data: agendamento, error } = await supabase.rpc(
        "criar_agendamento_seguro",
        {
          p_barbearia_id: barbeariaId,
          p_servico_id: servicoId,
          p_data_hora: new Date(dataHoraLocal).toISOString(),
          p_profissional_id: profissionalFinalId,
          p_cliente_id: null,
        },
      );

      if (error) throw error;

      const profissionalFinal =
        profissionais.find((item) => item.id === profissionalFinalId) || null;

      setConfirmation({
        agendamentoId: agendamento?.id,
        barbearia: barbearia?.nome || "Barbearia",
        servico: servico?.nome || "Serviço",
        profissional: profissionalFinal?.nome || "Profissional",
        data,
        horario,
        preco: servico?.preco,
      });

      setSuccessMessage(
        "Agendamento solicitado com sucesso. Agora a barbearia poderá confirmar seu horário.",
      );

      setHorario("");
    } catch (error) {
      console.error("[BarberHub] Criar agendamento cliente:", error);

      setErrorMessage(mensagemErro(error));

      if (
        String(error?.message || "").includes(
          "não está mais disponível",
        )
      ) {
        const slotAtual = horario;
        setHorario("");
        setHorarios((atuais) =>
          atuais.filter((item) => item.hora !== slotAtual),
        );
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadingBase) {
    return (
      <section className="client-booking">
        <div className="client-booking-loading">
          Carregando barbearias...
        </div>
      </section>
    );
  }

  return (
    <section className="client-booking">
      <div className="client-page-heading client-booking-heading">
        <div>
          <span>AGENDAMENTO</span>
          <h1>Agendar horário</h1>
          <p>
            Escolha a unidade, o serviço, o profissional e um dos
            horários realmente disponíveis.
          </p>
        </div>

        <Link to="/cliente/agendamentos">
          Ver meus agendamentos →
        </Link>
      </div>

      {errorMessage ? (
        <div className="client-booking-message client-booking-message--error">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="client-booking-message client-booking-message--success">
          {successMessage}
        </div>
      ) : null}

      <form
        className="client-booking-grid"
        onSubmit={confirmarAgendamento}
      >
        <div className="client-booking-form">
          <section className="client-booking-step">
            <div className="client-booking-step-title">
              <b>1</b>
              <div>
                <h2>Escolha a barbearia</h2>
                <p>Selecione onde você deseja ser atendido.</p>
              </div>
            </div>

            {barbearias.length === 0 ? (
              <div className="client-booking-empty">
                Nenhuma barbearia disponível no momento.
              </div>
            ) : (
              <div className="client-booking-businesses">
                {barbearias.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`client-booking-business${
                      barbeariaId === item.id
                        ? " client-booking-business--active"
                        : ""
                    }`}
                    onClick={() => setBarbeariaId(item.id)}
                  >
                    {item.logo_url ? (
                      <img src={item.logo_url} alt="" />
                    ) : (
                      <span aria-hidden="true">💈</span>
                    )}

                    <div>
                      <strong>{item.nome}</strong>
                      <small>
                        {item.cidade || "Cidade não informada"}
                      </small>
                    </div>

                    <b aria-hidden="true">
                      {barbeariaId === item.id ? "✓" : "›"}
                    </b>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="client-booking-step">
            <div className="client-booking-step-title">
              <b>2</b>
              <div>
                <h2>Escolha o serviço</h2>
                <p>Preço e duração são definidos pela barbearia.</p>
              </div>
            </div>

            {!barbeariaId ? (
              <div className="client-booking-empty">
                Primeiro escolha uma barbearia.
              </div>
            ) : loadingCatalogo ? (
              <div className="client-booking-empty">
                Carregando serviços...
              </div>
            ) : servicos.length === 0 ? (
              <div className="client-booking-empty">
                Essa barbearia não possui serviços ativos.
              </div>
            ) : (
              <div className="client-booking-services">
                {servicos.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`client-booking-service${
                      servicoId === item.id
                        ? " client-booking-service--active"
                        : ""
                    }`}
                    onClick={() => {
                      setServicoId(item.id);
                      setHorario("");
                    }}
                  >
                    <div>
                      <strong>{item.nome}</strong>
                      <small>
                        {Number(item.duracao) || 30} min
                      </small>
                    </div>

                    <b>{moeda(item.preco)}</b>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="client-booking-step">
            <div className="client-booking-step-title">
              <b>3</b>
              <div>
                <h2>Escolha o profissional</h2>
                <p>
                  Você pode escolher alguém ou deixar o BarberHub
                  encontrar um profissional disponível.
                </p>
              </div>
            </div>

            {!servicoId ? (
              <div className="client-booking-empty">
                Primeiro escolha o serviço.
              </div>
            ) : profissionais.length === 0 ? (
              <div className="client-booking-empty">
                Nenhum profissional ativo nesta unidade.
              </div>
            ) : (
              <div className="client-booking-professionals">
                <button
                  type="button"
                  className={`client-booking-professional${
                    profissionalId === ""
                      ? " client-booking-professional--active"
                      : ""
                  }`}
                  onClick={() => {
                    setProfissionalId("");
                    setHorario("");
                  }}
                >
                  <span className="client-booking-avatar">✦</span>
                  <div>
                    <strong>Qualquer profissional</strong>
                    <small>
                      Mostra horários de toda a equipe
                    </small>
                  </div>
                </button>

                {profissionais.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`client-booking-professional${
                      profissionalId === item.id
                        ? " client-booking-professional--active"
                        : ""
                    }`}
                    onClick={() => {
                      setProfissionalId(item.id);
                      setHorario("");
                    }}
                  >
                    {item.foto_url ? (
                      <img src={item.foto_url} alt="" />
                    ) : (
                      <span className="client-booking-avatar">
                        {item.nome?.[0]?.toUpperCase() || "P"}
                      </span>
                    )}

                    <div>
                      <strong>{item.nome}</strong>
                      <small>Profissional</small>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="client-booking-step">
            <div className="client-booking-step-title">
              <b>4</b>
              <div>
                <h2>Data e horário</h2>
                <p>
                  Só mostramos horários realmente disponíveis para o
                  serviço escolhido.
                </p>
              </div>
            </div>

            <div className="client-booking-date">
              <label htmlFor="client-booking-date">
                Data
              </label>

              <input
                id="client-booking-date"
                type="date"
                min={hojeLocal()}
                max={dataLimite(60)}
                value={data}
                onChange={(event) => {
                  setData(event.target.value);
                  setHorario("");
                }}
                disabled={!servicoId}
              />
            </div>

            {!servicoId ? null : loadingHorarios ? (
              <div className="client-booking-empty">
                Calculando horários disponíveis...
              </div>
            ) : horarios.length === 0 ? (
              <div className="client-booking-empty">
                Nenhum horário disponível para esta data.
              </div>
            ) : (
              <div className="client-booking-times">
                {horarios.map((slot) => (
                  <button
                    type="button"
                    key={slot.hora}
                    className={
                      horario === slot.hora
                        ? "client-booking-time client-booking-time--active"
                        : "client-booking-time"
                    }
                    onClick={() => setHorario(slot.hora)}
                  >
                    {slot.hora}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="client-booking-summary">
          <span className="client-booking-summary-eyebrow">
            RESUMO
          </span>

          <h2>Seu agendamento</h2>

          <dl>
            <div>
              <dt>Barbearia</dt>
              <dd>{barbearia?.nome || "Selecione"}</dd>
            </div>

            <div>
              <dt>Serviço</dt>
              <dd>{servico?.nome || "Selecione"}</dd>
            </div>

            <div>
              <dt>Profissional</dt>
              <dd>
                {profissionalId
                  ? profissionalEscolhido?.nome || "Selecione"
                  : profissionalEscolhido?.nome
                    ? `${profissionalEscolhido.nome} (disponível)`
                    : "Qualquer profissional"}
              </dd>
            </div>

            <div>
              <dt>Data</dt>
              <dd>{data ? dataBR(data) : "Selecione"}</dd>
            </div>

            <div>
              <dt>Horário</dt>
              <dd>{horario || "Selecione"}</dd>
            </div>

            <div>
              <dt>Duração</dt>
              <dd>
                {servico
                  ? `${Number(servico.duracao) || 30} min`
                  : "—"}
              </dd>
            </div>
          </dl>

          <div className="client-booking-total">
            <small>VALOR DO SERVIÇO</small>
            <strong>
              {servico ? moeda(servico.preco) : moeda(0)}
            </strong>
          </div>

          <button
            type="submit"
            className="client-booking-submit"
            disabled={
              saving ||
              !barbeariaId ||
              !servicoId ||
              !data ||
              !horario
            }
          >
            {saving
              ? "Confirmando..."
              : "Confirmar agendamento"}
          </button>

          <p className="client-booking-notice">
            O horário será criado como <strong>pendente</strong> e a
            barbearia receberá uma notificação para confirmar.
          </p>
        </aside>
      </form>

      {confirmation ? (
        <div
          className="client-booking-modal-backdrop"
          role="presentation"
        >
          <div
            className="client-booking-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-confirmation-title"
          >
            <div className="client-booking-confirmation-icon">
              ✓
            </div>

            <span>AGENDAMENTO CRIADO</span>

            <h2 id="booking-confirmation-title">
              Horário solicitado com sucesso
            </h2>

            <p>
              A barbearia recebeu seu agendamento e poderá
              confirmá-lo.
            </p>

            <div className="client-booking-confirmation-details">
              <div>
                <small>Barbearia</small>
                <strong>{confirmation.barbearia}</strong>
              </div>

              <div>
                <small>Serviço</small>
                <strong>{confirmation.servico}</strong>
              </div>

              <div>
                <small>Profissional</small>
                <strong>{confirmation.profissional}</strong>
              </div>

              <div>
                <small>Quando</small>
                <strong>
                  {dataBR(confirmation.data)} às{" "}
                  {confirmation.horario}
                </strong>
              </div>

              <div>
                <small>Valor</small>
                <strong>{moeda(confirmation.preco)}</strong>
              </div>
            </div>

            <div className="client-booking-confirmation-actions">
              <button
                type="button"
                onClick={() => setConfirmation(null)}
              >
                Fazer outro agendamento
              </button>

              <button
                type="button"
                className="client-booking-confirmation-primary"
                onClick={() =>
                  navigate("/cliente/agendamentos")
                }
              >
                Ver meus agendamentos
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
