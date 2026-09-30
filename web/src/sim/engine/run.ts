import { copy } from '../copy'
import { cardById, type FalaEvent, type HearingSim, type Page } from '../lib/hearing'
import * as B from './balance'
import { judge, type MoveKind, type Verdict } from './judge'
import { chance } from './rng'
import { playerTag, resolveMove, sourceOf, systemLine, type Delta, type Line, type ThreadEvent, type TreplicaOffer } from './rules'
import { sayMove } from './say'

export type Phase = 'tese' | 'prelude' | 'opening' | 'session' | 'floor' | 'reaction' | 'closing' | 'ata'
export type FloorKind = 'granted' | 'interject'

export interface Move {
  turn: number
  kind: MoveKind
  card: string
  cite: string | null
  /** a frase do molde, como foi dita */
  said: string
  verdict: Verdict
  /** o que a sala fez em resposta */
  reactions: Omit<ThreadEvent, 'id'>[]
  /** veio do botão Tréplica */
  treplica: boolean
}

export interface RunState {
  seed: number
  rng: number
  phase: Phase
  tese: string | null
  guided: boolean
  /** índice do próximo evento da linha do tempo a processar */
  cursor: number
  /** fala em curso: índice do evento e da página */
  play: { event: number; page: number } | null
  clock: number
  current: Line | null
  queue: Line[]
  nextLineId: number
  nextDeltaId: number

  conviction: number
  attention: number
  mesaPatience: number

  hand: string[]
  noted: string[]
  /** anotável agora: a carta ou pergunta da página em curso (ou da réplica em curso) */
  notable: string[]
  /** cartas (ou refs) já lidas por inteiro nesta sessão, como página ou como réplica: nada é lido duas vezes */
  shownCards: string[]
  moves: Move[]
  movesLeft: number
  thread: ThreadEvent[]
  deltas: Delta[]
  /** páginas de pessoa nomeada já exibidas e originais abertos (para a ata) */
  pagesSeen: number
  originalsOpened: string[]
  /** perguntas cobradas em aberto (+2 quando a sala responde depois) e as que a sala respondeu depois */
  cobradas: string[]
  respondidas: string[]
  treplicaOffer: TreplicaOffer | null
  floorsUsed: number
  floorKind: FloorKind | null
  floorSpoke: boolean
  interjectsUsed: number
  /** o texto original está aberto: a digitação e o relógio da fala param, a atenção não cai */
  originalOpen: boolean
  /** aviso curto de interface (aparte recusado, atenção baixa...) */
  notice: { id: number; text: string } | null
}

export type Action =
  | { t: 'chooseTese'; tese: string; guided: boolean }
  | { t: 'enterRoom' }
  | { t: 'advance' }
  | { t: 'tick'; dt: number; looking: boolean }
  | { t: 'note'; card: string }
  | { t: 'openOriginal'; open: boolean }
  | { t: 'requestInterject' }
  | { t: 'speak'; kind: MoveKind; card: string; cite: string | null }
  | { t: 'treplica' }
  | { t: 'yieldFloor' }

export function createRun(seed: number): RunState {
  return {
    seed, rng: seed >>> 0, phase: 'tese', tese: null, guided: false, cursor: 0, play: null, clock: 0,
    current: null, queue: [], nextLineId: 1, nextDeltaId: 1,
    conviction: B.START_CONVICTION, attention: B.START_ATTENTION, mesaPatience: B.START_PATIENCE,
    hand: [], noted: [], notable: [], shownCards: [], moves: [], movesLeft: 0, thread: [], deltas: [],
    pagesSeen: 0, originalsOpened: [], cobradas: [], respondidas: [], treplicaOffer: null,
    floorsUsed: 0, floorKind: null, floorSpoke: false, interjectsUsed: 0, originalOpen: false, notice: null,
  }
}

export function interjectChance(s: RunState): number {
  const p = 0.5 + (s.conviction - 50) / 300 + (s.mesaPatience - 70) / 300
  return Math.min(0.95, Math.max(0.05, p))
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.min(hi, Math.max(lo, v))
}

function line(s: RunState, partial: Omit<Line, 'id'>): [Line, RunState] {
  return [{ ...partial, id: s.nextLineId }, { ...s, nextLineId: s.nextLineId + 1 }]
}

