import { useMemo } from "react";
import "./MovimentacoesFinanceiras.css";

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

  const [ano, mes, dia] =
    String(valor).split("-");

  return `${dia}/${mes}/${ano}`;
}

function horaBR(valor) {
  if (!valor) {
    return "";
  }

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return "";
  }

  return data.toLocaleTimeString(
    "pt-BR",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

function agruparPorDia(movimentacoes) {
  const mapa = new Map();

  for (const item of movimentacoes || []) {
    const data =
      item.data_movimento;

    if (!mapa.has(data)) {
      mapa.set(data, {
        data,
        atendimentos: [],
        produtos: [],
        gastos: [],
        faturamento: 0,
        despesas: 0,
        comissoes: 0,
      });
    }

    const dia = mapa.get(data);

    dia.faturamento +=
      Number(
        item.valor_entrada ||
          0,
      );

    dia.despesas +=
      Number(
        item.valor_saida ||
          0,
      );

    dia.comissoes +=
      Number(
        item.comissao ||
          0,
      );

    if (
      item.tipo ===
      "servico"
    ) {
      dia.atendimentos.push(
        item,
      );
    } else if (
      item.tipo ===
      "produto"
    ) {
      dia.produtos.push(
        item,
      );
    } else if (
      item.tipo ===
      "gasto"
    ) {
      dia.gastos.push(
        item,
      );
    }
  }

  return Array.from(
    mapa.values(),
  ).sort(
    (a, b) =>
      String(b.data).localeCompare(
        String(a.data),
      ),
  );
}

export default function MovimentacoesFinanceiras({
  movimentacoes,
  loading,
}) {
  const dias = useMemo(
    () =>
      agruparPorDia(
        movimentacoes,
      ),
    [movimentacoes],
  );

  if (loading) {
    return (
      <section className="daily-finance-section">
        <div className="daily-finance-loading">
          Carregando movimentação diária...
        </div>
      </section>
    );
  }

  if (!dias.length) {
    return (
      <section className="daily-finance-section">
        <div className="daily-finance-heading">
          <div>
            <span>
              MOVIMENTAÇÃO
            </span>
            <h2>
              Resumo por dia
            </h2>
            <p>
              Atendimentos, vendas e gastos do período.
            </p>
          </div>
        </div>

        <div className="daily-finance-empty">
          Nenhuma movimentação financeira encontrada no período.
        </div>
      </section>
    );
  }

  return (
    <section className="daily-finance-section">
      <div className="daily-finance-heading">
        <div>
          <span>
            MOVIMENTAÇÃO
          </span>
          <h2>
            Resumo por dia
          </h2>
          <p>
            Veja quem foi atendido, o que foi vendido e quanto entrou ou saiu em cada dia.
          </p>
        </div>
      </div>

      <div className="daily-finance-days">
        {dias.map((dia) => {
          const resultado =
            dia.faturamento -
            dia.despesas -
            dia.comissoes;

          return (
            <article
              key={dia.data}
              className="daily-finance-card"
            >
              <div className="daily-finance-date">
                <div>
                  <span>
                    DIA
                  </span>

                  <h3>
                    {dataBR(
                      dia.data,
                    )}
                  </h3>
                </div>

                <div className="daily-finance-summary">
                  <div>
                    <small>
                      ATENDIMENTOS
                    </small>
                    <strong>
                      {
                        dia
                          .atendimentos
                          .length
                      }
                    </strong>
                  </div>

                  <div>
                    <small>
                      VENDAS
                    </small>
                    <strong>
                      {
                        dia
                          .produtos
                          .length
                      }
                    </strong>
                  </div>

                  <div>
                    <small>
                      FATURADO
                    </small>
                    <strong>
                      {moeda(
                        dia.faturamento,
                      )}
                    </strong>
                  </div>

                  <div>
                    <small>
                      GASTOS
                    </small>
                    <strong>
                      {moeda(
                        dia.despesas,
                      )}
                    </strong>
                  </div>

                  <div>
                    <small>
                      COMISSÕES
                    </small>
                    <strong>
                      {moeda(
                        dia.comissoes,
                      )}
                    </strong>
                  </div>

                  <div className="daily-finance-result">
                    <small>
                      RESULTADO
                    </small>
                    <strong>
                      {moeda(
                        resultado,
                      )}
                    </strong>
                  </div>
                </div>
              </div>

              {dia.atendimentos.length ? (
                <div className="daily-finance-group">
                  <div className="daily-finance-group-title">
                    <span>
                      ✂️
                    </span>
                    <div>
                      <strong>
                        Clientes atendidos
                      </strong>
                      <small>
                        {
                          dia
                            .atendimentos
                            .length
                        }{" "}
                        atendimento(s)
                      </small>
                    </div>
                  </div>

                  <div className="daily-finance-list">
                    {dia.atendimentos.map(
                      (
                        item,
                        index,
                      ) => (
                        <div
                          key={`servico-${dia.data}-${index}`}
                          className="daily-finance-row"
                        >
                          <div>
                            <strong>
                              {
                                item.cliente_nome
                              }
                            </strong>
                            <span>
                              {horaBR(
                                item.data_hora,
                              )}
                              {" · "}
                              {
                                item.descricao
                              }
                              {item.profissional_nome
                                ? ` · ${item.profissional_nome}`
                                : ""}
                            </span>
                          </div>

                          <strong className="daily-finance-money">
                            {moeda(
                              item.valor_entrada,
                            )}
                          </strong>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ) : null}

              {dia.produtos.length ? (
                <div className="daily-finance-group">
                  <div className="daily-finance-group-title">
                    <span>
                      🛍️
                    </span>
                    <div>
                      <strong>
                        Produtos vendidos
                      </strong>
                      <small>
                        {
                          dia
                            .produtos
                            .length
                        }{" "}
                        venda(s)
                      </small>
                    </div>
                  </div>

                  <div className="daily-finance-list">
                    {dia.produtos.map(
                      (
                        item,
                        index,
                      ) => (
                        <div
                          key={`produto-${dia.data}-${index}`}
                          className="daily-finance-row"
                        >
                          <div>
                            <strong>
                              {
                                item.cliente_nome
                              }
                            </strong>
                            <span>
                              {horaBR(
                                item.data_hora,
                              )}
                              {" · "}
                              {
                                item.descricao
                              }
                              {" · "}
                              Qtd.{" "}
                              {
                                item.quantidade
                              }
                            </span>
                          </div>

                          <strong className="daily-finance-money">
                            {moeda(
                              item.valor_entrada,
                            )}
                          </strong>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ) : null}

              {dia.gastos.length ? (
                <div className="daily-finance-group">
                  <div className="daily-finance-group-title">
                    <span>
                      📉
                    </span>
                    <div>
                      <strong>
                        Gastos do dia
                      </strong>
                      <small>
                        {
                          dia.gastos
                            .length
                        }{" "}
                        gasto(s)
                      </small>
                    </div>
                  </div>

                  <div className="daily-finance-list">
                    {dia.gastos.map(
                      (
                        item,
                        index,
                      ) => (
                        <div
                          key={`gasto-${dia.data}-${index}`}
                          className="daily-finance-row"
                        >
                          <div>
                            <strong>
                              {
                                item.descricao
                              }
                            </strong>
                            <span>
                              {[
                                item.categoria,
                                item.pagamento,
                              ]
                                .filter(
                                  Boolean,
                                )
                                .join(
                                  " · ",
                                ) ||
                                "Gasto registrado"}
                            </span>
                          </div>

                          <strong className="daily-finance-money daily-finance-money--expense">
                            -
                            {moeda(
                              item.valor_saida,
                            )}
                          </strong>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
