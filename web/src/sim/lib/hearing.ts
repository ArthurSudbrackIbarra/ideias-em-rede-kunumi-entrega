import type { Card, CastMember, ClaimCard, Event, HearingSim, QuestionCard, Role, Tese, Theme } from './hearing-sim'

export type {
  Audience, Card, CastMember, ClaimCard, ClaimType, Consensus, Event, Fact, GlossaryTerm, HearingSim, MesaMove, Original,
  Page, Player, Position, Press, QuestionCard, QuestionPosition, Reaction, RelationKind, Role, Side, Strength, Tese, Theme, Tone,
} from './hearing-sim'

export type FalaEvent = Extract<Event, { kind: 'fala' }>
export type MesaEvent = Extract<Event, { kind: 'mesa' }>

export function pad3(id: number): string {
  return String(id).padStart(3, '0')
}

export function hearingUrl(id: number): string {
  return `${import.meta.env.BASE_URL}hearings/hearing-${pad3(id)}.json`
}

export function hearingIndexUrl(): string {
  return `${import.meta.env.BASE_URL}hearings/index.json`
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

/** Checagem estrutural leve; o schema completo é conferido no Python ao gravar o arquivo. */
export function assertHearing(x: unknown): HearingSim {
  if (!isRecord(x)) throw new Error('hearing-sim: não é um objeto')
  if (x.version !== 'hearing-sim-v2') throw new Error(`hearing-sim: versão ${String(x.version)} não suportada (esperado hearing-sim-v2)`)
  for (const key of ['themes', 'cast', 'teses', 'timeline', 'deck', 'facts', 'consensus', 'glossario'] as const) {
    if (!Array.isArray(x[key])) throw new Error(`hearing-sim: campo "${key}" ausente ou não é lista`)
  }
  if (typeof x.id !== 'number' || typeof x.name !== 'string') throw new Error('hearing-sim: "id"/"name" inválidos')
  if (!isRecord(x.player)) throw new Error('hearing-sim: "player" ausente')
  return x as unknown as HearingSim
}

export async function loadHearing(id: number): Promise<HearingSim> {
  const res = await fetch(hearingUrl(id))
  if (!res.ok) throw new Error(`audiência ${id} não encontrada (${res.status})`)
  return assertHearing(await res.json())
}

/** Uma linha do catálogo do acervo (catalog.json, gerado por catalog.py): só o que a lista precisa. */
export interface CatalogEntry {
  id: number
  name: string
  date: string | null
  committee: string | null
  words: number
}

export function catalogUrl(): string {
  return `${import.meta.env.BASE_URL}hearings/catalog.json`
}

export async function loadCatalog(): Promise<CatalogEntry[]> {
  const res = await fetch(catalogUrl())
  if (!res.ok) return []
  const data: unknown = await res.json()
  return Array.isArray(data) ? (data as CatalogEntry[]) : []
}

export interface HearingEntry {
  id: number
  name: string
  date: string | null
  committee: string | null
  words: number
  cast: number
  falas: number
  cards: number
  relations: number
  teses: number
  plain: boolean
  /** as versões simples passaram por um segundo modelo (meta.verify) */
  verified?: boolean
  json: string
}

export async function loadHearingIndex(): Promise<HearingEntry[]> {
  const res = await fetch(hearingIndexUrl())
  if (!res.ok) return []
  const data: unknown = await res.json()
  return Array.isArray(data) ? (data as HearingEntry[]) : []
}

export function castById(h: HearingSim): Map<string, CastMember> {
  return new Map(h.cast.map((m) => [m.id, m]))
}

export function cardById(h: HearingSim): Map<string, Card> {
  return new Map(h.deck.map((c) => [c.id, c]))
}

export function themeById(h: HearingSim): Map<string, Theme> {
  return new Map(h.themes.map((t) => [t.id, t]))
}

export function teseById(h: HearingSim, id: string | null): Tese | undefined {
  return id ? h.teses.find((t) => t.id === id) : undefined
}

export function isClaim(c: Card | undefined): c is ClaimCard {
  return c?.kind === 'claim'
}

export function isQuestion(c: Card | undefined): c is QuestionCard {
  return c?.kind === 'pergunta'
}

export function falaEvents(h: HearingSim): FalaEvent[] {
  return h.timeline.filter((e): e is FalaEvent => e.kind === 'fala')
}

export function falaById(h: HearingSim, id: string): FalaEvent | undefined {
  return falaEvents(h).find((f) => f.id === id)
}

/** A primeira fala procedimental de um dado ato, para a mesa "falar" com texto real quando o jogo precisa. */
export function mesaLineOf(h: HearingSim, move: MesaEvent['move']): MesaEvent | undefined {
  return h.timeline.find((e): e is MesaEvent => e.kind === 'mesa' && e.move === move)
}

/** `b036.95-96` -> { fala: 'b036', from: 95, to: 96 } */
export function parseRef(ref: string): { fala: string; from: number; to: number } | null {
  const m = /^(b\d{3})\.(\d+)(?:-(\d+))?$/.exec(ref)
  if (!m) return null
  const from = Number(m[2])
  return { fala: m[1], from, to: m[3] ? Number(m[3]) : from }
}

/** A carta de afirmação que contém a sentença referida (para réplicas e tréplicas). */
export function claimAtRef(h: HearingSim, ref: string): ClaimCard | undefined {
  const r = parseRef(ref)
  if (!r) return undefined
  for (const c of h.deck) {
    if (c.kind !== 'claim' || c.fala !== r.fala) continue
    const cr = parseRef(c.ref)
    if (cr && r.from >= cr.from && r.to <= cr.to) return c
  }
  return undefined
}

export function nameOf(h: HearingSim, speaker: string): string {
  return h.cast.find((m) => m.id === speaker)?.name ?? speaker
}

/** O nome como entra nas frases do jogo: a mesa é "a presidência da Comissão", não o registro "Presidente". */
export function displayName(h: HearingSim, speaker: string): string {
  const m = h.cast.find((x) => x.id === speaker)
  if (!m) return speaker
  return m.role === 'mesa' ? 'a presidência da Comissão' : m.name
}

export function bylineOf(h: HearingSim, speaker: string): string | null {
  return h.cast.find((m) => m.id === speaker)?.byline ?? null
}

export const ROLE_LABEL: Record<Role, string> = {
  mesa: 'Mesa',
  parlamentar: 'Parlamentar',
  governo: 'Governo',
  sociedade_civil: 'Sociedade civil',
  setor_privado: 'Setor privado',
  convidado: 'Convidado',
}

export const ROLE_COLOR: Record<Role, string> = {
  mesa: '#8d8177',
  parlamentar: '#3a6ea5',
  governo: '#b5533c',
  sociedade_civil: '#4f9d69',
  setor_privado: '#c9a227',
  convidado: '#9a9a9a',
}

export const CLAIM_TYPE_LABEL: Record<ClaimCard['type'], string> = {
  dado: 'dado',
  principio: 'princípio',
  experiencia: 'experiência',
  juridico: 'jurídico',
  economico: 'econômico',
  precedente: 'precedente',
}

export const POSITION_LABEL: Record<ClaimCard['position'], string> = {
  favoravel: 'a favor',
  contrario: 'contra',
  condicional: 'com ressalvas',
  neutro: 'sem lado',
}