function pageLine(ev: FalaEvent, i: number): Omit<Line, 'id'> {
  const p: Page = ev.pages[i]
  const last = i === ev.pages.length - 1
  return {
    kind: 'fala', speaker: ev.speaker, text: p.plain ?? p.original.text, plain: p.plain, original: p.original, ref: p.original.ref,
    page: { kind: p.kind, card: p.card }, relation: null, fala: ev.id, applause: last ? ev.applause : 0, retomada: false, move: null,
    sources: [], verdict: null,
  }
}

function notice(s: RunState, text: string): RunState {
  return { ...s, notice: { id: s.nextDeltaId, text }, nextDeltaId: s.nextDeltaId + 1 }
}

function applyDeltas(s: RunState, ds: Omit<Delta, 'id'>[]): RunState {
  let out = s
  for (const d of ds) {
    const delta: Delta = { ...d, id: out.nextDeltaId }
    out = { ...out, nextDeltaId: out.nextDeltaId + 1, deltas: [...out.deltas.slice(-5), delta] }
    if (d.meter === 'conviccao') out = { ...out, conviction: clamp(out.conviction + d.value) }
    else if (d.meter === 'mesa') out = { ...out, mesaPatience: clamp(out.mesaPatience + d.value) }
    else out = { ...out, attention: clamp(out.attention + d.value) }
  }
  return out
}

function pushThread(s: RunState, items: Omit<ThreadEvent, 'id'>[]): RunState {
  if (!items.length) return s
  let id = s.nextDeltaId
  const thread = [...s.thread, ...items.map((it) => ({ ...it, id: id++ }))]
  return { ...s, thread, nextDeltaId: id }
}

/** A fala já tocou (ou está tocando) na sessão. */
export function spoken(h: HearingSim, s: RunState, falaId: string): boolean {
  const idx = h.timeline.findIndex((e) => e.kind === 'fala' && e.id === falaId)
  return idx >= 0 && (idx < s.cursor || (s.play !== null && s.play.event === idx))
}

/** A primeira página da fala a partir de `from` que ainda não foi lida (uma réplica pode ter antecipado uma página). */
function nextPage(ev: FalaEvent, from: number, shown: string[]): number {
  for (let i = from; i < ev.pages.length; i++) if (!shown.includes(ev.pages[i].card)) return i
  return -1
}

/** O que acontece quando a linha do tempo chega a uma fala, antes de ler a primeira página. */
function enterFala(h: HearingSim, s: RunState, ev: FalaEvent): RunState {
  let out = s
  // uma pergunta que você cobrou e a sala responde agora
  const cards = cardById(h)
  const answered = out.cobradas.filter((q) => {
    const c = cards.get(q)
    return c?.kind === 'pergunta' && c.answered_by_real?.fala === ev.id
  })
  if (answered.length) {
    out = applyDeltas(out, answered.map(() => ({ meter: 'conviccao' as const, value: B.SALA_RESPONDEU, cause: copy.deltas.salaRespondeu })))
    out = pushThread(out, answered.map((q) => ({ kind: 'respondida' as const, from: ev.speaker, to: 'player', ref: cards.get(q)?.ref ?? null, note: copy.thread.respondidaDepois })))
    out = { ...out, cobradas: out.cobradas.filter((q) => !answered.includes(q)), respondidas: [...out.respondidas, ...answered] }
  }
  return out
}

function showPage(s: RunState, ev: FalaEvent, idx: number, pageIdx: number): RunState {
  const [ln, s2] = line(s, pageLine(ev, pageIdx))
  const card = ev.pages[pageIdx].card
  return {
    ...s2, phase: 'session', play: { event: idx, page: pageIdx }, notable: [card], current: ln, pagesSeen: s2.pagesSeen + 1,
    shownCards: s2.shownCards.includes(card) ? s2.shownCards : [...s2.shownCards, card],
  }
}

function endFala(h: HearingSim, s: RunState, ev: FalaEvent): RunState {
  const items: Omit<ThreadEvent, 'id'>[] = [{ kind: 'voce', from: ev.speaker, to: null, ref: ev.stance.ref, note: ev.summary }]
  if (ev.applause > 0) items.push({ kind: 'palmas', from: ev.speaker, to: null, ref: ev.stance.ref, note: copy.thread.palmas(ev.applause) })
  void h
  return pushThread({ ...s, notable: [] }, items)
}

