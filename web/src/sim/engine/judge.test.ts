import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cardById, teseById, type ClaimCard, type HearingSim } from '../lib/hearing'
import * as B from './balance'
import { align, canCite, contradictsEdge, edgeBetween, judge, type JudgeContext } from './judge'

const h = JSON.parse(readFileSync(resolve(__dirname, '../../../public/hearings/hearing-044.json'), 'utf-8')) as HearingSim
const cards = cardById(h)
const claim = (id: string): ClaimCard => {
  const c = cards.get(id)
  if (!c || c.kind !== 'claim') throw new Error(`carta ${id} não é claim`)
  return c
}
const t1 = teseById(h, 't1')!
const t2 = teseById(h, 't2')!
const t3 = teseById(h, 't3')!
const t4 = teseById(h, 't4')!
const t5 = teseById(h, 't5')!
const t6 = teseById(h, 't6')!
const fresh: JudgeContext = { played: [], spoken: () => false }

describe('alinhamento com a tese', () => {
  it('t2 (avaliar a região): Ibama aliado, Petrobras adversária, royalties fora', () => {
    expect(align(t2, claim('b009c1'))).toBe('aliada')
    expect(align(t2, claim('b036c2'))).toBe('adversaria')
    expect(align(t2, claim('b011c3'))).toBe('fora') // d2, tema em que a t2 não toma lado
    expect(align(t2, claim('b013c2'))).toBe('consenso') // d4, consenso na sala desde 2026-09-15
    expect(align(t2, claim('b046c1'))).toBe('fora') // neutra no tema
  })
  it('a mesma carta muda de lado conforme a tese', () => {
    expect(align(t3, claim('b036c2'))).toBe('aliada')
    expect(align(t3, claim('b009c1'))).toBe('adversaria')
  })
})

