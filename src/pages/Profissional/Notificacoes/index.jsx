import { useCallback, useEffect, useState } from "react";

import { supabase } from "../../../services/supabase";
import "../Profissional.css";
import "./ProfissionalNotificacoesPage.css";

export default function ProfissionalNotificacoesPage() {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("notificacoes")
        .select("id, titulo, mensagem, lida, created_at, link")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      setItens(data || []);
    } catch (error) {
      console.error("[BarberHub] Notificações profissional:", error);
      setMessage(error?.message || "Não foi possível carregar as notificações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function marcarComoLida(item) {
    if (item.lida) return;

    const { error } = await supabase
      .from("notificacoes")
      .update({ lida: true })
      .eq("id", item.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setItens((atual) =>
      atual.map((notificacao) =>
        notificacao.id === item.id ? { ...notificacao, lida: true } : notificacao,
      ),
    );
  }

  return (
    <section className="professional-page">
      <div className="professional-page-heading">
        <div>
          <span className="professional-eyebrow">AVISOS</span>
          <h1>Notificações</h1>
          <p>Acompanhe atualizações relacionadas à sua conta e seus atendimentos.</p>
        </div>
        <button type="button" className="professional-secondary-button" onClick={carregar} disabled={loading}>
          ↻ Atualizar
        </button>
      </div>

      {message ? <div className="professional-message">{message}</div> : null}

      {loading ? (
        <div className="professional-empty">Carregando...</div>
      ) : itens.length ? (
        <div className="professional-notification-list">
          {itens.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.lida ? "professional-notification-item" : "professional-notification-item professional-notification-item--unread"}
              onClick={() => marcarComoLida(item)}
            >
              <div>
                <strong>{item.titulo}</strong>
                <span>{item.mensagem}</span>
              </div>
              <small>{new Date(item.created_at).toLocaleString("pt-BR")}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="professional-empty">Nenhuma notificação encontrada.</div>
      )}
    </section>
  );
}
