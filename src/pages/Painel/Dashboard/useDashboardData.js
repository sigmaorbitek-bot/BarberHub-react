import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { supabase } from "../../../services/supabase";
import {
  obterPeriodoHoje,
} from "../../../utils/formatters";

const INITIAL_DATA = {
  totalAgendamentosHoje: 0,
  totalClientes: 0,
  totalProfissionais: 0,
  totalProdutos: 0,
  estoqueBaixo: 0,
  pedidosPendentes: 0,
  faturamentoHoje: 0,
  avaliacaoMedia: 0,
  notificacoesNaoLidas: 0,
  proximosAgendamentos: [],
  notificacoesRecentes: [],
  comentariosRecentes: [],
};

export function useDashboardData({
  barbeariaId,
  usuarioId,
}) {
  const [data, setData] = useState(INITIAL_DATA);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const carregar = useCallback(async () => {
    if (!barbeariaId || !usuarioId) {
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const { agora, inicio, fim } = obterPeriodoHoje();

    try {
      const [
        agendamentosHojeResult,
        proximosResult,
        clientesResult,
        profissionaisResult,
        produtosResult,
        estoqueBaixoResult,
        pedidosPendentesResult,
        pedidosHojeResult,
        avaliacoesResult,
        notificacoesCountResult,
        notificacoesRecentesResult,
        comentariosResult,
      ] = await Promise.all([
        supabase
          .from("agendamentos")
          .select(
            `
              id,
              status,
              data_hora,
              servicos:servico_id (
                id,
                nome,
                preco
              )
            `,
          )
          .eq("barbearia_id", barbeariaId)
          .eq("arquivado", false)
          .gte("data_hora", inicio.toISOString())
          .lte("data_hora", fim.toISOString()),

        supabase
          .from("agendamentos")
          .select(
            `
              id,
              data_hora,
              status,
              cliente_nome,
              cliente_telefone,
              servicos:servico_id (
                id,
                nome,
                preco,
                duracao
              ),
              profissionais:profissional_id (
                id,
                nome
              ),
              clientes:cliente_id (
                id,
                nome,
                telefone
              )
            `,
          )
          .eq("barbearia_id", barbeariaId)
          .eq("arquivado", false)
          .gte("data_hora", agora.toISOString())
          .in("status", ["pendente", "confirmado"])
          .order("data_hora", {
            ascending: true,
          })
          .limit(5),

        supabase
          .from("clientes_barbearias")
          .select("cliente_id", {
            count: "exact",
            head: true,
          })
          .eq("barbearia_id", barbeariaId),

        supabase
          .from("profissionais")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("barbearia_id", barbeariaId)
          .eq("ativo", true),

        supabase
          .from("produtos")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("barbearia_id", barbeariaId),

        supabase
          .from("produtos")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("barbearia_id", barbeariaId)
          .lte("estoque", 3),

        supabase
          .from("pedidos")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("barbearia_id", barbeariaId)
          .eq("status", "pendente")
          .eq("arquivado", false),

        supabase
          .from("pedidos")
          .select(
            `
              id,
              quantidade,
              preco_unitario,
              status,
              confirmado_at
            `,
          )
          .eq("barbearia_id", barbeariaId)
          .in("status", ["confirmado", "concluido"])
          .gte("confirmado_at", inicio.toISOString())
          .lte("confirmado_at", fim.toISOString()),

        supabase
          .from("avaliacoes")
          .select("nota")
          .eq("barbearia_id", barbeariaId),

        supabase
          .from("notificacoes")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("usuario_id", usuarioId)
          .eq("barbearia_id", barbeariaId)
          .eq("lida", false),

        supabase
          .from("notificacoes")
          .select(
            `
              id,
              tipo,
              titulo,
              mensagem,
              lida,
              created_at
            `,
          )
          .eq("usuario_id", usuarioId)
          .eq("barbearia_id", barbeariaId)
          .order("created_at", {
            ascending: false,
          })
          .limit(5),

        supabase
          .from("avaliacoes")
          .select(
            `
              id,
              nota,
              comentario,
              created_at,
              clientes:cliente_id (
                id,
                nome
              )
            `,
          )
          .eq("barbearia_id", barbeariaId)
          .not("comentario", "is", null)
          .order("created_at", {
            ascending: false,
          })
          .limit(5),
      ]);

      const results = [
        agendamentosHojeResult,
        proximosResult,
        clientesResult,
        profissionaisResult,
        produtosResult,
        estoqueBaixoResult,
        pedidosPendentesResult,
        pedidosHojeResult,
        avaliacoesResult,
        notificacoesCountResult,
        notificacoesRecentesResult,
        comentariosResult,
      ];

      const primeiroErro = results.find(
        (item) => item.error,
      )?.error;

      if (primeiroErro) {
        throw primeiroErro;
      }

      const agendamentosHoje =
        agendamentosHojeResult.data || [];

      const faturamentoServicos =
        agendamentosHoje
          .filter(
            (item) => item.status === "concluido",
          )
          .reduce(
            (total, item) =>
              total +
              (Number(item.servicos?.preco) || 0),
            0,
          );

      const faturamentoProdutos =
        (pedidosHojeResult.data || []).reduce(
          (total, pedido) =>
            total +
            (Number(pedido.quantidade) || 0) *
              (Number(pedido.preco_unitario) || 0),
          0,
        );

      const notas = (
        avaliacoesResult.data || []
      )
        .map((item) => Number(item.nota))
        .filter(Number.isFinite);

      const avaliacaoMedia = notas.length
        ? notas.reduce(
            (total, nota) => total + nota,
            0,
          ) / notas.length
        : 0;

      setData({
        totalAgendamentosHoje:
          agendamentosHoje.length,
        totalClientes:
          clientesResult.count || 0,
        totalProfissionais:
          profissionaisResult.count || 0,
        totalProdutos:
          produtosResult.count || 0,
        estoqueBaixo:
          estoqueBaixoResult.count || 0,
        pedidosPendentes:
          pedidosPendentesResult.count || 0,
        faturamentoHoje:
          faturamentoServicos +
          faturamentoProdutos,
        avaliacaoMedia,
        notificacoesNaoLidas:
          notificacoesCountResult.count || 0,
        proximosAgendamentos:
          proximosResult.data || [],
        notificacoesRecentes:
          notificacoesRecentesResult.data || [],
        comentariosRecentes:
          comentariosResult.data || [],
      });
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao carregar dashboard:",
        error,
      );

      setData(INITIAL_DATA);
      setErrorMessage(
        "Não foi possível carregar todos os dados do painel.",
      );
    } finally {
      setLoading(false);
    }
  }, [barbeariaId, usuarioId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return {
    data,
    loading,
    errorMessage,
    recarregar: carregar,
  };
}
