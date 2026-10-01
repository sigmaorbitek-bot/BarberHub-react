import { useAuth } from "../../hooks/useAuth";

export default function ClienteHomePage() {
  const { profile } = useAuth();

  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Área do cliente</p>
          <h1>Olá, {profile?.nome || "Cliente"}</h1>
          <p>
            A autenticação já está integrada ao banco novo. Os módulos de
            agendamento, pedidos, favoritos e avaliações serão migrados em
            seguida.
          </p>
        </div>
      </div>

      <div className="module-grid">
        {[
          ["📅", "Agendar horário"],
          ["🗓️", "Meus agendamentos"],
          ["🛍️", "Produtos"],
          ["📦", "Meus pedidos"],
          ["❤️", "Favoritos"],
          ["⭐", "Avaliações"],
        ].map(([icon, title]) => (
          <div className="module-card" key={title}>
            <span>{icon}</span>
            <strong>{title}</strong>
            <small>Em migração</small>
          </div>
        ))}
      </div>
    </section>
  );
}