describe('tabela de vereditos (spec §7.6)', () => {
  it('sustento aliada → coerente +8 (ou +11 além do bloco)', () => {
    const v = judge(h, t2, 'sustento', claim('b009c1'), null, fresh)!
    expect(v.kind).toBe('coerente')
    expect(v.delta).toBe(B.COERENTE + (v.alemDoBloco ? B.ALEM_DO_BLOCO : 0))
  })
  it('sustento adversária → contradição −12 com a tese e o lado na explicação', () => {
    const v = judge(h, t2, 'sustento', claim('b036c2'), null, fresh)!
    expect(v.kind).toBe('contradicao')
    expect(v.delta).toBe(B.CONTRADICAO)
    expect(v.explanation).toContain('Você defende que')
    expect(v.explanation!.toLowerCase()).toContain(t2.statement_plain.slice(1, 30).toLowerCase())
    expect(v.explanation).toContain('Daniele Zaneti Puelker')
  })
  it('sustento fora → neutro +2', () => {
    const v = judge(h, t2, 'sustento', claim('b011c3'), null, fresh)!
    expect(v.kind).toBe('neutro')
    expect(v.delta).toBe(B.NEUTRO)
  })
  it('contesto adversária → coerente; contesto aliada → contradição', () => {
    expect(judge(h, t2, 'contesto', claim('b036c2'), null, fresh)!.kind).toBe('coerente')
    const v = judge(h, t2, 'contesto', claim('b009c3'), null, fresh)!
    expect(v.kind).toBe('contradicao')
    expect(v.explanation).toContain('está do seu lado')
  })
  it('contesto e cito com aresta real → certeiro (+8 +6)', () => {
    // b065 contradiz b055 (nunca houve vazamento × acidentes todo ano), mesmo tema d5
    const v = judge(h, t2, 'contesto', claim('b055c3'), claim('b065c3'), fresh)!
    expect(contradictsEdge(claim('b055c3'), claim('b065c3'))).toBe(true)
    expect(v.kind).toBe('certeiro')
    expect(v.certeiro).toBe(true)
    expect(v.delta).toBe(B.COERENTE + B.CERTEIRO)
  })
  it('contesto e cito por disputa de dado → certeiro', () => {
    // f3 (b007.71 "não existe toque na costa") é disputado por b028.10, que está em b028c1
    const v = judge(h, t2, 'contesto', claim('b007c3'), claim('b028c1'), fresh)!
    expect(v.kind).toBe('certeiro')
  })
  it('contesto e cito sem discordância → par inválido −6', () => {
    // b055c3 e b034c2: ambas dizem que a Petrobras nunca teve vazamento
    const v = judge(h, t2, 'contesto', claim('b055c3'), claim('b034c2'), fresh)!
    expect(v.kind).toBe('par_invalido')
    expect(v.delta).toBe(B.PAR_INVALIDO)
    expect(v.explanation).toContain('não discorda de')
  })
  it('cite de outro tema sem aresta, ou do próprio id, é inválido (null)', () => {
    expect(contradictsEdge(claim('b055c3'), claim('b013c2'))).toBe(false)
    expect(canCite(claim('b055c3'), claim('b013c2'))).toBe(false)
    expect(judge(h, t2, 'contesto', claim('b055c3'), claim('b013c2'), fresh)).toBeNull()
    expect(judge(h, t2, 'contesto', claim('b055c3'), claim('b055c3'), fresh)).toBeNull()
    expect(judge(h, t2, 'sustento', claim('b055c3'), claim('b065c3'), fresh)).toBeNull()
  })
  it('cite de outro tema com aresta real do grafo → válido e certeiro, com a nota da relação (2026-09-15)', () => {
    // b011 (Observatório do Clima, d2) contradisse b036c3 (Petrobras, d3): a AAAS e o parecer do Ibama cruzam tema
    const card = claim('b036c3')
    const cite = claim('b011c3')
    expect(card.theme).not.toBe(cite.theme)
    expect(canCite(card, cite)).toBe(true)
    const edge = edgeBetween(card, cite, ['contradiz'])!
    expect(edge).not.toBeNull()
    const v = judge(h, t2, 'contesto', card, cite, fresh)!
    expect(v.kind).toBe('certeiro')
    expect(v.certeiro).toBe(true)
    expect(v.delta).toBe(B.COERENTE + B.CERTEIRO)
    expect(v.explanation).toContain('Foi exatamente isso que')
    expect(v.explanation).toContain(edge.note.slice(0, 30))
  })
  it('a âncora de carta manda: a reação gravada em b002c1 vem de b008c1, e uma carta irmã não a herda', () => {
    // gatilhos ancorados por carta (fase 0 do relatório): nada em b009c3 veio de relações apontadas a b009c1
    for (const c of h.deck) {
      if (c.kind !== 'claim') continue
      for (const t of c.triggers) expect(['carta', 'fala']).toContain(t.anchor)
    }
    expect(claim('b009c1').triggers.some((t) => t.anchor === 'carta')).toBe(true)
  })
  it('cobro em aberto: coerente / contradição / neutro conforme o lado da pergunta', () => {
    const q1 = cards.get('q1')! // d3 contrário: pressiona a licença
    const q5 = cards.get('q5')! // d5 neutra
    expect(judge(h, t2, 'cobro', q1, null, fresh)!.delta).toBe(B.COBRO)
    expect(judge(h, t3, 'cobro', q1, null, fresh)!.kind).toBe('contradicao')
    expect(judge(h, t3, 'cobro', q1, null, fresh)!.delta).toBe(B.COBRO_CONTRA)
    expect(judge(h, t2, 'cobro', q5, null, fresh)!.kind).toBe('neutro')
    expect(judge(h, t2, 'cobro', q5, null, fresh)!.delta).toBe(B.COBRO_NEUTRO)
  })
  it('cobro de pergunta já respondida → já respondida −6', () => {
    const q3 = cards.get('q3')!
    const v = judge(h, t6, 'cobro', q3, null, { played: [], spoken: (f) => f === 'b065' })!
    expect(v.kind).toBe('ja_respondida')
    expect(v.delta).toBe(B.COBRO_JA_RESPONDIDA)
    expect(v.explanation).toContain('Rodrigo Agostinho')
  })
  it('sustento de pergunta e cobro de afirmação são inválidos', () => {
    expect(judge(h, t2, 'sustento', cards.get('q1')!, null, fresh)).toBeNull()
    expect(judge(h, t2, 'cobro', claim('b009c1'), null, fresh)).toBeNull()
  })
  it('carta repetida → −4', () => {
    const v = judge(h, t2, 'sustento', claim('b009c1'), null, { played: ['b009c1'], spoken: () => false })!
    expect(v.kind).toBe('repetida')
    expect(v.delta).toBe(B.REPETIDA)
  })
  it('consenso fora dos temas da tese: sustentar soma CONSENSO e nunca contradiz; contestar custa −6', () => {
    // b004c1 (MME, d2) é consenso na 44 desde que o grupo d2 lista cartas; t4 não toma lado em d2
    const c = claim('b004c1')
    expect(c.consensus).toBe(true)
    expect(align(t4, c)).toBe('consenso')
    expect(judge(h, t4, 'sustento', c, null, fresh)!.kind).toBe('consenso')
    expect(judge(h, t4, 'sustento', c, null, fresh)!.delta).toBe(B.CONSENSO)
    const v = judge(h, t4, 'contesto', c, null, fresh)!
    expect(v.kind).toBe('contradicao')
    expect(v.delta).toBe(B.CONSENSO_CONTESTADO)
    expect(v.explanation).toContain('papéis diferentes concordaram')
  })
  it('o lado da tese vem antes do consenso: a tese minoritária contesta o consenso sem contradição (2026-09-15)', () => {
    // t5 é contra em d2: as cartas da queda em 2029 são adversárias dela, consenso ou não (spec §20, revisto)
    const c = claim('b004c1')
    expect(align(t5, c)).toBe('adversaria')
    expect(judge(h, t5, 'contesto', c, null, fresh)!.kind).toBe('coerente')
    expect(judge(h, t5, 'contesto', c, null, fresh)!.delta).toBe(B.COERENTE)
    expect(align(t1, c)).toBe('aliada')
    expect(judge(h, t1, 'sustento', c, null, fresh)!.kind).toBe('coerente')
  })
  it('ressalva: carta condicional num tema da tese vale RESSALVA nos dois movimentos, sem contradição', () => {
    const c = claim('b032c3') // FUP, d2 condicional
    expect(align(t1, c)).toBe('ressalva')
    expect(align(t5, c)).toBe('ressalva')
    expect(align(t4, c)).toBe('fora')
    for (const t of [t1, t5]) {
      const s = judge(h, t, 'sustento', c, null, fresh)!
      expect(s.kind).toBe('coerente')
      expect(s.delta).toBe(B.RESSALVA)
      expect(s.explanation).toContain('ressalva')
      const x = judge(h, t, 'contesto', c, null, fresh)!
      expect(x.kind).toBe('coerente')
      expect(x.delta).toBe(B.RESSALVA)
    }
    expect(judge(h, t4, 'sustento', c, null, fresh)!.kind).toBe('neutro')
  })
  it('evidência: carta neutra que o grafo liga a uma carta do lado da tese pesa para esse lado', () => {
    // b070c1 (MME, d4 neutro) com um apoio anotado a b013c3 (Pará, d4 favorável): t4 é favorável em d4, t5 contrária
    const base = claim('b070c1')
    const via = { ...claim('b013c3').asserts[0], kind: 'apoia' as const, fala: 'b013', speaker: claim('b013c3').speaker, role: claim('b013c3').role, card: 'b013c3', anchor: 'carta' as const, note: 'O MME repete o argumento do Pará sobre a riqueza do subsolo.' }
    const c: ClaimCard = { ...base, triggers: [via], asserts: [] }
    expect(align(t4, c, h)).toBe('evidencia')
    expect(align(t5, c, h)).toBe('contraevidencia')
    expect(align(t4, c)).toBe('fora') // sem a audiência, o grafo não é lido
    const s = judge(h, t4, 'sustento', c, null, fresh)!
    expect(s.kind).toBe('coerente')
    expect(s.delta).toBe(B.EVIDENCIA)
    expect(s.explanation).toContain('pesa do seu lado')
    const x = judge(h, t5, 'sustento', c, null, fresh)!
    expect(x.kind).toBe('contradicao')
    expect(x.delta).toBe(B.EVIDENCIA_CONTRA)
    expect(judge(h, t5, 'contesto', c, null, fresh)!.kind).toBe('coerente')
    expect(judge(h, t4, 'contesto', c, null, fresh)!.kind).toBe('contradicao')
  })
  it('além do bloco: sustentar uma aliada de papel diferente do majoritário vale +3', () => {
    // t6 é defendida sobretudo por parlamentares (PSOL e PL); o Ibama (governo) é de fora do bloco
    const v = judge(h, t6, 'sustento', claim('b065c1'), null, fresh)!
    expect(v.kind).toBe('coerente')
    expect(v.alemDoBloco).toBe(true)
    expect(v.delta).toBe(B.COERENTE + B.ALEM_DO_BLOCO)
  })
})
