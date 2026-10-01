import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../services/supabase";

const MAX_LOGO_SIZE = 5 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export default function PainelBarbeariaPage() {
  const { barbeariaId } = useParams();
  const { user } = useAuth();

  const [barbearia, setBarbearia] = useState(null);
  const [status, setStatus] = useState("loading");
  const [logo, setLogo] = useState(null);
  const [sendingLogo, setSendingLogo] = useState(false);
  const [logoMessage, setLogoMessage] = useState("");

  async function carregar() {
    try {
      const { data, error } = await supabase
        .from("barbearias")
        .select(
          "id, nome, cidade, endereco, telefone, logo_url",
        )
        .eq("id", barbeariaId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      setBarbearia(data);
      setStatus(data ? "success" : "not-found");
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao carregar barbearia:",
        error,
      );

      setStatus("error");
    }
  }

  useEffect(() => {
    carregar();
  }, [barbeariaId]);

  async function handleLogoUpload(event) {
    event.preventDefault();
    setLogoMessage("");

    if (!logo) {
      setLogoMessage("Selecione uma imagem.");
      return;
    }

    if (!ALLOWED_LOGO_TYPES.includes(logo.type)) {
      setLogoMessage("A logo precisa ser JPG, PNG ou WEBP.");
      return;
    }

    if (logo.size > MAX_LOGO_SIZE) {
      setLogoMessage("A logo pode ter no máximo 5 MB.");
      return;
    }

    if (!user?.id) {
      setLogoMessage("Usuário não identificado.");
      return;
    }

    setSendingLogo(true);

    try {
      const extensao =
        logo.name.split(".").pop()?.toLowerCase() || "png";

      const caminho =
        `${user.id}/${barbeariaId}/logo-${crypto.randomUUID()}.${extensao}`;

      const { error: uploadError } = await supabase.storage
        .from("barbearias")
        .upload(caminho, logo, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage
        .from("barbearias")
        .getPublicUrl(caminho);

      const logoUrl = data?.publicUrl;

      if (!logoUrl) {
        throw new Error(
          "Não foi possível obter a URL pública da logo.",
        );
      }

      const { error: updateError } = await supabase
        .from("barbearias")
        .update({
          logo_url: logoUrl,
        })
        .eq("id", barbeariaId)
        .eq("dono_id", user.id);

      if (updateError) {
        throw updateError;
      }

      setLogo(null);
      setLogoMessage("Logo atualizada com sucesso.");
      await carregar();
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao atualizar logo:",
        error,
      );

      setLogoMessage(
        error?.message || "Não foi possível atualizar a logo.",
      );
    } finally {
      setSendingLogo(false);
    }
  }

  if (status === "loading") {
    return <p>Carregando barbearia...</p>;
  }

  if (status !== "success") {
    return (
      <div className="empty-state">
        <h1>Barbearia não encontrada</h1>
        <p>
          A RLS também impede o acesso caso esta unidade não pertença ao
          usuário autenticado.
        </p>
        <Link className="button button--primary" to="/painel">
          Voltar
        </Link>
      </div>
    );
  }

  return (
    <section className="page-section">
      <Link className="back-link" to="/painel">
        ← Suas barbearias
      </Link>

      <div className="page-heading">
        <div>
          <p className="eyebrow">Painel da barbearia</p>
          <h1>{barbearia.nome}</h1>
          <p>
            {barbearia.cidade}
            {barbearia.endereco
              ? ` · ${barbearia.endereco}`
              : ""}
          </p>
        </div>
      </div>

      <div className="module-card">
        <span>🖼️</span>
        <strong>Logo da barbearia</strong>

        {barbearia.logo_url ? (
          <img
            src={barbearia.logo_url}
            alt={`Logo de ${barbearia.nome}`}
            style={{
              width: "110px",
              height: "110px",
              objectFit: "contain",
              borderRadius: "14px",
            }}
          />
        ) : (
          <small>Nenhuma logo cadastrada.</small>
        )}

        <form
          onSubmit={handleLogoUpload}
          style={{
            display: "grid",
            gap: "10px",
            marginTop: "10px",
          }}
        >
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            disabled={sendingLogo}
            onChange={(event) =>
              setLogo(event.target.files?.[0] || null)
            }
          />

          <button
            className="button button--primary"
            type="submit"
            disabled={sendingLogo}
          >
            {sendingLogo
              ? "Enviando..."
              : barbearia.logo_url
                ? "Alterar logo"
                : "Adicionar logo"}
          </button>

          {logoMessage ? (
            <small>{logoMessage}</small>
          ) : null}
        </form>
      </div>

      <div className="module-grid">
        {[
          ["📅", "Agendamentos"],
          ["✂️", "Serviços"],
          ["💇", "Profissionais"],
          ["👥", "Clientes"],
          ["🛍️", "Produtos"],
          ["📦", "Pedidos"],
          ["💰", "Financeiro"],
          ["⭐", "Avaliações"],
        ].map(([icon, title]) => (
          <div className="module-card" key={title}>
            <span>{icon}</span>
            <strong>{title}</strong>
            <small>Próximo módulo da migração</small>
          </div>
        ))}
      </div>
    </section>
  );
}
