// roteador.js

function planejarViagem(origem, destino, malha) {
  if (origem === destino) {
    return { erro: "Origem e destino são iguais." };
  }

  // 1. Mapeamento de nós e grafo de adjacência
  const adj = {}; // no -> [{ vizinho, peso, tipo, linhaId, estacao }]
  const estacaoParaNos = {}; // nomeEstacao -> [nos]
  const linhasInfo = {};

  malha.linhas.forEach((linha) => {
    linhasInfo[linha.id] = linha;

    linha.estacoes.forEach((estacao, idx) => {
      const noAtual = `${estacao}__${linha.id}`;

      if (!adj[noAtual]) adj[noAtual] = [];
      if (!estacaoParaNos[estacao]) estacaoParaNos[estacao] = [];
      estacaoParaNos[estacao].push({ no: noAtual, linhaId: linha.id });

      // Conecta com a estação anterior na mesma linha
      if (idx > 0) {
        const noAnterior = `${linha.estacoes[idx - 1]}__${linha.id}`;
        adj[noAtual].push({
          para: noAnterior,
          peso: 1, // custo baixo para seguir na mesma linha
          tipo: "TRECHO",
          linhaId: linha.id,
          estacao: linha.estacoes[idx - 1],
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

  // Conecta baldeações (mesma estação física, linhas diferentes)
  Object.keys(estacaoParaNos).forEach((estacao) => {
    const nos = estacaoParaNos[estacao];
    if (nos.length > 1) {
      for (let i = 0; i < nos.length; i++) {
        for (let j = 0; j < nos.length; j++) {
          if (i !== j) {
            adj[nos[i].no].push({
              para: nos[j].no,
              peso: 15, // penalidade alta: prefere viajar mais a trocar de trem
              tipo: "BALDEACAO",
              linhaId: nos[j].linhaId,
              estacao: estacao,
            });
          }
        }
      }
    }
  });

  const nosOrigem = estacaoParaNos[origem];
  const nosDestino = estacaoParaNos[destino];

  if (!nosOrigem || !nosDestino) {
    return { erro: "Estação de origem ou destino não encontrada na base." };
  }

  // 2. Busca pelo menor custo (Dijkstra)
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
    if (estacaoAtual === destino) break;

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

  // Identifica o melhor nó de chegada no destino
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

  // 3. Reconstrói o caminho completo
  const caminhoNos = [];
  let atual = melhorNoDestino;
  while (atual) {
    caminhoNos.unshift(atual);
    atual = anterior[atual] ? anterior[atual].de : null;
  }

  // 4. Formata apenas as instruções essenciais de bordo
  const instrucoes = [];
  const [estOrigem, lInicial] = caminhoNos[0].split("__");

  instrucoes.push({
    acao: "EMBARQUE",
    estacao: estOrigem,
    linha: linhasInfo[lInicial].nome,
    corLinha: linhasInfo[lInicial].cor,
  });

  for (let i = 1; i < caminhoNos.length; i++) {
    const [estAnterior, linhaAnt] = caminhoNos[i - 1].split("__");
    const [estAtual, linhaNova] = caminhoNos[i].split("__");

    if (linhaAnt !== linhaNova && estAnterior === estAtual) {
      instrucoes.push({
        acao: "BALDEACAO",
        estacao: estAtual,
        descerDaLinha: linhasInfo[linhaAnt].nome,
        pegarLinha: linhasInfo[linhaNova].nome,
        corLinha: linhasInfo[linhaNova].cor,
      });
    }
  }

  const [estFinal, lFinal] = caminhoNos[caminhoNos.length - 1].split("__");
  instrucoes.push({
    acao: "DESEMBARQUE",
    estacao: estFinal,
    linha: linhasInfo[lFinal].nome,
  });

  return {
    origem,
    destino,
    totalBaldeacoes: instrucoes.filter((i) => i.acao === "BALDEACAO").length,
    instrucoes,
  };
}