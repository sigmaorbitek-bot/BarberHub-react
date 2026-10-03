import { jsPDF } from "jspdf";

const PAGAMENTOS = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  outro: "Outro",
};

function texto(valor, fallback = "Não informado") {
  const normalizado = String(valor ?? "").trim();
  return normalizado || fallback;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarDataHora(valor) {
  if (!valor) {
    return "Não informado";
  }

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return "Não informado";
  }

  return data.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatarTelefone(valor) {
  const numeros = String(valor || "").replace(/\D/g, "");

  if (numeros.length === 11) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
  }

  if (numeros.length === 10) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
  }

  return texto(valor);
}

function numeroWhatsApp(valor) {
  const numeros = String(valor || "").replace(/\D/g, "");

  if (!numeros) {
    return "";
  }

  if (numeros.startsWith("55") && numeros.length >= 12) {
    return numeros;
  }

  if (numeros.length === 10 || numeros.length === 11) {
    return `55${numeros}`;
  }

  return numeros;
}

function pagamento(valor) {
  return PAGAMENTOS[valor] || "Não informado";
}

function codigoPedido(pedido) {
  return String(pedido?.pedido_id || pedido?.id || "").slice(0, 8).toUpperCase();
}

function nomeArquivoSeguro(valor) {
  return String(valor || "pedido")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

async function imagemParaDataUrl(url) {
  if (!url) {
    return null;
  }

  try {
    const resposta = await fetch(url, {
      mode: "cors",
    });

    if (!resposta.ok) {
      return null;
    }

    const blob = await resposta.blob();

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function detectarFormatoImagem(dataUrl) {
  if (String(dataUrl).startsWith("data:image/png")) {
    return "PNG";
  }

  if (
    String(dataUrl).startsWith("data:image/jpeg") ||
    String(dataUrl).startsWith("data:image/jpg")
  ) {
    return "JPEG";
  }

  if (String(dataUrl).startsWith("data:image/webp")) {
    return "WEBP";
  }

  return null;
}

export function montarMensagemPedido({ pedido, barbearia }) {
  const codigo = codigoPedido(pedido);
  const total =
    Number(pedido?.total) ||
    Number(pedido?.quantidade || 0) * Number(pedido?.preco_unitario || 0);

  return [
    `Olá, ${texto(pedido?.cliente_nome, "cliente")}! 👋`,
    "",
    `Seu pedido na ${texto(barbearia?.nome, "barbearia")} foi concluído ✅`,
    "",
    `🧾 Pedido: #${codigo || "-"}`,
    `🛍️ Produto: ${texto(pedido?.produto_nome)}`,
    `📦 Quantidade: ${Number(pedido?.quantidade || 0)}`,
    `💵 Valor unitário: ${formatarMoeda(pedido?.preco_unitario)}`,
    `💰 Total: ${formatarMoeda(total)}`,
    `💳 Pagamento: ${pagamento(pedido?.forma_pagamento)}`,
    `📅 Concluído em: ${formatarDataHora(pedido?.concluido_at || pedido?.atualizado_at)}`,
    "",
    "Obrigado pela preferência! 💈",
    "",
    "Comprovante gerado pelo BarberHub.",
  ].join("\n");
}

export function abrirWhatsAppPedido({ pedido, barbearia }) {
  const numero = numeroWhatsApp(pedido?.cliente_telefone);

  if (!numero) {
    throw new Error(
      "Este cliente não possui telefone cadastrado para envio pelo WhatsApp.",
    );
  }

  const mensagem = montarMensagemPedido({
    pedido,
    barbearia,
  });

  const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
  const janela = window.open(url, "_blank", "noopener,noreferrer");

  if (!janela) {
    window.location.href = url;
  }
}

export async function gerarComprovantePedidoPdf({ pedido, barbearia }) {
  if (!pedido) {
    throw new Error("Pedido não informado.");
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margem = 18;
  const largura = pageWidth - margem * 2;
  const codigo = codigoPedido(pedido);
  const total =
    Number(pedido?.total) ||
    Number(pedido?.quantidade || 0) * Number(pedido?.preco_unitario || 0);

  doc.setFillColor(16, 18, 22);
  doc.roundedRect(margem, 16, largura, 40, 3, 3, "F");

  const logoUrl = barbearia?.logo_url || barbearia?.logoUrl || null;
  const logoDataUrl = await imagemParaDataUrl(logoUrl);
  const formatoLogo = detectarFormatoImagem(logoDataUrl);

  if (logoDataUrl && formatoLogo) {
    try {
      doc.addImage(logoDataUrl, formatoLogo, margem + 6, 22, 26, 26);
    } catch {
      // O comprovante continua válido mesmo que a imagem não possa ser renderizada.
    }
  }

  const inicioTexto = logoDataUrl ? margem + 38 : margem + 8;

  doc.setTextColor(212, 175, 55);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("COMPROVANTE DE VENDA", inicioTexto, 29);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(texto(barbearia?.nome, "Barbearia"), inicioTexto, 38);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(190, 194, 201);
  doc.text(
    [barbearia?.cidade, formatarTelefone(barbearia?.telefone)]
      .filter(Boolean)
      .join(" · "),
    inicioTexto,
    45,
  );

  let y = 68;

  doc.setTextColor(24, 26, 31);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`Pedido #${codigo || "-"}`, margem, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(90, 94, 104);
  doc.text(
    `Concluído em ${formatarDataHora(pedido?.concluido_at || pedido?.atualizado_at)}`,
    margem,
    y + 7,
  );

  y += 22;

  doc.setDrawColor(225, 226, 230);
  doc.line(margem, y, pageWidth - margem, y);
  y += 11;

  doc.setTextColor(24, 26, 31);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Cliente", margem, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(texto(pedido?.cliente_nome), margem, y + 7);
  doc.setTextColor(90, 94, 104);
  doc.text(formatarTelefone(pedido?.cliente_telefone), margem, y + 13);
  doc.text(texto(pedido?.cliente_email), margem, y + 19);

  y += 31;

  doc.setTextColor(24, 26, 31);
  doc.setFont("helvetica", "bold");
  doc.text("Itens", margem, y);
  y += 8;

  doc.setFillColor(247, 247, 248);
  doc.roundedRect(margem, y, largura, 39, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(24, 26, 31);
  doc.text(texto(pedido?.produto_nome), margem + 6, y + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 94, 104);
  doc.text(`Quantidade: ${Number(pedido?.quantidade || 0)}`, margem + 6, y + 18);
  doc.text(`Valor unitário: ${formatarMoeda(pedido?.preco_unitario)}`, margem + 6, y + 25);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(24, 26, 31);
  doc.text(formatarMoeda(total), pageWidth - margem - 6, y + 22, {
    align: "right",
  });

  y += 52;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Pagamento", margem, y);

  doc.setFont("helvetica", "normal");
  doc.text(pagamento(pedido?.forma_pagamento), margem, y + 7);

  if (pedido?.observacoes) {
    y += 22;
    doc.setFont("helvetica", "bold");
    doc.text("Observações", margem, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 94, 104);
    const linhas = doc.splitTextToSize(String(pedido.observacoes), largura);
    doc.text(linhas, margem, y + 7);
    y += linhas.length * 5;
  }

  y += 20;
  doc.setDrawColor(225, 226, 230);
  doc.line(margem, y, pageWidth - margem, y);

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(24, 26, 31);
  doc.setFontSize(12);
  doc.text("TOTAL", margem, y);
  doc.setTextColor(184, 134, 11);
  doc.text(formatarMoeda(total), pageWidth - margem, y, {
    align: "right",
  });

  const footerY = 272;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(105, 109, 118);
  doc.text(
    "Este comprovante registra a venda no BarberHub e não substitui documento fiscal quando exigível.",
    pageWidth / 2,
    footerY,
    { align: "center" },
  );
  doc.text(
    "Gerado pelo BarberHub · Desenvolvido por Sigma Orbitek",
    pageWidth / 2,
    footerY + 6,
    { align: "center" },
  );

  const nome = nomeArquivoSeguro(
    `comprovante-${barbearia?.nome || "barberhub"}-${codigo || "pedido"}`,
  );

  doc.save(`${nome}.pdf`);
}
