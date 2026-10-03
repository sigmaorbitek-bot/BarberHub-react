import jsPDF from "jspdf";

const CORES = {
  ouro: [196, 150, 26],
  ouroClaro: [244, 211, 94],
  texto: [24, 28, 35],
  secundario: [98, 107, 120],
  borda: [222, 226, 232],
  fundo: [247, 248, 250],
  verde: [31, 133, 83],
  vermelho: [200, 61, 67],
};

function moeda(valor) {
  return Number(valor || 0).toLocaleString(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    },
  );
}

function dataBR(valor) {
  if (!valor) {
    return "-";
  }

  const [ano, mes, dia] =
    String(valor).split("-");

  if (!ano || !mes || !dia) {
    return String(valor);
  }

  return `${dia}/${mes}/${ano}`;
}

function safeText(valor) {
  return String(
    valor ?? "",
  ).trim();
}

function horaBR(valor) {
  if (!valor) {
    return "";
  }

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return "";
  }

  return data.toLocaleTimeString(
    "pt-BR",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

function telefoneBR(valor) {
  const numeros = safeText(
    valor,
  ).replace(/\D/g, "");

  if (numeros.length === 11) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
  }

  if (numeros.length === 10) {
    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
  }

  return safeText(valor);
}

function agruparMovimentacoesPorDia(
  movimentacoes,
) {
  const mapa = new Map();

  for (
    const item
    of movimentacoes || []
  ) {
    const data =
      item.data_movimento;

    if (!mapa.has(data)) {
      mapa.set(data, {
        data,
        atendimentos: [],
        produtos: [],
        gastos: [],
        faturamento: 0,
        despesas: 0,
        comissoes: 0,
      });
    }

    const dia =
      mapa.get(data);

    dia.faturamento +=
      Number(
        item.valor_entrada ||
          0,
      );

    dia.despesas +=
      Number(
        item.valor_saida ||
          0,
      );

    dia.comissoes +=
      Number(
        item.comissao ||
          0,
      );

    if (
      item.tipo ===
      "servico"
    ) {
      dia.atendimentos.push(
        item,
      );
    } else if (
      item.tipo ===
      "produto"
    ) {
      dia.produtos.push(
        item,
      );
    } else if (
      item.tipo ===
      "gasto"
    ) {
      dia.gastos.push(
        item,
      );
    }
  }

  return Array.from(
    mapa.values(),
  ).sort(
    (a, b) =>
      String(b.data)
        .localeCompare(
          String(a.data),
        ),
  );
}

async function carregarImagemComoPng(
  url,
) {
  if (!url) {
    return null;
  }

  try {
    const imagem =
      new Image();

    imagem.crossOrigin =
      "anonymous";

    const carregada =
      new Promise(
        (resolve, reject) => {
          imagem.onload =
            resolve;
          imagem.onerror =
            reject;
        },
      );

    imagem.src = url;

    await carregada;

    const canvas =
      document.createElement(
        "canvas",
      );

    const tamanho = 512;

    canvas.width = tamanho;
    canvas.height = tamanho;

    const ctx =
      canvas.getContext("2d");

    if (!ctx) {
      return null;
    }

    ctx.clearRect(
      0,
      0,
      tamanho,
      tamanho,
    );

    const escala =
      Math.min(
        tamanho /
          imagem.naturalWidth,
        tamanho /
          imagem.naturalHeight,
      );

    const largura =
      imagem.naturalWidth *
      escala;

    const altura =
      imagem.naturalHeight *
      escala;

    const x =
      (tamanho -
        largura) /
      2;

    const y =
      (tamanho -
        altura) /
      2;

    ctx.drawImage(
      imagem,
      x,
      y,
      largura,
      altura,
    );

    return canvas.toDataURL(
      "image/png",
    );
  } catch (error) {
    console.warn(
      "[BarberHub] Não foi possível carregar a logo no relatório:",
      error,
    );

    return null;
  }
}

