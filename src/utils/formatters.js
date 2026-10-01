export function formatarMoeda(valor) {
  const numero = Number(valor);

  return (Number.isFinite(numero) ? numero : 0).toLocaleString(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    },
  );
}

export function formatarDataHora(valor) {
  if (!valor) {
    return "";
  }

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return "";
  }

  return data.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function obterPeriodoHoje() {
  const agora = new Date();

  const inicio = new Date(agora);
  inicio.setHours(0, 0, 0, 0);

  const fim = new Date(agora);
  fim.setHours(23, 59, 59, 999);

  return {
    agora,
    inicio,
    fim,
  };
}
