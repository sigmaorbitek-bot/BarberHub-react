import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "react-router-dom";

import { supabase } from "../services/supabase";

export const BarbeariaContext = createContext(null);

export function BarbeariaProvider({ children }) {
  const { barbeariaId } = useParams();

  const [barbearia, setBarbearia] = useState(null);
  const [loadingBarbearia, setLoadingBarbearia] = useState(true);
  const [barbeariaError, setBarbeariaError] = useState("");

  const carregarBarbearia = useCallback(async () => {
    if (!barbeariaId) {
      setBarbearia(null);
      setBarbeariaError("Barbearia não identificada.");
      setLoadingBarbearia(false);
      return;
    }

    setLoadingBarbearia(true);
    setBarbeariaError("");

    try {
      const { data, error } = await supabase
        .from("barbearias")
        .select(
          `
            id,
            dono_id,
            nome,
            cidade,
            endereco,
            telefone,
            logo_url,
            horario_abertura,
            horario_fechamento,
            created_at
          `,
        )
        .eq("id", barbeariaId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        setBarbearia(null);
        setBarbeariaError(
          "Barbearia não encontrada ou você não possui acesso.",
        );
        return;
      }

      setBarbearia(data);
    } catch (error) {
      console.error(
        "[BarberHub] Erro ao carregar barbearia:",
        error,
      );

      setBarbearia(null);
      setBarbeariaError(
        "Não foi possível carregar os dados da barbearia.",
      );
    } finally {
      setLoadingBarbearia(false);
    }
  }, [barbeariaId]);

  useEffect(() => {
    carregarBarbearia();
  }, [carregarBarbearia]);

  const value = useMemo(
    () => ({
      barbeariaId,
      barbearia,
      loadingBarbearia,
      barbeariaError,
      recarregarBarbearia: carregarBarbearia,
    }),
    [
      barbeariaId,
      barbearia,
      loadingBarbearia,
      barbeariaError,
      carregarBarbearia,
    ],
  );

  return (
    <BarbeariaContext.Provider value={value}>
      {children}
    </BarbeariaContext.Provider>
  );
}
