import { Route, Routes } from "react-router-dom";

import ProtectedRoute from "../components/ProtectedRoute/ProtectedRoute";

import ClienteLayout from "../pages/Cliente/ClienteLayout";
import ClienteHomePage from "../pages/Cliente/ClienteHomePage";
import ClienteContasPage from "../pages/Cliente/ClienteContasPage";
import ClientePlaceholderPage from "../pages/Cliente/ClientePlaceholderPage";
import ClienteAgendarPage from "../pages/Cliente/ClienteAgendarPage";
import ClienteAgendamentosPage from "../pages/Cliente/ClienteAgendamentosPage";
import ClienteNotificacoesPage from "../pages/Cliente/ClienteNotificacoesPage";

import PainelLayout from "../layouts/PainelLayout/PainelLayout";

import AuthCallbackPage from "../pages/AuthCallback/AuthCallbackPage";
import CadastroBarbeariaPage from "../pages/Cadastro/CadastroBarbeariaPage";
import CadastroClientePage from "../pages/Cadastro/CadastroClientePage";
import HomePage from "../pages/Home/Home";
import LoginPage from "../pages/Login/LoginPage";
import NotFoundPage from "../pages/NotFound/NotFoundPage";
import ResetPasswordPage from "../pages/ResetPassword/ResetPasswordPage";
import ClientesPage from "../pages/Painel/Clientes/ClientesPage";

import AgendamentosPage from "../pages/Painel/Agendamentos/AgendamentosPage";
import DashboardPage from "../pages/Painel/Dashboard/DashboardPage";
import HorariosPage from "../pages/Painel/Horarios/HorariosPage";
import ContasReceberPage from "../pages/Painel/ContasReceber/ContasReceberPage";
import PainelEntradaPage from "../pages/Painel/PainelEntradaPage";
import ProfissionaisPage from "../pages/Painel/Profissionais/ProfissionaisPage";
import ServicosPage from "../pages/Painel/Servicos/ServicosPage";
import ProdutosPage from "../pages/Painel/Produtos/ProdutosPage";
import PedidosPage from "../pages/Painel/Pedidos/PedidosPage";
import FinanceiroPage from "../pages/Painel/Financeiro/FinanceiroPage";
import AvaliacoesPage from "../pages/Painel/Avaliacoes/AvaliacoesPage";
import Configuracoes from "../pages/Painel/Configuracoes/Configuracoes";

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

          <Route
            path="produtos"
            element={
              <ClientePlaceholderPage
                eyebrow="LOJA"
                title="Produtos"
                description="Veja os produtos disponíveis nas barbearias e escolha o que deseja comprar."
                icon="🛍️"
                nextStep="integrar o catálogo de produtos"
              />
            }
          />

          <Route
            path="pedidos"
            element={
              <ClientePlaceholderPage
                eyebrow="COMPRAS"
                title="Meus pedidos"
                description="Acompanhe o andamento e o histórico das suas compras."
                icon="📦"
                nextStep="integrar pedidos do cliente"
              />
            }
          />

          <Route path="contas" element={<ClienteContasPage />} />

          <Route
            path="avaliacoes"
            element={
              <ClientePlaceholderPage
                eyebrow="EXPERIÊNCIA"
                title="Avaliações"
                description="Avalie atendimentos concluídos e acompanhe respostas da barbearia."
                icon="⭐"
                nextStep="integrar avaliações do cliente"
              />
            }
          />

          <Route path="notificacoes" element={<ClienteNotificacoesPage />} />

          <Route
            path="perfil"
            element={
              <ClientePlaceholderPage
                eyebrow="MINHA CONTA"
                title="Meu perfil"
                description="Consulte e altere seus dados pessoais, senha e configurações da conta."
                icon="👤"
                nextStep="integrar perfil e segurança da conta"
              />
            }
          />
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
