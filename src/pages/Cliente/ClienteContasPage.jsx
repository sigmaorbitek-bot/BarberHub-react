import { useEffect, useMemo, useState } from "react";

import { supabase } from "../../services/supabase";
import "./ClienteContasPage.css";

const STATUS = {
  pendente: "Pendente",
  parcial: "Parcial",
  pago: "Pago",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataBR(valor) {
  if (!valor) return "—";

  const [year, month, day] = String(valor)
    .slice(0, 10)
    .split("-");

  return `${day}/${month}/${year}`;
}

export default function ClienteContasPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadAccounts() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase.rpc(
      "listar_contas_cliente",
    );

    if (error) {
      console.error(
        "[BarberHub] Minhas contas:",
        error,
      );

      setAccounts([]);
      setErrorMessage(
        "Não foi possível carregar suas contas.",
      );
      setLoading(false);
      return;
    }

    setAccounts(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  const summary = useMemo(() => {
    return accounts.reduce(
      (result, account) => {
        if (
          account.status === "cancelado" ||
          account.status === "pago"
        ) {
          return result;
        }

        result.open += Number(account.saldo || 0);

        if (account.status === "vencido") {
          result.overdue += Number(account.saldo || 0);
        }

        return result;
      },
      {
        open: 0,
        overdue: 0,
      },
    );
  }, [accounts]);

  return (
    <section className="client-accounts">
      <div className="client-page-heading">
        <div>
          <span>FINANCEIRO</span>
          <h1>Minhas contas</h1>
          <p>
            Veja valores em aberto, vencimentos e pagamentos
            registrados pelas barbearias.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAccounts}
          disabled={loading}
        >
          ↻ Atualizar
        </button>
      </div>

      <div className="client-account-stats">
        <article>
          <small>SALDO EM ABERTO</small>
          <strong>{moeda(summary.open)}</strong>
        </article>

        <article className="client-account-stat--danger">
          <small>VENCIDO</small>
          <strong>{moeda(summary.overdue)}</strong>
        </article>

        <article>
          <small>REGISTROS</small>
          <strong>{accounts.length}</strong>
        </article>
      </div>

      {errorMessage ? (
        <div className="client-account-error">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="client-account-empty">
          Carregando suas contas...
        </div>
      ) : accounts.length === 0 ? (
        <div className="client-account-empty">
          <span>✓</span>
          <strong>Nenhuma conta encontrada</strong>
          <p>
            Quando houver um valor registrado para você,
            ele aparecerá aqui.
          </p>
        </div>
      ) : (
        <div className="client-account-list">
          {accounts.map((account) => (
            <article
              className={`client-account-card client-account-card--${account.status}`}
              key={account.conta_id}
            >
              <div className="client-account-card-top">
                <div className="client-account-business">
                  {account.barbearia_logo_url ? (
                    <img
                      src={account.barbearia_logo_url}
                      alt=""
                    />
                  ) : (
                    <span aria-hidden="true">💈</span>
                  )}

                  <div>
                    <small>BARBEARIA</small>
                    <strong>
                      {account.barbearia_nome}
                    </strong>
                  </div>
                </div>

                <span
                  className={`client-account-status client-account-status--${account.status}`}
                >
                  {STATUS[account.status] ||
                    account.status}
                </span>
              </div>

              <h2>{account.descricao}</h2>

              <div className="client-account-values">
                <div>
                  <small>Valor original</small>
                  <strong>
                    {moeda(account.valor_original)}
                  </strong>
                </div>

                <div>
                  <small>Já pago</small>
                  <strong>
                    {moeda(account.valor_pago)}
                  </strong>
                </div>

                <div>
                  <small>Saldo</small>
                  <strong className="client-account-balance">
                    {moeda(account.saldo)}
                  </strong>
                </div>

                <div>
                  <small>Vencimento</small>
                  <strong>
                    {dataBR(account.vencimento)}
                  </strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
