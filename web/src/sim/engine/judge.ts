import { copy } from '../copy'
import { cardById, displayName, isClaim, isQuestion, themeById, type Card, type ClaimCard, type HearingSim, type Reaction, type Role, type Tese } from '../lib/hearing'
import * as B from './balance'

export type MoveKind = 'sustento' | 'contesto' | 'cobro'
/**
 * Onde a carta está em relação à tese (spec §7.6, revista em 2026-09-15 pelo RELATORIO-grafo-e-argumentacao.md):
 * `aliada`/`adversaria` quando a carta toma lado num tema da tese; `consenso` quando está num grupo de consenso e a
 * tese não toma lado ali; `ressalva` quando a carta apoia com ressalvas num tema da tese; `evidencia`/`contraevidencia`
 * quando a carta só informa mas o grafo a liga a uma carta que está do lado da tese (ou do outro); `fora` no resto.
 */
export type Align = 'consenso' | 'fora' | 'aliada' | 'adversaria' | 'ressalva' | 'evidencia' | 'contraevidencia'
export type VerdictKind = 'coerente' | 'contradicao' | 'neutro' | 'consenso' | 'certeiro' | 'par_invalido' | 'ja_respondida' | 'repetida'

export interface Verdict {
  kind: VerdictKind
  /** variação total de convicção, bônus incluídos */
  delta: number
  explanation: string | null
  /** houve aresta real entre a carta citada e a contestada */
  certeiro: boolean
  /** sustentou uma carta aliada de outro papel que não o majoritário da tese */
  alemDoBloco: boolean
}

export interface JudgeContext {
  played: string[]
  /** a fala já tocou na sessão (cursor passou por ela ou está em curso) */
  spoken: (fala: string) => boolean
}

/** A reação `r`, gravada na carta `a`, aponta a carta `b`: pela âncora de carta quando existe, senão pela fala. */
function reactionHits(r: Reaction, b: ClaimCard): boolean {
  return r.fala === b.fala && (r.card === null || r.card === b.id)
}

/**
 * A aresta do grafo entre duas cartas, em qualquer direção, restrita aos tipos pedidos. Devolve a reação (com a
 * nota escrita por quem anotou), ou null. As disputas de dado entram como `contradiz` (build_scene.py).
 */
export function edgeBetween(a: ClaimCard, b: ClaimCard, kinds: Reaction['kind'][] = ['apoia', 'contradiz', 'responde']): Reaction | null {
  const pick = (x: ClaimCard, y: ClaimCard) => [...x.triggers, ...x.asserts].find((r) => kinds.includes(r.kind) && reactionHits(r, y)) ?? null
  return pick(a, b) ?? pick(b, a)
}

/** Há uma aresta `contradiz` real entre as duas cartas (qualquer direção), ou uma disputa de dado. */
export function contradictsEdge(a: ClaimCard, b: ClaimCard): boolean {
  return edgeBetween(a, b, ['contradiz']) !== null
}

/**
 * A segunda carta pode ser citada ao contestar a primeira: do mesmo tema (como sempre), ou de outro tema quando o
 * grafo registra que uma contradisse a outra na audiência real (fase 3 do relatório). É o grafo, não o tema, que
 * autoriza o argumento cruzado.
 */
export function canCite(card: ClaimCard, cite: ClaimCard): boolean {
  return cite.id !== card.id && (cite.theme === card.theme || contradictsEdge(card, cite))
}

/** O lado que uma carta neutra pesa, pelo grafo: apoia uma aliada ou contradiz uma adversária (e vice-versa). */
export function graphSide(h: HearingSim, tese: Tese, card: ClaimCard): { side: 'evidencia' | 'contraevidencia'; via: Reaction; other: ClaimCard } | null {
  const cards = cardById(h)
  let pro: { via: Reaction; other: ClaimCard } | null = null
  let contra: { via: Reaction; other: ClaimCard } | null = null
  let nPro = 0
  let nContra = 0
  for (const r of [...card.triggers, ...card.asserts]) {
    if (r.kind === 'responde' || !r.card) continue
    const other = cards.get(r.card)
    if (!isClaim(other)) continue
    const a = align(tese, other)
    if (a !== 'aliada' && a !== 'adversaria') continue
    const helps = (r.kind === 'apoia') === (a === 'aliada')
    if (helps) {
      nPro++
      pro ??= { via: r, other }
    } else {
      nContra++
      contra ??= { via: r, other }
    }
  }
  if (nPro > nContra && pro) return { side: 'evidencia', ...pro }
  if (nContra > nPro && contra) return { side: 'contraevidencia', ...contra }
  return null
}

