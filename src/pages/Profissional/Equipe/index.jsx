import { useCallback, useEffect, useState } from "react";

import { supabase } from "../../../services/supabase";
import { useProfissional } from "../useProfissional";
import "../Profissional.css";
import "./ProfissionalEquipePage.css";

export default function ProfissionalEquipePage() {
  const { contexto } = useProfissional();
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const carregar = useCallback(async () => {
    if (!contexto.ver_agenda_equipe) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "listar_agenda_equipe_profissional",
      );

      if (error) {
        throw error;
      }

      setItens(data || []);
    } catch (error) {
      console.warn("[BarberHub] Agenda da equipe:", error);
      setMessage(
        error?.message ||
          "Este módulo será liberado quando a RPC de agenda da equipe for aplicada.",
      );
      setItens([]);
    } finally {
      setLoading(false);
    }
  }, [contexto.ver_agenda_equipe]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!contexto.ver_agenda_equipe) {
    return (
      <section className="professional-page">
        <span className="professional-eyebrow">EQUIPE</span>
        <h1>Agenda da equipe</h1>
        <div className="professional-empty">A barbearia não liberou este módulo para sua conta.</div>
      </section>
    );
  }

  return (
    <section className="professional-page">
      <div className="professional-page-heading">
        <div>
          <span className="professional-eyebrow">EQUIPE</span>
          <h1>Agenda da equipe</h1>
          <p>Consulte a agenda dos profissionais quando essa permissão estiver liberada.</p>
        </div>
        <button type="button" className="professional-secondary-button" onClick={carregar} disabled={loading}>
          ↻ Atualizar
        </button>
      </div>

      {message ? <div className="professional-message">{message}</div> : null}

      {loading ? (
        <div className="professional-empty">Carregando...</div>
      ) : itens.length ? (
        <div className="professional-team-list">
          {itens.map((item) => (
            <article key={item.agendamento_id || item.id} className="professional-panel-card">
              <div>
                <strong>{item.profissional_nome || "Profissional"}</strong>
                <span>{item.cliente_nome || "Cliente"}</span>
              </div>
              <div>
                <strong>{item.servico_nome || "Serviço"}</strong>
                <span>{item.data_hora ? new Date(item.data_hora).toLocaleString("pt-BR") : ""}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="professional-empty">Nenhum atendimento da equipe encontrado.</div>
      )}
    </section>
  );
}
