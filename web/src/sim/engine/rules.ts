import { copy } from '../copy'
import { claimAtRef, displayName, type Card, type ClaimCard, type HearingSim, type MesaMove, type Original, type QuestionCard, type Reaction, type RelationKind, type Strength } from '../lib/hearing'
import * as B from './balance'
import { contradictsEdge, type MoveKind, type Verdict } from './judge'
import { chance, pickWeighted } from './rng'

/**
 * Uma linha que aparece no balão. Toda linha de pessoa nomeada é ou verbatim ou a versão simples com o
 * original ao lado, sempre com `ref`. As linhas do jogador têm `sources` (o que ele citou).
 */
export interface Line {
  id: number
  kind: 'fala' | 'mesa' | 'reaction' | 'player' | 'system' | 'relcard'
  /** null = linha de interface ou o próprio jogador */
  speaker: string | null
  /** o que é digitado: a versão simples quando existe, senão o original */
  text: string
  /** preenchido quando `text` é a versão em palavras simples */
  plain: string | null
  original: Original | null
  ref: string | null
  /** página anotável (carta ou pergunta da fala em curso) */
  page: { kind: 'claim' | 'pergunta'; card: string } | null
  relation: RelationTag | null
  fala: string | null
  /** palmas registradas ao fim desta fala (só na última página) */
  applause: number
  /** réplica de quem já havia falado antes: o balão avisa que é uma retomada */
  retomada: boolean
  move: MesaMove | null
  /** jogador: as cartas citadas, para a faixa "Fonte" */
  sources: Source[]
  /** jogador: o veredito da jogada */
  verdict: Verdict | null
  /** jogador: a convicção antes e depois do veredito, para o balão mostrar o passo (redesenho, passo 5) */
  meter?: { before: number; after: number }
}

export interface Source {
  card: string
  ref: string
  gist: string
  text: string
  plain: string | null
  speaker: string
}

export type TagKind = RelationKind | 'consenso' | 'defende' | 'concorda' | 'cobra'

export interface RelationTag {
  kind: TagKind
  note: string
  strength: Strength
  /** quem está do outro lado (null = o jogador) */
  target: string | null
  targetRef: string | null
  /** true quando é o jogador quem apoia/contesta/cobra */
  byPlayer: boolean
  /** reação real: a relação anotada apontava esta carta (`carta`) ou a fala inteira (`fala`) */
  anchor?: 'carta' | 'fala'
}

export type Meter = 'conviccao' | 'atencao' | 'mesa'

export interface Delta {
  id: number
  meter: Meter
  value: number
  cause: string
}

export type ThreadKind = RelationKind | 'consenso' | 'cobranca' | 'palmas' | 'voce' | 'defende' | 'concorda' | 'veredito' | 'respondida'

export interface ThreadEvent {
  id: number
  kind: ThreadKind
  from: string // speaker id ou 'player'
  to: string | null
  ref: string | null
  note: string
}

export interface TreplicaOffer {
  /** a carta da mão que contradiz a fala do replicante */
  card: string
  /** a carta do replicante (o que será contestado) */
  target: string
  until: number
}

export interface Resolution {
  lines: Line[]
  thread: Omit<ThreadEvent, 'id'>[]
  rng: number
  treplica: Omit<TreplicaOffer, 'until'> | null
  /** chaves (carta ou ref) lidas por inteiro nesta resolução */
  shown: string[]
}

export function systemLine(text: string): Omit<Line, 'id'> {
  return { kind: 'system', speaker: null, text, plain: null, original: null, ref: null, page: null, relation: null, fala: null, applause: 0, retomada: false, move: null, sources: [], verdict: null }
}

export function reactionLine(id: number, r: Reaction, tag: RelationTag, card: ClaimCard | undefined): Line {
  return {
    id, kind: 'reaction', speaker: r.speaker, text: r.plain ?? r.text, plain: r.plain, original: { text: r.text, ref: r.ref }, ref: r.ref,
    // a réplica é anotável como a página que ela antecipa: quando a fala tocar, essa página não repete
    page: card ? { kind: 'claim', card: card.id } : null, relation: tag, fala: r.fala, applause: 0, retomada: false, move: null, sources: [], verdict: null,
  }
}

function relcardLine(id: number, r: Reaction, tag: RelationTag, text: string): Line {
  return {
    id, kind: 'relcard', speaker: r.speaker, text, plain: null, original: { text: r.text, ref: r.ref }, ref: r.ref,
    page: null, relation: tag, fala: r.fala, applause: 0, retomada: false, move: null, sources: [], verdict: null,
  }
}

