import { create } from 'zustand'
import { AUTOPLAY_DEFAULT, DEFAULT_SPEED_INDEX, SPEEDS, TEXT_MODE_DEFAULT } from '../engine/balance'
import { canCite, type MoveKind } from '../engine/judge'
import { seedFrom } from '../engine/rng'
import type { Line } from '../engine/rules'
import { createRun, reduce, type Action, type RunState } from '../engine/run'
import { setMuted, unlock } from '../lib/sound'
import { loadHearing, type HearingSim } from '../lib/hearing'

export type Status = 'idle' | 'loading' | 'ready' | 'error'

/**
 * A vez de falar em três passos, na ordem que a pessoa preferir: o movimento (sustentar, contestar, cobrar), a
 * anotação principal e, só ao contestar, uma segunda anotação que discorda dela (a citação): do mesmo tema, ou de
 * outro tema quando o grafo registra que uma respondeu à outra na audiência (`canCite`).
 */

/** O que o balão digita por padrão: a versão em palavras simples ou o original verbatim (pedido do autor, 2026-09-15). */
export type TextMode = 'plain' | 'verbatim'

/** Os painéis de consulta da sala: um aberto por vez. */
export type Panel = 'help' | 'glossary' | 'history'

/** O que já passou pela sala, na ordem: as linhas do balão e os avisos. É o que o histórico mostra. */
export type LogItem = { key: string; line: Line } | { key: string; notice: string }

export interface Selection {
  card: string | null
  kind: MoveKind | null
  cite: string | null
}

const NO_SELECTION: Selection = { card: null, kind: null, cite: null }

interface SimState {
  hearingId: number | null
  hearing: HearingSim | null
  status: Status
  error: string | null
  run: RunState
  /** índice em SPEEDS */
  speed: number
  /** as páginas avançam sozinhas; false = modo manual (Espaço/continuar) */
  autoplay: boolean
  /** a versão que o balão digita primeiro; a outra continua a um clique no próprio balão */
  textMode: TextMode
  muted: boolean
  panel: Panel | null
  log: LogItem[]
  /** câmera olhando para a mesa de anotações (inclinação abaixo de -50°) */
  deskView: boolean
  lookingAtSpeaker: boolean
  selection: Selection
  /** a linha atual terminou de digitar */
  typingDone: boolean
  /** pedidos à câmera: virar para o orador; abrir/fechar a mesa de anotações */
  lookRequest: number
  deskRequest: { open: boolean; nonce: number }
  /** virar a câmera um passo para a esquerda (-1) ou para a direita (1) */
  turnRequest: { dir: -1 | 1; nonce: number }
  /** a leitura em voz alta da linha atual terminou (ou não há leitura) */
  voiceDone: boolean
  /** a cena desenhou o primeiro quadro */
  sceneReady: boolean
  /** nonce: completar a página atual */
  skipNonce: number
  hurryNonce: number

  load: (id: number, seed?: string) => Promise<void>
  dispatch: (a: Action) => void
  chooseTese: (tese: string, guided: boolean) => void
  enterRoom: () => void
  advance: () => void
  continueManual: () => void
  /** o botão continuar e o Espaço: completam a página que ainda digita, ou passam para a próxima */
  stepManual: () => void
  note: (card: string) => void
  openOriginal: (open?: boolean) => void
  interject: () => void
  treplica: () => void
  select: (card: string) => void
  setMove: (kind: MoveKind) => void
  /** volta ao passo 1 sem perder a anotação já escolhida */
  clearMove: () => void
  clearCite: () => void
  clearSelection: () => void
  speak: () => void
  yieldFloor: () => void
  setSpeed: (dir: 1 | -1) => void
  setSpeedIndex: (i: number) => void
  setAutoplay: (v: boolean) => void
  toggleAutoplay: () => void
  setTextMode: (m: TextMode) => void
  toggleTextMode: () => void
  toggleMute: () => void
  togglePanel: (p: Panel, open?: boolean) => void
  setDeskView: (v: boolean) => void
  setLooking: (v: boolean) => void
  setTypingDone: (v: boolean) => void
  requestLook: () => void
  requestDesk: (open?: boolean) => void
  turn: (dir: -1 | 1) => void
  setVoiceDone: (v: boolean) => void
  setSceneReady: (v: boolean) => void
  skipTyping: () => void
  hurryTyping: () => void
  restart: (seed?: number) => void
}

