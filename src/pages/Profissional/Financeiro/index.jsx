import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../../services/supabase";
import { formatarMoeda, obterPeriodoMesAtual } from "../../../utils/formatters";
import "../Profissional.css";
import "./ProfissionalFinanceiroPage.css";

export default function ProfissionalFinanceiroPage() {
  const [filtros, setFiltros] = useState(() => obterPeriodoMesAtual());
  const [periodoConsulta, setPeriodoConsulta] = useState(() => obterPeriodoMesAtual());
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const sequenciaRef = useRef(0);

  const carregar = useCallback(async () => {
    const requisicao = ++sequenciaRef.current;
    setLoading(true);
    setErro("");
    try {
      const { data, error } = await supabase.rpc("obter_financeiro_profissional", {
        p_data_inicial: periodoConsulta.inicial,
        p_data_final: periodoConsulta.final,
      });
      if (error) throw error;
      if (requisicao !== sequenciaRef.current) return;
      setDados(Array.isArray(data) ? data[0] || null : data || null);
    } catch (error) {
      if (requisicao !== sequenciaRef.current) return;
      console.error("[BarberHub] Financeiro do profissional:", error);
      setDados(null);
      setErro(error?.message || "Não foi possível carregar seu financeiro.");
    } finally {
      if (requisicao === sequenciaRef.current) setLoading(false);
    }
  }, [periodoConsulta]);

  useEffect(() => {
    void carregar();
    return () => { sequenciaRef.current += 1; };
  }, [carregar]);

  const periodoValido = Boolean(
    filtros.inicial && filtros.final && filtros.inicial <= filtros.final,
  );
  const periodoPendente = filtros.inicial !== periodoConsulta.inicial || filtros.final !== periodoConsulta.final;

  function atualizarPeriodo() {
    if (!periodoValido) {
      setErro("Informe um período válido.");
      return;
    }
    setPeriodoConsulta({ ...filtros });
  }

  return (
    <section className="professional-page">
      <div className="professional-page-heading">
        <div>
          <span className="professional-eyebrow">RESULTADOS</span>
          <h1>Meu financeiro</h1>
          <p>Valores de atendimentos concluídos no período. A comissão é estimada com base nos percentuais registrados em cada atendimento.</p>
        </div>
      </div>
      <div className="professional-period">
        <label htmlFor="prof-finance-start">De
          <input id="prof-finance-start" type="date" value={filtros.inicial} onChange={(e) => setFiltros((f) => ({ ...f, inicial: e.target.value }))} />
        </label>
        <label htmlFor="prof-finance-end">Até
          <input id="prof-finance-end" type="date" value={filtros.final} onChange={(e) => setFiltros((f) => ({ ...f, final: e.target.value }))} />
        </label>
        <button type="button" disabled={loading || !periodoValido} onClick={atualizarPeriodo}>↻ Atualizar</button>
      </div>
      {periodoPendente && <p className="professional-finance-notice" role="status">Período alterado. Clique em Atualizar para consultar os resultados.</p>}
      {erro && <div className="professional-message" role="alert">{erro}</div>}
      {loading ? (
        <div className="professional-empty" role="status">Carregando financeiro...</div>
      ) : dados ? (
        <div className="professional-finance-grid">
          <article><small>ATENDIMENTOS CONCLUÍDOS</small><strong>{dados.atendimentos_concluidos ?? 0}</strong></article>
          <article><small>FATURAMENTO GERADO</small><strong>{formatarMoeda(dados.faturamento)}</strong></article>
          {dados.mostrar_comissao && (
            <>
              <article>
                <small>PERCENTUAL ATUAL</small>
                <strong>{Number(dados.comissao_percentual || 0).toLocaleString("pt-BR")}%</strong>
                <span className="professional-finance-hint">Percentual atual; não necessariamente aplicado a todos os atendimentos do período.</span>
              </article>
              <article><small>COMISSÃO ESTIMADA NO PERÍODO</small><strong>{formatarMoeda(dados.comissao_estimada)}</strong></article>
            </>
          )}
        </div>
      ) : (
        !erro && <div className="professional-empty">Nenhum dado financeiro encontrado.</div>
      )}
    </section>
  );
}
