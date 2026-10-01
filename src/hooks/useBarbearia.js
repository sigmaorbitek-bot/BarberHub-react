import { useContext } from "react";

import { BarbeariaContext } from "../contexts/BarbeariaContext";

export function useBarbearia() {
  const context = useContext(BarbeariaContext);

  if (!context) {
    throw new Error(
      "useBarbearia deve ser usado dentro de BarbeariaProvider.",
    );
  }

  return context;
}
