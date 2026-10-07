// roteador.js

function planejarViagem(origem, destino, malha) {
  if (!origem || !destino) {
    return { erro: "Origem e destino devem ser informados." };
  }

  if (origem === destino) {
    return { erro: "Origem e destino são iguais." };
  }

  // 1. Mapeamento de nós e grafo de adjacência
  const adj = {}; // no -> [{ para, peso, tipo, linhaId, estacao }]
  const estacaoParaNos = {}; // nomeEstacao -> [{ no, linhaId }]
  const linhasInfo = {};

  malha.linhas.forEach((linha) => {
    linhasInfo[linha.id] = linha;

    linha.estacoes.forEach((estacao, idx) => {
      const noAtual = `${estacao}__${linha.id}`;

      if (!adj[noAtual]) adj[noAtual] = [];
      if (!estacaoParaNos[estacao]) estacaoParaNos[estacao] = [];
      estacaoParaNos[estacao].push({ no: noAtual, linhaId: linha.id });

      // Conexão bidirecional entre estações vizinhas na mesma linha
      if (idx > 0) {
        const noAnterior = `${linha.estacoes[idx - 1]}__${linha.id}`;
        adj[noAtual].push({
          para: noAnterior,
          peso: 1, // custo 1 por estação percorrida
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

  // 2. Baldeações na mesma estação (nomes idênticos em linhas diferentes)
  Object.keys(estacaoParaNos).forEach((estacao) => {
    const nos = estacaoParaNos[estacao];
    if (nos.length > 1) {
      for (let i = 0; i < nos.length; i++) {
        for (let j = 0; j < nos.length; j++) {
          if (i !== j) {
            adj[nos[i].no].push({
              para: nos[j].no,
              peso: 20, // penalidade alta: prioriza ficar no trem a trocar de linha
              tipo: "BALDEACAO",
              linhaId: nos[j].linhaId,
              estacao: estacao,
            });
          }
        }
      }
    }
  });

  // 3. Conexões especiais entre estações físicas unificadas com nomes distintos
  function conectarEstacoesFisicas(est1, est2) {
    const nos1 = estacaoParaNos[est1] || [];
    const nos2 = estacaoParaNos[est2] || [];
    nos1.forEach((n1) => {
      nos2.forEach((n2) => {
        adj[n1.no].push({
          para: n2.no,
          peso: 20,
          tipo: "BALDEACAO",
          linhaId: n2.linhaId,
          estacao: `${est1} / ${est2}`,
        });
        adj[n2.no].push({
          para: n1.no,
          peso: 20,
          tipo: "BALDEACAO",
          linhaId: n1.linhaId,
          estacao: `${est2} / ${est1}`,
        });
      });
    });
  }

  // Integração Linha 2 (Consolação) <-> Linha 4 (Paulista)
  conectarEstacoesFisicas("Consolação", "Paulista");

  const nosOrigem = estacaoParaNos[origem];
  const nosDestino = estacaoParaNos[destino];

  if (!nosOrigem || !nosDestino) {
    return { erro: "Estação de origem ou destino não encontrada na base." };
  }

  // 4. Busca do caminho de menor custo (Dijkstra)
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