/**
 * Onde uma carta está em relação à tese (spec §7.6). O lado da tese vem primeiro: uma carta que toma lado num tema
 * da tese é aliada ou adversária mesmo quando é consenso na sala (é o que deixa a tese minoritária contestar o que
 * a maioria concordou). Com `h`, a carta neutra é lida pelo grafo.
 */
export function align(tese: Tese, card: Card, h?: HearingSim): Align {
  const side = tese.positions[card.theme]
  if (side !== undefined && (card.position === 'favoravel' || card.position === 'contrario')) return card.position === side ? 'aliada' : 'adversaria'
  if (isClaim(card) && card.consensus) return 'consenso'
  if (side !== undefined && card.position === 'condicional') return 'ressalva'
  if (h && isClaim(card) && card.position === 'neutro') {
    const g = graphSide(h, tese, card)
    if (g) return g.side
  }
  return 'fora'
}

/** O papel que mais defendeu a tese na sala (para o bônus "além do seu bloco"). */
export function majorityRole(tese: Tese): Role | null {
  let best: Role | null = null
  let n = -1
  for (const [role, count] of Object.entries(tese.defenders) as [Role, number | undefined][]) {
    if ((count ?? 0) > n) {
      n = count ?? 0
      best = role
    }
  }
  return best
}

function opposite(a: string, b: string): boolean {
  return (a === 'favoravel' && b === 'contrario') || (a === 'contrario' && b === 'favoravel')
}

function sidePlain(h: HearingSim, card: Card): string {
  const theme = themeById(h).get(card.theme)
  if (!theme) return ''
  return card.position === 'favoravel' ? theme.axis.pro_plain : theme.axis.contra_plain
}

function consensusNote(h: HearingSim, card: Card): string | null {
  return h.consensus.find((c) => c.cards.includes(card.id))?.note ?? null
}

const NO_FLAGS = { certeiro: false, alemDoBloco: false }

/**
 * O julgamento de coerência (spec §7.6). Puro: devolve null quando o movimento não é válido para a carta
 * (o estado então fica intocado). Toda contradição vem com explicação montada de campos existentes.
 */