export function sourceOf(card: Card): Source {
  return { card: card.id, ref: card.ref, gist: card.gist, text: card.text, plain: card.plain, speaker: card.speaker }
}

/** Uma carta da mão que contradiz a carta `target` (aresta em qualquer direção, ou disputa de dado), de qualquer tema. */
export function handCardAgainst(h: HearingSim, hand: string[], target: ClaimCard, except: string[]): ClaimCard | null {
  for (const id of hand) {
    if (except.includes(id)) continue
    const c = h.deck.find((x) => x.id === id)
    if (!c || c.kind !== 'claim') continue
    if (contradictsEdge(c, target)) return c
  }
  return null
}

export interface MoveContext {
  hand: string[]
  rng: number
  nextLineId: number
  /** a carta (ou a sentença) já foi lida nesta sessão, como página ou como réplica */
  shown: (key: string) => boolean
}

/** A chave de exibição de uma reação: a carta que contém a sentença, ou a própria ref quando não há carta. */
export function reactionKey(h: HearingSim, r: Reaction): string {
  return claimAtRef(h, r.ref)?.id ?? r.ref
}

/**
 * Uma réplica real só é lida por inteiro uma vez na sessão. Se o trecho já passou (como página da fala ou como
 * réplica anterior), a pessoa não repete a frase: o cartão de relação lembra o gist, com a ref ao lado.
 */
function reactOrRecall(h: HearingSim, lineId: number, r: Reaction, tag: RelationTag, ctx: MoveContext): Line {
  const card = claimAtRef(h, r.ref)
  const name = nameOfCast(h, r.speaker)
  if (ctx.shown(reactionKey(h, r))) {
    return relcardLine(lineId, r, tag, card ? copy.relcard.mantem(name, card.gist) : copy.relcard.mantemNote(name, r.note))
  }
  // sentença fora de qualquer carta: não há versão em palavras simples, e a transcrição bruta não vai ao balão (v3);
  // o cartão de relação mostra a nota da relação, com a ref ao lado
  if (!card || r.plain === null) return relcardLine(lineId, r, tag, r.note)
  return reactionLine(lineId, r, tag, card)
}

/**
 * As reações da sala a um movimento do jogador (spec §7.7). Puro. Nada aqui gera texto de pessoa
 * nomeada: toda réplica é uma sentença real, exibida em palavras simples com o original ao lado.
 */
