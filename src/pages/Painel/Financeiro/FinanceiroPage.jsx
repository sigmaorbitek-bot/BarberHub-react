import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import EmptyState from "../../../components/Painel/EmptyState/EmptyState";
import MovimentacoesFinanceiras from "./MovimentacoesFinanceiras";
import { useBarbearia } from "../../../hooks/useBarbearia";
import { supabase } from "../../../services/supabase";
import {
  abrirResumoFinanceiroWhatsapp,
  gerarRelatorioFinanceiroPdf,
} from "../../../utils/relatorioFinanceiro";
import "./FinanceiroPage.css";

const FORM_INICIAL = {
  id: null,
  descricao: "",
  valor: "",
  categoria: "",
  dataGasto: "",
  pagamento: "",
  observacao: "",
};

function hojeLocal() {
  const data = new Date();

  const ano =
    data.getFullYear();

  const mes =
    String(
      data.getMonth() + 1,
    ).padStart(
      2,
      "0",
    );

  const dia =
    String(
      data.getDate(),
    ).padStart(
      2,
      "0",
    );

  return `${ano}-${mes}-${dia}`;
}

function inicioMesLocal() {
  const data = new Date();

  const ano =
    data.getFullYear();

  const mes =
    String(
      data.getMonth() + 1,
    ).padStart(
      2,
      "0",
    );

  return `${ano}-${mes}-01`;
}

function moeda(valor) {
  return Number(valor || 0).toLocaleString(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    },
  );
}

function dataBR(valor) {
  if (!valor) {
    return "—";
  }

  const [
    ano,
    mes,
    dia,
  ] = String(
    valor,
  ).split("-");

  return `${dia}/${mes}/${ano}`;
}

