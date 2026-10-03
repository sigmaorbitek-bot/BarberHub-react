import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import LoadingScreen from "../../components/LoadingScreen/LoadingScreen";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../services/supabase";
import PainelHomePage from "./PainelHomePage";

export default function PainelEntradaPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [barbearias, setBarbearias] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function carregar() {
      if (!user?.id) {
        if (active) {
          setBarbearias([]);
          setLoading(false);
        }

        return;
      }

      setLoading(true);
      setError("");

      const { data, error: queryError } = await supabase
        .from("barbearias")
        .select("id, nome, created_at")
        .eq("dono_id", user.id)
        .order("created_at", {
          ascending: true,
        });

      if (!active) {
        return;
      }

      if (queryError) {
        console.error(
          "[BarberHub] Erro ao decidir destino do painel:",
          queryError,
        );

        setError(
          "Não foi possível verificar suas barbearias.",
        );
        setLoading(false);
        return;
      }

      setBarbearias(data || []);
      setLoading(false);
    }

    carregar();

    return () => {
      active = false;
    };
  }, [user?.id]);

  if (loading) {
    return (
      <LoadingScreen text="Carregando suas barbearias..." />
    );
  }

  if (error) {
    return (
      <div className="feedback-page">
        <h1>Não foi possível abrir o painel</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (barbearias.length === 1) {
    return (
      <Navigate
        to={`/painel/${barbearias[0].id}`}
        replace
      />
    );
  }

  return <PainelHomePage />;
}
