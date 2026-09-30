/**
 * Todo texto que o jogo escreve, num lugar só (spec v2 §19.15): avisos, rótulos, prelúdio, ata, vereditos,
 * explicações de contradição e os moldes de fala do jogador. Revisado com o skill humanizer antes de cada
 * commit que o altere. O que vem do modelo (plain, gist, teses, glossário) não passa por aqui: lá manda a
 * fidelidade ao que foi dito.
 *
 * Regras da casa (decisão do autor em 2026-09-13): nada em caixa alta, nenhum ponto e vírgula, nenhum
 * separador "·" e nenhuma seta em unicode. Ícones são SVG nos componentes.
 */

const lc = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)
const strip = (s: string) => s.trim().replace(/[.!]$/, '')

export const copy = {
  home: {
    eyebrow: 'Ideias em Rede, do Instituto Kunumi',
    /** o texto alternativo do símbolo do Instituto Kunumi, que abre a tela inicial acima do crédito */
    brand: 'Instituto Kunumi',
    /** o nome do jogo (2026-09-15): "Don't Leave It Uai-Tchê", um trocadilho com "white" e as interjeições mineira e gaúcha.
     *  O caderno em branco é o que se quer evitar: sem anotar, não há argumento nem senso crítico. */
    title: "Don't Leave It",
    titleMark: 'Uai-Tchê',
    /** a marca pisca entre o trocadilho e a palavra que ele imita */
    titleMarkAlt: 'White',
    subtitle: 'Simulador de audiências públicas',
    lead:
      'Você participa de uma audiência real da Câmara dos Deputados, resumida aos seus momentos mais importantes. No debate, seu objetivo é escolher uma ideia e sustentá-la com coerência, sem cair em contradição. Para isso, fique atento ao que os outros dizem e registre o que for relevante, pois é usando essas falas que você vai concordar ou contestar os argumentos da sala. Para facilitar o entendimento, o texto foi simplificado, mas a fala original continua à disposição a um clique. Lembre-se: caderno em branco, opinião em branco.',
    loading: 'Procurando as audiências preparadas.',
    none: 'Nenhuma audiência preparada. Gere uma com o build_scene.py.',
    entry: (id: number, date: string | null) => `Audiência ${id}${date ? `, ${date}` : ''}`,
    stats: (cast: number, falas: number, cards: number) => `${cast} pessoas na sala, ${falas} falas e ${cards} trechos`,
    teses: (n: number) => `${n} ideias para defender`,
    foot:
      'Os dados vêm do PublicHearingBR (Unicamp) e das transcrições oficiais da Câmara dos Deputados. As audiências são processadas por um modelo de linguagem que simplifica as falas, mantendo cada trecho sempre vinculado à sentença de origem para fácil verificação.',
    play: 'Jogar',
  },

  /** a tela nova de escolha da audiência (redesenho de 2026-09-14): mestre e detalhe sobre o acervo inteiro */
  catalog: {
    back: 'início',
    title: 'Escolha a audiência',
    count: (n: number) => `${n} audiências do acervo PublicHearingBR`,
    search: 'buscar por tema, comissão ou data',
    committee: 'comissão',
    allCommittees: 'todas',
    year: 'ano',
    allYears: 'todos',
    /** filtro temporário (2026-09-15): separa as audiências já preparadas das que ainda não foram processadas. Sai quando as 206 estiverem prontas */
    status: 'situação',
    allStatus: 'todas',
    statusReady: 'prontas para jogar',
    statusPending: 'em preparação',
    showing: (n: number, total: number) => `Mostrando ${n} de ${total}`,
    newest: 'mais recentes primeiro',
    oldest: 'mais antigas primeiro',
    row: (id: number) => `audiência ${id}`,
    heading: (id: number) => `Audiência ${id}`,
    pick: 'Escolha uma audiência na lista',
    enter: 'Entrar na sala',
    inRoom: 'na sala:',
    falas: 'falas e trechos:',
    ideas: 'ideias para defender:',
    transcript: 'transcrição',
    people: (n: number) => `${n} pessoas`,
    falasCards: (f: number, c: number) => `${f} falas e ${c} trechos`,
    words: (w: number) => `${w.toLocaleString('pt-BR')} palavras`,
    preparing: 'Esta audiência ainda está em preparação e não abre a sala.',
    noCommittee: 'comissão não identificada',
    none: 'Nenhuma audiência com esse recorte.',
    loading: 'Lendo o acervo.',
    note: 'A leitura de cada audiência é feita uma vez por um modelo de linguagem, e cada trecho fica preso à sentença de origem para poder ser conferido.',
  },

  tese: {
    back: 'audiências',
    eyebrow: (date: string | null, seed: number) => `Audiência pública${date ? ` de ${date}` : ''}, semente ${seed}`,
    /** identificação da audiência no cabeçalho do dossiê */
    heading: (id: number, date: string | null) => `Audiência ${id}${date ? `, ${date}` : ''}`,
    question: 'A pergunta da sessão',
    /** posição na tira de ideias */
    which: (n: number, total: number) => `Ideia ${n} de ${total}`,
    appears: (n: number) => (n === 1 ? 'apareceu 1 vez na audiência' : `apareceu ${n} vezes na audiência`),
    said: 'Dito na sala',
    saidBy: (name: string, byline: string | null) => (byline ? `${name}, ${byline}` : name),
    prev: 'ideia anterior',
    next: 'próxima ideia',
    defend: 'Defender esta ideia',
    stakes: 'O que estava em jogo',
    choose: 'Escolha a ideia que vai defender',
    lead: 'Você vai ocupar uma cadeira que a audiência não teve. Não tem nome nem partido. Anota o que ouve e, na sua vez, sustenta ou contesta o que as pessoas reais disseram. O placar mede uma coisa só: se você foi coerente com a ideia que escolheu.',
    defenders: 'Quem defendeu isso na sala',
    opponents: 'Quem discordou',
    nobody: 'ninguém que tenha falado',
    choosing: 'Escolher',
    rule: 'Você pode defender qualquer uma. O jogo não julga a sua tese. Julga se você foi coerente com ela.',
    guided: 'Modo guiado',
    guidedHint: 'Mostra, em cada carta e em cada balão, de que lado da sua ideia a fala está. É um apoio de acessibilidade, e fica registrado na ata.',
    dataNote: 'Anotação por modelo de linguagem, com cada trecho referido à sentença de origem. Ninguém nomeado diz aqui uma palavra que não tenha dito.',
  },

  prelude: {
    kicker: 'Audiência pública',
    date: (date: string | null) => `Audiência pública${date ? ` de ${date}` : ''}`,
    skip: 'Enter pula',
  },

  hud: {
    desk: 'caderno',
    room: 'voltar à sala',
    interject: 'aparte',
    treplica: 'tréplica',
    auto: 'auto',
    manual: 'manual',
    autoTitle: 'as falas avançam sozinhas (P alterna)',
    manualTitle: 'você avança com Espaço (P alterna)',
    /** o que o balão digita primeiro: a versão simples ou o original (V alterna); a outra fica a um clique */
    plainMode: 'simples',
    verbatimMode: 'original',
    plainModeTitle: 'o balão digita a versão em palavras simples, com o original a um clique (V alterna)',
    verbatimModeTitle: 'o balão digita o texto original, com a versão simples a um clique (V alterna)',
    muted: 'mudo',
    sound: 'som',
    help: 'ajuda',
    glossary: 'glossário',
    continue: 'continuar',
    speed: (x: number) => `${String(x).replace('.', ',')}×`,
    attentionLow: 'atenção baixa: olhe para quem fala',
  },

  meters: {
    conviction: 'coerência',
    attention: 'atenção',
    mesa: 'mesa',
    hand: 'caderno',
  },

  balloon: {
    originalLabel: 'texto original',
    plainLabel: 'palavras simples',
    seeOriginal: 'ver o que foi dito',
    seePlain: 'ver em palavras simples',
    back: 'voltar',
    note: 'Anotar',
    noteQuestion: 'Anotar pergunta',
    noted: 'anotado',
    you: 'Você, da cadeira vaga',
    room: 'Sala',
    mesaAct: 'ato da mesa',
    mesa: 'Mesa',
    retomada: 'retomada',
    source: 'Fonte',
    palmas: (n: number) => (n > 1 ? `(Palmas ×${n})` : '(Palmas)'),
    pages: (i: number, n: number) => `página ${i} de ${n}`,
  },

  desk: {
    title: 'Caderno',
    cards: (n: number) => `${n} ${n === 1 ? 'anotação' : 'anotações'}`,
    empty: 'Nada anotado. Enquanto alguém fala, o botão Anotar (ou a tecla N) guarda o trecho aqui.',
    youDefend: 'Você defende',
    thread: 'Fio do debate',
    threadEmpty: 'A sessão ainda não começou a se cruzar.',
    questions: 'Perguntas em aberto',
    questionsEmpty: 'Nenhuma pergunta sem resposta até agora.',
    you: 'Você',
    hold: 'Tab ou Esc volta à sala',
  },

  floor: {
    title: 'A palavra é sua',
    interject: 'Aparte',
    counter: (n: number, total: number) => `${n} de ${total} nesta vez`,
    empty: 'Seu caderno está vazio. Devolva a palavra e anote na próxima fala.',
    step1: 'O que você vai fazer?',
    sustento: 'Sustentar',
    contesto: 'Contestar',
    cobro: 'Cobrar',
    moveHint: {
      sustento: 'concordar com o que alguém disse',
      contesto: 'discordar do que alguém disse',
      cobro: 'repetir uma pergunta que ficou sem resposta',
    } as Record<'sustento' | 'contesto' | 'cobro', string>,
    pickFor: {
      sustento: 'Escolha no caderno a anotação que você vai sustentar.',
      contesto: 'Escolha no caderno a anotação que você vai contestar.',
      cobro: 'Escolha no caderno a pergunta que você vai cobrar.',
    } as Record<'sustento' | 'contesto' | 'cobro', string>,
    pickMove: 'Você escolheu uma anotação. Agora diga o que vai fazer com ela: sustentar ou contestar.',
    pickAny: 'Escolha o que vai fazer, ou clique direto numa anotação do caderno.',
    noneFor: {
      sustento: 'Nenhuma afirmação anotada. Só perguntas.',
      contesto: 'Nenhuma afirmação anotada. Só perguntas.',
      cobro: 'Nenhuma pergunta anotada. Só afirmações.',
    } as Record<'sustento' | 'contesto' | 'cobro', string>,
    chosen: {
      sustento: 'Você sustenta',
      contesto: 'Você contesta',
      cobro: 'Você cobra',
    } as Record<'sustento' | 'contesto' | 'cobro', string>,
    cited: 'Você cita',
    chosenNoMove: 'Você escolheu',
    citeRole: (name: string) => `${name} entra na frase como quem discorda.`,
    citeTitle: 'Citar alguém que disse o contrário (opcional)',
    citeHint: 'Clique numa anotação do mesmo tema que discorde dela, ou numa que respondeu a ela na audiência, de qualquer tema. Se for a pessoa que de fato respondeu, a réplica vale mais.',
    citeNone: 'Nenhuma anotação do caderno é do mesmo tema nem respondeu a esta na audiência. Você pode contestar sem citar.',
    /** a carta candidata a citação vem de outro tema: só o grafo a autoriza */
    citeCross: 'respondeu a esta na audiência',
    remove: 'tirar',
    removeCite: 'tirar a citação',
    /** a trilha é clicável: dá para voltar e escolher outro movimento */
    backToStep: (label: string) => `voltar para ${label}`,
    steps: { move: 'o movimento', pick: 'a anotação', cite: 'a citação', citeIf: 'a citação, se contestar' },
    unlockMove: 'Escolha um movimento para liberar o botão Falar.',
    unlockPick: 'Escolha uma anotação para liberar o botão Falar.',
    canCite: 'Pode falar assim, ou citar alguém que disse o contrário no passo 3.',
    ready: 'Falar diz a frase da prévia.',
    preview: 'Você vai dizer',
    speak: 'Falar',
    yield: 'Devolver a palavra',
    kinds: { claim: 'afirmação', pergunta: 'pergunta' } as Record<'claim' | 'pergunta', string>,
    sideLabel: { favoravel: 'a favor', contrario: 'contra', condicional: 'com ressalvas', neutro: 'sem lado' } as Record<string, string>,
    ally: ', do lado da sua tese',
    foe: ', do lado contrário',
    /** o que o modo guiado escreve depois do lado, por alinhamento (ressalva e fora não ganham sufixo) */
    alignSuffix: {
      aliada: ', do lado da sua tese',
      adversaria: ', do lado contrário',
      evidencia: ', e o dado pesa do seu lado',
      contraevidencia: ', e o dado pesa contra você',
    } as Record<string, string>,
  },

  verdict: {
    meter: 'coerência',
    short: (kind: string): string =>
      ({
        coerente: 'Coerente com a sua tese',
        contradicao: 'Você se contradisse',
        certeiro: 'Réplica certeira',
        neutro: 'Sua tese não toma lado nisso',
        consenso: 'Isso é consenso na sala',
        ja_respondida: 'Pergunta já respondida',
        par_invalido: 'Par sem discordância',
        repetida: 'Você já usou essa carta',
      })[kind] ?? kind,
  },

  explain: {
    repetida: 'Você já tinha usado essa anotação.',
    neutro: 'Sua tese não toma lado nesse tema.',
    alemDoBloco: 'Você sustentou alguém de fora do bloco que mais defendeu a sua tese.',
    consenso: (note: string | null) => note ?? 'Papéis diferentes concordaram nisso na sala.',
    consensoContestado: (note: string | null) => (note ? `Você contestou algo em que papéis diferentes concordaram: ${lc(note)}` : 'Você contestou algo em que papéis diferentes concordaram.'),
    sustentoAdversaria: (statement: string, name: string, side: string) =>
      `Você defende que ${lc(strip(statement))}. Mas, nesse ponto, ${name} está do outro lado: ${lc(side)}`,
    contestoAliada: (statement: string, name: string, side: string) =>
      `Você defende que ${lc(strip(statement))}. E ${name} está do seu lado nesse ponto: ${lc(side)}`,
    cobroContra: (statement: string, side: string) =>
      `Você defende que ${lc(strip(statement))}. Essa pergunta pressiona o outro lado: ${lc(side)}`,
    certeiro: (nameB: string, name: string, note?: string | null) => `Foi exatamente isso que ${nameB} respondeu a ${name}.${note ? ` ${strip(note)}.` : ''}`,
    parInvalido: (nameB: string, name: string) => `${nameB} não discorda de ${name} nesse ponto.`,
    jaRespondida: (name: string) => `${name} respondeu isso há pouco.`,
    /** carta que apoia com ressalvas num tema em que a tese toma lado: movimento honesto, sem contradição */
    ressalva: (name: string, move: 'sustento' | 'contesto') =>
      move === 'sustento' ? `${name} apoia com ressalvas. Sustentar uma ressalva não contradiz a sua tese.` : `${name} apoia com ressalvas. Contestar uma ressalva não contradiz a sua tese.`,
    /** carta neutra que o grafo liga a uma carta do lado da tese (ou do outro lado) */
    evidencia: (name: string, other: string, note: string) => `${name} só registra um dado, mas ele pesa do seu lado, junto com ${other}: ${lc(strip(note))}.`,
    contraevidencia: (name: string, other: string, note: string) => `${name} só registra um dado, mas ele pesa contra a sua tese, junto com ${other}: ${lc(strip(note))}.`,
    contestoEvidencia: (name: string, other: string, note: string) => `${name} só registra um dado, e ele pesava do seu lado, junto com ${other}: ${lc(strip(note))}.`,
    contestoContraevidencia: (name: string, other: string, note: string) => `${name} só registra um dado, e ele pesava contra a sua tese, junto com ${other}: ${lc(strip(note))}.`,
  },

  relcard: {
    /** a relação anotada apontava a fala inteira, não este trecho */
    anchorFala: 'à fala inteira, não só a este trecho',
    tambemSustentou: (name: string) => `${name} também sustentou isso.`,
    concordaComVoce: 'Concorda com você',
    defende: (name: string) => `Defende ${name}`,
    /** a pessoa já foi lida por inteiro nesta sessão: o cartão lembra o ponto em vez de repetir a frase */
    mantem: (name: string, gist: string) => `${name} mantém o que já disse: que ${gist}.`,
    mantemNote: (name: string, note: string) => `${name} mantém o que já disse. ${note}`,
    jaRespondeu: (name: string, gist: string) => `${name} já respondeu a isso: que ${gist}.`,
    jaRespondeuNote: (name: string) => `${name} já respondeu a isso há pouco.`,
  },

  rel: {
    apoia: 'Apoia',
    responde: 'Responde a',
    contradiz: 'Contradiz',
    consenso: 'Consenso',
    defende: 'Defende',
    concorda: 'Concorda com você',
    cobra: 'Cobra',
    you: 'você',
  } as Record<string, string>,

  mesa: {
    concede: 'A presidência concede a palavra à cadeira vaga.',
    concedeBreve: 'A presidência concede a palavra à cadeira vaga e pede brevidade.',
    aparte: 'A presidência concede um aparte. Um movimento.',
    devolve: 'Você devolve a palavra.',
    encerrada: 'A sessão está encerrada.',
    presidencia: 'a presidência da Comissão',
  },

  notices: {
    semAtencao: 'Você não estava prestando atenção.',
    cadernoCheio: 'O caderno está cheio.',
    apartesEsgotados: 'Você já pediu aparte duas vezes nesta sessão.',
    mesaSemPaciencia: 'A mesa não está para apartes agora.',
    aparteNegado: 'A presidência não concedeu o aparte.',
  },

  deltas: {
    salaRespondeu: 'a sala respondeu ao que você cobrou',
    aparteRecusado: 'aparte recusado',
  },

  thread: {
    respondidaDepois: 'respondida depois de você cobrar',
    palmas: (n: number) => (n > 1 ? `Palmas ×${n}` : 'Palmas'),
    veredito: (short: string, explanation: string | null) => (explanation ? `${short}. ${explanation}` : short),
  },

  say: {
    sustento: [
      'eu sustento o que disse {quem-}: que {gist}.',
      'concordo com {quem} quando diz que {gist}.',
      'quero reforçar o que {quem} disse aqui: que {gist}.',
    ],
    contesto: [
      'não concordo com {quem} quando diz que {gist}.',
      'discordo do que disse {quem-}: que {gist}.',
      '{quem} disse que {gist}. Não é assim que eu vejo.',
    ],
    contestoCito: [
      '{quem} disse que {gist}. Não concordo. Como lembrou {quemB} {gistB}.',
      'não concordo com {quem} quando diz que {gist}. Fico com {quemB-}: {gistB}.',
      '{quem} afirmou que {gist}. Mas {quemB} mostrou aqui que {gistB}.',
    ],
    cobro: [
      'quero repetir a pergunta de {quem} que ficou sem resposta: {plain}',
      'ninguém respondeu a {quem-}. Repito a pergunta: {plain}',
      'volto à pergunta de {quem} que ficou no ar: {plain}',
    ],
  },

  legend: {
    title: 'Legenda e ajuda',
    relations: 'Relações',
    apoia: 'defende a mesma posição',
    responde: 'responde a uma pergunta ou cobrança',
    contradiz: 'nega um fato ou uma conclusão',
    consenso: 'papéis diferentes concordam',
    verdicts: 'Vereditos',
    coerente: 'você foi coerente com a sua tese',
    contradicao: 'você se contradisse, e a explicação diz por quê',
    certeiro: 'citou quem de fato respondeu àquela pessoa, do mesmo tema ou não',
    roles: 'Cores',
    keys: 'Teclas',
    keyList: [
      ['arrastar', 'olhar em volta (a cena vai com o mouse)'],
      ['Q E', 'virar para quem fala'],
      ['Tab', 'caderno'],
      ['N', 'anotar o trecho atual'],
      ['O', 'ver o que foi dito, e voltar'],
      ['1 2 3', 'na sua vez: sustentar, contestar, cobrar'],
      ['C', 'na sua vez: tirar a carta citada'],
      ['T', 'tréplica, enquanto o botão aparece'],
      ['A', 'pedir aparte'],
      ['Enter', 'acelerar, falar, continuar'],
      ['Espaço', 'continuar (modo manual)'],
      ['Esc', 'fechar o que estiver aberto, ou completar a página'],
      ['P', 'automático ou manual'],
      ['V', 'balão em palavras simples ou no original'],
      ['+ −', 'velocidade'],
      ['M', 'som'],
      ['L G H', 'legenda, glossário, ajuda'],
    ] as [string, string][],
    close: 'fechar',
  },

  glossary: {
    title: 'Glossário',
    hint: 'Termos que apareceram na audiência, explicados. Na fala, eles ficam sublinhados.',
    close: 'fechar',
  },

  ata: {
    eyebrow: (date: string | null, seed: number) => `Ata da sessão simulada${date ? ` de ${date}` : ''}, semente ${seed}`,
    yourSession: 'A sua sessão',
    yourTese: 'Sua tese',
    inRoom: (defenders: string, opponents: string) => `Na sala, defenderam essa ideia: ${defenders}. Discordaram: ${opponents}.`,
    moves: 'Suas intervenções',
    noMoves: 'Você não usou a palavra.',
    turn: (n: number) => `vez ${n}`,
    interject: 'aparte',
    treplica: 'tréplica',
    roomDid: 'A sala:',
    finalConviction: 'Coerência final',
    startedAt: (v: number) => `começou em ${v}`,
    opened: (n: number, total: number) => `${n} dos ${total} trechos abertos no original`,
    mode: (auto: boolean, speed: string) => `partida ${auto ? 'automática' : 'manual'}, a ${speed}`,
    counts: (c: number, x: number, n: number) =>
      `${c} ${c === 1 ? 'intervenção coerente' : 'intervenções coerentes'}, ${x} ${x === 1 ? 'contradição' : 'contradições'} e ${n} ${n === 1 ? 'neutra' : 'neutras'}.`,
    checked: (n: number, total: number) => `Você abriu o texto original de ${n} dos ${total} trechos que ouviu.`,
    guided: 'Partida em modo guiado.',
    real: 'A audiência real',
    openQuestions: 'Perguntas em aberto',
    answeredBy: (name: string) => `respondida por ${name}`,
    unanswered: (role: string) => `ninguém de ${role} respondeu`,
    speakingTime: 'Quanto cada papel falou',
    words: (w: number) => `${w.toLocaleString('pt-BR')} palavras`,
    reactions: {
      contradiz: 'contradisse você',
      apoia: 'também sustentou isso',
      defende: 'defendeu',
      concorda: 'concordou com você',
      responde: 'já tinha respondido a isso',
    },
    press: 'O que a Agência Câmara noticiou',
    pressQuoted: (roles: string, covered: number, total: number) => `Papéis citados: ${roles}. Falas relatadas: ${covered} de ${total}.`,
    omitted: 'O que ficou de fora',
    verdictTitle: 'Veredito da ata',
    again: 'Jogar de novo com outra tese',
    sameSeed: 'Repetir a mesma semente',
    home: 'Voltar às audiências',
    original: 'ver o que foi dito',
    verdicts: {
      silent: 'Passou sem deixar marca: você não interveio.',
      coerente: 'Coerente do início ao fim.',
      contradicoes: (n: number) => (n === 1 ? 'Você se contradisse uma vez.' : `Você se contradisse ${n} vezes.`),
      alem: 'Citou além do seu bloco: sustentou pessoas de três papéis diferentes.',
      replica: 'Acertou a réplica certa.',
      cobrou: 'Cobrou o que ficou sem resposta na audiência real.',
      press: 'Sua tese entrou na matéria da Agência Câmara.',
      ata: 'Ficou na ata, fora da imprensa: o tema da sua tese não foi noticiado.',
    },
  },

  error: {
    title: (id: number) => `Não foi possível abrir a audiência ${id}.`,
    hint: 'Gere o arquivo com o build_scene.py e recarregue.',
    back: 'Voltar',
    preparing: 'Preparando a sala.',
  },
} as const
