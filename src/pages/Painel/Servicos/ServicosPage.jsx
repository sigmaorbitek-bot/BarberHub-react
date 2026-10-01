import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import EmptyState from "../../../components/Painel/EmptyState/EmptyState";
import { useBarbearia } from "../../../hooks/useBarbearia";
import { supabase } from "../../../services/supabase";
import { formatarMoeda } from "../../../utils/formatters";
import "./ServicosPage.css";

const FORM_INICIAL = {
  id: null,
  nome: "",
  preco: "",
  duracao: "30",
};

function normalizarPreco(valor) {
  const texto = String(valor || "")
    .trim()
    .replace(",", ".");

  const numero = Number(texto);

  return Number.isFinite(numero)
    ? numero
    : NaN;
}

function traduzirErro(error) {
  return (
    error?.message ||
    "Não foi possível concluir a operação."
  );
}

export default function ServicosPage() {
  const {
    barbeariaId,
    barbearia,
  } = useBarbearia();

  const [servicos, setServicos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("ativos");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const carregarServicos = useCallback(async () => {
    if (!barbeariaId) {
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase
        .from("servicos")
        .select(
          `
            id,
            nome,
            preco,
            duracao,
            ativo,
            created_at
          `,
        )
        .eq("barbearia_id", barbeariaId)
        .order("ativo", {
          ascending: false,
        })
        .order("nome", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      setServicos(data || []);
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao carregar serviços:",
        error,
      );

      setErrorMessage(
        "Não foi possível carregar os serviços.",
      );
    } finally {
      setLoading(false);
    }
  }, [barbeariaId]);

  useEffect(() => {
    carregarServicos();
  }, [carregarServicos]);

  const servicosFiltrados = useMemo(() => {
    const termo = busca
      .trim()
      .toLowerCase();

    return servicos.filter((servico) => {
      if (
        filtro === "ativos" &&
        !servico.ativo
      ) {
        return false;
      }

      if (
        filtro === "inativos" &&
        servico.ativo
      ) {
        return false;
      }

      if (!termo) {
        return true;
      }

      return String(
        servico.nome || "",
      )
        .toLowerCase()
        .includes(termo);
    });
  }, [servicos, busca, filtro]);

  const totais = useMemo(() => {
    const ativos = servicos.filter(
      (item) => item.ativo,
    );

    const precoMedio = ativos.length
      ? ativos.reduce(
          (total, item) =>
            total +
            (Number(item.preco) || 0),
          0,
        ) / ativos.length
      : 0;

    const duracaoMedia = ativos.length
      ? Math.round(
          ativos.reduce(
            (total, item) =>
              total +
              (Number(item.duracao) || 0),
            0,
          ) / ativos.length,
        )
      : 0;

    return {
      ativos: ativos.length,
      inativos:
        servicos.length - ativos.length,
      precoMedio,
      duracaoMedia,
    };
  }, [servicos]);

  function abrirNovoServico() {
    setForm(FORM_INICIAL);
    setErrorMessage("");
    setSuccessMessage("");
    setModalOpen(true);
  }

  function abrirEdicao(servico) {
    setForm({
      id: servico.id,
      nome: servico.nome || "",
      preco: String(
        Number(servico.preco || 0)
          .toFixed(2)
          .replace(".", ","),
      ),
      duracao: String(
        servico.duracao || 30,
      ),
    });

    setErrorMessage("");
    setSuccessMessage("");
    setModalOpen(true);
  }

  function fecharModal() {
    if (saving) {
      return;
    }

    setModalOpen(false);
    setForm(FORM_INICIAL);
  }

  function alterarForm(event) {
    const {
      name,
      value,
    } = event.target;

    setForm((atual) => ({
      ...atual,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    const nome = form.nome.trim();
    const preco = normalizarPreco(
      form.preco,
    );
    const duracao = Number(
      form.duracao,
    );

    if (!nome) {
      setErrorMessage(
        "Digite o nome do serviço.",
      );
      return;
    }

    if (
      !Number.isFinite(preco) ||
      preco < 0
    ) {
      setErrorMessage(
        "Digite um preço válido.",
      );
      return;
    }

    if (
      !Number.isInteger(duracao) ||
      duracao <= 0
    ) {
      setErrorMessage(
        "Digite uma duração válida.",
      );
      return;
    }

    setSaving(true);

    try {
      if (form.id) {
        const { error } = await supabase
          .from("servicos")
          .update({
            nome,
            preco,
            duracao,
          })
          .eq("id", form.id)
          .eq(
            "barbearia_id",
            barbeariaId,
          );

        if (error) {
          throw error;
        }

        setSuccessMessage(
          "Serviço atualizado com sucesso.",
        );
      } else {
        const { error } = await supabase
          .from("servicos")
          .insert({
            barbearia_id:
              barbeariaId,
            nome,
            preco,
            duracao,
            ativo: true,
          });

        if (error) {
          throw error;
        }

        setSuccessMessage(
          "Serviço cadastrado com sucesso.",
        );
      }

      setModalOpen(false);
      setForm(FORM_INICIAL);

      await carregarServicos();
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao salvar serviço:",
        error,
      );

      setErrorMessage(
        traduzirErro(error),
      );
    } finally {
      setSaving(false);
    }
  }

  async function alterarStatus(
    servico,
  ) {
    const novoStatus =
      !servico.ativo;

    const texto = novoStatus
      ? `Reativar o serviço "${servico.nome}"?`
      : `Desativar o serviço "${servico.nome}"?`;

    if (!window.confirm(texto)) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    try {
      const { error } = await supabase
        .from("servicos")
        .update({
          ativo: novoStatus,
        })
        .eq("id", servico.id)
        .eq(
          "barbearia_id",
          barbeariaId,
        );

      if (error) {
        throw error;
      }

      setSuccessMessage(
        novoStatus
          ? "Serviço reativado com sucesso."
          : "Serviço desativado com sucesso.",
      );

      await carregarServicos();
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao alterar serviço:",
        error,
      );

      setErrorMessage(
        traduzirErro(error),
      );
    }
  }

  return (
    <section className="services-page">
      <div className="services-heading">
        <div>
          <span className="services-eyebrow">
            CATÁLOGO
          </span>

          <h1>Serviços</h1>

          <p>
            Cadastre os serviços oferecidos por{" "}
            <strong>
              {barbearia?.nome ||
                "sua barbearia"}
            </strong>
            .
          </p>
        </div>

        <button
          type="button"
          className="services-primary-button"
          onClick={abrirNovoServico}
        >
          ＋ Novo serviço
        </button>
      </div>

      {errorMessage ? (
        <div className="services-message services-message--error">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="services-message services-message--success">
          {successMessage}
        </div>
      ) : null}

      <div className="services-stats">
        <article>
          <span>✂️</span>
          <div>
            <small>ATIVOS</small>
            <strong>
              {loading
                ? "..."
                : totais.ativos}
            </strong>
          </div>
        </article>

        <article>
          <span>💰</span>
          <div>
            <small>PREÇO MÉDIO</small>
            <strong>
              {loading
                ? "..."
                : formatarMoeda(
                    totais.precoMedio,
                  )}
            </strong>
          </div>
        </article>

        <article>
          <span>⏱</span>
          <div>
            <small>DURAÇÃO MÉDIA</small>
            <strong>
              {loading
                ? "..."
                : `${totais.duracaoMedia} min`}
            </strong>
          </div>
        </article>

        <article>
          <span>◌</span>
          <div>
            <small>INATIVOS</small>
            <strong>
              {loading
                ? "..."
                : totais.inativos}
            </strong>
          </div>
        </article>
      </div>

      <div className="services-toolbar">
        <div className="services-search">
          <span aria-hidden="true">
            ⌕
          </span>

          <input
            type="search"
            value={busca}
            placeholder="Buscar serviço..."
            onChange={(event) =>
              setBusca(
                event.target.value,
              )
            }
          />
        </div>

        <div className="services-filter-group">
          {[
            ["ativos", "Ativos"],
            ["todos", "Todos"],
            ["inativos", "Inativos"],
          ].map(
            ([value, label]) => (
              <button
                key={value}
                type="button"
                className={
                  filtro === value
                    ? "services-filter services-filter--active"
                    : "services-filter"
                }
                onClick={() =>
                  setFiltro(value)
                }
              >
                {label}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          className="services-refresh"
          onClick={carregarServicos}
          disabled={loading}
        >
          ↻ Atualizar
        </button>
      </div>

      {loading ? (
        <div className="services-loading">
          Carregando serviços...
        </div>
      ) : servicosFiltrados.length ? (
        <div className="services-grid">
          {servicosFiltrados.map(
            (servico) => (
              <article
                className={[
                  "service-card",
                  !servico.ativo
                    ? "service-card--inactive"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={servico.id}
              >
                <div className="service-card-top">
                  <div className="service-card-icon">
                    ✂️
                  </div>

                  <span
                    className={
                      servico.ativo
                        ? "service-status service-status--active"
                        : "service-status service-status--inactive"
                    }
                  >
                    {servico.ativo
                      ? "Ativo"
                      : "Inativo"}
                  </span>
                </div>

                <div className="service-card-content">
                  <span className="services-eyebrow">
                    SERVIÇO
                  </span>

                  <h2>
                    {servico.nome}
                  </h2>

                  <div className="service-card-info">
                    <div>
                      <span>Preço</span>
                      <strong>
                        {formatarMoeda(
                          servico.preco,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>Duração</span>
                      <strong>
                        {servico.duracao} min
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="service-card-actions">
                  <button
                    type="button"
                    className="service-action-button"
                    onClick={() =>
                      abrirEdicao(servico)
                    }
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    className={
                      servico.ativo
                        ? "service-action-button service-action-button--danger"
                        : "service-action-button service-action-button--success"
                    }
                    onClick={() =>
                      alterarStatus(
                        servico,
                      )
                    }
                  >
                    {servico.ativo
                      ? "Desativar"
                      : "Reativar"}
                  </button>
                </div>
              </article>
            ),
          )}
        </div>
      ) : (
        <EmptyState
          icon="✂️"
          title="Nenhum serviço encontrado"
          description={
            filtro === "ativos"
              ? "Cadastre o primeiro serviço para começar a criar agendamentos."
              : "Nenhum serviço corresponde aos filtros atuais."
          }
        />
      )}

      {modalOpen ? (
        <div
          className="services-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              fecharModal();
            }
          }}
        >
          <div
            className="services-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="service-modal-title"
          >
            <div className="services-modal-header">
              <div>
                <span className="services-eyebrow">
                  {form.id
                    ? "EDITAR"
                    : "NOVO SERVIÇO"}
                </span>

                <h2 id="service-modal-title">
                  {form.id
                    ? "Editar serviço"
                    : "Cadastrar serviço"}
                </h2>

                <p>
                  Defina nome, preço e duração
                  do atendimento.
                </p>
              </div>

              <button
                type="button"
                className="services-modal-close"
                onClick={fecharModal}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <form
              className="services-form"
              onSubmit={handleSubmit}
              noValidate
            >
              <div className="services-field services-field--full">
                <label htmlFor="service-name">
                  Nome do serviço *
                </label>

                <input
                  id="service-name"
                  name="nome"
                  type="text"
                  value={form.nome}
                  placeholder="Ex.: Corte degradê"
                  maxLength={120}
                  autoFocus
                  disabled={saving}
                  onChange={alterarForm}
                />
              </div>

              <div className="services-field">
                <label htmlFor="service-price">
                  Preço *
                </label>

                <div className="services-input-prefix">
                  <span>R$</span>

                  <input
                    id="service-price"
                    name="preco"
                    type="text"
                    inputMode="decimal"
                    value={form.preco}
                    placeholder="35,00"
                    disabled={saving}
                    onChange={alterarForm}
                  />
                </div>
              </div>

              <div className="services-field">
                <label htmlFor="service-duration">
                  Duração *
                </label>

                <select
                  id="service-duration"
                  name="duracao"
                  value={form.duracao}
                  disabled={saving}
                  onChange={alterarForm}
                >
                  {[15, 20, 30, 40, 45, 50, 60, 75, 90, 120].map(
                    (minutos) => (
                      <option
                        key={minutos}
                        value={minutos}
                      >
                        {minutos} minutos
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div className="services-form-note">
                <span aria-hidden="true">
                  ℹ
                </span>

                <p>
                  A duração é usada para calcular
                  automaticamente os horários
                  disponíveis da agenda.
                </p>
              </div>

              <div className="services-form-actions">
                <button
                  type="button"
                  className="services-secondary-button"
                  disabled={saving}
                  onClick={fecharModal}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="services-primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Salvando..."
                    : form.id
                      ? "Salvar alterações"
                      : "Cadastrar serviço"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