function configurarTexto(
  doc,
  {
    tamanho = 9,
    negrito = false,
    cor = CORES.texto,
  } = {},
) {
  doc.setFont(
    "helvetica",
    negrito
      ? "bold"
      : "normal",
  );

  doc.setFontSize(
    tamanho,
  );

  doc.setTextColor(
    ...cor,
  );
}

function linha(
  doc,
  y,
  {
    x1 = 15,
    x2 = 195,
    cor = CORES.borda,
  } = {},
) {
  doc.setDrawColor(
    ...cor,
  );

  doc.setLineWidth(
    0.25,
  );

  doc.line(
    x1,
    y,
    x2,
    y,
  );
}

function garantirEspaco(
  doc,
  y,
  necessario = 28,
) {
  const limite = 274;

  if (
    y + necessario <=
    limite
  ) {
    return y;
  }

  doc.addPage();

  return 18;
}

function desenharTituloSecao(
  doc,
  titulo,
  y,
) {
  y =
    garantirEspaco(
      doc,
      y,
      14,
    );

  configurarTexto(
    doc,
    {
      tamanho: 8,
      negrito: true,
      cor: CORES.ouro,
    },
  );

  doc.text(
    titulo.toUpperCase(),
    15,
    y,
  );

  y += 4;

  linha(
    doc,
    y,
    {
      x2: 195,
      cor:
        CORES.ouroClaro,
    },
  );

  return y + 6;
}

function desenharCardResumo(
  doc,
  {
    x,
    y,
    largura,
    titulo,
    valor,
    destaque = false,
    negativo = false,
  },
) {
  doc.setFillColor(
    destaque
      ? 253
      : 248,
    destaque
      ? 249
      : 249,
    destaque
      ? 235
      : 251,
  );

  doc.setDrawColor(
    ...(
      destaque
        ? CORES.ouro
        : CORES.borda
    ),
  );

  doc.roundedRect(
    x,
    y,
    largura,
    22,
    2.4,
    2.4,
    "FD",
  );

  configurarTexto(
    doc,
    {
      tamanho: 6.8,
      negrito: true,
      cor:
        CORES.secundario,
    },
  );

  doc.text(
    titulo.toUpperCase(),
    x + 4,
    y + 6,
  );

  configurarTexto(
    doc,
    {
      tamanho: 10,
      negrito: true,
      cor:
        negativo
          ? CORES.vermelho
          : destaque
            ? CORES.ouro
            : CORES.texto,
    },
  );

  doc.text(
    valor,
    x + 4,
    y + 15,
  );
}

function desenharMovimento(
  doc,
  item,
  y,
  tipo,
) {
  y =
    garantirEspaco(
      doc,
      y,
      16,
    );

  const x = 19;
  const largura = 172;

  doc.setFillColor(
    ...CORES.fundo,
  );

  doc.setDrawColor(
    ...CORES.borda,
  );

  doc.roundedRect(
    x,
    y,
    largura,
    13,
    1.7,
    1.7,
    "FD",
  );

  const titulo =
    tipo === "servico"
      ? safeText(
          item.cliente_nome,
        ) ||
        "Cliente"
      : tipo ===
          "produto"
        ? safeText(
            item.cliente_nome,
          ) ||
          "Cliente"
        : safeText(
            item.descricao,
          ) ||
          "Gasto";

  configurarTexto(
    doc,
    {
      tamanho: 7.6,
      negrito: true,
    },
  );

  doc.text(
    titulo,
    x + 4,
    y + 5,
  );

  let detalhe = "";

  if (
    tipo === "servico"
  ) {
    detalhe = [
      horaBR(
        item.data_hora,
      ),
      safeText(
        item.descricao,
      ),
      safeText(
        item.profissional_nome,
      ),
    ]
      .filter(Boolean)
      .join(" - ");
  } else if (
    tipo === "produto"
  ) {
    detalhe = [
      horaBR(
        item.data_hora,
      ),
      safeText(
        item.descricao,
      ),
      `Qtd. ${Number(item.quantidade || 0)}`,
    ]
      .filter(Boolean)
      .join(" - ");
  } else {
    detalhe = [
      safeText(
        item.categoria,
      ),
      safeText(
        item.pagamento,
      ),
    ]
      .filter(Boolean)
      .join(" - ");
  }

  configurarTexto(
    doc,
    {
      tamanho: 6.8,
      cor:
        CORES.secundario,
    },
  );

  const detalheLinhas =
    doc.splitTextToSize(
      detalhe ||
        "Sem detalhes adicionais",
      120,
    );

  doc.text(
    detalheLinhas[
      0
    ],
    x + 4,
    y + 9.5,
  );

  configurarTexto(
    doc,
    {
      tamanho: 8,
      negrito: true,
      cor:
        tipo === "gasto"
          ? CORES.vermelho
          : CORES.verde,
    },
  );

  const valor =
    tipo === "gasto"
      ? `-${moeda(
          item.valor_saida,
        )}`
      : moeda(
          item.valor_entrada,
        );

  doc.text(
    valor,
    x + largura - 4,
    y + 8,
    {
      align: "right",
    },
  );

  return y + 16;
}

