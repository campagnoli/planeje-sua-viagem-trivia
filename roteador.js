// roteador.js

function planejarViagem(origem, destino, malha) {
  if (!origem || !destino) return { erro: "Origem e destino devem ser selecionados." };

  // Normalização para comparar nomes com hifens/espaços sem falhar
  const padronizar = (txt) =>
    txt.trim().toLowerCase().replace(/[\s\-_]+/g, "");

  const normOrigem = padronizar(origem);
  const normDestino = padronizar(destino);

  if (normOrigem === normDestino) return { erro: "Origem e destino são iguais." };

  const adj = {};
  const estacaoNormParaNos = {};
  const linhasInfo = {};

  malha.linhas.forEach((linha) => {
    linhasInfo[linha.id] = linha;

    linha.estacoes.forEach((estacaoRaw, idx) => {
      const estNorm = padronizar(estacaoRaw);
      const noAtual = `${estNorm}__${linha.id}`;

      if (!adj[noAtual]) adj[noAtual] = [];
      if (!estacaoNormParaNos[estNorm]) estacaoNormParaNos[estNorm] = [];

      estacaoNormParaNos[estNorm].push({
        no: noAtual,
        linhaId: linha.id,
        nomeOriginal: estacaoRaw.trim(),
      });

      if (idx > 0) {
        const estAntNorm = padronizar(linha.estacoes[idx - 1]);
        const noAnterior = `${estAntNorm}__${linha.id}`;

        adj[noAtual].push({
          para: noAnterior,
          peso: 1,
          tipo: "TRECHO",
          linhaId: linha.id,
          estacaoOriginal: linha.estacoes[idx - 1].trim(),
        });
        adj[noAnterior].push({
          para: noAtual,
          peso: 1,
          tipo: "TRECHO",
          linhaId: linha.id,
          estacaoOriginal: estacaoRaw.trim(),
        });
      }
    });
  });

  // Baldeações gratuitas na mesma estação física (peso 60 para evitar trocas bobas)
  Object.keys(estacaoNormParaNos).forEach((normKey) => {
    const nos = estacaoNormParaNos[normKey];
    if (nos.length > 1) {
      for (let i = 0; i < nos.length; i++) {
        for (let j = 0; j < nos.length; j++) {
          if (i !== j) {
            adj[nos[i].no].push({
              para: nos[j].no,
              peso: 60,
              tipo: "BALDEACAO",
              linhaId: nos[j].linhaId,
              estacaoOriginal: nos[j].nomeOriginal,
            });
          }
        }
      }
    }
  });

  // Conexão integrada Consolação <-> Paulista
  function conectarEstacoesFisicas(nome1, nome2) {
    const nos1 = estacaoNormParaNos[padronizar(nome1)] || [];
    const nos2 = estacaoNormParaNos[padronizar(nome2)] || [];
    nos1.forEach((n1) => {
      nos2.forEach((n2) => {
        adj[n1.no].push({
          para: n2.no,
          peso: 60,
          tipo: "BALDEACAO",
          linhaId: n2.linhaId,
          estacaoOriginal: n2.nomeOriginal,
        });
        adj[n2.no].push({
          para: n1.no,
          peso: 60,
          tipo: "BALDEACAO",
          linhaId: n1.linhaId,
          estacaoOriginal: n1.nomeOriginal,
        });
      });
    });
  }
  conectarEstacoesFisicas("Consolação", "Paulista");

  const nosOrigem = estacaoNormParaNos[normOrigem];
  const nosDestino = estacaoNormParaNos[normDestino];

  if (!nosOrigem || !nosDestino) {
    return { erro: "Estação não localizada na malha cadastrada." };
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

    const [estNormAtual] = u.split("__");
    if (estNormAtual === normDestino) break;

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
    return { erro: "Não foi possível traçar uma rota entre essas estações." };
  }

  const caminhoNos = [];
  let atual = melhorNoDestino;
  while (atual) {
    caminhoNos.unshift(atual);
    atual = anterior[atual] ? anterior[atual].de : null;
  }

  // Função para determinar o sentido correto do trem
  function obterSentido(linhaId, estNormOrigem, estNormProxima) {
    const linha = linhasInfo[linhaId];
    if (!linha) return "";
    const estsNorm = linha.estacoes.map(padronizar);
    const idxOrig = estsNorm.indexOf(estNormOrigem);
    const idxProx = estsNorm.indexOf(estNormProxima);
    if (idxOrig === -1 || idxProx === -1) return "";
    return idxProx > idxOrig
      ? linha.estacoes[linha.estacoes.length - 1]
      : linha.estacoes[0];
  }

  const instrucoes = [];
  const [estNormInicio, lInicial] = caminhoNos[0].split("__");
  const estInicialOriginal = linhasInfo[lInicial].estacoes.find(
    (e) => padronizar(e) === estNormInicio
  ) || origem;

  let sentidoInicial = "";
  for (let i = 1; i < caminhoNos.length; i++) {
    const [eNorm, l] = caminhoNos[i].split("__");
    if (l === lInicial && eNorm !== estNormInicio) {
      sentidoInicial = obterSentido(lInicial, estNormInicio, eNorm);
      break;
    }
  }

  instrucoes.push({
    acao: "EMBARQUE",
    estacao: estInicialOriginal,
    linha: linhasInfo[lInicial].nome,
    corLinha: linhasInfo[lInicial].cor,
    sentido: sentidoInicial,
  });

  for (let i = 1; i < caminhoNos.length; i++) {
    const [estAntNorm, linhaAnt] = caminhoNos[i - 1].split("__");
    const [estAtuNorm, linhaAtu] = caminhoNos[i].split("__");

    if (linhaAnt !== linhaAtu) {
      const estTransfOriginal =
        linhasInfo[linhaAnt].estacoes.find((e) => padronizar(e) === estAtuNorm) ||
        linhasInfo[linhaAtu].estacoes.find((e) => padronizar(e) === estAtuNorm) ||
        "";

      let sentidoNovo = "";
      for (let j = i + 1; j < caminhoNos.length; j++) {
        const [eSegNorm, lSeg] = caminhoNos[j].split("__");
        if (lSeg === linhaAtu && eSegNorm !== estAtuNorm) {
          sentidoNovo = obterSentido(linhaAtu, estAtuNorm, eSegNorm);
          break;
        }
      }

      instrucoes.push({
        acao: "BALDEACAO",
        estacao: estTransfOriginal,
        descerDaLinha: linhasInfo[linhaAnt].nome,
        pegarLinha: linhasInfo[linhaAtu].nome,
        corLinha: linhasInfo[linhaAtu].cor,
        sentido: sentidoNovo,
      });
    }
  }

  const [estFinalNorm, lFinal] = caminhoNos[caminhoNos.length - 1].split("__");
  const estFinalOriginal = linhasInfo[lFinal].estacoes.find(
    (e) => padronizar(e) === estFinalNorm
  ) || destino;

  instrucoes.push({
    acao: "DESEMBARQUE",
    estacao: estFinalOriginal,
    linha: linhasInfo[lFinal].nome,
    corLinha: linhasInfo[lFinal].cor,
  });

  return {
    origem,
    destino,
    totalBaldeacoes: instrucoes.filter((i) => i.acao === "BALDEACAO").length,
    instrucoes,
  };
}
