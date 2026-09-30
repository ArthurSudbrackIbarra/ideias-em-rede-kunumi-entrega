/* eslint-disable */
/* Gerado de shared/hearing-sim.schema.json por npm run gen:types:sim. Nao editar. */

export type SpeakerId = string;
export type Role = "mesa" | "parlamentar" | "governo" | "sociedade_civil" | "setor_privado" | "convidado";
export type Seat = "mesa" | "bancada" | "debatedores" | "remoto";
export type FalaId = string;
export type Side = "favoravel" | "contrario";
export type Event =
  | {
      kind: "mesa";
      id: FalaId;
      move: MesaMove;
      speaker: SpeakerId;
      /**
       * o cartão da mesa, em palavras simples e em 3ª pessoa (resumo do ato)
       */
      text: string;
      original: Original;
      seconds: number;
    }
  | {
      kind: "fala";
      id: FalaId;
      speaker: SpeakerId;
      theme: string;
      seconds: number;
      /**
       * momento na sessão real (fração)
       */
      t0: number;
      /**
       * resumo gerado por modelo; exibir sempre rotulado como resumo
       */
      summary: string;
      stance: {
        position: Position;
        claim: string;
        ref: Ref;
      };
      applause: number;
      covered: boolean;
      interrupted: boolean;
      tone: Tone;
      /**
       * @minItems 1
       */
      pages: [Page, ...Page[]];
    }
  | {
      kind: "floor";
      slot: number;
      after: FalaId;
    }
  | {
      kind: "close";
      text: string | null;
      original: Original | null;
      speaker: SpeakerId | null;
    };
export type MesaMove =
  | "abre"
  | "apresenta"
  | "passa_palavra"
  | "pede_conclusao"
  | "corta"
  | "anuncia_presenca"
  | "audiodescricao"
  | "ordem"
  | "microfone"
  | "cortesia"
  | "encerra";
/**
 * origem verbatim: fala.sentença ou fala.início-fim
 */
export type Ref = string;
export type Position = "favoravel" | "contrario" | "condicional" | "neutro";
export type Tone = "tecnico" | "emotivo" | "juridico" | "politico";
export type Card = ClaimCard | QuestionCard;
export type ClaimType = "dado" | "principio" | "experiencia" | "juridico" | "economico" | "precedente";
export type Strength = "forte" | "media";
export type RelationKind = "apoia" | "contradiz" | "responde";
export type QuestionPosition = "favoravel" | "contrario" | "neutro";

/**
 * Contrato hearing-sim-v2 entre src/sim/build_scene.py e o simulador em web/src/sim. Uma audiência pública pronta para ser jogada: elenco, plateia, a cadeira vaga, as teses, a linha do tempo em páginas (versão em palavras simples + original verbatim), o baralho de cartas (afirmações e perguntas), fatos, consensos, glossário e o enquadramento da imprensa. Todo texto atribuído a uma pessoa nomeada é verbatim ou traz o original verbatim ao lado, sempre com a referência de origem (ref).
 */
export interface HearingSim {
  version: "hearing-sim-v2";
  id: number;
  name: string;
  date: string | null;
  committee: string | null;
  words: number;
  synopsis: string;
  stakes: string;
  central_question: string;
  synopsis_plain: string;
  stakes_plain: string;
  central_question_plain: string;
  /**
   * @minItems 1
   */
  themes: [Theme, ...Theme[]];
  /**
   * @minItems 1
   */
  cast: [CastMember, ...CastMember[]];
  audience: Audience;
  player: Player;
  /**
   * @minItems 3
   * @maxItems 6
   */
  teses:
    | [Tese, Tese, Tese]
    | [Tese, Tese, Tese, Tese]
    | [Tese, Tese, Tese, Tese, Tese]
    | [Tese, Tese, Tese, Tese, Tese, Tese];
  /**
   * @minItems 1
   */
  timeline: [Event, ...Event[]];
  /**
   * @minItems 1
   */
  deck: [Card, ...Card[]];
  facts: Fact[];
  consensus: Consensus[];
  glossario: GlossaryTerm[];
  press: Press;
  meta: Meta;
}
export interface Theme {
  id: string;
  name: string;
  description: string;
  axis: {
    pro: string;
    contra: string;
    pro_plain: string;
    contra_plain: string;
  };
  contested: boolean;
}
export interface CastMember {
  id: SpeakerId;
  /**
   * como está na ata
   */
  name: string;
  role: Role;
  cargo: string;
  org: string | null;
  /**
   * como a pessoa é referida numa frase: 'do Ibama'; null para a mesa
   */
  byline: string | null;
  /**
   * o que é a instituição, em palavras simples
   */
  org_plain: string | null;
  seat: Seat;
  /**
   * posição dentro do grupo de assentos
   */
  seat_index: number;
  remote: boolean;
  /**
   * falas substantivas desta pessoa
   */
  falas: FalaId[];
  words: number;
}
export interface Audience {
  estimate: number;
  rows: number;
  composition: {
    role: Role;
    count: number;
  }[];
  confidence: "alta" | "media" | "baixa";
}
export interface Player {
  seat: Seat;
  seat_index: number;
  /**
   * depois de que fala a presidência concede a palavra à cadeira vaga; null = depois da última fala
   *
   * @minItems 1
   */
  slots: [FalaId | null, ...(FalaId | null)[]];
  moves_per_floor: number;
}
export interface Tese {
  id: string;
  title: string;
  statement_plain: string;
  core_theme: string;
  /**
   * tema -> lado que a tese toma
   */
  positions: {
    [k: string]: Side;
  };
  /**
   * @minItems 3
   */
  claims_chave: [string, string, string, ...string[]];
  note: string;
  defenders: RoleCount;
  opponents: RoleCount1;
  /**
   * instituições (nunca nomes de pessoas), por ordem de fala
   */
  defender_orgs: string[];
  opponent_orgs: string[];
  /**
   * teses com posição oposta em algum tema comum
   */
  rivals: string[];
  aligned_cards: number;
  opposed_cards: number;
}
/**
 * oradores distintos com ao menos uma carta alinhada, por papel
 */
