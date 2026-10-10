const moedaBR = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatarMoeda(valor) {
  const numero = Number(valor);
  return moedaBR.format(Number.isFinite(numero) ? numero : 0);
}

export function formatarData(valor, fallback = "—") {
  if (!valor) return fallback;
  const texto = String(valor);
  // Datas SQL (date) devem ser formatadas sem passar por Date/UTC.
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (partes) return `${partes[3]}/${partes[2]}/${partes[1]}`;
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? fallback
    : data.toLocaleDateString("pt-BR");
}

export function formatarHora(valor, timezone = "America/Recife") {
  if (!valor) return "";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(data);
  } catch {
    return data.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

export function formatarDataHora(valor, timezone) {
  if (!valor) return "";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(data);
  } catch {
    return data.toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }
}

export function obterPeriodoHoje() {
  const agora = new Date();
  const inicio = new Date(agora);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(agora);
  fim.setHours(23, 59, 59, 999);
  return { agora, inicio, fim };
}

export function obterDataISOHoje(timezone = "America/Recife") {
  const agora = new Date();
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const valores = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}

export function obterPeriodoMesAtual(timezone = "America/Recife") {
  const final = obterDataISOHoje(timezone);
  return { inicial: `${final.slice(0, 7)}-01`, final };
}
