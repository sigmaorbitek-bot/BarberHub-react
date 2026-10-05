import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useNavigate,
} from "react-router-dom";

import { useBarbearia } from "../../../hooks/useBarbearia";
import { supabase } from "../../../services/supabase";
import {
  ativarPush,
  desativarPush,
  obterEstadoPush,
  syncAppBadgeFromDatabase,
} from "../../../services/pushNotifications";

import "./Notificacoes.css";

const ICONES = {
  novo_agendamento: "📅",
  agendamento_cancelado: "❌",
  agendamento_confirmado: "✅",
  novo_pedido: "🛍️",
  pedido_atualizado: "📦",
  estoque_baixo: "⚠️",
  nova_avaliacao: "⭐",
  conta_vencendo: "⏰",
  conta_vencida: "🚨",
  pagamento_recebido: "💰",
};

function dataHora(valor) {
  if (!valor) {
    return "";
  }

  const data =
    new Date(valor);

  if (
    Number.isNaN(
      data.getTime(),
    )
  ) {
    return "";
  }

  return data.toLocaleString(
    "pt-BR",
    {
      dateStyle: "short",
      timeStyle: "short",
    },
  );
}

export default function Notificacoes() {
  const {
    barbeariaId,
  } = useBarbearia();

  const navigate =
    useNavigate();

  const containerRef =
    useRef(null);

  const [
    aberto,
    setAberto,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    notificacoes,
    setNotificacoes,
  ] = useState([]);

  const [
    pushState,
    setPushState,
  ] = useState(null);

  const [
    pushLoading,
    setPushLoading,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const carregar =
    useCallback(
      async () => {
        if (!barbeariaId) {
          return;
        }

        setLoading(true);

        try {
          const {
            data,
            error,
          } =
            await supabase.rpc(
              "listar_notificacoes_painel",
              {
                p_barbearia_id:
                  barbeariaId,
                p_limite: 50,
              },
            );

          if (error) {
            throw error;
          }

          setNotificacoes(
            data || [],
          );

          syncAppBadgeFromDatabase();
        } catch (error) {
          console.error(
            "[BarberHub] Erro ao carregar notificações:",
            error,
          );
        } finally {
          setLoading(false);
        }
      },
      [barbeariaId],
    );

  const carregarPush =
    useCallback(
      async () => {
        try {
          const estado =
            await obterEstadoPush();

          setPushState(
            estado,
          );
        } catch (error) {
          console.warn(
            "[BarberHub] Estado push:",
            error,
          );
        }
      },
      [],
    );

  useEffect(() => {
    carregar();
    carregarPush();
  }, [
    carregar,
    carregarPush,
  ]);

  useEffect(() => {
    const channel =
      supabase
        .channel(
          `notificacoes:${barbeariaId}`,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table:
              "notificacoes",
          },
          () => {
            carregar();
          },
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        channel,
      );
    };
  }, [
    barbeariaId,
    carregar,
  ]);

  useEffect(() => {
    function fecharFora(
      event,
    ) {
      if (
        containerRef.current &&
        !containerRef.current.contains(
          event.target,
        )
      ) {
        setAberto(
          false,
        );
      }
    }

    document.addEventListener(
      "mousedown",
      fecharFora,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        fecharFora,
      );
    };
  }, []);

  const naoLidas =
    useMemo(
      () =>
        notificacoes.filter(
          (item) =>
            !item.lida,
        ).length,
      [notificacoes],
    );

  async function marcarLida(
    item,
  ) {
    if (!item.lida) {
      const { error } =
        await supabase.rpc(
          "marcar_notificacao_lida",
          {
            p_notificacao_id:
              item.notificacao_id,
          },
        );

      if (error) {
        console.error(
          error,
        );
      } else {
        setNotificacoes(
          (atuais) =>
            atuais.map(
              (notificacao) =>
                notificacao.notificacao_id ===
                item.notificacao_id
                  ? {
                      ...notificacao,
                      lida: true,
                    }
                  : notificacao,
            ),
        );

        await syncAppBadgeFromDatabase();
      }
    }

    setAberto(false);

    if (item.rota) {
      navigate(
        item.rota,
      );
    }
  }

  async function marcarTodas() {
    const { error } =
      await supabase.rpc(
        "marcar_todas_notificacoes_lidas",
        {
          p_barbearia_id:
            barbeariaId,
        },
      );

    if (error) {
      console.error(
        error,
      );
      return;
    }

    setNotificacoes(
      (atuais) =>
        atuais.map(
          (item) => ({
            ...item,
            lida: true,
          }),
        ),
    );

    await syncAppBadgeFromDatabase();
  }

  async function togglePush() {
    setMessage("");
    setPushLoading(true);

    try {
      if (
        pushState?.subscribed
      ) {
        await desativarPush();

        setMessage(
          "Notificações deste dispositivo desativadas.",
        );
      } else {
        await ativarPush();

        setMessage(
          "Notificações deste dispositivo ativadas.",
        );
      }

      await carregarPush();
      await syncAppBadgeFromDatabase();
    } catch (error) {
      setMessage(
        error?.message ||
          "Não foi possível alterar as notificações.",
      );
    } finally {
      setPushLoading(false);
    }
  }

  const precisaInstalarIOS =
    pushState?.ios &&
    !pushState?.standalone;

  return (
    <div
      className="notifications-root"
      ref={
        containerRef
      }
    >
      <button
        type="button"
        className="notifications-bell"
        aria-label={`Notificações${naoLidas ? `, ${naoLidas} não lidas` : ""}`}
        aria-expanded={
          aberto
        }
        onClick={() =>
          setAberto(
            (atual) =>
              !atual,
          )
        }
      >
        🔔

        {naoLidas > 0 ? (
          <span className="notifications-badge">
            {naoLidas >
            99
              ? "99+"
              : naoLidas}
          </span>
        ) : null}
      </button>

      {aberto ? (
        <aside className="notifications-panel">
          <div className="notifications-header">
            <div>
              <strong>
                Notificações
              </strong>
              <span>
                {naoLidas} não lida(s)
              </span>
            </div>

            {naoLidas ? (
              <button
                type="button"
                onClick={
                  marcarTodas
                }
              >
                Marcar todas
              </button>
            ) : null}
          </div>

          <div className="notifications-push">
            <div>
              <strong>
                📱 Notificações no dispositivo
              </strong>

              {precisaInstalarIOS ? (
                <p>
                  No iPhone/iPad: Compartilhar → Adicionar à Tela de Início. Depois abra o BarberHub pelo ícone e ative aqui.
                </p>
              ) : (
                <p>
                  Receba avisos mesmo quando o BarberHub não estiver aberto.
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={
                pushLoading ||
                !pushState?.supported ||
                precisaInstalarIOS
              }
              onClick={
                togglePush
              }
            >
              {pushLoading
                ? "Aguarde..."
                : pushState?.subscribed
                  ? "Desativar"
                  : "Ativar"}
            </button>
          </div>

          {message ? (
            <p className="notifications-message">
              {message}
            </p>
          ) : null}

          <div className="notifications-list">
            {loading ? (
              <div className="notifications-empty">
                Carregando...
              </div>
            ) : notificacoes.length ? (
              notificacoes.map(
                (item) => (
                  <button
                    key={
                      item.notificacao_id
                    }
                    type="button"
                    className={`notification-item${item.lida ? "" : " notification-item--unread"}`}
                    onClick={() =>
                      marcarLida(
                        item,
                      )
                    }
                  >
                    <span className="notification-icon">
                      {ICONES[
                        item.tipo
                      ] ||
                        "🔔"}
                    </span>

                    <span className="notification-content">
                      <strong>
                        {
                          item.titulo
                        }
                      </strong>

                      <span>
                        {
                          item.mensagem
                        }
                      </span>

                      <small>
                        {dataHora(
                          item.created_at,
                        )}
                      </small>
                    </span>

                    {!item.lida ? (
                      <i />
                    ) : null}
                  </button>
                ),
              )
            ) : (
              <div className="notifications-empty">
                🔔 Nenhuma notificação por enquanto.
              </div>
            )}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
