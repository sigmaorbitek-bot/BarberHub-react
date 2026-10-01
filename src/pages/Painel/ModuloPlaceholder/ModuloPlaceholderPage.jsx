import { useLocation } from "react-router-dom";

import "./ModuloPlaceholderPage.css";

const MODULOS = {
  agendamentos: ["📅", "Agendamentos"],
  servicos: ["✂️", "Serviços"],
  clientes: ["👥", "Clientes"],
  profissionais: ["💈", "Profissionais"],
  horarios: ["🕐", "Horários"],
  produtos: ["🛍️", "Produtos"],
  pedidos: ["🧾", "Pedidos"],
  financeiro: ["💰", "Financeiro"],
  avaliacoes: ["⭐", "Avaliações"],
  configuracoes: ["⚙️", "Configurações"],
};

export default function ModuloPlaceholderPage() {
  const location = useLocation();

  const slug =
    location.pathname.split("/").filter(Boolean).at(-1);

  const [icon, title] =
    MODULOS[slug] || ["🧩", "Módulo"];

  return (
    <section className="module-placeholder-page">
      <div>
        <span>{icon}</span>
        <p>BARBERHUB</p>
        <h1>{title}</h1>
        <small>
          Este módulo já está dentro da nova arquitetura do painel.
          Agora vamos migrar as funcionalidades dele do sistema antigo
          para React.
        </small>
      </div>
    </section>
  );
}