function desenharRodape(
  doc,
) {
  const totalPaginas =
    doc.getNumberOfPages();

  for (
    let pagina = 1;
    pagina <=
    totalPaginas;
    pagina += 1
  ) {
    doc.setPage(
      pagina,
    );

    linha(
      doc,
      282,
      {
        x1: 15,
        x2: 195,
      },
    );

    configurarTexto(
      doc,
      {
        tamanho: 6.6,
        cor:
          CORES.secundario,
      },
    );

    doc.text(
      "Relatório gerado pelo BarberHub - Desenvolvido por Sigma Orbitek",
      15,
      287,
    );

    doc.text(
      `Página ${pagina} de ${totalPaginas}`,
      195,
      287,
      {
        align: "right",
      },
    );
  }
}

export async function gerarRelatorioFinanceiroPdf({
  barbearia,
  periodo,
  resumo,
  gastos = [],
  movimentacoes = [],
}) {
  const doc =
    new jsPDF({
      unit: "mm",
      format: "a4",
    });

  const nome =
    safeText(
      barbearia?.nome,
    ) ||
    "BarberHub";

  const cidade =
    safeText(
      barbearia?.cidade,
    );

  const telefone =
    telefoneBR(
      barbearia?.telefone,
    );

  const endereco =
    safeText(
      barbearia?.endereco,
    );

  const logo =
    await carregarImagemComoPng(
      barbearia?.logo_url,
    );

  let y = 16;

  if (logo) {
    try {
      doc.addImage(
        logo,
        "PNG",
        15,
        14,
        24,
        24,
      );
    } catch (error) {
      console.warn(
        "[BarberHub] Logo ignorada no PDF:",
        error,
      );
    }
  } else {
    doc.setDrawColor(
      ...CORES.ouro,
    );

    doc.setLineWidth(
      0.6,
    );

    doc.roundedRect(
      15,
      14,
      24,
      24,
      4,
      4,
      "S",
    );

    configurarTexto(
      doc,
      {
        tamanho: 15,
        negrito: true,
        cor: CORES.ouro,
      },
    );

    doc.text(
      nome
        .slice(0, 2)
        .toUpperCase(),
      27,
      29,
      {
        align: "center",
      },
    );
  }

  configurarTexto(
    doc,
    {
      tamanho: 7,
      negrito: true,
      cor: CORES.ouro,
    },
  );

  doc.text(
    "RELATÓRIO FINANCEIRO",
    45,
    y + 2,
  );

  configurarTexto(
    doc,
    {
      tamanho: 15,
      negrito: true,
    },
  );

  doc.text(
    nome,
    45,
    y + 10,
  );

  configurarTexto(
    doc,
    {
      tamanho: 7.4,
      cor:
        CORES.secundario,
    },
  );

  const local =
    [
      cidade,
      telefone,
    ]
      .filter(Boolean)
      .join(" - ");

  if (local) {
    doc.text(
      local,
      45,
      y + 16,
    );
  }

  if (endereco) {
    const enderecoLinhas =
      doc.splitTextToSize(
        endereco,
        118,
      );

    doc.text(
      enderecoLinhas[
        0
      ],
      45,
      y + 21,
    );
  }

  doc.setFillColor(
    253,
    249,
    235,
  );

  doc.setDrawColor(
    ...CORES.ouro,
  );

  doc.roundedRect(
    147,
    14,
    48,
    24,
    2.5,
    2.5,
    "FD",
  );

  configurarTexto(
    doc,
    {
      tamanho: 6.8,
      negrito: true,
      cor:
        CORES.secundario,
    },
  );

  doc.text(
    "PERÍODO",
    151,
    21,
  );

  configurarTexto(
    doc,
    {
      tamanho: 8.2,
      negrito: true,
      cor:
        CORES.texto,
    },
  );

  doc.text(
    dataBR(
      periodo.inicial,
    ),
    151,
    28,
  );

  configurarTexto(
    doc,
    {
      tamanho: 6.8,
      cor:
        CORES.secundario,
    },
  );

  doc.text(
    "até",
    151,
    32.5,
  );

  configurarTexto(
    doc,
    {
      tamanho: 8.2,
      negrito: true,
      cor:
        CORES.texto,
    },
  );

  doc.text(
    dataBR(
      periodo.final,
    ),
    162,
    32.5,
  );

  y = 46;

  linha(
    doc,
    y,
    {
      cor:
        CORES.ouroClaro,
    },
  );

  y += 8;

  y =
    desenharTituloSecao(
      doc,
      "Resumo financeiro",
      y,
    );

  const cards = [
    {
      titulo: "Serviços",
      valor: moeda(
        resumo.faturamento_servicos,
      ),
    },
    {
      titulo: "Produtos",
      valor: moeda(
        resumo.faturamento_produtos,
      ),
    },
    {
      titulo: "Entradas",
      valor: moeda(
        resumo.entradas,
      ),
    },
    {
      titulo: "Despesas",
      valor: moeda(
        resumo.despesas,
      ),
      negativo:
        Number(
          resumo.despesas,
        ) > 0,
    },
    {
      titulo: "Comissões",
      valor: moeda(
        resumo.comissoes_estimadas,
      ),
    },
    {
      titulo:
        "Resultado líquido",
      valor: moeda(
        resumo.resultado_liquido,
      ),
      destaque: true,
      negativo:
        Number(
          resumo.resultado_liquido,
        ) < 0,
    },
  ];

  const larguraCard =
    56.7;

  cards.forEach(
    (card, index) => {
      const coluna =
        index % 3;

      const linhaCard =
        Math.floor(
          index / 3,
        );

      desenharCardResumo(
        doc,
        {
          x:
            15 +
            coluna *
              61.5,
          y:
            y +
            linhaCard *
              27,
          largura:
            larguraCard,
          ...card,
        },
      );
    },
  );

  y += 58;

  const dias =
    agruparMovimentacoesPorDia(
      movimentacoes,
    );

  y =
    desenharTituloSecao(
      doc,
      "Movimentação por dia",
      y,
    );

  if (!dias.length) {
    configurarTexto(
      doc,
      {
        tamanho: 8,
        cor:
          CORES.secundario,
      },
    );

    doc.text(
      "Nenhuma movimentação encontrada no período.",
      15,
      y,
    );

    y += 8;
  } else {
    for (
      const dia
      of dias
    ) {
      y =
        garantirEspaco(
          doc,
          y,
          38,
        );

      const resultado =
        dia.faturamento -
        dia.despesas -
        dia.comissoes;

      doc.setFillColor(
        250,
        250,
        251,
      );

      doc.setDrawColor(
        ...CORES.borda,
      );

      doc.roundedRect(
        15,
        y,
        180,
        22,
        2.2,
        2.2,
        "FD",
      );

      configurarTexto(
        doc,
        {
          tamanho: 6.8,
          negrito: true,
          cor:
            CORES.ouro,
        },
      );

      doc.text(
        "DIA",
        20,
        y + 6,
      );

      configurarTexto(
        doc,
        {
          tamanho: 10,
          negrito: true,
        },
      );

      doc.text(
        dataBR(
          dia.data,
        ),
        20,
        y + 14,
      );

      const indicadores = [
        [
          "Atend.",
          String(
            dia.atendimentos
              .length,
          ),
        ],
        [
          "Vendas",
          String(
            dia.produtos
              .length,
          ),
        ],
        [
          "Faturado",
          moeda(
            dia.faturamento,
          ),
        ],
        [
          "Gastos",
          moeda(
            dia.despesas,
          ),
        ],
        [
          "Resultado",
          moeda(
            resultado,
          ),
        ],
      ];

      indicadores.forEach(
        (
          [
            titulo,
            valor,
          ],
          index,
        ) => {
          const x =
            57 +
            index *
              27.3;

          configurarTexto(
            doc,
            {
              tamanho: 5.9,
              negrito: true,
              cor:
                CORES.secundario,
            },
          );

          doc.text(
            titulo.toUpperCase(),
            x,
            y + 6,
          );

          configurarTexto(
            doc,
            {
              tamanho: 7.1,
              negrito: true,
              cor:
                titulo ===
                  "Resultado" &&
                resultado < 0
                  ? CORES.vermelho
                  : CORES.texto,
            },
          );

          doc.text(
            valor,
            x,
            y + 14,
          );
        },
      );

      y += 28;

      if (
        dia.atendimentos
          .length
      ) {
        configurarTexto(
          doc,
          {
            tamanho: 7.3,
            negrito: true,
          },
        );

        doc.text(
          `Clientes atendidos (${dia.atendimentos.length})`,
          19,
          y,
        );

        y += 4;

        for (
          const item
          of dia.atendimentos
        ) {
          y =
            desenharMovimento(
              doc,
              item,
              y,
              "servico",
            );
        }
      }

      if (
        dia.produtos.length
      ) {
        configurarTexto(
          doc,
          {
            tamanho: 7.3,
            negrito: true,
          },
        );

        doc.text(
          `Produtos vendidos (${dia.produtos.length})`,
          19,
          y,
        );

        y += 4;

        for (
          const item
          of dia.produtos
        ) {
          y =
            desenharMovimento(
              doc,
              item,
              y,
              "produto",
            );
        }
      }

      if (
        dia.gastos.length
      ) {
        configurarTexto(
          doc,
          {
            tamanho: 7.3,
            negrito: true,
          },
        );

        doc.text(
          `Gastos do dia (${dia.gastos.length})`,
          19,
          y,
        );

        y += 4;

        for (
          const item
          of dia.gastos
        ) {
          y =
            desenharMovimento(
              doc,
              item,
              y,
              "gasto",
            );
        }
      }

      y += 5;
    }
  }

  if (gastos.length) {
    y =
      desenharTituloSecao(
        doc,
        "Gastos registrados",
        y,
      );

    for (
      const gasto
      of gastos
    ) {
      y =
        garantirEspaco(
          doc,
          y,
          14,
        );

      doc.setFillColor(
        ...CORES.fundo,
      );

      doc.setDrawColor(
        ...CORES.borda,
      );

      doc.roundedRect(
        15,
        y,
        180,
        12,
        1.7,
        1.7,
        "FD",
      );

      configurarTexto(
        doc,
        {
          tamanho: 7.3,
          negrito: true,
        },
      );

      doc.text(
        safeText(
          gasto.descricao,
        ),
        19,
        y + 5,
      );

      configurarTexto(
        doc,
        {
          tamanho: 6.5,
          cor:
            CORES.secundario,
        },
      );

      const detalhe =
        [
          dataBR(
            gasto.data_gasto,
          ),
          safeText(
            gasto.categoria,
          ),
          safeText(
            gasto.pagamento,
          ),
        ]
          .filter(Boolean)
          .join(" - ");

      doc.text(
        detalhe,
        19,
        y + 9,
      );

      configurarTexto(
        doc,
        {
          tamanho: 8,
          negrito: true,
          cor:
            CORES.vermelho,
        },
      );

      doc.text(
        `-${moeda(
          gasto.valor,
        )}`,
        191,
        y + 7,
        {
          align: "right",
        },
      );

      y += 15;
    }
  }

  y =
    garantirEspaco(
      doc,
      y,
      32,
    );

  doc.setFillColor(
    253,
    249,
    235,
  );

  doc.setDrawColor(
    ...CORES.ouro,
  );

  doc.roundedRect(
    15,
    y,
    180,
    24,
    2.5,
    2.5,
    "FD",
  );

  configurarTexto(
    doc,
    {
      tamanho: 7,
      negrito: true,
      cor:
        CORES.secundario,
    },
  );

  doc.text(
    "RESULTADO DO PERÍODO",
    20,
    y + 7,
  );

  configurarTexto(
    doc,
    {
      tamanho: 15,
      negrito: true,
      cor:
        Number(
          resumo.resultado_liquido,
        ) < 0
          ? CORES.vermelho
          : CORES.ouro,
    },
  );

  doc.text(
    moeda(
      resumo.resultado_liquido,
    ),
    20,
    y + 17,
  );

  configurarTexto(
    doc,
    {
      tamanho: 7,
      cor:
        CORES.secundario,
    },
  );

  doc.text(
    "Entradas - despesas - comissões estimadas",
    191,
    y + 15,
    {
      align: "right",
    },
  );

  desenharRodape(
    doc,
  );

  const arquivo =
    `financeiro-${nome
      .toLowerCase()
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .replace(
        /[^a-z0-9]+/g,
        "-",
      )
      .replace(
        /^-|-$/g,
        "",
      )}-${periodo.inicial}-${periodo.final}.pdf`;

  doc.save(
    arquivo,
  );
}

