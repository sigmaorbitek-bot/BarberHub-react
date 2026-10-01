import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="feedback-page">
      <h1>Página não encontrada</h1>
      <p>O endereço informado não existe no BarberHub.</p>
      <Link className="button button--primary" to="/">
        Voltar ao início
      </Link>
    </div>
  );
}
