import { Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "../components/ProtectedRoute/ProtectedRoute";

import ClienteLayout from "../layouts/ClienteLayout/ClienteLayout";
import PainelLayout from "../layouts/PainelLayout/PainelLayout";

import AuthCallbackPage from "../pages/AuthCallback/AuthCallbackPage";
import CadastroBarbeariaPage from "../pages/Cadastro/CadastroBarbeariaPage";
import CadastroClientePage from "../pages/Cadastro/CadastroClientePage";
import HomePage from "../pages/Home/Home.jsx";
import NotFoundPage from "../pages/NotFound/NotFoundPage";
import ResetPasswordPage from "../pages/ResetPassword/ResetPasswordPage";

import ClienteHomePage from "../pages/Cliente/home";
import ClienteContasPage from "../pages/Cliente/Contas";
import ClienteAgendarPage from "../pages/Cliente/Agendar";
import ClienteAgendamentosPage from "../pages/Cliente/Agendamentos";
import ClienteNotificacoesPage from "../pages/Cliente/Notificacoes";
import ClienteProdutosPage from "../pages/Cliente/Produtos";
import ClientePedidosPage from "../pages/Cliente/Pedidos";
import ClienteAvaliacoesPage from "../pages/Cliente/Avaliacoes";
import ClientePerfilPage from "../pages/Cliente/Perfil";

import AgendamentosPage from "../pages/Painel/Agendamentos/AgendamentosPage";
import AvaliacoesPage from "../pages/Painel/Avaliacoes/AvaliacoesPage";
import ClientesPage from "../pages/Painel/Clientes/ClientesPage";
import Configuracoes from "../pages/Painel/Configuracoes/Configuracoes";
import ContasReceberPage from "../pages/Painel/ContasReceber/ContasReceberPage";
import DashboardPage from "../pages/Painel/Dashboard/DashboardPage";
import FinanceiroPage from "../pages/Painel/Financeiro/FinanceiroPage";
import HorariosPage from "../pages/Painel/Horarios/HorariosPage";
import PainelEntradaPage from "../pages/Painel/PainelEntradaPage";
import PedidosPage from "../pages/Painel/Pedidos/PedidosPage";
import ProdutosPage from "../pages/Painel/Produtos/ProdutosPage";
import ProfissionaisPage from "../pages/Painel/Profissionais/ProfissionaisPage";
import ServicosPage from "../pages/Painel/Servicos/ServicosPage";

import PrimeiroAcessoProfissionalPage from "../pages/Profissional/PrimeiroAcesso";
import ProfissionalAgendaPage from "../pages/Profissional/Agenda";
import ProfissionalClientesPage from "../pages/Profissional/Clientes";
import ProfissionalContaPage from "../pages/Profissional/Conta";
import ProfissionalEquipePage from "../pages/Profissional/Equipe";
import ProfissionalFinanceiroPage from "../pages/Profissional/Financeiro";
import ProfissionalHomePage from "../pages/Profissional/Home";
import ProfissionalNotificacoesPage from "../pages/Profissional/Notificacoes";
import ProfissionalProdutosPage from "../pages/Profissional/Produtos";
import ProfissionalLayout from "../pages/Profissional/ProfissionalLayout";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/login/:tipo" element={<HomePage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/nova-senha" element={<ResetPasswordPage />} />
      <Route path="/cadastro/barbearia" element={<CadastroBarbeariaPage />} />
      <Route path="/cadastro/cliente" element={<CadastroClientePage />} />

      <Route element={<ProtectedRoute allowedTypes={["dono"]} />}>
        <Route path="/painel" element={<PainelEntradaPage />} />

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
          <Route path="contas-receber" element={<ContasReceberPage />} />
          <Route path="configuracoes" element={<Configuracoes />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedTypes={["cliente"]} />}>
        <Route path="/cliente" element={<ClienteLayout />}>
          <Route index element={<ClienteHomePage />} />
          <Route path="agendar" element={<ClienteAgendarPage />} />
          <Route path="agendamentos" element={<ClienteAgendamentosPage />} />
          <Route path="produtos" element={<ClienteProdutosPage />} />
          <Route path="pedidos" element={<ClientePedidosPage />} />
          <Route path="contas" element={<ClienteContasPage />} />
          <Route path="avaliacoes" element={<ClienteAvaliacoesPage />} />
          <Route path="notificacoes" element={<ClienteNotificacoesPage />} />
          <Route path="perfil" element={<ClientePerfilPage />} />
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
          <Route path="equipe" element={<ProfissionalEquipePage />} />
          <Route path="clientes" element={<ProfissionalClientesPage />} />
          <Route path="produtos" element={<ProfissionalProdutosPage />} />
          <Route path="financeiro" element={<ProfissionalFinanceiroPage />} />
          <Route path="notificacoes" element={<ProfissionalNotificacoesPage />} />
          <Route path="minha-conta" element={<ProfissionalContaPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
