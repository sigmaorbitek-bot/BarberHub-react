import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "../../../services/supabase";
import { useProfissional } from "../useProfissional";
import "../Profissional.css";
import "./ProfissionalClientesPage.css";

export default function ProfissionalClientesPage() {
  const { contexto } = useProfissional();
  const [clientes, setClientes] = useState([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const carregar = useCallback(async () => {
    if (!contexto.ver_clientes) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc(
        "listar_clientes_profissional",
      );

      if (error) {
        throw error;
      }

      setClientes(data || []);
    } catch (error) {
      console.warn("[BarberHub] Clientes do profissional:", error);
      setMessage(
        error?.message ||
          "Este módulo será liberado quando a RPC de clientes do profissional for aplicada.",
      );
      setClientes([]);
    } finally {
      setLoading(false);
    }
  }, [contexto.ver_clientes]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return clientes;

    return clientes.filter((cliente) =>
      [cliente.nome, cliente.telefone, cliente.email]
        .filter(Boolean)
        .some((valor) => String(valor).toLowerCase().includes(termo)),
    );
  }, [clientes, busca]);

  if (!contexto.ver_clientes) {
    return (
      <section className="professional-page">
        <span className="professional-eyebrow">CLIENTES</span>
        <h1>Clientes</h1>
        <div className="professional-empty">A barbearia não liberou este módulo para sua conta.</div>
      </section>
    );
  }

  return (
    <section className="professional-page">
      <div className="professional-page-heading">
        <div>
          <span className="professional-eyebrow">RELACIONAMENTO</span>
          <h1>Clientes</h1>
          <p>Consulte clientes permitidos para sua conta profissional.</p>
        </div>
        <button type="button" className="professional-secondary-button" onClick={carregar} disabled={loading}>
          ↻ Atualizar
        </button>
      </div>

      <div className="professional-search-box">
        <input
          type="search"
          value={busca}
          placeholder="Buscar por nome, telefone ou e-mail..."
          onChange={(event) => setBusca(event.target.value)}
        />
      </div>

      {message ? <div className="professional-message">{message}</div> : null}

      {loading ? (
        <div className="professional-empty">Carregando...</div>
      ) : filtrados.length ? (
        <div className="professional-client-grid">
          {filtrados.map((cliente) => (
            <article key={cliente.cliente_id || cliente.id} className="professional-panel-card">
              <strong>{cliente.nome || "Cliente"}</strong>
              {contexto.ver_cliente_telefone && cliente.telefone ? <span>📱 {cliente.telefone}</span> : null}
              {cliente.email ? <span>✉️ {cliente.email}</span> : null}
              {cliente.total_agendamentos != null ? (
                <small>{cliente.total_agendamentos} agendamento(s)</small>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="professional-empty">Nenhum cliente encontrado.</div>
      )}
    </section>
  );
}
