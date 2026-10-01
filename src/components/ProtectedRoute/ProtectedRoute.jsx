import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import LoadingScreen from "../LoadingScreen/LoadingScreen";

export default function ProtectedRoute({ allowedTypes }) {
  const { authenticated, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen text="Verificando sua sessão..." />;
  }

  if (!authenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  if (!profile) {
    return (
      <div className="feedback-page">
        <h1>Perfil não encontrado</h1>
        <p>
          Sua conta está autenticada, mas o perfil do BarberHub não foi
          localizado.
        </p>
      </div>
    );
  }

  if (
    Array.isArray(allowedTypes) &&
    !allowedTypes.includes(profile.tipo)
  ) {
    const destino =
      profile.tipo === "dono" ? "/painel" : "/cliente";

    return <Navigate to={destino} replace />;
  }

  return <Outlet />;
}
