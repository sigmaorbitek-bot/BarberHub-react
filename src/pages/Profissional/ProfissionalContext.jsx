import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../services/supabase";

export const ProfissionalContext =
  createContext(null);

export function ProfissionalProvider({
  children,
}) {
  const [
    contexto,
    setContexto,
  ] = useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const carregar =
    useCallback(async () => {
      setLoading(true);
      setError("");

      try {
        const {
          data,
          error: rpcError,
        } = await supabase.rpc(
          "obter_contexto_profissional",
        );

        if (rpcError) {
          throw rpcError;
        }

        const item =
          Array.isArray(data)
            ? data[0]
            : data;

        setContexto(
          item || null,
        );
      } catch (err) {
        console.error(
          "[BarberHub] Contexto profissional:",
          err,
        );

        setContexto(null);
        setError(
          err?.message ||
            "Não foi possível carregar seu perfil profissional.",
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const value = useMemo(
    () => ({
      contexto,
      loading,
      error,
      recarregar:
        carregar,
    }),
    [
      contexto,
      loading,
      error,
      carregar,
    ],
  );

  return (
    <ProfissionalContext.Provider
      value={value}
    >
      {children}
    </ProfissionalContext.Provider>
  );
}
