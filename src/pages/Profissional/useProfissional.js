import {
  useContext,
} from "react";

import {
  ProfissionalContext,
} from "./ProfissionalContext";

export function useProfissional() {
  const contexto =
    useContext(
      ProfissionalContext,
    );

  if (!contexto) {
    throw new Error(
      "useProfissional deve ser usado dentro de ProfissionalProvider.",
    );
  }

  return contexto;
}