export function judge(h: HearingSim, tese: Tese, move: MoveKind, card: Card, cite: ClaimCard | null, ctx: JudgeContext): Verdict | null {
  if (move === 'cobro' ? !isQuestion(card) : !isClaim(card)) return null
  if (cite && (move !== 'contesto' || !isClaim(card) || !canCite(card, cite))) return null
  const name = displayName(h, card.speaker)
  if (ctx.played.includes(card.id)) {
    return { kind: 'repetida', delta: B.REPETIDA, explanation: copy.explain.repetida, ...NO_FLAGS }
  }
  const a = align(tese, card, h)
  const graph = isClaim(card) && (a === 'evidencia' || a === 'contraevidencia') ? graphSide(h, tese, card) : null
  const otherName = graph ? displayName(h, graph.other.speaker) : ''

  if (move === 'sustento' && isClaim(card)) {
    if (a === 'consenso') return { kind: 'consenso', delta: B.CONSENSO, explanation: copy.explain.consenso(consensusNote(h, card)), ...NO_FLAGS }
    if (a === 'fora') return { kind: 'neutro', delta: B.NEUTRO, explanation: copy.explain.neutro, ...NO_FLAGS }
    if (a === 'ressalva') return { kind: 'coerente', delta: B.RESSALVA, explanation: copy.explain.ressalva(name, 'sustento'), ...NO_FLAGS }
    if (a === 'evidencia' && graph) return { kind: 'coerente', delta: B.EVIDENCIA, explanation: copy.explain.evidencia(name, otherName, graph.via.note), ...NO_FLAGS }
    if (a === 'contraevidencia' && graph) return { kind: 'contradicao', delta: B.EVIDENCIA_CONTRA, explanation: copy.explain.contraevidencia(name, otherName, graph.via.note), ...NO_FLAGS }
    if (a === 'adversaria') {
      return { kind: 'contradicao', delta: B.CONTRADICAO, explanation: copy.explain.sustentoAdversaria(tese.statement_plain, name, sidePlain(h, card)), ...NO_FLAGS }
    }
    const alem = majorityRole(tese) !== null && card.role !== majorityRole(tese)
    return { kind: 'coerente', delta: B.COERENTE + (alem ? B.ALEM_DO_BLOCO : 0), explanation: alem ? copy.explain.alemDoBloco : null, certeiro: false, alemDoBloco: alem }
  }

  if (move === 'contesto' && isClaim(card)) {
    let kind: VerdictKind
    let delta: number
    let explanation: string | null = null
    if (a === 'consenso') {
      kind = 'contradicao'
      delta = B.CONSENSO_CONTESTADO
      explanation = copy.explain.consensoContestado(consensusNote(h, card))
    } else if (a === 'fora') {
      kind = 'neutro'
      delta = B.NEUTRO
      explanation = copy.explain.neutro
    } else if (a === 'ressalva') {
      kind = 'coerente'
      delta = B.RESSALVA
      explanation = copy.explain.ressalva(name, 'contesto')
    } else if (a === 'evidencia' && graph) {
      kind = 'contradicao'
      delta = B.EVIDENCIA_CONTRA
      explanation = copy.explain.contestoEvidencia(name, otherName, graph.via.note)
    } else if (a === 'contraevidencia' && graph) {
      kind = 'coerente'
      delta = B.EVIDENCIA
      explanation = copy.explain.contestoContraevidencia(name, otherName, graph.via.note)
    } else if (a === 'aliada') {
      kind = 'contradicao'
      delta = B.CONTRADICAO
      explanation = copy.explain.contestoAliada(tese.statement_plain, name, sidePlain(h, card))
    } else {
      kind = 'coerente'
      delta = B.COERENTE
    }
    if (cite) {
      const nameB = displayName(h, cite.speaker)
      const edge = edgeBetween(card, cite, ['contradiz'])
      if (edge) {
        delta += B.CERTEIRO
        if (kind === 'coerente' || kind === 'neutro') {
          kind = 'certeiro'
          explanation = copy.explain.certeiro(nameB, name, edge.note)
        }
        return { kind, delta, explanation, certeiro: true, alemDoBloco: false }
      }
      if (!opposite(card.position, cite.position)) {
        // par inválido: a segunda carta não sai da mão (run.ts)
        return { kind: 'par_invalido', delta: B.PAR_INVALIDO, explanation: copy.explain.parInvalido(nameB, name), ...NO_FLAGS }
      }
    }
    return { kind, delta, explanation, ...NO_FLAGS }
  }

  if (move === 'cobro' && isQuestion(card)) {
    const answer = card.answered_by_real
    if (answer && ctx.spoken(answer.fala)) {
      return { kind: 'ja_respondida', delta: B.COBRO_JA_RESPONDIDA, explanation: copy.explain.jaRespondida(displayName(h, answer.speaker)), ...NO_FLAGS }
    }
    if (a === 'aliada') return { kind: 'coerente', delta: B.COBRO, explanation: null, ...NO_FLAGS }
    if (a === 'adversaria') {
      return { kind: 'contradicao', delta: B.COBRO_CONTRA, explanation: copy.explain.cobroContra(tese.statement_plain, sidePlain(h, card)), ...NO_FLAGS }
    }
    return { kind: 'neutro', delta: B.COBRO_NEUTRO, explanation: copy.explain.neutro, ...NO_FLAGS }
  }
  return null
}
