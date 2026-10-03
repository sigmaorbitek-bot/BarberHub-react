import { Route, Routes } from "react-router-dom";

import AppShell from "../components/AppShell/AppShell";
import ProtectedRoute from "../components/ProtectedRoute/ProtectedRoute";

import PainelLayout from "../layouts/PainelLayout/PainelLayout";

import AuthCallbackPage from "../pages/AuthCallback/AuthCallbackPage";
import CadastroBarbeariaPage from "../pages/Cadastro/CadastroBarbeariaPage";
import CadastroClientePage from "../pages/Cadastro/CadastroClientePage";
import ClienteHomePage from "../pages/Cliente/ClienteHomePage";
import HomePage from "../pages/Home/Home";
import LoginPage from "../pages/Login/LoginPage";
import NotFoundPage from "../pages/NotFound/NotFoundPage";
import ResetPasswordPage from "../pages/ResetPassword/ResetPasswordPage";
import ClientesPage from "../pages/Painel/Clientes/ClientesPage";

import AgendamentosPage from "../pages/Painel/Agendamentos/AgendamentosPage";
import DashboardPage from "../pages/Painel/Dashboard/DashboardPage";
import HorariosPage from "../pages/Painel/Horarios/HorariosPage";
import ModuloPlaceholderPage from "../pages/Painel/ModuloPlaceholder/ModuloPlaceholderPage";
import PainelHomePage from "../pages/Painel/PainelHomePage";
import ProfissionaisPage from "../pages/Painel/Profissionais/ProfissionaisPage";
import ServicosPage from "../pages/Painel/Servicos/ServicosPage";
import ProdutosPage from "../pages/Painel/Produtos/ProdutosPage";
import PedidosPage from "../pages/Painel/Pedidos/PedidosPage";
import FinanceiroPage from "../pages/Painel/Financeiro/FinanceiroPage";
import AvaliacoesPage from "../pages/Painel/Avaliacoes/AvaliacoesPage";

import PrimeiroAcessoProfissionalPage from "../pages/Profissional/PrimeiroAcessoProfissionalPage";
import ProfissionalAgendaPage from "../pages/Profissional/ProfissionalAgendaPage";
import ProfissionalContaPage from "../pages/Profissional/ProfissionalContaPage";
import ProfissionalFinanceiroPage from "../pages/Profissional/ProfissionalFinanceiroPage";
import ProfissionalHomePage from "../pages/Profissional/ProfissionalHomePage";
import ProfissionalLayout from "../pages/Profissional/ProfissionalLayout";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />

      <Route path="/login/:tipo" element={<LoginPage />} />

      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      <Route path="/nova-senha" element={<ResetPasswordPage />} />

      <Route path="/cadastro/barbearia" element={<CadastroBarbeariaPage />} />

      <Route path="/cadastro/cliente" element={<CadastroClientePage />} />

      <Route element={<ProtectedRoute allowedTypes={["dono"]} />}>
        <Route path="/painel" element={<PainelHomePage />} />

        <Route path="/painel/:barbeariaId" element={<PainelLayout />}>
          <Route index element={<DashboardPage />} />

          <Route path="agendamentos" element={<AgendamentosPage />} />

          <Route path="servicos" element={<ServicosPage />} />

          <Route path="profissionais" element={<ProfissionaisPage />} />

          <Route path="horarios" element={<HorariosPage />} />
          <Route path="clientes" element={<ClientesPage />} />
          <Route path="produtos" element={<ProdutosPage />} />
          <Route path="pedidos" element={<PedidosPage />} />
          <Route path="financeiro" element={<FinanceiroPage />} />
          <Route path="avaliacoes" element={<AvaliacoesPage />} />

          {["configuracoes"].map((path) => (
            <Route key={path} path={path} element={<ModuloPlaceholderPage />} />
          ))}
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedTypes={["cliente"]} />}>
        <Route element={<AppShell area="Área do cliente" />}>
          <Route path="/cliente" element={<ClienteHomePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedTypes={["profissional"]} />}>
        <Route
          path="/profissional/primeiro-acesso"
          element={<PrimeiroAcessoProfissionalPage />}
        />

        <Route path="/profissional" element={<ProfissionalLayout />}>
          <Route index element={<ProfissionalHomePage />} />

          <Route path="agenda" element={<ProfissionalAgendaPage />} />

          <Route path="financeiro" element={<ProfissionalFinanceiroPage />} />

          <Route path="minha-conta" element={<ProfissionalContaPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