function grantFloor(h: HearingSim, s: RunState): RunState {
  const low = s.conviction < B.LOW_CONVICTION
  const [ln, s2] = line(s, systemLine(low ? copy.mesa.concedeBreve : copy.mesa.concede))
  return { ...s2, phase: 'floor', floorKind: 'granted', floorSpoke: false, movesLeft: low ? 1 : Math.max(1, h.player.moves_per_floor), current: ln, treplicaOffer: null }
}

/** Avança para a próxima linha (spec §12). Fila de réplicas primeiro; depois a fala em curso; depois a linha do tempo. */
export function advance(h: HearingSim, s0: RunState): RunState {
  let s = s0
  if (s.phase === 'tese' || s.phase === 'prelude' || s.phase === 'ata') return s
  if (s.queue.length) {
    // réplicas: uma réplica lida por inteiro é anotável como a página que antecipa
    const [next, ...rest] = s.queue
    return { ...s, current: next, queue: rest, notable: next.page ? [next.page.card] : [] }
  }
  if (s.phase === 'reaction') {
    // acabaram as réplicas: ainda há movimento nesta vez? o painel volta
    if (s.floorKind && s.movesLeft > 0) return { ...s, phase: 'floor', current: null, treplicaOffer: null }
    s = { ...s, phase: 'session', floorKind: null, movesLeft: 0, treplicaOffer: null }
  }
  if (s.phase === 'floor') return s
  if (s.phase === 'closing') return { ...s, phase: 'ata', current: null }

  if (s.play) {
    const ev = h.timeline[s.play.event] as FalaEvent
    const nextIdx = nextPage(ev, s.play.page + 1, s.shownCards)
    if (nextIdx >= 0) return showPage(s, ev, s.play.event, nextIdx)
    s = endFala(h, s, ev)
    s = { ...s, play: null, cursor: s.play!.event + 1 }
  }

  for (;;) {
    if (s.cursor >= h.timeline.length) return { ...s, phase: 'ata', current: null }
    const ev = h.timeline[s.cursor]
    if (ev.kind === 'mesa') {
      const patience = ev.move === 'pede_conclusao' || ev.move === 'corta' ? -4 : ev.move === 'ordem' ? -2 : 0
      const opening = s.phase === 'opening' && (ev.move === 'abre' || ev.move === 'apresenta' || ev.move === 'anuncia_presenca')
      let s2: RunState = { ...s, cursor: s.cursor + 1, phase: opening ? 'opening' : 'session' }
      if (patience) s2 = { ...s2, mesaPatience: clamp(s2.mesaPatience + patience) }
      const [ln, s3] = line(s2, { kind: 'mesa', speaker: ev.speaker, text: ev.text, plain: null, original: ev.original, ref: ev.original.ref, page: null, relation: null, fala: ev.id, applause: 0, retomada: false, move: ev.move, sources: [], verdict: null })
      return { ...s3, current: ln }
    }
    if (ev.kind === 'fala') {
      s = enterFala(h, s, ev)
      const first = nextPage(ev, 0, s.shownCards)
      if (first >= 0) return showPage(s, ev, s.cursor, first)
      // todas as páginas desta fala já foram lidas como réplicas: a fala não se repete
      s = endFala(h, s, ev)
      s = { ...s, cursor: s.cursor + 1 }
      continue
    }
    if (ev.kind === 'floor') {
      s = { ...s, cursor: s.cursor + 1 }
      if (s.floorsUsed < h.player.slots.length) return grantFloor(h, s)
      continue
    }
    // close
    s = { ...s, cursor: s.cursor + 1, phase: 'closing' }
    const [ln, s2] = ev.text && ev.speaker && ev.original
      ? line(s, { kind: 'mesa', speaker: ev.speaker, text: ev.text, plain: null, original: ev.original, ref: ev.original.ref, page: null, relation: null, fala: null, applause: 0, retomada: false, move: 'encerra', sources: [], verdict: null })
      : line(s, systemLine(copy.mesa.encerrada))
    return { ...s2, current: ln }
  }
}

function playerLine(said: string, sources: Line['sources'], tag: Line['relation'], verdict: Verdict, before: number): Omit<Line, 'id'> {
  return {
    kind: 'player', speaker: null, text: said, plain: null, original: null, ref: null, page: null, relation: tag, fala: null, applause: 0, retomada: false, move: null, sources, verdict,
    meter: { before, after: clamp(before + verdict.delta) },
  }
}