function readSpeed(): number {
  try {
    const v = localStorage.getItem('sim.speed')
    const i = v === null ? DEFAULT_SPEED_INDEX : Number(v)
    return Number.isInteger(i) && i >= 0 && i < SPEEDS.length ? i : DEFAULT_SPEED_INDEX
  } catch {
    return DEFAULT_SPEED_INDEX
  }
}

function readAutoplay(): boolean {
  try {
    const v = localStorage.getItem('sim.autoplay')
    return v === null ? AUTOPLAY_DEFAULT : v === '1'
  } catch {
    return AUTOPLAY_DEFAULT
  }
}

function readTextMode(): TextMode {
  try {
    const v = localStorage.getItem('sim.text')
    return v === 'plain' || v === 'verbatim' ? v : TEXT_MODE_DEFAULT
  } catch {
    return TEXT_MODE_DEFAULT
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* sem armazenamento: segue sem lembrar */
  }
}

export const useSim = create<SimState>((set, get) => ({
  hearingId: null,
  hearing: null,
  status: 'idle',
  error: null,
  run: createRun(seedFrom(undefined)),
  speed: readSpeed(),
  autoplay: readAutoplay(),
  textMode: readTextMode(),
  muted: false,
  panel: null,
  log: [],
  deskView: false,
  lookingAtSpeaker: true,
  selection: NO_SELECTION,
  typingDone: false,
  lookRequest: 0,
  deskRequest: { open: false, nonce: 0 },
  turnRequest: { dir: 1, nonce: 0 },
  voiceDone: true,
  sceneReady: false,
  skipNonce: 0,
  hurryNonce: 0,

  async load(id, seed) {
    if (get().hearingId === id && get().status === 'ready') return
    set({ hearingId: id, status: 'loading', error: null, hearing: null, run: createRun(seedFrom(seed)), selection: NO_SELECTION, sceneReady: false, log: [], panel: null })
    try {
      const hearing = await loadHearing(id)
      set({ hearing, status: 'ready' })
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  },
  dispatch(a) {
    const { hearing, run } = get()
    if (!hearing) return
    const next = reduce(hearing, run, a)
    if (next === run) return
    const lineChanged = next.current?.id !== run.current?.id
    let log = get().log
    if (lineChanged && next.current) log = [...log, { key: `l${next.current.id}`, line: next.current }]
    if (next.notice && next.notice.id !== run.notice?.id) log = [...log, { key: `n${next.notice.id}`, notice: next.notice.text }]
    set({ run: next, typingDone: lineChanged ? false : get().typingDone, log })
  },
  chooseTese(tese, guided) {
    unlock()
    get().dispatch({ t: 'chooseTese', tese, guided })
  },
  enterRoom() {
    get().dispatch({ t: 'enterRoom' })
  },
  advance() {
    get().dispatch({ t: 'advance' })
  },
  continueManual() {
    const { run, typingDone } = get()
    if (run.phase === 'floor' || run.phase === 'ata' || run.phase === 'tese' || run.phase === 'prelude') return
    if (!typingDone && run.current?.kind !== 'relcard') return
    if (run.originalOpen) return
    get().dispatch({ t: 'advance' })
  },
  stepManual() {
    const { run, typingDone } = get()
    if (!typingDone && run.current && run.current.kind !== 'relcard') get().skipTyping()
    else get().continueManual()
  },
  note(card) {
    get().dispatch({ t: 'note', card })
  },
  openOriginal(open) {
    const { run } = get()
    get().dispatch({ t: 'openOriginal', open: open ?? !run.originalOpen })
  },
  interject() {
    get().dispatch({ t: 'requestInterject' })
  },
  treplica() {
    get().dispatch({ t: 'treplica' })
  },
  select(card) {
    const { selection, run, hearing } = get()
    if (!run.hand.includes(card) || !hearing) return
    const c = hearing.deck.find((x) => x.id === card)
    if (!c) return
    // clicar de novo na principal ou na citada tira a carta daquele lugar
    if (selection.card === card) {
      set({ selection: { ...selection, card: null, cite: null } })
      return
    }
    if (selection.cite === card) {
      set({ selection: { ...selection, cite: null } })
      return
    }
    // com uma afirmação escolhida para contestar, outra afirmação citável (mesmo tema, ou ligada pelo grafo) vira a citação
    const chosen = selection.card ? hearing.deck.find((x) => x.id === selection.card) : null
    if (chosen && selection.kind === 'contesto' && chosen.kind === 'claim' && c.kind === 'claim' && canCite(chosen, c)) {
      set({ selection: { ...selection, cite: card } })
      return
    }
    // senão, é a anotação principal; perguntas só se cobram, afirmações não se cobram
    const kind: MoveKind | null = c.kind === 'pergunta' ? 'cobro' : selection.kind === 'cobro' ? null : selection.kind
    set({ selection: { card, kind, cite: null } })
  },
  setMove(kind) {
    const { selection, run, hearing } = get()
    if (run.phase !== 'floor' || !hearing) return
    const c = selection.card ? hearing.deck.find((x) => x.id === selection.card) : null
    // a anotação escolhida não serve para este movimento: sai, e a pessoa escolhe outra
    const keep = c ? (kind === 'cobro') === (c.kind === 'pergunta') : false
    set({ selection: { card: keep ? selection.card : null, kind, cite: kind === 'contesto' && keep ? selection.cite : null } })
  },
  clearMove() {
    const { selection, run } = get()
    if (run.phase !== 'floor' || !selection.kind) return
    set({ selection: { ...selection, kind: null, cite: null } })
  },
  clearCite() {
    const { selection } = get()
    if (selection.cite) set({ selection: { ...selection, cite: null } })
  },
  clearSelection() {
    set({ selection: NO_SELECTION })
  },
  speak() {
    const { selection } = get()
    if (!selection.card || !selection.kind) return
    get().dispatch({ t: 'speak', kind: selection.kind, card: selection.card, cite: selection.kind === 'contesto' ? selection.cite : null })
    if (get().run.phase !== 'floor') set({ selection: NO_SELECTION })
  },
  yieldFloor() {
    get().dispatch({ t: 'yieldFloor' })
    set({ selection: NO_SELECTION })
  },
  setSpeed(dir) {
    const i = Math.min(SPEEDS.length - 1, Math.max(0, get().speed + dir))
    set({ speed: i })
    remember('sim.speed', String(i))
  },
  setSpeedIndex(i) {
    const v = Math.min(SPEEDS.length - 1, Math.max(0, Math.round(i)))
    set({ speed: v })
    remember('sim.speed', String(v))
  },
  setAutoplay(v) {
    if (get().autoplay !== v) get().toggleAutoplay()
  },
  toggleAutoplay() {
    const v = !get().autoplay
    set({ autoplay: v })
    remember('sim.autoplay', v ? '1' : '0')
  },
  setTextMode(m) {
    if (get().textMode === m) return
    set({ textMode: m })
    remember('sim.text', m)
  },
  toggleTextMode() {
    get().setTextMode(get().textMode === 'plain' ? 'verbatim' : 'plain')
  },
  toggleMute() {
    const m = !get().muted
    setMuted(m)
    set({ muted: m })
  },
  togglePanel(p, open) {
    const isOpen = get().panel === p
    const want = open ?? !isOpen
    if (want !== isOpen) set({ panel: want ? p : null })
  },
  setDeskView(v) {
    if (get().deskView !== v) set({ deskView: v })
  },
  setLooking(v) {
    if (get().lookingAtSpeaker !== v) set({ lookingAtSpeaker: v })
  },
  setTypingDone(v) {
    if (get().typingDone !== v) set({ typingDone: v })
  },
  requestLook() {
    set({ lookRequest: get().lookRequest + 1 })
  },
  requestDesk(open) {
    const cur = get().deskRequest
    set({ deskRequest: { open: open ?? !get().deskView, nonce: cur.nonce + 1 } })
  },
  turn(dir) {
    set({ turnRequest: { dir, nonce: get().turnRequest.nonce + 1 } })
  },
  setVoiceDone(v) {
    if (get().voiceDone !== v) set({ voiceDone: v })
  },
  setSceneReady(v) {
    if (get().sceneReady !== v) set({ sceneReady: v })
  },
  skipTyping() {
    set({ skipNonce: get().skipNonce + 1 })
  },
  hurryTyping() {
    set({ hurryNonce: get().hurryNonce + 1 })
  },
  restart(seed) {
    set({
      run: createRun(seed ?? seedFrom(undefined)), selection: NO_SELECTION, typingDone: false, panel: null, log: [],
      deskRequest: { open: false, nonce: get().deskRequest.nonce + 1 },
    })
  },
}))

export function speedFactor(i: number): number {
  return SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, i))]
}
