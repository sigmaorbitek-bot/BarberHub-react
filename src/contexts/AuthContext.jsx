import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../services/supabase";

export const AuthContext = createContext(null);

async function buscarPerfil(userId) {
  if (!userId) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, nome, telefone, tipo, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const aplicarSessao = useCallback(async (novaSessao) => {
    setSession(novaSessao ?? null);
    setUser(novaSessao?.user ?? null);

    if (!novaSessao?.user?.id) {
      setProfile(null);
      return null;
    }

    const perfil = await buscarPerfil(novaSessao.user.id);
    setProfile(perfil);

    return perfil;
  }, []);

  useEffect(() => {
    let ativo = true;

    async function iniciar() {
      try {
        const {
          data: { session: sessaoInicial },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (ativo) {
          await aplicarSessao(sessaoInicial);
        }
      } catch (error) {
        console.error("[BarberHub] Erro ao iniciar autenticação:", error);

        if (ativo) {
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (ativo) {
          setLoading(false);
        }
      }
    }

    iniciar();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, novaSessao) => {
      Promise.resolve().then(async () => {
        try {
          if (ativo) {
            await aplicarSessao(novaSessao);
          }
        } catch (error) {
          console.error("[BarberHub] Erro ao atualizar autenticação:", error);
        } finally {
          if (ativo) {
            setLoading(false);
          }
        }
      });
    });

    return () => {
      ativo = false;
      subscription.unsubscribe();
    };
  }, [aplicarSessao]);

  const entrar = useCallback(
    async ({ email, password }) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      const perfil = await aplicarSessao(data.session);

      if (!perfil) {
        await supabase.auth.signOut();
        throw new Error("Perfil do usuário não encontrado.");
      }

      return {
        session: data.session,
        user: data.user,
        profile: perfil,
      };
    },
    [aplicarSessao],
  );

  const sair = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    setSession(null);
    setUser(null);
    setProfile(null);
  }, []);

  const recarregarPerfil = useCallback(async () => {
    if (!user?.id) {
      setProfile(null);
      return null;
    }

    const perfil = await buscarPerfil(user.id);
    setProfile(perfil);

    return perfil;
  }, [user?.id]);

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      loading,
      authenticated: Boolean(session?.user),
      entrar,
      sair,
      recarregarPerfil,
    }),
    [session, user, profile, loading, entrar, sair, recarregarPerfil],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