function doSpeak(h: HearingSim, s: RunState, kind: MoveKind, cardId: string, citeId: string | null, treplica: boolean, extraDelta: number): RunState | null {
  const cards = cardById(h)
  const tese = h.teses.find((t) => t.id === s.tese)
  const card = cards.get(cardId)
  const cite = citeId ? cards.get(citeId) : null
  if (!tese || !card) return null
  if (cite && cite.kind !== 'claim') return null
  const verdict = judge(h, tese, kind, card, cite ?? null, { played: s.moves.map((m) => m.card), spoken: (f) => spoken(h, s, f) })
  if (!verdict) return null
  const [said, rng1] = sayMove(h, kind, card, cite ?? null, s.rng)
  const sources = [sourceOf(card), ...(cite ? [sourceOf(cite)] : [])]
  const total = verdict.delta + extraDelta
  const fullVerdict: Verdict = { ...verdict, delta: total }
  let out: RunState = { ...s, rng: rng1 }
  const [pl, s2] = line(out, playerLine(said, sources, playerTag(kind, card, fullVerdict), fullVerdict, s.conviction))
  out = s2
  const shownNow = out.shownCards
  const res = treplica
    ? { lines: [], thread: [], rng: out.rng, treplica: null, shown: [] as string[] }
    : resolveMove(h, kind, card, cite ?? null, fullVerdict, { hand: out.hand, rng: out.rng, nextLineId: out.nextLineId, shown: (k) => shownNow.includes(k) })
  const maxId = res.lines.reduce((m, l) => Math.max(m, l.id), out.nextLineId - 1)
  out = { ...out, rng: res.rng, nextLineId: maxId + 1, shownCards: [...out.shownCards, ...res.shown.filter((k) => !out.shownCards.includes(k))] }
  // a carta jogada sai da mão; a 2ª carta de um par inválido fica
  const keepCite = verdict.kind === 'par_invalido'
  out = { ...out, hand: out.hand.filter((id) => id !== card.id && (keepCite || id !== cite?.id)) }
  out = applyDeltas(out, [{ meter: 'conviccao', value: total, cause: copy.verdict.short(fullVerdict.kind) }])
  const thread: Omit<ThreadEvent, 'id'>[] = [
    { kind: kind === 'sustento' ? 'apoia' : kind === 'contesto' ? 'contradiz' : 'cobranca', from: 'player', to: card.speaker, ref: card.ref, note: said },
    { kind: 'veredito', from: 'player', to: null, ref: card.ref, note: copy.thread.veredito(copy.verdict.short(fullVerdict.kind), fullVerdict.explanation) },
    ...res.thread,
  ]
  out = pushThread(out, thread)
  const turn = out.floorKind === 'interject' ? out.floorsUsed : out.floorsUsed + (out.floorSpoke ? 0 : 1)
  const move: Move = { turn, kind, card: card.id, cite: keepCite ? null : cite?.id ?? null, said, verdict: fullVerdict, reactions: res.thread, treplica }
  let cobradas = out.cobradas
  if (kind === 'cobro' && verdict.kind !== 'ja_respondida' && card.kind === 'pergunta' && card.answered_by_real) cobradas = [...cobradas, card.id]
  const queue = [pl, ...res.lines]
  const offer: TreplicaOffer | null = res.treplica ? { ...res.treplica, until: out.clock + B.TREPLICA_WINDOW_S } : null
  return {
    ...out, moves: [...out.moves, move], cobradas, phase: 'reaction', current: queue[0], queue: queue.slice(1), notice: null,
    treplicaOffer: offer,
  }
}