export default function FinanceiroPage() {
  const {
    barbeariaId,
    barbearia,
  } = useBarbearia();

  const [
    dataInicial,
    setDataInicial,
  ] = useState(
    inicioMesLocal,
  );

  const [
    dataFinal,
    setDataFinal,
  ] = useState(
    hojeLocal,
  );

  const [
    resumo,
    setResumo,
  ] = useState({
    servicos_concluidos: 0,
    faturamento_servicos: 0,
    vendas_produtos: 0,
    faturamento_produtos: 0,
    entradas: 0,
    despesas: 0,
    comissoes_estimadas: 0,
    resultado_liquido: 0,
  });

  const [
    gastos,
    setGastos,
  ] = useState([]);

  const [
    movimentacoes,
    setMovimentacoes,
  ] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [
    modalOpen,
    setModalOpen,
  ] = useState(false);

  const [
    form,
    setForm,
  ] = useState({
    ...FORM_INICIAL,
    dataGasto:
      hojeLocal(),
  });

  const [message, setMessage] =
    useState("");

  const [
    messageType,
    setMessageType,
  ] = useState("success");

  const periodoValido =
    dataInicial &&
    dataFinal &&
    dataInicial <=
      dataFinal;

  const carregar =
    useCallback(
      async () => {
        if (
          !barbeariaId ||
          !dataInicial ||
          !dataFinal
        ) {
          return;
        }

        if (
          dataInicial >
          dataFinal
        ) {
          setMessageType(
            "error",
          );

          setMessage(
            "A data inicial não pode ser maior que a data final.",
          );

          return;
        }

        setLoading(true);

        try {
          const [
            respostaResumo,
            respostaGastos,
            respostaMovimentacoes,
          ] =
            await Promise.all([
              supabase.rpc(
                "obter_financeiro_painel",
                {
                  p_barbearia_id:
                    barbeariaId,
                  p_data_inicial:
                    dataInicial,
                  p_data_final:
                    dataFinal,
                },
              ),
              supabase.rpc(
                "listar_gastos_painel",
                {
                  p_barbearia_id:
                    barbeariaId,
                  p_data_inicial:
                    dataInicial,
                  p_data_final:
                    dataFinal,
                },
              ),
              supabase.rpc(
                "listar_movimentacoes_financeiras_painel",
                {
                  p_barbearia_id:
                    barbeariaId,
                  p_data_inicial:
                    dataInicial,
                  p_data_final:
                    dataFinal,
                },
              ),
            ]);

          if (
            respostaResumo.error
          ) {
            throw respostaResumo.error;
          }

          if (
            respostaGastos.error
          ) {
            throw respostaGastos.error;
          }

          if (
            respostaMovimentacoes.error
          ) {
            throw respostaMovimentacoes.error;
          }

          setResumo(
            respostaResumo
              .data?.[0] || {
              servicos_concluidos: 0,
              faturamento_servicos: 0,
              vendas_produtos: 0,
              faturamento_produtos: 0,
              entradas: 0,
              despesas: 0,
              comissoes_estimadas: 0,
              resultado_liquido: 0,
            },
          );

          setGastos(
            respostaGastos.data ||
              [],
          );

          setMovimentacoes(
            respostaMovimentacoes.data ||
              [],
          );
        } catch (error) {
          console.error(
            "[BarberHub] Erro ao carregar financeiro:",
            error,
          );

          setMessageType(
            "error",
          );

          setMessage(
            error?.message ||
              "Não foi possível carregar o financeiro.",
          );
        } finally {
          setLoading(false);
        }
      },
      [
        barbeariaId,
        dataInicial,
        dataFinal,
      ],
    );

  useEffect(() => {
    carregar();
  }, [carregar]);

  const margem = useMemo(
    () => {
      const entradas =
        Number(
          resumo.entradas ||
            0,
        );

      const liquido =
        Number(
          resumo.resultado_liquido ||
            0,
        );

      if (
        entradas <= 0
      ) {
        return 0;
      }

      return (
        liquido /
        entradas
      ) * 100;
    },
    [resumo],
  );

  function abrirNovo() {
    setForm({
      ...FORM_INICIAL,
      dataGasto:
        hojeLocal(),
    });

    setMessage("");
    setModalOpen(true);
  }

  function editarGasto(
    gasto,
  ) {
    setForm({
      id:
        gasto.gasto_id,
      descricao:
        gasto.descricao ||
        "",
      valor:
        String(
          gasto.valor ??
            "",
        ),
      categoria:
        gasto.categoria ||
        "",
      dataGasto:
        gasto.data_gasto ||
        hojeLocal(),
      pagamento:
        gasto.pagamento ||
        "",
      observacao:
        gasto.observacao ||
        "",
    });

    setMessage("");
    setModalOpen(true);
  }

  async function salvarGasto(
    event,
  ) {
    event.preventDefault();

    const valor =
      Number(
        String(
          form.valor,
        ).replace(
          ",",
          ".",
        ),
      );

    if (
      !form.descricao.trim()
    ) {
      setMessageType(
        "error",
      );
      setMessage(
        "Digite a descrição do gasto.",
      );
      return;
    }

    if (
      !Number.isFinite(
        valor,
      ) ||
      valor <= 0
    ) {
      setMessageType(
        "error",
      );
      setMessage(
        "Informe um valor maior que zero.",
      );
      return;
    }

    setSaving(true);

    try {
      const { error } =
        await supabase.rpc(
          "salvar_gasto_painel",
          {
            p_barbearia_id:
              barbeariaId,
            p_gasto_id:
              form.id ||
              null,
            p_descricao:
              form.descricao.trim(),
            p_valor:
              valor,
            p_categoria:
              form.categoria.trim() ||
              null,
            p_data_gasto:
              form.dataGasto,
            p_pagamento:
              form.pagamento.trim() ||
              null,
            p_observacao:
              form.observacao.trim() ||
              null,
          },
        );

      if (error) {
        throw error;
      }

      setModalOpen(false);
      setMessageType(
        "success",
      );
      setMessage(
        form.id
          ? "Gasto atualizado com sucesso."
          : "Gasto registrado com sucesso.",
      );

      await carregar();
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao salvar gasto:",
        error,
      );

      setMessageType(
        "error",
      );

      setMessage(
        error?.message ||
          "Não foi possível salvar o gasto.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function arquivarGasto(
    gasto,
  ) {
    const confirmou =
      window.confirm(
        `Arquivar o gasto "${gasto.descricao}"? Ele deixará de entrar nos cálculos financeiros.`,
      );

    if (!confirmou) {
      return;
    }

    try {
      const { error } =
        await supabase.rpc(
          "arquivar_gasto_painel",
          {
            p_barbearia_id:
              barbeariaId,
            p_gasto_id:
              gasto.gasto_id,
          },
        );

      if (error) {
        throw error;
      }

      setMessageType(
        "success",
      );

      setMessage(
        "Gasto arquivado com sucesso.",
      );

      await carregar();
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao arquivar gasto:",
        error,
      );

      setMessageType(
        "error",
      );

      setMessage(
        error?.message ||
          "Não foi possível arquivar o gasto.",
      );
    }
  }

  function gerarPdf() {
    gerarRelatorioFinanceiroPdf({
      barbearia,
      periodo: {
        inicial:
          dataInicial,
        final:
          dataFinal,
      },
      resumo,
      gastos,
      movimentacoes,
    });
  }

  function enviarWhatsapp() {
    abrirResumoFinanceiroWhatsapp({
      barbearia,
      periodo: {
        inicial:
          dataInicial,
        final:
          dataFinal,
      },
      resumo,
      movimentacoes,
    });
  }

  return (
    <section className="finance-page">
      <div className="finance-heading">
        <div>
          <span className="finance-eyebrow">
            RESULTADOS
          </span>

          <h1>
            Financeiro
          </h1>

          <p>
            Entradas, despesas, comissões e resultado da{" "}
            <strong>
              {barbearia?.nome ||
                "sua barbearia"}
            </strong>
            .
          </p>
        </div>

        <button
          type="button"
          className="finance-primary"
          onClick={
            abrirNovo
          }
        >
          ＋ Registrar gasto
        </button>
      </div>

      {message ? (
        <div
          className={`finance-message finance-message--${messageType}`}
          role="status"
        >
          {message}
        </div>
      ) : null}

      <div className="finance-period">
        <div>
          <label htmlFor="finance-start">
            Data inicial
          </label>

          <input
            id="finance-start"
            type="date"
            value={
              dataInicial
            }
            onChange={(event) =>
              setDataInicial(
                event.target.value,
              )
            }
          />
        </div>

        <div>
          <label htmlFor="finance-end">
            Data final
          </label>

          <input
            id="finance-end"
            type="date"
            value={
              dataFinal
            }
            onChange={(event) =>
              setDataFinal(
                event.target.value,
              )
            }
          />
        </div>

        <button
          type="button"
          className="finance-secondary"
          disabled={
            loading ||
            !periodoValido
          }
          onClick={
            carregar
          }
        >
          ↻ Atualizar
        </button>

        <button
          type="button"
          className="finance-secondary"
          disabled={
            loading ||
            !periodoValido
          }
          onClick={
            enviarWhatsapp
          }
        >
          📲 WhatsApp
        </button>

        <button
          type="button"
          className="finance-secondary"
          disabled={
            loading ||
            !periodoValido
          }
          onClick={
            gerarPdf
          }
        >
          📄 Relatório PDF
        </button>
      </div>

      <div className="finance-stats">
        <article>
          <span>✂️</span>
          <div>
            <small>
              SERVIÇOS
            </small>
            <strong>
              {loading
                ? "..."
                : moeda(
                    resumo.faturamento_servicos,
                  )}
            </strong>
            <p>
              {
                resumo.servicos_concluidos
              }{" "}
              concluído(s)
            </p>
          </div>
        </article>

        <article>
          <span>🛍️</span>
          <div>
            <small>
              PRODUTOS
            </small>
            <strong>
              {loading
                ? "..."
                : moeda(
                    resumo.faturamento_produtos,
                  )}
            </strong>
            <p>
              {
                resumo.vendas_produtos
              }{" "}
              venda(s)
            </p>
          </div>
        </article>

        <article>
          <span>📈</span>
          <div>
            <small>
              ENTRADAS
            </small>
            <strong>
              {loading
                ? "..."
                : moeda(
                    resumo.entradas,
                  )}
            </strong>
            <p>
              Serviços + produtos
            </p>
          </div>
        </article>

        <article>
          <span>📉</span>
          <div>
            <small>
              DESPESAS
            </small>
            <strong>
              {loading
                ? "..."
                : moeda(
                    resumo.despesas,
                  )}
            </strong>
            <p>
              Gastos registrados
            </p>
          </div>
        </article>

        <article>
          <span>👤</span>
          <div>
            <small>
              COMISSÕES
            </small>
            <strong>
              {loading
                ? "..."
                : moeda(
                    resumo.comissoes_estimadas,
                  )}
            </strong>
            <p>
              Estimativa dos profissionais
            </p>
          </div>
        </article>

        <article className="finance-result-card">
          <span>💰</span>
          <div>
            <small>
              RESULTADO LÍQUIDO
            </small>
            <strong>
              {loading
                ? "..."
                : moeda(
                    resumo.resultado_liquido,
                  )}
            </strong>
            <p>
              Margem{" "}
              {margem.toLocaleString(
                "pt-BR",
                {
                  maximumFractionDigits: 1,
                },
              )}
              %
            </p>
          </div>
        </article>
      </div>

      <MovimentacoesFinanceiras
        movimentacoes={
          movimentacoes
        }
        loading={
          loading
        }
      />

      <section className="finance-section">
        <div className="finance-section-heading">
          <div>
            <span className="finance-eyebrow">
              SAÍDAS
            </span>
            <h2>
              Gastos do período
            </h2>
            <p>
              {dataBR(
                dataInicial,
              )}{" "}
              até{" "}
              {dataBR(
                dataFinal,
              )}
            </p>
          </div>

          <strong>
            {moeda(
              resumo.despesas,
            )}
          </strong>
        </div>

        {loading ? (
          <div className="finance-loading">
            Carregando financeiro...
          </div>
        ) : gastos.length ? (
          <div className="finance-expenses">
            {gastos.map(
              (gasto) => (
                <article
                  key={
                    gasto.gasto_id
                  }
                  className="finance-expense"
                >
                  <div className="finance-expense-icon">
                    📉
                  </div>

                  <div className="finance-expense-main">
                    <span className="finance-eyebrow">
                      {gasto.categoria ||
                        "GASTO"}
                    </span>

                    <h3>
                      {
                        gasto.descricao
                      }
                    </h3>

                    <p>
                      {dataBR(
                        gasto.data_gasto,
                      )}
                      {gasto.pagamento
                        ? ` · ${gasto.pagamento}`
                        : ""}
                    </p>

                    {gasto.observacao ? (
                      <small>
                        {
                          gasto.observacao
                        }
                      </small>
                    ) : null}
                  </div>

                  <strong className="finance-expense-value">
                    {moeda(
                      gasto.valor,
                    )}
                  </strong>

                  <div className="finance-expense-actions">
                    <button
                      type="button"
                      onClick={() =>
                        editarGasto(
                          gasto,
                        )
                      }
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      className="finance-danger"
                      onClick={() =>
                        arquivarGasto(
                          gasto,
                        )
                      }
                    >
                      Arquivar
                    </button>
                  </div>
                </article>
              ),
            )}
          </div>
        ) : (
          <EmptyState
            icon="📉"
            title="Nenhum gasto no período"
            description="Quando você registrar despesas, elas aparecerão aqui e entrarão no cálculo do resultado."
          />
        )}
      </section>

      {modalOpen ? (
        <div
          className="finance-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
                event.currentTarget &&
              !saving
            ) {
              setModalOpen(
                false,
              );
            }
          }}
        >
          <div
            className="finance-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className="finance-modal-header">
              <div>
                <span className="finance-eyebrow">
                  {form.id
                    ? "EDITAR GASTO"
                    : "NOVO GASTO"}
                </span>

                <h2>
                  {form.id
                    ? "Editar gasto"
                    : "Registrar gasto"}
                </h2>

                <p>
                  Despesas registradas entram no resultado financeiro do período.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setModalOpen(
                    false,
                  )
                }
              >
                ×
              </button>
            </div>

            <form
              className="finance-form"
              onSubmit={
                salvarGasto
              }
            >
              <div className="finance-field finance-field--full">
                <label>
                  Descrição *
                </label>

                <input
                  type="text"
                  maxLength={160}
                  value={
                    form.descricao
                  }
                  disabled={
                    saving
                  }
                  placeholder="Ex.: Conta de energia"
                  onChange={(event) =>
                    setForm(
                      (atual) => ({
                        ...atual,
                        descricao:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>

              <div className="finance-field">
                <label>
                  Valor *
                </label>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={
                    form.valor
                  }
                  disabled={
                    saving
                  }
                  placeholder="0,00"
                  onChange={(event) =>
                    setForm(
                      (atual) => ({
                        ...atual,
                        valor:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>

              <div className="finance-field">
                <label>
                  Data *
                </label>

                <input
                  type="date"
                  value={
                    form.dataGasto
                  }
                  disabled={
                    saving
                  }
                  onChange={(event) =>
                    setForm(
                      (atual) => ({
                        ...atual,
                        dataGasto:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>

              <div className="finance-field">
                <label>
                  Categoria
                </label>

                <select
                  value={
                    form.categoria
                  }
                  disabled={
                    saving
                  }
                  onChange={(event) =>
                    setForm(
                      (atual) => ({
                        ...atual,
                        categoria:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                >
                  <option value="">
                    Selecione...
                  </option>
                  <option value="Aluguel">
                    Aluguel
                  </option>
                  <option value="Água">
                    Água
                  </option>
                  <option value="Energia">
                    Energia
                  </option>
                  <option value="Internet">
                    Internet
                  </option>
                  <option value="Produtos e insumos">
                    Produtos e insumos
                  </option>
                  <option value="Manutenção">
                    Manutenção
                  </option>
                  <option value="Impostos">
                    Impostos
                  </option>
                  <option value="Salários">
                    Salários
                  </option>
                  <option value="Outros">
                    Outros
                  </option>
                </select>
              </div>

              <div className="finance-field">
                <label>
                  Pagamento
                </label>

                <select
                  value={
                    form.pagamento
                  }
                  disabled={
                    saving
                  }
                  onChange={(event) =>
                    setForm(
                      (atual) => ({
                        ...atual,
                        pagamento:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                >
                  <option value="">
                    Não informado
                  </option>
                  <option value="Dinheiro">
                    Dinheiro
                  </option>
                  <option value="Pix">
                    Pix
                  </option>
                  <option value="Débito">
                    Débito
                  </option>
                  <option value="Crédito">
                    Crédito
                  </option>
                  <option value="Boleto">
                    Boleto
                  </option>
                  <option value="Transferência">
                    Transferência
                  </option>
                </select>
              </div>

              <div className="finance-field finance-field--full">
                <label>
                  Observação
                </label>

                <textarea
                  rows={4}
                  maxLength={1000}
                  value={
                    form.observacao
                  }
                  disabled={
                    saving
                  }
                  placeholder="Informações adicionais..."
                  onChange={(event) =>
                    setForm(
                      (atual) => ({
                        ...atual,
                        observacao:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>

              <div className="finance-form-actions">
                <button
                  type="button"
                  className="finance-secondary"
                  disabled={
                    saving
                  }
                  onClick={() =>
                    setModalOpen(
                      false,
                    )
                  }
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="finance-primary"
                  disabled={
                    saving
                  }
                >
                  {saving
                    ? "Salvando..."
                    : form.id
                      ? "Salvar alterações"
                      : "Registrar gasto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