export function resolveMove(h: HearingSim, move: MoveKind, card: Card, cite: ClaimCard | null, verdict: Verdict, ctx: MoveContext): Resolution {
  const res: Resolution = { lines: [], thread: [], rng: ctx.rng, treplica: null, shown: [] }
  let lineId = ctx.nextLineId
  const push = (t: Reaction, tag: RelationTag) => {
    const key = reactionKey(h, t)
    const ln = reactOrRecall(h, lineId++, t, tag, ctx)
    if (ln.kind === 'reaction') res.shown.push(key)
    res.lines.push(ln)
  }

  if (move === 'sustento' && card.kind === 'claim') {
    // 1. um adversário real pode replicar (ponderado pela força; pode não vir)
    const contras = card.triggers.filter((t) => t.kind === 'contradiz')
    if (contras.length) {
      const [i, s1] = pickWeighted(res.rng, contras.map((t) => (t.strength === 'forte' ? 3 : 1)))
      const t = contras[i]
      const [reacts, s2] = chance(s1, B.REACT_CHANCE[t.strength])
      res.rng = s2
      if (reacts) {
        push(t, { kind: 'contradiz', note: t.note, strength: t.strength, target: card.speaker, targetRef: card.ref, byPlayer: false, anchor: t.anchor })
        res.thread.push({ kind: 'contradiz', from: t.speaker, to: 'player', ref: t.ref, note: t.note })
        // a tréplica contesta a carta do replicante: a âncora gravada, ou a carta que contém a sentença da réplica
        const target = (t.card ? h.deck.find((c) => c.id === t.card && c.kind === 'claim') : undefined) as ClaimCard | undefined ?? claimAtRef(h, t.ref)
        const reply = target ? handCardAgainst(h, ctx.hand, target, [card.id, target.id]) : null
        if (target && reply) res.treplica = { card: reply.id, target: target.id }
      }
    }
    // 2. um apoiador real pode aparecer, só como cartão de relação
    const apoios = card.triggers.filter((t) => t.kind === 'apoia')
    if (apoios.length) {
      const [i, s1] = pickWeighted(res.rng, apoios.map((t) => (t.strength === 'forte' ? 2 : 1)))
      const t = apoios[i]
      const [reacts, s2] = chance(s1, B.APOIO_CARD_CHANCE)
      res.rng = s2
      if (reacts) {
        res.lines.push(relcardLine(lineId++, t, { kind: 'apoia', note: t.note, strength: t.strength, target: null, targetRef: card.ref, byPlayer: false }, copy.relcard.tambemSustentou(nameOfCast(h, t.speaker))))
        res.thread.push({ kind: 'apoia', from: t.speaker, to: 'player', ref: t.ref, note: t.note })
      }
    }
  }

  if (move === 'contesto' && card.kind === 'claim') {
    // 1. quem apoiou A na vida real pode defendê-lo
    const apoios = card.triggers.filter((t) => t.kind === 'apoia')
    if (apoios.length) {
      const [i, s1] = pickWeighted(res.rng, apoios.map((t) => (t.strength === 'forte' ? 2 : 1)))
      const t = apoios[i]
      const [reacts, s2] = chance(s1, B.DEFENDE_CHANCE)
      res.rng = s2
      if (reacts) {
        push(t, { kind: 'defende', note: t.note, strength: t.strength, target: card.speaker, targetRef: card.ref, byPlayer: false, anchor: t.anchor })
        res.thread.push({ kind: 'defende', from: t.speaker, to: card.speaker, ref: t.ref, note: t.note })
      }
    }
    // 2. quem contradisse A na vida real pode concordar com você
    const contras = card.triggers.filter((t) => t.kind === 'contradiz' && t.fala !== cite?.fala)
    if (contras.length) {
      const [i, s1] = pickWeighted(res.rng, contras.map((t) => (t.strength === 'forte' ? 3 : 1)))
      const t = contras[i]
      const [reacts, s2] = chance(s1, B.CONCORDA_CHANCE)
      res.rng = s2
      if (reacts) {
        res.lines.push(relcardLine(lineId++, t, { kind: 'concorda', note: t.note, strength: t.strength, target: null, targetRef: card.ref, byPlayer: false }, copy.relcard.concordaComVoce))
        res.thread.push({ kind: 'concorda', from: t.speaker, to: 'player', ref: t.ref, note: t.note })
      }
    }
  }

  if (move === 'cobro' && card.kind === 'pergunta' && verdict.kind === 'ja_respondida' && card.answered_by_real) {
    // a resposta real já tocou: o cartão lembra o gist, sem reler a frase
    const a = card.answered_by_real
    const name = nameOfCast(h, a.speaker)
    const answer = a.card ? h.deck.find((c) => c.id === a.card) : undefined
    const r: Reaction = { kind: 'responde', fala: a.fala, speaker: a.speaker, role: roleOf(h, a.speaker), card: a.card, anchor: 'carta', plain: a.plain, text: a.text, ref: a.ref, note: copy.explain.jaRespondida(name), strength: 'forte' }
    const text = answer ? copy.relcard.jaRespondeu(name, answer.gist) : copy.relcard.jaRespondeuNote(name)
    res.lines.push(relcardLine(lineId++, r, { kind: 'responde', note: r.note, strength: 'forte', target: card.speaker, targetRef: card.ref, byPlayer: false }, text))
    res.thread.push({ kind: 'responde', from: a.speaker, to: 'player', ref: a.ref, note: r.note })
  }
  return res
}

export function nameOfCast(h: HearingSim, speaker: string): string {
  return displayName(h, speaker)
}

function roleOf(h: HearingSim, speaker: string) {
  return h.cast.find((m) => m.id === speaker)?.role ?? 'convidado'
}

/** A relação que a fala do jogador declara, para o badge do balão. */
export function playerTag(move: MoveKind, card: Card, verdict: Verdict): RelationTag {
  const kind: TagKind = move === 'sustento' ? 'apoia' : move === 'contesto' ? 'contradiz' : 'cobra'
  return { kind, note: verdict.explanation ?? '', strength: 'forte', target: card.speaker, targetRef: card.ref, byPlayer: true }
}

export function questionTargetRole(card: QuestionCard): string {
  return card.addressed_to
}
