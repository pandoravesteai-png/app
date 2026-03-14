export const dailyMessages = [
  {
    title: "✨ Seu guarda-roupa está te esperando!",
    body: "Que tal experimentar aquele look novo hoje? Sua transformação está a um clique de distância! 💜"
  },
  {
    title: "👗 Tempo de renovar o visual!",
    body: "Cada dia é uma nova chance de se reinventar. Experimente uma peça nova e surpreenda-se!"
  },
  {
    title: "🔥 Você está incrível, mas pode ficar AINDA MELHOR!",
    body: "Descubra looks que vão fazer você se sentir poderosa. Sua versão favorita de si mesma te aguarda!"
  },
  {
    title: "💫 Sua próxima roupa favorita está aqui!",
    body: "Não deixe para depois. Experimente agora e descubra o look que vai fazer você brilhar!"
  },
  {
    title: "🌟 Seu estilo merece evoluir!",
    body: "Que tal sair da zona de conforto? Teste novos estilos e descubra versões de você que nem imaginava!"
  },
  {
    title: "💃 Hora de arrasar!",
    body: "Sua autoestima está chamando! Experimente um look novo e sinta a diferença no seu dia."
  },
  {
    title: "✨ Você está a 30 segundos de um novo você!",
    body: "Não é mágica, é tecnologia! Experimente aquela peça que você estava de olho."
  }
];

export const lowCreditsMessages = [
  {
    title: "⚠️ Só restam {credits} crédito(s)!",
    body: "Não fique sem criar seus looks! Recarregue agora e continue sua jornada de transformação. 💜"
  },
  {
    title: "🚨 Seus créditos estão acabando!",
    body: "Você estava no meio de algo incrível... Não deixe a inspiração parar! Recarregue e continue."
  },
  {
    title: "💔 Quase sem créditos...",
    body: "Cada look não experimentado é uma oportunidade perdida. Recarregue e não perca mais nenhuma!"
  },
  {
    title: "⏰ Últimos créditos! Não perca tempo!",
    body: "Você estava criando looks incríveis! Não deixe isso parar agora. Recarregue em segundos!"
  },
  {
    title: "😢 Acabando... Mas você merece mais!",
    body: "Você merece experimentar TUDO que quer. Recarregue agora e libere seu potencial infinito!"
  }
];

export const getRandomDailyMessage = () => {
  const index = Math.floor(Math.random() * dailyMessages.length);
  return dailyMessages[index];
};

export const getRandomLowCreditsMessage = (credits: number) => {
  const index = Math.floor(Math.random() * lowCreditsMessages.length);
  const message = lowCreditsMessages[index];
  return {
    title: message.title.replace('{credits}', String(credits)),
    body: message.body
  };
};