export function reduce(h: HearingSim, s: RunState, a: Action): RunState {
  switch (a.t) {
    case 'chooseTese': {
      if (s.phase !== 'tese') return s
      if (!h.teses.some((t) => t.id === a.tese)) return s
      return { ...s, phase: 'prelude', tese: a.tese, guided: a.guided }
    }
    case 'enterRoom': {
      if (s.phase !== 'prelude') return s
      return advance(h, { ...s, phase: 'opening' })
    }
    case 'advance':
      return advance(h, s)
    case 'tick': {
      if (s.phase === 'tese' || s.phase === 'prelude' || s.phase === 'ata') return s
      const dt = Math.min(a.dt, 0.5)
      if (s.originalOpen) return { ...s, mesaPatience: clamp(s.mesaPatience + B.PATIENCE_RECOVER * dt) }
      const attention = a.looking ? clamp(s.attention + B.ATTENTION_GAIN * dt) : clamp(s.attention - B.ATTENTION_LOSS * dt)
      const clock = s.clock + dt
      const offer = s.treplicaOffer && s.treplicaOffer.until < clock ? null : s.treplicaOffer
      return { ...s, clock, attention, mesaPatience: clamp(s.mesaPatience + B.PATIENCE_RECOVER * dt), treplicaOffer: offer }
    }
    case 'note': {
      if (!s.notable.includes(a.card) || s.noted.includes(a.card)) return s
      if (s.attention < B.ATTENTION_MIN_TO_NOTE) return notice(s, copy.notices.semAtencao)
      if (s.hand.length >= B.HAND_MAX) return notice(s, copy.notices.cadernoCheio)
      return { ...s, hand: [...s.hand, a.card], noted: [...s.noted, a.card], notice: null }
    }
    case 'openOriginal': {
      if (s.phase === 'tese' || s.phase === 'prelude' || s.phase === 'ata') return s
      if (s.originalOpen === a.open) return s
      if (!a.open) return { ...s, originalOpen: false }
      const key = s.current?.page ? s.current.page.card : s.current?.ref ?? (s.current ? `line:${s.current.id}` : null)
      if (!s.current || (!s.current.original && !s.current.sources.length)) return s
      const opened = key && !s.originalsOpened.includes(key) ? [...s.originalsOpened, key] : s.originalsOpened
      return { ...s, originalOpen: true, originalsOpened: opened }
    }
    case 'requestInterject': {
      if (s.phase !== 'session' || !s.play || !s.hand.length) return s
      if (s.interjectsUsed >= B.MAX_INTERJECTS) return notice(s, copy.notices.apartesEsgotados)
      if (s.mesaPatience < B.LOW_PATIENCE) return notice(s, copy.notices.mesaSemPaciencia)
      const [ok, rng] = chance(s.rng, interjectChance(s))
      let out: RunState = { ...s, rng, interjectsUsed: s.interjectsUsed + 1 }
      if (!ok) {
        out = applyDeltas(out, [{ meter: 'mesa', value: -B.INTERJECT_FAIL_PATIENCE, cause: copy.deltas.aparteRecusado }])
        return notice(out, copy.notices.aparteNegado)
      }
      const [ln, s2] = line(out, systemLine(copy.mesa.aparte))
      return { ...s2, phase: 'floor', floorKind: 'interject', floorSpoke: false, movesLeft: B.MOVES_PER_INTERJECT, current: ln, notice: null, treplicaOffer: null }
    }
    case 'yieldFloor': {
      // devolver a palavra sem falar não gasta a vez
      if (s.phase !== 'floor') return s
      const [ln, s2] = line({ ...s, floorKind: null, movesLeft: 0, phase: 'reaction' }, systemLine(copy.mesa.devolve))
      return { ...s2, current: ln }
    }
    case 'speak': {
      if (s.phase !== 'floor' || s.movesLeft <= 0 || !s.tese) return s
      if (!s.hand.includes(a.card)) return s
      if (a.cite && (!s.hand.includes(a.cite) || a.cite === a.card)) return s
      const out = doSpeak(h, s, a.kind, a.card, a.cite, false, 0)
      if (!out) return s
      const first = out.floorKind === 'granted' && !out.floorSpoke
      return { ...out, movesLeft: out.movesLeft - 1, floorSpoke: true, floorsUsed: first ? out.floorsUsed + 1 : out.floorsUsed }
    }
    case 'treplica': {
      const offer = s.treplicaOffer
      if (!offer || !s.tese || offer.until < s.clock) return s
      if (!s.hand.includes(offer.card)) return { ...s, treplicaOffer: null }
      const cards = cardById(h)
      const tese = h.teses.find((t) => t.id === s.tese)
      const target = cards.get(offer.target)
      const cite = cards.get(offer.card)
      if (!tese || !target || !cite || cite.kind !== 'claim') return { ...s, treplicaOffer: null }
      const pre = judge(h, tese, 'contesto', target, cite, { played: s.moves.map((m) => m.card), spoken: (f) => spoken(h, s, f) })
      const bonus = pre && (pre.kind === 'coerente' || pre.kind === 'certeiro') ? B.TREPLICA : 0
      const out = doSpeak(h, { ...s, treplicaOffer: null }, 'contesto', offer.target, offer.card, true, bonus)
      if (!out) return { ...s, treplicaOffer: null }
      // a tréplica entra na fila logo depois da réplica em curso, sem gastar movimento
      return { ...out, phase: 'reaction' }
    }
  }
}
