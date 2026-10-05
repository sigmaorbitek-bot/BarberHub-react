import { useCallback, useEffect, useMemo, useState } from "react";

import { useNavigate } from "react-router-dom";

import {
  disableWebPush,
  enableWebPush,
  getWebPushStatus,
  syncAppBadgeFromDatabase,
} from "../../../services/pushNotifications";
import { supabase } from "../../../services/supabase";

import "./ClienteNotificacoesPage.css";

const ICONS = {
  agendamento_confirmado: "✅",
  agendamento_cancelado: "❌",
  agendamento_concluido: "✂️",
  agendamento_alterado: "📅",
  pedido_atualizado: "📦",
  pagamento_recebido: "💰",
  conta_vencendo: "⏳",
  conta_vencida: "⚠️",
  resposta_avaliacao: "⭐",
};

function dataHora(valor) {
  if (!valor) {
    return "—";
  }

  return new Date(valor).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function ClienteNotificacoesPage() {
  const navigate = useNavigate();

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

  const [pushIOS, setPushIOS] = useState(false);
  const [pushStandalone, setPushStandalone] = useState(false);

  const carregarStatusPush = useCallback(async () => {
    setPushLoading(true);

    try {
      const status = await getWebPushStatus();

      setPushSupported(status.supported);

      setPushPermission(status.permission);

      setPushActive(status.active);
      setPushIOS(Boolean(status.ios));
      setPushStandalone(Boolean(status.standalone));
    } catch (error) {
      console.warn("[BarberHub] Status Web Push:", error);
    } finally {
      setPushLoading(false);
    }
  }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");

    try {
      const { data, error } = await supabase.rpc(
        "listar_notificacoes_cliente",
        {
          p_limite: 150,
        },
      );

      if (error) {
        throw error;
      }

      setNotificacoes(data || []);
      await syncAppBadgeFromDatabase();
    } catch (error) {
      console.error("[BarberHub] Notificações do cliente:", error);

      setNotificacoes([]);

      setErro("Não foi possível carregar suas notificações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    carregarStatusPush();
  }, [carregar, carregarStatusPush]);

  const naoLidas = useMemo(
    () => notificacoes.filter((item) => !item.lida).length,
    [notificacoes],
  );

  const exibidas = useMemo(() => {
    if (filtro === "nao-lidas") {
      return notificacoes.filter((item) => !item.lida);
    }

    return notificacoes;
  }, [notificacoes, filtro]);

  async function togglePush() {
    if (pushLoading) {
      return;
    }

    setPushLoading(true);
    setPushMessage("");

    try {
      if (pushActive) {
        await disableWebPush();

        setPushActive(false);

        setPushMessage("Notificações deste dispositivo desativadas.");
      } else {
        await enableWebPush();

        setPushActive(true);
        setPushPermission("granted");

        setPushMessage("Notificações deste dispositivo ativadas.");
        await syncAppBadgeFromDatabase();
      }
    } catch (error) {
      console.error("[BarberHub] Web Push do cliente:", error);

      setPushMessage(
        error?.message ||
          "Não foi possível alterar as notificações deste dispositivo.",
      );

      await carregarStatusPush();
    } finally {
      setPushLoading(false);
    }
  }

  async function marcarComoLida(item) {
    if (item.lida) {
      if (item.rota) {
        navigate(item.rota);
      }

      return;
    }

    setErro("");

    try {
      const { error } = await supabase.rpc("marcar_notificacao_lida", {
        p_notificacao_id: item.notificacao_id,
      });

      if (error) {
        throw error;
      }

      setNotificacoes((atuais) =>
        atuais.map((registro) =>
          registro.notificacao_id === item.notificacao_id
            ? {
                ...registro,
                lida: true,
              }
            : registro,
        ),
      );

      window.dispatchEvent(new Event("barberhub:notificacoes-atualizadas"));
      await syncAppBadgeFromDatabase();

      if (item.rota) {
        navigate(item.rota);
      }
    } catch (error) {
      console.error("[BarberHub] Marcar notificação:", error);

      setErro("Não foi possível atualizar a notificação.");
    }
  }

  async function marcarTodas() {
    if (!naoLidas || saving) {
      return;
    }

    setSaving(true);
    setErro("");

    try {
      const { error } = await supabase.rpc(
        "marcar_todas_notificacoes_cliente_lidas",
      );

      if (error) {
        throw error;
      }

      setNotificacoes((atuais) =>
        atuais.map((item) => ({
          ...item,
          lida: true,
        })),
      );

      window.dispatchEvent(new Event("barberhub:notificacoes-atualizadas"));
      await syncAppBadgeFromDatabase();
    } catch (error) {
      console.error("[BarberHub] Marcar todas notificações:", error);

      setErro("Não foi possível marcar todas como lidas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="client-notifications-page">
      <div className="client-page-heading">
        <div>
          <span>AVISOS</span>

          <h1>Notificações</h1>

          <p>
            Confirmações, cancelamentos, pedidos, pagamentos e outros avisos
            importantes.
          </p>
        </div>

        <button
          type="button"
          className="client-notifications-read-all"
          onClick={marcarTodas}
          disabled={!naoLidas || saving}
        >
          {saving ? "Atualizando..." : "✓ Marcar todas como lidas"}
        </button>
      </div>

      <section className="client-push-card">
        <div className="client-push-icon">🔔</div>

        <div className="client-push-content">
          <strong>Notificações neste dispositivo</strong>

          {pushIOS && !pushStandalone ? (
            <p>
              No iPhone/iPad: toque em Compartilhar → Adicionar à Tela de
              Início. Depois abra o BarberHub pelo ícone e ative as notificações
              aqui.
            </p>
          ) : (
            <p>
              Receba confirmações, cancelamentos, pagamentos e outros avisos
              mesmo quando o BarberHub não estiver aberto.
            </p>
          )}

          {pushMessage ? (
            <span className="client-push-message">{pushMessage}</span>
          ) : null}

          {!pushSupported ? (
            <span className="client-push-warning">
              Este navegador não suporta Web Push.
            </span>
          ) : null}

          {pushPermission === "denied" ? (
            <span className="client-push-warning">
              As notificações estão bloqueadas nas configurações do navegador.
            </span>
          ) : null}
        </div>

        <button
          type="button"
          className={`client-push-button${
            pushActive ? " client-push-button--active" : ""
          }`}
          disabled={
            pushLoading || !pushSupported || (pushIOS && !pushStandalone)
          }
          onClick={togglePush}
        >
          {pushLoading
            ? "Verificando..."
            : pushActive
              ? "Desativar"
              : "Ativar notificações"}
        </button>
      </section>

      {erro ? <div className="client-notifications-error">{erro}</div> : null}

      <div className="client-notifications-summary">
        <article>
          <small>NÃO LIDAS</small>

          <strong>{naoLidas}</strong>
        </article>

        <article>
          <small>TOTAL</small>

          <strong>{notificacoes.length}</strong>
        </article>
      </div>

      <div className="client-notifications-toolbar">
        <div className="client-notifications-tabs">
          <button
            type="button"
            className={
              filtro === "todas"
                ? "client-notifications-tab client-notifications-tab--active"
                : "client-notifications-tab"
            }
            onClick={() => setFiltro("todas")}
          >
            Todas
          </button>

          <button
            type="button"
            className={
              filtro === "nao-lidas"
                ? "client-notifications-tab client-notifications-tab--active"
                : "client-notifications-tab"
            }
            onClick={() => setFiltro("nao-lidas")}
          >
            Não lidas
            {naoLidas > 0 ? ` (${naoLidas})` : ""}
          </button>
        </div>

        <button
          type="button"
          className="client-notifications-refresh"
          onClick={carregar}
          disabled={loading}
        >
          ↻ Atualizar
        </button>
      </div>

      {loading ? (
        <div className="client-notifications-empty">
          Carregando notificações...
        </div>
      ) : exibidas.length === 0 ? (
        <div className="client-notifications-empty">
          <span aria-hidden="true">🔔</span>

          <strong>
            {filtro === "nao-lidas"
              ? "Nenhuma notificação não lida"
              : "Nenhuma notificação ainda"}
          </strong>

          <p>Os avisos importantes aparecerão aqui.</p>
        </div>
      ) : (
        <div className="client-notifications-list">
          {exibidas.map((item) => (
            <button
              type="button"
              key={item.notificacao_id}
              className={`client-notification-card${
                !item.lida ? " client-notification-card--unread" : ""
              }`}
              onClick={() => marcarComoLida(item)}
            >
              <div className="client-notification-icon">
                {ICONS[item.tipo] || "🔔"}
              </div>

              <div className="client-notification-body">
                <div className="client-notification-title-row">
                  <strong>{item.titulo}</strong>

                  {!item.lida ? (
                    <span
                      className="client-notification-dot"
                      aria-label="Não lida"
                    />
                  ) : null}
                </div>

                <p>{item.mensagem}</p>

                <div className="client-notification-meta">
                  {item.barbearia_logo_url ? (
                    <img src={item.barbearia_logo_url} alt="" />
                  ) : null}

                  {item.barbearia_nome ? (
                    <span>{item.barbearia_nome}</span>
                  ) : null}

                  <time dateTime={item.created_at}>
                    {dataHora(item.created_at)}
                  </time>
                </div>
              </div>

              <span className="client-notification-arrow" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
