import {
  useState,
} from "react";

import { supabase } from "../../services/supabase";
import "./Profissional.css";

export default function ProfissionalContaPage() {
  const [senha, setSenha] =
    useState("");

  const [
    confirmar,
    setConfirmar,
  ] = useState("");

  const [message, setMessage] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  async function alterarSenha(
    event,
  ) {
    event.preventDefault();

    if (senha.length < 8) {
      setMessage(
        "A senha precisa ter pelo menos 8 caracteres.",
      );
      return;
    }

    if (senha !== confirmar) {
      setMessage(
        "As senhas não são iguais.",
      );
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const { error } =
        await supabase.auth.updateUser({
          password: senha,
        });

      if (error) {
        throw error;
      }

      setSenha("");
      setConfirmar("");

      setMessage(
        "Senha alterada com sucesso.",
      );
    } catch (error) {
      setMessage(
        error?.message ||
          "Não foi possível alterar a senha.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="professional-page">
      <span className="professional-eyebrow">
        CONTA
      </span>

      <h1>Minha conta</h1>

      <p>
        Altere sua senha de acesso ao BarberHub.
      </p>

      <form
        className="professional-account-form"
        onSubmit={
          alterarSenha
        }
      >
        <label>
          Nova senha
          <input
            type="password"
            autoComplete="new-password"
            value={senha}
            disabled={saving}
            onChange={(event) =>
              setSenha(
                event.target.value,
              )
            }
          />
        </label>

        <label>
          Confirmar nova senha
          <input
            type="password"
            autoComplete="new-password"
            value={confirmar}
            disabled={saving}
            onChange={(event) =>
              setConfirmar(
                event.target.value,
              )
            }
          />
        </label>

        {message ? (
          <div className="professional-message">
            {message}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={saving}
        >
          {saving
            ? "Salvando..."
            : "Alterar senha"}
        </button>
      </form>

      <div className="professional-info-box">
        Você também pode entrar usando Google pela tela
        <strong>
          {" "}
          /login/profissional
        </strong>
        , desde que use o mesmo e-mail vinculado pela barbearia.
      </div>
    </section>
  );
}
