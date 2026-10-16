/**
 * Todo texto que o jogo escreve, num lugar só (spec v2 §19.15): avisos, rótulos, prelúdio, ata, vereditos,
 * explicações de contradição e os moldes de fala do jogador. Revisado com o skill humanizer antes de cada
 * commit que o altere. O que vem do modelo (plain, gist, teses, glossário) não passa por aqui: lá manda a
 * fidelidade ao que foi dito.
 *
 * Regras da casa (decisão do autor em 2026-09-13): nada em caixa alta, nenhum ponto e vírgula, nenhum
 * separador "·" e nenhuma seta em unicode. Ícones são SVG nos componentes.
 */

import type { KeyAction } from './lib/keys'

/** Uma tecla citada no tutorial: um atalho do mapa (escrito com a tecla atual) ou uma das teclas fixas. */
export type TutorialKey = KeyAction | 'Espaço' | 'Enter' | 'Esc' | 'setas'
/** Um item de teclas: sem `what`, a descrição vem de `copy.keys` ou das teclas fixas da legenda. */
export interface TutorialKeys {
  k: TutorialKey[]
  what?: string
}
export interface TutorialStep {
  id: string
  /** o capítulo do passo, escrito no alto do diálogo: o tutorial vai do que é o jogo ao que fazer em cada momento */
  part: string
  title: string
  text: string
  /** arquivo em public/tutorial/; null no último passo, que mostra a tabela de teclas */
  image: string | null
  alt: string
  keys?: TutorialKeys[]
}

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
    listLabel: 'Audiências',
    listKeys: 'Use as setas para cima e para baixo para escolher. Enter entra na sala.',
    preparingShort: 'em preparação',
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
    advanceGroup: 'Avanço das falas',
    autoTitle: 'as falas avançam sozinhas',
    manualTitle: 'você avança com Espaço ou com o botão continuar',
    /** o que o balão digita primeiro: a versão simples ou o original, e a outra fica a um clique */
    textGroup: 'Texto do balão',
    plainMode: 'simples',
    verbatimMode: 'original',
    plainModeTitle: 'o balão digita a versão em palavras simples, com o original a um clique',
    verbatimModeTitle: 'o balão digita o texto original, com a versão simples a um clique',
    slower: 'mais devagar',
    faster: 'mais rápido',
    speedLabel: 'Velocidade',
    muted: 'mudo',
    sound: 'som',
    help: 'ajuda',
    glossary: 'glossário',
    history: 'histórico',
    tutorial: 'como jogar',
    a11y: 'acessibilidade',
    continue: 'continuar',
    speed: (x: number) => `${String(x).replace('.', ',')}×`,
    attentionLow: 'atenção baixa: olhe para quem fala',
    railLabel: 'Bancada',
    topLabel: 'Consultas',
  },

  meters: {
    conviction: 'coerência',
    attention: 'atenção',
    mesa: 'mesa',
    hand: 'caderno',
    low: 'em baixa',
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
    nextPage: 'página seguinte',
    firstPage: 'voltar à primeira',
  },

  desk: {
    title: 'Caderno',
    cards: (n: number) => `${n} ${n === 1 ? 'anotação' : 'anotações'}`,
    empty: 'Nada anotado. Enquanto alguém fala, o botão Anotar guarda o trecho aqui.',
    youDefend: 'Você defende',
    thread: 'Fio do debate',
    threadEmpty: 'A sessão ainda não começou a se cruzar.',
    questions: 'Perguntas em aberto',
    questionsEmpty: 'Nenhuma pergunta sem resposta até agora.',
    you: 'Você',
    close: 'voltar à sala',
    listen: 'ouvir',
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
    confirmSpeak: 'Falar esta frase?',
    confirmSpeakYes: 'Sim, falar',
    confirmYield: 'Devolver a palavra sem falar? A vez acaba aqui.',
    confirmYieldYes: 'Sim, devolver',
    notYet: 'Ainda não',
    escBack: 'Esc volta um passo',
    listen: 'ouvir a frase',
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
    roleShapes: 'A cor e a forma da marca dizem o papel de cada pessoa.',
    keys: 'Teclas',
    /** as teclas fixas, que não se trocam nem se desligam */
    fixedKeys: [
      ['Tab', 'ir de um controle a outro'],
      ['Enter', 'ativar o botão em foco, acelerar a digitação'],
      ['Espaço', 'continuar, no modo manual'],
      ['Esc', 'fechar o que estiver aberto, ou completar a página'],
      ['setas', 'virar a câmera para os lados'],
      ['arrastar', 'olhar em volta (a cena vai com o mouse)'],
    ] as [string, string][],
    keysOff: 'Os atalhos de uma tecla estão desligados. Dá para ligar e trocar as teclas em Acessibilidade.',
    keysMore: 'Dá para trocar qualquer uma dessas teclas em Acessibilidade.',
    close: 'fechar',
  },

  /** o que cada atalho de uma tecla faz, na ajuda e no painel de acessibilidade */
  keys: {
    look: 'virar para quem fala',
    desk: 'abrir e fechar o caderno',
    note: 'anotar o trecho atual',
    original: 'ver o que foi dito, e voltar',
    history: 'rever o que já foi dito',
    sustento: 'na sua vez: sustentar',
    contesto: 'na sua vez: contestar',
    cobro: 'na sua vez: cobrar',
    clearCite: 'na sua vez: tirar a carta citada',
    treplica: 'tréplica, enquanto o botão aparece',
    interject: 'pedir aparte',
    autoplay: 'automático ou manual',
    textMode: 'balão em palavras simples ou no original',
    faster: 'mais rápido',
    slower: 'mais devagar',
    mute: 'ligar e desligar o som',
    help: 'legenda e ajuda',
    glossary: 'glossário',
  } as Record<string, string>,

  /**
   * O tutorial "Como jogar". Cada passo tem título, até três frases curtas, uma imagem tirada do jogo
   * (`npm run tutorial:screenshots` grava em public/tutorial/) e o texto alternativo dela. `**assim**` marca o único
   * destaque do passo. As teclas não vão no texto: `keys` lista as ações, e o diálogo escreve a tecla atual de cada uma
   * (some quando os atalhos estão desligados). O último passo mostra a tabela de teclas no lugar da imagem.
   */
  tutorial: {
    open: 'Como jogar',
    ask: {
      title: 'Primeira vez por aqui?',
      text: 'Quer ver como funciona? Leva uns cinco minutos, e dá para sair quando quiser.',
      yes: 'Ver o tutorial',
      no: 'Agora não',
    },
    progress: (i: number, n: number) => `${i} de ${n}`,
    prev: 'Voltar',
    next: 'Próximo',
    start: 'Começar',
    resume: 'Voltar à sessão',
    close: 'fechar',
    keys: 'Teclas',
    tableLabel: 'Teclas da sala',
    announce: (i: number, n: number, part: string, title: string, text: string) => `${i} de ${n}, ${part}. ${title}. ${text}`,
    steps: [
      {
        id: 'jogo',
        part: 'O jogo',
        title: 'Um jogo sério',
        text: 'Este é um jogo sério, ou seja, um jogo feito para aprender jogando. Você entra numa **audiência pública**, a reunião aberta em que uma comissão da Câmara dos Deputados ouve convidados sobre um tema, e acompanha tudo da cadeira vaga, em primeira pessoa.',
        image: 'sala.webp',
        alt: 'A sala de comissão em 3D vista da cadeira vaga. Ao fundo, a parede com o nome da comissão e a mesa da presidência, com deputados sentados em arco. No meio, o balão com a pergunta do deputado Ivan Valente: a sonda levada ao bloco estava autorizada? No alto, o título da audiência e a ideia que você defende. Embaixo, os medidores e os botões da sala.',
      },
      {
        id: 'dados',
        part: 'O jogo',
        title: 'Falas reais, mais fáceis de ler',
        text: 'As falas vêm do PublicHearingBR, um acervo com as transcrições oficiais de 206 audiências reais da Câmara. Um modelo de linguagem resumiu cada audiência aos momentos mais importantes e reescreveu as falas em **palavras simples**, com explicação para os termos difíceis. A transcrição original, como a da imagem, fica sempre a um clique.',
        image: 'original.webp',
        alt: 'O balão de Mauro Pires, do ICMBio, marcado como texto original, com a transcrição da fala na página 1 de 2: a este debate gostaria de trazer um ponto que considero importante, o petróleo na foz do Rio Amazonas, ao considerar essa temática dentro dos compromissos que o Brasil assumiu perante as convenções. No pé do balão, o botão voltar leva à versão em palavras simples.',
      },
      {
        id: 'objetivo',
        part: 'O jogo',
        title: 'Para que serve',
        text: 'O jogo tem dois objetivos. Um é aproximar você dos assuntos que o país está discutindo, do jeito que eles foram discutidos. O outro é exercitar o seu **senso crítico**: ouvir argumentos diferentes, entender cada um e perceber o que pesa a favor ou contra uma posição.',
        image: 'temas.webp',
        alt: 'A lista do acervo, com audiências reais de 2024 sobre assuntos variados: a concessão da BR-101 em Santa Catarina, a exigência de certidão negativa de antecedentes criminais, as emissões de carbono em terminais marítimos, a regulamentação da reforma tributária e o saque-aniversário do FGTS. Cada linha traz a data, o número da audiência e a comissão.',
      },
      {
        id: 'acervo',
        part: 'Antes de entrar',
        title: 'Escolha a audiência',
        text: 'No acervo, cada linha é uma audiência real, com a data, a comissão e o tema, e dá para buscar por qualquer um deles. Escolha um assunto que chame a sua atenção e clique em **Entrar na sala**.',
        image: 'acervo.webp',
        alt: 'A tela Escolha a audiência, com a busca e os filtros no alto. Na lista, a audiência sobre a exploração de petróleo na Margem Equatorial, de 31 de maio de 2023, está escolhida. Ao lado, o resumo dela: 18 pessoas na sala, 24 falas e 65 trechos, 6 ideias para defender. O botão Entrar na sala está em destaque.',
      },
      {
        id: 'ideia',
        part: 'Antes de entrar',
        title: 'Escolha uma ideia para defender',
        text: 'No alto da tela está a pergunta que a audiência discutiu. Embaixo, as ideias que pessoas defenderam de verdade, com quem defendeu e quem discordou de cada uma. Escolha uma. O seu objetivo é ser **coerente com ela**. Não existe vitória nem derrota, e o jogo não julga se a ideia está certa.',
        image: 'ideia.webp',
        alt: 'O dossiê da audiência 44. No alto, a pergunta da sessão: o Ibama deve deixar a Petrobras perfurar o poço de pesquisa do Bloco 59, na costa do Amapá, antes de existir um estudo ambiental de toda a região? No meio, a ideia 2 de 6, sem avaliar toda a região, não dá para decidir o Bloco 59, com quem a defendeu (Ibama, Observatório do Clima e UENF) e quem discordou (MME e um deputado do MDB do Maranhão). Embaixo, a tira com as seis ideias. O botão Defender esta ideia está em destaque.',
      },
      {
        id: 'lados',
        part: 'Antes de entrar',
        title: 'Ouça para separar os lados',
        text: 'Para ser coerente, você precisa prestar atenção. Cada fala pode estar a favor da sua ideia, contra ela ou não ter nada a ver com ela, e **é você quem percebe a diferença**. Se quiser apoio, ligue o modo guiado na escolha da ideia: ele escreve no balão de que lado cada fala está, como na imagem.',
        image: 'lados.webp',
        alt: 'O balão de Carlos Agenor Onofre Cabral, do Ministério de Minas e Energia, numa partida com o modo guiado. Ele diz que, se o Brasil tiver os 13 bilhões de barris esperados na Guiana e no Suriname, isso dá 1 trilhão de reais e centenas de milhares de empregos. No alto do balão, em destaque, a etiqueta a favor, do lado contrário: ele é a favor do poço, e por isso fica do lado oposto ao da ideia escolhida.',
      },
      {
        id: 'sala',
        part: 'Na sala',
        title: 'Quem é quem',
        text: 'A presidência, na mesa, abre a sessão e passa a palavra. A cor e a forma da marca de cada pessoa dizem o papel dela: parlamentar, governo, sociedade civil, setor privado ou convidado. A **legenda**, no botão ajuda, explica as cores e os sinais do jogo.',
        image: 'legenda.webp',
        alt: 'A legenda e ajuda aberta ao lado do balão, com as relações e os vereditos do jogo. Em destaque, as cores dos papéis, cada uma com a sua forma: mesa em cinza, parlamentar em azul, governo em vermelho, sociedade civil em verde, setor privado em amarelo e convidado num anel vazio.',
        keys: [{ k: ['help'] }],
      },
      {
        id: 'balao',
        part: 'Na sala',
        title: 'Leia as falas',
        text: 'Quem fala aparece num balão, com o nome e a instituição. A fala vem em palavras simples, e **ver o que foi dito** abre a transcrição original. As palavras sublinhadas têm explicação: passe o mouse ou clique nelas. Falas longas se dividem em páginas.',
        image: 'balao.webp',
        alt: 'O balão da primeira fala, de Mauro Pires, do ICMBio, em palavras simples: o petróleo na foz do Amazonas precisa ser pensado dentro dos compromissos que o Brasil assinou, como o Acordo de Paris, de 2015. O termo Acordo de Paris está sublinhado, e a explicação dele aparece por cima do texto: o acordo mundial em que os países se comprometeram a reduzir emissões. No pé do balão, ver o que foi dito está em destaque, ao lado de Anotar e continuar.',
        keys: [{ k: ['original'] }, { k: ['glossary'] }],
      },
      {
        id: 'ritmo',
        part: 'Na sala',
        title: 'No seu ritmo',
        text: 'No modo automático, as falas seguem sozinhas, na velocidade que você escolher. No **modo manual**, cada fala espera você apertar continuar ou Espaço. Perdeu alguma coisa? O histórico, no alto da tela, guarda tudo o que já foi dito.',
        image: 'ritmo.webp',
        alt: 'A bancada, embaixo do balão da fala. Em destaque, o par automático e manual, com o manual escolhido, e a velocidade em 0,5×, entre os botões de menos e de mais.',
        keys: [{ k: ['autoplay'] }, { k: ['Espaço'] }, { k: ['faster', 'slower'], what: 'velocidade' }, { k: ['history'] }],
      },
      {
        id: 'anotar',
        part: 'Na sala',
        title: 'Anote o que importa',
        text: 'Ouviu um argumento que pesa a favor ou contra a sua ideia? Clique em **Anotar**, no próprio balão, enquanto a pessoa fala. Quando a fala é uma pergunta, o botão vira Anotar pergunta. O caderno tem sete lugares, então guarde o que importa de verdade.',
        image: 'anotar.webp',
        alt: 'O balão de Rodrigo Agostinho, do Ibama: a regra prevê, como exceção, que os 2 ministros autorizem petróleo em áreas sem a AAAS, a avaliação regional, e isso é uma decisão mais política do que técnica. No pé do balão, o botão Anotar está em destaque.',
        keys: [{ k: ['note'] }],
      },
      {
        id: 'caderno',
        part: 'Na sala',
        title: 'O caderno',
        text: 'O caderno guarda cada anotação com quem disse e o tema. Ao lado ficam o fio do debate, com quem respondeu a quem, e as perguntas que ficaram sem resposta. **É com estas anotações que você vai falar** quando chegar a sua vez.',
        image: 'caderno.webp',
        alt: 'O caderno aberto, com a ideia que você defende no alto e as sete anotações em cartões, em destaque. Cada cartão mostra quem disse, se é afirmação ou pergunta, o resumo do trecho e o tema. Ao lado, o fio do debate, com o que cada pessoa defendeu.',
        keys: [{ k: ['desk'] }],
      },
      {
        id: 'atencao',
        part: 'Na sala',
        title: 'Olhe para quem fala',
        text: 'Se você passa muito tempo olhando para o lado, **a atenção cai** e você não consegue anotar. Para voltar, arraste a cena, use as setas ou o botão olhar para quem fala. No painel Acessibilidade, a câmera pode virar sozinha.',
        image: 'atencao.webp',
        alt: 'A câmera virada para longe de quem está falando. No canto, o aviso atenção baixa: olhe para quem fala. Na bancada, o medidor de atenção em 10, marcado como em baixa. O aviso e o medidor estão em destaque.',
        keys: [{ k: ['look'] }, { k: ['setas'] }],
      },
      {
        id: 'palavra',
        part: 'A sua vez',
        title: 'A palavra é sua',
        text: 'Algumas vezes na sessão, a presidência passa a palavra para você. Você não fala com palavras suas: **você reage ao que as pessoas disseram**, usando as anotações do caderno. Sustentar é concordar com uma fala, contestar é discordar dela, e cobrar é repetir uma pergunta que ficou sem resposta.',
        image: 'palavra.webp',
        alt: 'O painel A palavra é sua, com a ideia que você defende no alto. Os três movimentos estão em destaque: sustentar, para concordar com o que alguém disse, contestar, para discordar, e cobrar, para repetir uma pergunta que ficou sem resposta. Embaixo, as anotações do caderno e os botões Falar e Devolver a palavra.',
        keys: [{ k: ['sustento', 'contesto', 'cobro'], what: 'sustentar, contestar, cobrar' }],
      },
      {
        id: 'frase',
        part: 'A sua vez',
        title: 'Monte a frase',
        text: 'Escolha no caderno a anotação que vai usar. Ao contestar, dá para citar alguém que disse o contrário, e vale mais se for quem de fato respondeu àquela pessoa na audiência. A frase, montada com o que você anotou, aparece inteira **antes de você clicar em Falar**.',
        image: 'frase.webp',
        alt: 'O painel A palavra é sua depois das escolhas: você contesta o que disse Carlos Agenor Onofre Cabral, do Ministério de Minas e Energia, e cita Rodrigo Agostinho, do Ibama. A prévia Você vai dizer, com a frase inteira, e o botão Falar estão em destaque.',
        keys: [{ k: ['Enter'], what: 'falar' }, { k: ['Esc'], what: 'voltar um passo' }],
      },
      {
        id: 'veredito',
        part: 'A sua vez',
        title: 'O veredito',
        text: 'Logo depois de falar, o jogo diz se você foi coerente com a sua ideia e explica por quê. Concordar com quem está do outro lado, ou discordar de quem está do seu, é contradição. O medidor de **coerência**, na bancada, sobe ou desce a cada fala sua.',
        image: 'veredito.webp',
        alt: 'O balão da sua fala, da cadeira vaga: eu sustento o que disse Suely Araújo, do Observatório do Clima, que a AAAS mapeia áreas aptas, não aptas e em moratória. Embaixo, a fonte da frase e, em destaque, o veredito Coerente com a sua tese, com a coerência subindo de 50 para 61 e a explicação: você sustentou alguém de fora do bloco que mais defendeu a sua tese.',
      },
      {
        id: 'reacao',
        part: 'A sua vez',
        title: 'A sala responde',
        text: 'O que você diz pode provocar respostas, sempre com falas reais da audiência. Quando alguém do outro lado rebate o que você disse, isso é a **réplica**. Quem concorda também pode aparecer. A etiqueta no balão diz a relação entre as falas, e um cartão explica quem respondeu a quem.',
        image: 'reacao.webp',
        alt: 'A resposta de Daniele Zaneti Puelker, da Petrobras, ao que você sustentou: o próprio Ibama já reconheceu, num parecer, que não há base jurídica para negar a licença por falta da AAAS. No alto do balão, em destaque, a etiqueta Contradiz você. Embaixo, um cartão explica a relação: ela contradiz Suely Araújo, que tinha dito que a licença seria negada mesmo sem a AAAS.',
      },
      {
        id: 'treplica',
        part: 'A sua vez',
        title: 'Tréplica',
        text: 'Quando alguém rebate o que você sustentou, você pode responder de novo: é a **tréplica**. Se o caderno tiver uma anotação contra quem rebateu, o botão Tréplica aparece na bancada por alguns segundos. Um clique e você contesta essa pessoa, sem gastar a sua vez. Em Acessibilidade, dá para tirar o limite de tempo.',
        image: 'treplica.webp',
        alt: 'A mesma resposta da Petrobras, com a etiqueta Contradiz você. Na bancada, em destaque, o botão tréplica, que aparece porque o seu caderno tem outra anotação de Suely Araújo contra o que a Petrobras disse.',
        keys: [{ k: ['treplica'] }],
      },
      {
        id: 'aparte',
        part: 'A sua vez',
        title: 'Aparte',
        text: 'Aparte é **pedir licença para comentar** enquanto outra pessoa fala, como nas sessões de verdade. O botão mostra a chance de a presidência aceitar, que cresce com a sua coerência e com a paciência da mesa, no medidor mesa. Se ela aceitar, você faz um movimento. São dois pedidos por sessão.',
        image: 'aparte.webp',
        alt: 'A sala durante a pergunta do deputado Ivan Valente. Na bancada, em destaque, o medidor mesa, em 100, e o botão aparte, com 66% de chance de a presidência aceitar o pedido.',
        keys: [{ k: ['interject'] }],
      },
      {
        id: 'ata',
        part: 'No fim',
        title: 'A ata',
        text: 'No fim, a ata conta a sua sessão: cada intervenção com o veredito e a coerência final. Junto vêm **a audiência real**, como a Agência Câmara noticiou, e as perguntas que ficaram em aberto, para você comparar a sua participação com o que aconteceu de fato.',
        image: 'ata.webp',
        alt: 'A ata da sessão simulada: o título da audiência, a coerência final de 69, a sua tese com quem a defendeu e quem discordou na sala e a sua primeira intervenção, julgada coerente. À direita, a audiência real, como a Agência Câmara noticiou, e as perguntas que ficaram em aberto.',
      },
      {
        id: 'teclas',
        part: 'No fim',
        title: 'Pronto para começar',
        text: 'Estas são as teclas da sala, e tudo também funciona com o mouse. Se quiser rever alguma coisa, o tutorial fica sempre à mão em **Como jogar**, no início, no acervo e dentro da sala.',
        image: null,
        alt: '',
      },
    ] as TutorialStep[],
    /** a tabela do último passo: as teclas que mais se usam, na ordem em que aparecem na partida */
    table: [
      { k: ['Espaço'] },
      { k: ['Enter'] },
      { k: ['Esc'] },
      { k: ['setas'] },
      { k: ['look'] },
      { k: ['original'] },
      { k: ['note'] },
      { k: ['desk'] },
      { k: ['history'] },
      { k: ['sustento', 'contesto', 'cobro'], what: 'na sua vez: sustentar, contestar, cobrar' },
      { k: ['interject'] },
      { k: ['treplica'] },
      { k: ['autoplay'] },
      { k: ['faster', 'slower'], what: 'velocidade' },
      { k: ['glossary'] },
      { k: ['help'] },
    ] as TutorialKeys[],
  },

  history: {
    title: 'O que já foi dito',
    hint: 'Tudo o que passou pelo balão nesta sessão, na ordem. O texto original de cada trecho fica a um clique.',
    empty: 'Ninguém falou ainda.',
    you: 'Você, da cadeira vaga',
    mesa: 'Mesa',
    notice: 'Aviso',
    close: 'fechar',
  },

  /** o andamento da sessão, no topo */
  progress: {
    label: 'Andamento da sessão',
    where: (pct: number) => `${pct}% da sessão`,
    floors: (n: number) => (n === 0 ? 'a palavra não volta mais' : n === 1 ? 'a palavra ainda vem 1 vez' : `a palavra ainda vem ${n} vezes`),
    floorPast: 'vez de falar que já passou',
    floorNext: 'próxima vez de falar',
    floorLater: 'vez de falar mais adiante',
  },

  /** os botões que viram a câmera sem arrastar */
  view: {
    group: 'Câmera',
    left: 'virar à esquerda',
    right: 'virar à direita',
    speaker: 'olhar para quem fala',
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

  /** o painel de ajustes de acessibilidade, o mesmo em todas as telas */
  a11y: {
    title: 'Acessibilidade',
    open: 'Acessibilidade',
    close: 'fechar',
    intro: 'Os ajustes valem na hora e ficam guardados neste navegador.',
    reading: 'Leitura',
    textSize: 'Tamanho do texto',
    speechFont: 'Fonte das falas',
    fontLibron: 'Libron, com serifa',
    fontLexend: 'Lexend, sem serifa',
    lineSpacing: 'Espaço entre as linhas',
    lineSpacings: ['normal', 'amplo', 'mais amplo'],
    highContrast: 'Alto contraste',
    highContrastHint: 'Preto e branco nos painéis, com bordas mais fortes.',
    motion: 'Movimento e efeitos',
    reduceMotion: 'Reduzir o movimento',
    reduceMotionHint: 'A câmera vira sem animação, o texto aparece de uma vez e nada balança.',
    effects: 'Efeitos visuais na sala',
    effectsHint: 'A sombra nas bordas da cena e o tremor da tela quando alguém contradiz você.',
    pace: 'Ritmo da sessão',
    advance: 'Avanço das falas',
    auto: 'automático',
    manual: 'manual',
    advanceHint: 'No manual, cada fala espera você apertar continuar ou Espaço. É o modo mais confortável com leitor de tela.',
    speed: 'Velocidade da digitação',
    balloonText: 'O balão mostra primeiro',
    plain: 'palavras simples',
    original: 'o texto original',
    noTimeLimits: 'Sem limite de tempo',
    noTimeLimitsHint: 'A tréplica espera você, em vez de sumir depois de 6 segundos.',
    autoLook: 'Virar sozinho para quem fala',
    autoLookHint: 'A câmera acompanha cada nova fala, e a sua atenção não cai por olhar para o lado errado.',
    confirmSpeak: 'Confirmar antes de falar',
    confirmSpeakHint: 'Falar pede um segundo clique, depois de você reler a frase.',
    sound: 'Som e voz',
    volume: 'Volume',
    master: 'geral',
    typewriter: 'máquina de escrever',
    applause: 'palmas',
    cues: 'sinais de relação e de veredito',
    readAloud: 'Ler as falas em voz alta',
    readAloudHint: 'Usa uma voz em português do próprio navegador e segue a velocidade escolhida. O texto lido é o mesmo da tela.',
    noVoice: 'Este navegador não tem voz em português, então a leitura em voz alta não está disponível aqui.',
    libras: 'Libras',
    vlibras: 'Tradutor VLibras',
    vlibrasHint: 'Liga o VLibras, do governo federal: clique num texto e o avatar traduz para Libras. Ele lê só o texto da página, não a cena 3D, e carrega da internet na primeira vez.',
    vlibrasOff: 'Para tirar o VLibras da página por completo, recarregue depois de desligar.',
    keys: 'Teclado',
    shortcuts: 'Atalhos de uma tecla',
    shortcutsHint: 'Desligados, continuam valendo Tab, Enter, Espaço, Esc e as setas.',
    change: 'mudar',
    waiting: 'aperte a nova tecla',
    changeLabel: (what: string, key: string) => `mudar a tecla de ${what}, hoje ${key}`,
    resetKeys: 'Voltar às teclas originais',
    reset: 'Voltar tudo ao padrão',
    statement: 'Declaração de acessibilidade',
  },

  /** a página de declaração de acessibilidade (/acessibilidade) */
  statement: {
    back: 'início',
    title: 'Acessibilidade',
    lead: 'Este jogo quer ser jogado por qualquer pessoa: quem lê pouco, quem enxerga pouco ou nada, quem não ouve, quem usa só o teclado e quem prefere Libras. Aqui está o que funciona hoje, o que ainda não funciona e como avisar quando algo atrapalhar.',
    supportedTitle: 'O que o jogo oferece',
    supported: [
      'Toda fala aparece em palavras simples, com o texto original a um clique.',
      'O jogo inteiro funciona pelo teclado. Os atalhos de uma tecla podem ser trocados ou desligados.',
      'Leitores de tela ouvem cada fala por inteiro, uma vez, com quem disse e de qual instituição. A sala 3D tem uma descrição em texto.',
      'No modo manual, nada avança sem você. A tréplica pode esperar sem limite de tempo.',
      'Um histórico guarda tudo o que foi dito na sessão, para reler quando quiser.',
      'O painel Acessibilidade ajusta o tamanho do texto até o dobro, a fonte das falas, o espaço entre as linhas, o alto contraste, o movimento e os efeitos, o volume de cada som e a leitura em voz alta.',
      'Cada som tem um equivalente na tela, e as falas são sempre texto.',
      'A cor nunca trabalha sozinha: relações e vereditos vêm com ícone e palavra, e cada papel tem uma forma própria.',
      'O tradutor VLibras pode ser ligado no painel Acessibilidade.',
    ],
    limitsTitle: 'O que ainda não funciona bem',
    limits: [
      'A cena 3D é visual. A descrição em texto conta onde cada grupo está, mas não substitui olhar a sala.',
      'O VLibras traduz o texto da página com um avatar automático. A tradução não foi revisada por intérpretes, e ele não alcança a cena 3D.',
      'A leitura em voz alta depende das vozes instaladas no aparelho, e algumas soam robóticas.',
      'Em telas muito estreitas, a sala ainda fica apertada.',
      'Os testes automáticos e os testes com teclado foram feitos por nós. Os testes com leitores de tela reais (NVDA, VoiceOver) ainda precisam ser feitos com pessoas que os usam no dia a dia.',
    ],
    standardTitle: 'Referências',
    standard: 'Seguimos a WCAG 2.2 no nível AA como piso, as Game Accessibility Guidelines, o eMAG e a Lei Brasileira de Inclusão (Lei 13.146/2015). Não afirmamos conformidade total: o que foi verificado está descrito no repositório, em docs/acessibilidade.md.',
    contactTitle: 'Encontrou um problema?',
    contact: 'Conte o que aconteceu, em que tela e com qual navegador ou leitor de tela, abrindo uma issue no repositório do jogo:',
    contactLink: 'github.com/ArthurSudbrackIbarra/ideias-em-rede-kunumi-entrega/issues',
    newTab: '(abre em outra aba)',
    open: 'Ajustes de acessibilidade',
    backToSettings: 'voltar ao painel',
  },

  /** os títulos da aba do navegador, por tela e por fase */
  titles: {
    suffix: "Don't Leave It Uai-Tchê",
    catalog: 'Escolha a audiência',
    statement: 'Acessibilidade',
    tese: (id: number) => `Audiência ${id}, escolha da ideia`,
    prelude: (id: number) => `Audiência ${id}, abertura`,
    room: (id: number) => `Audiência ${id}, sessão`,
    floor: (id: number) => `Audiência ${id}, a palavra é sua`,
    ata: (id: number) => `Audiência ${id}, ata`,
  },

  /** o que o leitor de tela ouve e o que a página escreve só para ele */
  sr: {
    skip: 'Pular para o conteúdo',
    manual: 'Ligar o modo manual: cada fala espera você avançar',
    manualOn: 'Modo manual ligado. Aperte Espaço ou o botão continuar para seguir.',
    roomHeading: (id: number, name: string) => `Audiência ${id}: ${name}`,
    room: (debaters: number, bancada: number, audience: number, remote: number) =>
      `Sala de comissão em 3D, vista da sua cadeira. Ao fundo, a mesa da presidência. Entre você e ela, ${bancada} ${bancada === 1 ? 'parlamentar sentado' : 'parlamentares sentados'} em arco. Você está no meio da mesa de debatedores, com ${debaters} ${debaters === 1 ? 'convidado' : 'convidados'} dos lados. Atrás, uma plateia de ${audience} pessoas.${remote ? ` Um telão na parede mostra ${remote === 1 ? 'quem participa' : `as ${remote} pessoas que participam`} por vídeo.` : ''} Os bonecos não têm rosto. A cor e a forma da marca de cada um dizem o papel: parlamentar, governo, sociedade civil ou setor privado.`,
    line: (who: string, text: string) => `${who}: ${text}`,
    mesa: (text: string) => `Mesa: ${text}`,
    you: (text: string) => `Você: ${text}`,
    verdict: (short: string, before: number | null, after: number | null, why: string | null) =>
      `${short}.${before !== null && after !== null ? ` Coerência de ${before} para ${after}.` : ''}${why ? ` ${why}` : ''}`,
    original: (ref: string | null, text: string) => `Texto original${ref ? `, ${ref}` : ''}: ${text}`,
    plain: (text: string) => `Em palavras simples: ${text}`,
    treplica: (key: string | null) => (key ? `Tréplica disponível. Aperte ${key} ou o botão tréplica.` : 'Tréplica disponível no botão tréplica.'),
    noted: (n: number) => `Anotado. ${n} no caderno.`,
    pages: (i: number, n: number) => `página ${i} de ${n}`,
  },

  error: {
    title: (id: number) => `Não foi possível abrir a audiência ${id}.`,
    hint: 'Gere o arquivo com o build_scene.py e recarregue.',
    back: 'Voltar',
    preparing: 'Preparando a sala.',
  },
} as const