export function abrirResumoFinanceiroWhatsapp({
  barbearia,
  periodo,
  resumo,
  movimentacoes = [],
}) {
  const mensagem = [
    `*Relatório financeiro - ${barbearia?.nome || "BarberHub"}*`,
    "",
    `Período: ${dataBR(periodo.inicial)} até ${dataBR(periodo.final)}`,
    "",
    `Serviços: ${moeda(resumo.faturamento_servicos)}`,
    `Produtos: ${moeda(resumo.faturamento_produtos)}`,
    `Entradas: ${moeda(resumo.entradas)}`,
    `Despesas: ${moeda(resumo.despesas)}`,
    `Comissões estimadas: ${moeda(resumo.comissoes_estimadas)}`,
    `Resultado líquido: ${moeda(resumo.resultado_liquido)}`,
    "",
    ...agruparMovimentacoesPorDia(
      movimentacoes,
    ).flatMap(
      (dia) => {
        const resultado =
          dia.faturamento -
          dia.despesas -
          dia.comissoes;

        return [
          `*${dataBR(dia.data)}*`,
          `Atendimentos: ${dia.atendimentos.length}`,
          `Vendas: ${dia.produtos.length}`,
          `Faturado: ${moeda(dia.faturamento)}`,
          `Gastos: ${moeda(dia.despesas)}`,
          `Comissões: ${moeda(dia.comissoes)}`,
          `Resultado: ${moeda(resultado)}`,
          "",
        ];
      },
    ),
    "Gerado pelo BarberHub - Desenvolvido por Sigma Orbitek",
  ].join("\n");

  const url =
    `https://wa.me/?text=${encodeURIComponent(mensagem)}`;

  window.open(
    url,
    "_blank",
    "noopener,noreferrer",
  );
}