export interface RoleCount {
  mesa?: number;
  parlamentar?: number;
  governo?: number;
  sociedade_civil?: number;
  setor_privado?: number;
  convidado?: number;
}
export interface RoleCount1 {
  mesa?: number;
  parlamentar?: number;
  governo?: number;
  sociedade_civil?: number;
  setor_privado?: number;
  convidado?: number;
}
export interface Original {
  /**
   * trecho verbatim da transcrição
   */
  text: string;
  ref: Ref;
}
export interface Page {
  kind: "claim" | "pergunta";
  /**
   * id da carta (claim) ou da pergunta (pergunta) no baralho
   */
  card: string;
  /**
   * versão em palavras simples; null = mostrar o original
   */
  plain: string | null;
  original: Original;
  seconds: number;
}
export interface ClaimCard {
  kind: "claim";
  id: string;
  fala: FalaId;
  speaker: SpeakerId;
  role: Role;
  theme: string;
  type: ClaimType;
  strength: Strength;
  /**
   * posição desta carta no eixo do tema dela
   */
  position: "favoravel" | "contrario" | "condicional" | "neutro";
  /**
   * a carta está num grupo de consensus: listada em claims, ou (grupo legado, só com falas) carta de uma fala do grupo, no tema do grupo, em que ninguém na sala tomou o lado oposto
   */
  consensus: boolean;
  /**
   * oração que completa 'sustento o que disse X: que ...'
   */
  gist: string;
  plain: string | null;
  text: string;
  ref: Ref;
  seconds: number;
  fact: string | null;
  /**
   * quem reage a esta carta (relações que chegam à fala de origem, e disputas de dado)
   */
  triggers: Reaction[];
  /**
   * o que esta carta faz a falas anteriores (relações que saem da fala de origem)
   */
  asserts: Reaction[];
}
export interface Reaction {
  kind: RelationKind;
  fala: FalaId;
  speaker: SpeakerId;
  role: Role;
  /**
   * a carta do outro lado da relação: num gatilho, a carta de quem reage (from_claim ou a carta de from_sentence); numa asserção, a carta atingida (to_claim ou a carta de to_sentence). null quando a sentença não pertence a carta
   */
  card: string | null;
  /**
   * carta: a relação aponta esta carta. fala: aponta a fala inteira, sem carta, e a reação repete em todas as cartas da fala
   */
  anchor: "carta" | "fala";
  /**
   * versão simples da carta a que a sentença pertence, se houver
   */
  plain: string | null;
  text: string;
  ref: Ref;
  note: string;
  strength: Strength;
}
export interface QuestionCard {
  kind: "pergunta";
  id: string;
  fala: FalaId;
  speaker: SpeakerId;
  role: Role;
  theme: string;
  position: QuestionPosition;
  addressed_to: Role;
  /**
   * a pergunta em palavras simples, sem o '?' final (para o molde)
   */
  gist: string;
  plain: string;
  text: string;
  ref: Ref;
  seconds: number;
  answered_by_real: {
    fala: FalaId;
    card: string | null;
    speaker: SpeakerId;
    plain: string | null;
    text: string;
    ref: Ref;
  } | null;
}
export interface Fact {
  id: string;
  fala: FalaId;
  speaker: SpeakerId;
  gist: string;
  text: string;
  ref: Ref;
  disputed_by: {
    fala: FalaId;
    card: string | null;
    speaker: SpeakerId;
    role: Role;
    plain: string | null;
    text: string;
    ref: Ref;
  }[];
}
export interface Consensus {
  theme: string;
  /**
   * @minItems 2
   */
  falas: [FalaId, FalaId, ...FalaId[]];
  /**
   * as cartas marcadas como consenso por este grupo (claims da anotação, ou a regra legada das falas)
   */
  cards: string[];
  /**
   * @minItems 2
   */
  roles: [Role, Role, ...Role[]];
  note: string;
}
export interface GlossaryTerm {
  /**
   * exatamente como aparece na transcrição
   */
  term: string;
  plain: string;
  ref: Ref;
}
export interface Press {
  themes_covered: string[];
  roles_quoted: Role[];
  angle: string;
  omitted: string;
  covered_falas: FalaId[];
}
export interface Meta {
  model: string;
  created: string;
  prompt_sha256: string;
  sentences_hash: string;
  builder: string;
  quote_max: number;
  built: string;
  /**
   * páginas com versão simples
   */
  plain_pages: number;
  /**
   * versões simples reprovadas pela verificação e trocadas pelo original
   */
  plain_dropped: number;
  /**
   * relações anotadas (o que o índice exibe)
   */
  relations: number;
  verify: {
    model: string;
    created: string;
  } | null;
  review: {
    pairs_read: number;
    pairs_fixed: number;
  } | null;
}
