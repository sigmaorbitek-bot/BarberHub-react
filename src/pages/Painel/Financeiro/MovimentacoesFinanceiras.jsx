import { useMemo } from "react";
import { formatarData, formatarHora, formatarMoeda } from "../../../utils/formatters";
import "./MovimentacoesFinanceiras.css";

function agruparPorDia(movimentacoes = []) {
  const dias = new Map();
  for (const item of movimentacoes) {
    const data = item.data_movimento;
    if (!data) continue;
    if (!dias.has(data)) {
      dias.set(data, {
        data,
        atendimentos: [],
        produtos: [],
        recebimentos: [],
        gastos: [],
        faturamento: 0,
        despesas: 0,
        comissoes: 0,
      });
    }
    const dia = dias.get(data);
    dia.faturamento += Number(item.valor_entrada || 0);
    dia.despesas += Number(item.valor_saida || 0);
    dia.comissoes += Number(item.comissao || 0);
    if (item.tipo === "servico") dia.atendimentos.push(item);
    if (item.tipo === "produto") dia.produtos.push(item);
    if (item.tipo === "recebimento") dia.recebimentos.push(item);
    if (item.tipo === "gasto") dia.gastos.push(item);
  }
  return [...dias.values()].sort((a, b) => b.data.localeCompare(a.data));
}

function LinhaMovimento({ item, timezone }) {
  const gasto = item.tipo === "gasto";
  const detalhe = gasto
    ? [item.categoria, item.pagamento].filter(Boolean).join(" · ") || "Gasto registrado"
    : [
        formatarHora(item.data_hora, timezone),
        item.descricao,
        item.tipo === "servico" ? item.profissional_nome : `Qtd. ${item.quantidade ?? 0}`,
      ].filter(Boolean).join(" · ");
  return (
    <div className="daily-finance-row">
      <div>
        <strong>{gasto ? item.descricao : item.cliente_nome || "Cliente"}</strong>
        <span>{detalhe}</span>
      </div>
      <strong className={`daily-finance-money${gasto ? " daily-finance-money--expense" : ""}`}>
        {gasto ? "−" : ""}{formatarMoeda(gasto ? item.valor_saida : item.valor_entrada)}
      </strong>
    </div>
  );
}

function GrupoMovimento({ titulo, icone, itens, timezone }) {
  if (!itens.length) return null;
  return (
    <div className="daily-finance-group">
      <div className="daily-finance-group-title">
        <span aria-hidden="true">{icone}</span>
        <div>
          <strong>{titulo}</strong>
          <small>{itens.length} movimentação(ões)</small>
        </div>
      </div>
      <div className="daily-finance-list">
        {itens.map((item, index) => (
          <LinhaMovimento
            key={`${item.tipo}-${item.movimentacao_id || `${item.data_movimento}-${index}`}`}
            item={item}
            timezone={timezone}
          />
        ))}
      </div>
    </div>
  );
}

export default function MovimentacoesFinanceiras({
  movimentacoes = [],
  loading = false,
  error = false,
  timezone = "America/Recife",
}) {
  const dias = useMemo(() => agruparPorDia(movimentacoes), [movimentacoes]);
  return (
    <section className="daily-finance-section" aria-labelledby="daily-finance-title" aria-busy={loading}>
      <div className="daily-finance-heading">
        <span>MOVIMENTAÇÃO</span>
        <h2 id="daily-finance-title">Resumo por dia</h2>
        <p>Atendimentos concluídos, vendas finalizadas e gastos registrados, incluindo despesas arquivadas.</p>
      </div>
      {loading ? (
        <div className="daily-finance-loading" role="status">Carregando movimentações...</div>
      ) : error ? (
        <div className="daily-finance-empty" role="alert">Falha ao carregar movimentações. Tente atualizar o período.</div>
      ) : !dias.length ? (
        <div className="daily-finance-empty">Nenhuma movimentação financeira encontrada neste período.</div>
      ) : (
        <div className="daily-finance-days">
          {dias.map((dia) => {
            const resultado = dia.faturamento - dia.despesas - dia.comissoes;
            return (
              <article key={dia.data} className="daily-finance-card">
                <div className="daily-finance-date">
                  <div>
                    <span>DIA</span>
                    <h3>{formatarData(dia.data)}</h3>
                  </div>
                  <div className="daily-finance-summary">
                    {[
                      ["ATENDIMENTOS", dia.atendimentos.length],
                      ["VENDAS", dia.produtos.length],
                      ["FATURADO", formatarMoeda(dia.faturamento)],
                      ["GASTOS", formatarMoeda(dia.despesas)],
                      ["COMISSÕES", formatarMoeda(dia.comissoes)],
                      ["RESULTADO", formatarMoeda(resultado)],
                    ].map(([titulo, valor], index) => (
                      <div key={titulo} className={index === 5 ? "daily-finance-result" : undefined}>
                        <small>{titulo}</small><strong>{valor}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <GrupoMovimento titulo="Clientes atendidos" icone="✂️" itens={dia.atendimentos} timezone={timezone} />
                <GrupoMovimento titulo="Produtos concluídos" icone="🛍️" itens={dia.produtos} timezone={timezone} />
                <GrupoMovimento titulo="Pagamentos recebidos" icone="💵" itens={dia.recebimentos} timezone={timezone} />
                <GrupoMovimento titulo="Gastos do dia" icone="📉" itens={dia.gastos} timezone={timezone} />
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
