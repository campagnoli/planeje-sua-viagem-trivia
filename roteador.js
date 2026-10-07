// roteador.js

function planejarViagem(origem, destino, malha) {
  try {
    if (!origem || !destino) {
      return { erro: "Origem e destino devem ser informados." };
    }

    const origTrim = origem.trim();
    const destTrim = destino.trim();

    if (origTrim === destTrim) {
      return { erro: "Origem e destino são iguais." };
    }

    const adj = {};
    const estacaoParaNos = {};
    const linhasInfo = {};

    malha.linhas.forEach((linha) => {
      linhasInfo[linha.id] = linha;

      linha.estacoes.forEach((estacaoRaw, idx) => {
        const estacao = estacaoRaw.trim();
        const noAtual = `${estacao}__${linha.id}`;

        if (!adj[noAtual]) adj[noAtual] = [];
        if (!estacaoParaNos[estacao]) estacaoParaNos[estacao] = [];
        estacaoParaNos[estacao].push({ no: noAtual, linhaId: linha.id });

        if (idx > 0) {
          const estAnterior = linha.estacoes[idx - 1].trim();
          const noAnterior = `${estAnterior}__${linha.id}`;
          adj[noAtual].push({
            para: noAnterior,
            peso: 1,
            tipo: "TRECHO",
            linhaId: linha.id,
            estacao: estAnterior,
          });
          adj[noAnterior].push({
            para: noAtual,
            peso: 1,
            tipo: "TRECHO",
            linhaId: linha.id,
            estacao: estacao,
          });
        }
      });
    });

    // Baldeações automáticas entre estações de mesmo nome
    Object.keys(estacaoParaNos).forEach((estacao) => {
      const nos = estacaoParaNos[estacao];
      if (nos.length > 1) {
        for (let i = 0; i < nos.length; i++) {
          for (let j = 0; j < nos.length; j++) {
            if (i !== j) {
              adj[nos[i].no].push({
                para: nos[j].no,
                peso: 25,
                tipo: "BALDEACAO",
                linhaId: nos[j].linhaId,
                estacao: estacao,
              });
            }
          }
        }
      }
    });

    // Conexão especial Consolação (L2) <-> Paulista (L4)
    function conectarEstacoesFisicas(est1, est2) {
      const nos1 = estacaoParaNos[est1] || [];
      const nos2 = estacaoParaNos[est2] || [];
      nos1.forEach((n1) => {
        nos2.forEach((n2) => {
          adj[n1.no].push({
            para: n2.no,
            peso: 25,
            tipo: "BALDEACAO",
            linhaId: n2.linhaId,
            estacao: `${est1} / ${est2}`,
          });
          adj[n2.no].push({
            para: n1.no,
            peso: 25,
            tipo: "BALDEACAO",
            linhaId: n1.linhaId,
            estacao: `${est2} / ${est1}`,
          });
        });
      });
    }
    conectarEstacoesFisicas("Consolação", "Paulista");

    const nosOrigem = estacaoParaNos[origTrim];
    const nosDestino = estacaoParaNos[destTrim];

    if (!nosOrigem || nosOrigem.length === 0) {
      return { erro: `Estação de origem "${origTrim}" não foi encontrada no mapa.` };
    }
    if (!nosDestino || nosDestino.length === 0) {
      return { erro: `Estação de destino "${destTrim}" não foi encontrada no mapa.` };
    }

    // Dijkstra
    const dist = {};
    const anterior = {};
    const visitados = new Set();
    const fila = [];

    nosOrigem.forEach(({ no }) => {
      dist[no] = 0;
      fila.push({ no, custo: 0 });
    });

    while (fila.length > 0) {
      fila.sort((a, b) => a.custo - b.custo);
      const { no: u } = fila.shift();

      if (visitados.has(u)) continue;
      visitados.add(u);

      const [estacaoAtual] = u.split("__");
      if (estacaoAtual === destTrim) break;

      (adj[u] || []).forEach((aresta) => {
        const v = aresta.para;
        const novoCusto = dist[u] + aresta.peso;

        if (dist[v] === undefined || novoCusto < dist[v]) {
          dist[v] = novoCusto;
          anterior[v] = { de: u, aresta };
          fila.push({ no: v, custo: novoCusto });
        }
      });
    }

    let melhorNoDestino = null;
    let menorCusto = Infinity;

    nosDestino.forEach(({ no }) => {
      if (dist[no] !== undefined && dist[no] < menorCusto) {
        menorCusto = dist[no];
        melhorNoDestino = no;
      }
    });

    if (!melhorNoDestino) {
      return { erro: "Não foi possível traçar uma rota entre as estações selecionadas." };
    }

    // Reconstrói o caminho
    const caminhoNos = [];
    let atual = melhorNoDestino;
    while (atual) {
      caminhoNos.unshift(atual);
      atual = anterior[atual] ? anterior[atual].de : null;
    }

    function obterSentido(linhaId, estOrigem, estProx) {
      if (!linhasInfo[linhaId] || !estOrigem || !estProx) return "";
      const ests = linhasInfo[linhaId].estacoes;
      const idxOrig = ests.indexOf(estOrigem);
      const idxP = ests.indexOf(estProx);
      if (idxOrig === -1 || idxP === -1) return "";
      return idxP > idxOrig ? ests[ests.length - 1] : ests[0];
    }

    const instrucoes = [];
    let paradasTrechoAtual = 0;

    const [estInicial, lInicial] = caminhoNos[0].split("__");
    let sentidoInicial = "";
    for (let i = 1; i < caminhoNos.length; i++) {
      const [e, l] = caminhoNos[i].split("__");
      if (l === lInicial && e !== estInicial) {
        sentidoInicial = obterSentido(lInicial, estInicial, e);
        break;
      }
    }

    instrucoes.push({
      acao: "EMBARQUE",
      estacao: estInicial,
      linha: (linhasInfo[lInicial] && linhasInfo[lInicial].nome) || lInicial,
      corLinha: (linhasInfo[lInicial] && linhasInfo[lInicial].cor) || "#333",
      sentido: sentidoInicial,
    });

    for (let i = 1; i < caminhoNos.length; i++) {
      const [estAnt, linhaAnt] = caminhoNos[i - 1].split("__");
      const [estAtu, linhaAtu] = caminhoNos[i].split("__");

      if (linhaAnt === linhaAtu) {
        paradasTrechoAtual++;
      } else {
        let sentidoNovo = "";
        for (let j = i + 1; j < caminhoNos.length; j++) {
          const [eSeg, lSeg] = caminhoNos[j].split("__");
          if (lSeg === linhaAtu && eSeg !== estAtu) {
            sentidoNovo = obterSentido(linhaAtu, estAtu, eSeg);
            break;
          }
        }

        instrucoes.push({
          acao: "BALDEACAO",
          estacao: estAnt === estAtu ? estAtu : `${estAnt} / ${estAtu}`,
          descerDaLinha: (linhasInfo[linhaAnt] && linhasInfo[linhaAnt].nome) || linhaAnt,
          pegarLinha: (linhasInfo[linhaAtu] && linhasInfo[linhaAtu].nome) || linhaAtu,
          corLinha: (linhasInfo[linhaAtu] && linhasInfo[linhaAtu].cor) || "#333",
          sentido: sentidoNovo,
          estacoesPercorridasTrechoAnterior: paradasTrechoAtual,
        });

        paradasTrechoAtual = 0;
      }
    }

    const [estFinal, lFinal] = caminhoNos[caminhoNos.length - 1].split("__");
    instrucoes.push({
      acao: "DESEMBARQUE",
      estacao: estFinal,
      linha: (linhasInfo[lFinal] && linhasInfo[lFinal].nome) || lFinal,
      estacoesPercorridasTrechoAnterior: paradasTrechoAtual,
    });

    return {
      origem: origTrim,
      destino: destTrim,
      totalBaldeacoes: instrucoes.filter((i) => i.acao === "BALDEACAO").length,
      instrucoes,
    };
  } catch (err) {
    console.error("Erro interno no roteador:", err);
    return { erro: "Ocorreu um erro ao calcular o roteiro: " + err.message };
  }
}
