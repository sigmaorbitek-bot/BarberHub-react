import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  disableWebPush,
  enableWebPush,
  getWebPushStatus,
  syncAppBadgeFromDatabase,
} from "../../../services/pushNotifications";
import { supabase } from "../../../services/supabase";
import { useProfissional } from "../useProfissional";

import "../Profissional.css";
import "./ProfissionalNotificacoesPage.css";

const ICONES = {
  novo_agendamento: "📅",
  agendamento_confirmado: "✅",
  agendamento_cancelado: "❌",
  agendamento_alterado: "📅",
  agendamento_concluido: "✂️",
  lembrete_agendamento: "⏰",
  novo_pedido: "📦",
  pedido_atualizado: "📦",
  estoque_baixo: "⚠️",
  nova_avaliacao: "⭐",
  pagamento_recebido: "💰",
};

function formatarDataHora(valor) {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function rotaProfissionalSegura(rota) {
  if (typeof rota !== "string") return null;
  if (rota === "/profissional" || rota.startsWith("/profissional/")) {
    if (!rota.includes("\\") && !rota.includes("//")) return rota;
  }
  return null;
}

export default function ProfissionalNotificacoesPage() {
  const navigate = useNavigate();
  const { contexto } = useProfissional();

  const [notificacoes, setNotificacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filtro, setFiltro] = useState("todas");
  const [erro, setErro] = useState("");

  const [pushLoading, setPushLoading] = useState(true);
  const [pushActive, setPushActive] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);
  const [pushPermission, setPushPermission] = useState("default");
  const [pushMessage, setPushMessage] = useState("");
  const [pushError, setPushError] = useState(false);
  const [pushIOS, setPushIOS] = useState(false);
  const [pushStandalone, setPushStandalone] = useState(false);

  const carregarStatusPush = useCallback(async () => {
    setPushLoading(true);
    try {
      const status = await getWebPushStatus();
      setPushSupported(Boolean(status.supported));
      setPushPermission(status.permission ?? "default");
      setPushActive(Boolean(status.active));
      setPushIOS(Boolean(status.ios));
      setPushStandalone(Boolean(status.standalone));
    } catch (error) {
      console.warn("[BarberHub] Estado do Push profissional:", error);
      setPushActive(false);
      setPushMessage("Não foi possível verificar o Push neste dispositivo.");
      setPushError(true);
    } finally {
      setPushLoading(false);
    }
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user?.id) {
        throw authError || new Error("Sessão expirada. Entre novamente.");
      }

      const { data, error } = await supabase
        .from("notificacoes")
        .select("id, usuario_id, barbearia_id, tipo, titulo, mensagem, lida, created_at, rota")
        .eq("usuario_id", authData.user.id)
        .order("created_at", { ascending: false })
        .limit(150);

      if (error) throw error;
      setNotificacoes(data || []);
      await syncAppBadgeFromDatabase();
    } catch (error) {
      console.error("[BarberHub] Notificações do profissional:", error);
      setNotificacoes([]);
      setErro(error?.message || "Não foi possível carregar suas notificações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    void carregarStatusPush();
  }, [carregar, carregarStatusPush]);

  const naoLidas = useMemo(
    () => notificacoes.filter((item) => !item.lida).length,
    [notificacoes],
  );

  const exibidas = useMemo(
    () => filtro === "nao-lidas"
      ? notificacoes.filter((item) => !item.lida)
      : notificacoes,
    [notificacoes, filtro],
  );

  async function alternarPush() {
    if (pushLoading) return;

    setPushLoading(true);
    setPushMessage("");
    setPushError(false);
    try {
      if (pushActive) {
        await disableWebPush();
        setPushActive(false);
        setPushMessage("Notificações deste dispositivo desativadas.");
      } else {
        // A permissão é solicitada como consequência direta do clique.
        await enableWebPush();
        setPushActive(true);
        setPushPermission("granted");
        setPushMessage("Notificações deste dispositivo ativadas.");
        await syncAppBadgeFromDatabase();
      }
    } catch (error) {
      console.error("[BarberHub] Push do profissional:", error);
      setPushMessage(
        error?.message || "Não foi possível alterar o Push neste dispositivo.",
      );
      setPushError(true);
      await carregarStatusPush();
    } finally {
      setPushLoading(false);
    }
  }

  async function marcarComoLida(item) {
    const rota = rotaProfissionalSegura(item.rota);
    if (item.lida) {
      if (rota) navigate(rota);
      return;
    }

    if (saving) return;
    setSaving(true);
    setErro("");
    try {
      const { error } = await supabase.rpc("marcar_notificacao_lida", {
        p_notificacao_id: item.id,
      });
      if (error) throw error;

      setNotificacoes((atuais) =>
        atuais.map((registro) =>
          registro.id === item.id ? { ...registro, lida: true } : registro,
        ),
      );
      window.dispatchEvent(new Event("barberhub:notificacoes-atualizadas"));
      await syncAppBadgeFromDatabase();
      if (rota) navigate(rota);
    } catch (error) {
      console.error("[BarberHub] Marcar notificação profissional:", error);
      setErro("Não foi possível marcar a notificação como lida.");
    } finally {
      setSaving(false);
    }
  }

  async function marcarTodas() {
    if (!naoLidas || saving) return;
    setSaving(true);
    setErro("");
    try {
      const { error } = await supabase.rpc(
        "marcar_todas_notificacoes_profissional_lidas",
      );
      if (error) throw error;

      setNotificacoes((atuais) =>
        atuais.map((item) => ({ ...item, lida: true })),
      );
      window.dispatchEvent(new Event("barberhub:notificacoes-atualizadas"));
      await syncAppBadgeFromDatabase();
    } catch (error) {
      console.error("[BarberHub] Marcar todas do profissional:", error);
      setErro("Não foi possível marcar todas como lidas. Verifique se a Migration 047 foi aplicada.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="professional-page professional-notifications-page">
      <div className="professional-page-heading professional-notifications-heading">
        <div>
          <span className="professional-eyebrow">AVISOS</span>
          <h1>Notificações</h1>
          <p>Agendamentos, confirmações, cancelamentos e outros avisos importantes.</p>
        </div>
        <button
          type="button"
          className="professional-notifications-read-all"
          onClick={marcarTodas}
          disabled={!naoLidas || saving || loading}
        >
          {saving ? "Atualizando..." : "✓ Marcar todas como lidas"}
        </button>
      </div>

      <section className="professional-push-card" aria-label="Notificações neste dispositivo">
        <div className="professional-push-icon" aria-hidden="true">🔔</div>
        <div className="professional-push-content">
          <strong>Notificações neste dispositivo</strong>
          {pushIOS && !pushStandalone ? (
            <p>
              No iPhone/iPad, toque em Compartilhar → Adicionar à Tela de Início.
              Depois abra o BarberHub pelo ícone e ative as notificações.
            </p>
          ) : (
            <p>
              Receba novos atendimentos, confirmações e cancelamentos mesmo
              quando o BarberHub não estiver aberto.
            </p>
          )}
          {pushMessage ? (
            <span className={pushError ? "professional-push-warning" : "professional-push-message"} role="status">
              {pushMessage}
            </span>
          ) : null}
          {!pushSupported ? (
            <span className="professional-push-warning">Este navegador não suporta Web Push.</span>
          ) : null}
          {pushPermission === "denied" ? (
            <span className="professional-push-warning">
              As notificações estão bloqueadas nas configurações do navegador.
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className={`professional-push-button${pushActive ? " professional-push-button--active" : ""}`}
          onClick={alternarPush}
          disabled={pushLoading || !pushSupported || (pushIOS && !pushStandalone)}
        >
          {pushLoading ? "Verificando..." : pushActive ? "Desativar" : "Ativar notificações"}
        </button>
      </section>

      {erro ? <div className="professional-notifications-error" role="alert">{erro}</div> : null}

      <div className="professional-notifications-summary">
        <article><small>NÃO LIDAS</small><strong>{naoLidas}</strong></article>
        <article><small>TOTAL</small><strong>{notificacoes.length}</strong></article>
      </div>

      <div className="professional-notifications-toolbar">
        <div className="professional-notifications-tabs" role="group" aria-label="Filtrar notificações">
          <button
            type="button"
            className={`professional-notifications-tab${filtro === "todas" ? " professional-notifications-tab--active" : ""}`}
            onClick={() => setFiltro("todas")}
            aria-pressed={filtro === "todas"}
          >
            Todas
          </button>
          <button
            type="button"
            className={`professional-notifications-tab${filtro === "nao-lidas" ? " professional-notifications-tab--active" : ""}`}
            onClick={() => setFiltro("nao-lidas")}
            aria-pressed={filtro === "nao-lidas"}
          >
            Não lidas{naoLidas ? ` (${naoLidas})` : ""}
          </button>
        </div>
        <button
          type="button"
          className="professional-notifications-refresh"
          onClick={carregar}
          disabled={loading || saving}
        >
          {loading ? "Carregando..." : "↻ Atualizar"}
        </button>
      </div>

      {loading ? (
        <div className="professional-notifications-empty">Carregando notificações...</div>
      ) : exibidas.length === 0 ? (
        <div className="professional-notifications-empty">
          <span aria-hidden="true">🔔</span>
          <strong>{filtro === "nao-lidas" ? "Nenhuma notificação não lida" : "Nenhuma notificação ainda"}</strong>
          <p>Os avisos dos seus atendimentos aparecerão aqui.</p>
        </div>
      ) : (
        <div className="professional-notifications-list">
          {exibidas.map((item) => {
            const rota = rotaProfissionalSegura(item.rota);
            return (
              <button
                type="button"
                key={item.id}
                className={`professional-notification-card${!item.lida ? " professional-notification-card--unread" : ""}`}
                onClick={() => marcarComoLida(item)}
                disabled={saving}
              >
                <span className="professional-notification-icon" aria-hidden="true">
                  {ICONES[item.tipo] || "🔔"}
                </span>
                <span className="professional-notification-body">
                  <span className="professional-notification-title-row">
                    <strong>{item.titulo}</strong>
                    {!item.lida ? <span className="professional-notification-dot" title="Não lida" /> : null}
                  </span>
                  <span className="professional-notification-description">{item.mensagem}</span>
                  <span className="professional-notification-meta">
                    {contexto?.barbearia_logo_url ? (
                      <img src={contexto.barbearia_logo_url} alt="" />
                    ) : null}
                    <span>{contexto?.barbearia_nome || "Barbearia"}</span>
                    <time dateTime={item.created_at}>{formatarDataHora(item.created_at)}</time>
                  </span>
                </span>
                {rota ? <span className="professional-notification-arrow" aria-hidden="true">›</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
