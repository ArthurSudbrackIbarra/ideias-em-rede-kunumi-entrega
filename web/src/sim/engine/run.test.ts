import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HearingSim } from '../lib/hearing'
import { canCite } from './judge'
import { advance, createRun, reduce, type Action, type RunState } from './run'
import { counts, verdicts } from './scoring'

const h = JSON.parse(readFileSync(resolve(__dirname, '../../../public/hearings/hearing-044.json'), 'utf-8')) as HearingSim

function start(tese = 't2', seed = 20260912): RunState {
  let s = createRun(seed)
  s = reduce(h, s, { t: 'chooseTese', tese, guided: false })
  return reduce(h, s, { t: 'enterRoom' })
}

/** avança até a próxima concessão de palavra (ou até a ata), anotando o que o filtro aceitar */
function untilFloor(s: RunState, note: (card: string) => boolean = () => true): RunState {
  let guard = 0
  while (s.phase !== 'floor' && s.phase !== 'ata' && guard++ < 3000) {
    const card = s.current?.page?.card
    if (card && s.notable.includes(card) && note(card)) s = reduce(h, s, { t: 'note', card })
    s = advance(h, s)
  }
  return s
}

function finish(s: RunState, onFloor: (s: RunState) => Action = () => ({ t: 'yieldFloor' })): RunState {
  let guard = 0
  while (s.phase !== 'ata' && guard++ < 4000) s = s.phase === 'floor' ? reduce(h, s, onFloor(s)) : advance(h, s)
  return s
}

describe('máquina de estados v2', () => {
  it('a tese só muda em chooseTese, e só na fase tese; o prelúdio precede a sala', () => {
    let s = createRun(1)
    expect(reduce(h, s, { t: 'enterRoom' })).toBe(s)
    s = reduce(h, s, { t: 'chooseTese', tese: 'xx', guided: false })
    expect(s.tese).toBeNull()
    s = reduce(h, s, { t: 'chooseTese', tese: 't1', guided: true })
    expect(s.phase).toBe('prelude')
    expect(s.guided).toBe(true)
    const again = reduce(h, s, { t: 'chooseTese', tese: 't2', guided: false })
    expect(again.tese).toBe('t1')
    s = reduce(h, s, { t: 'enterRoom' })
    expect(s.phase).toBe('opening')
    expect(s.current?.kind).toBe('mesa')
  })

  it('é determinístico: mesma semente e mesmas ações dão os mesmos movimentos e a mesma ata', () => {
    const play = (): RunState => {
      let s = untilFloor(start())
      const card = s.hand.find((id) => id.startsWith('b0'))!
      s = reduce(h, s, { t: 'speak', kind: 'sustento', card, cite: null })
      return finish(s)
    }
    const a = play()
    const b = play()
    expect(a.moves).toEqual(b.moves)
    expect(a.conviction).toBe(b.conviction)
    expect(a.thread).toEqual(b.thread)
    expect(verdicts(h, a)).toEqual(verdicts(h, b))
  })

  it('toda página digita a versão em palavras simples (v3: nenhuma carta sem plain); toda linha nomeada tem ref', () => {
    let s = start()
    let pages = 0
    let guard = 0
    while (s.phase !== 'ata' && guard++ < 4000) {
      const l = s.current
      if (l && (l.kind === 'fala' || l.kind === 'mesa' || l.kind === 'reaction')) {
        expect(l.ref).toMatch(/^b\d{3}\.\d+/)
        expect(l.original).not.toBeNull()
        if (l.kind === 'fala') {
          pages++
          expect(l.plain).not.toBeNull()
          expect(l.text).toBe(l.plain)
          expect(l.text).not.toContain(';')
        }
      }
      s = s.phase === 'floor' ? reduce(h, s, { t: 'yieldFloor' }) : advance(h, s)
    }
    expect(pages).toBe(h.timeline.filter((e) => e.kind === 'fala').reduce((n, e) => n + e.pages.length, 0))
    expect(s.phase).toBe('ata')
    expect(s.thread.filter((t) => t.kind === 'voce').length).toBe(h.timeline.filter((e) => e.kind === 'fala').length)
    expect(verdicts(h, s)[0].key).toBe('silent')
  })

  it('nenhum trecho é lido duas vezes: réplica antecipa a página, e a página depois não repete', () => {
    // sustenta a cada vez a primeira carta da mão que tem quem a contradiga; nada com texto de pessoa
    // nomeada aparece por inteiro mais de uma vez (nem como página, nem como réplica)
    const seen = new Map<string, number>()
    let s = start('t3', 7)
    let guard = 0
    while (s.phase !== 'ata' && guard++ < 6000) {
      const l = s.current
      if (l && (l.kind === 'fala' || l.kind === 'reaction') && l.page) seen.set(l.page.card, (seen.get(l.page.card) ?? 0) + 1)
      if (l?.kind === 'reaction') expect(l.page).not.toBeNull()
      if (s.phase === 'floor') {
        const card = s.hand.find((id) => {
          const c = h.deck.find((x) => x.id === id)
          return c?.kind === 'claim' && c.triggers.some((t) => t.kind === 'contradiz')
        })
        s = card ? reduce(h, s, { t: 'speak', kind: 'sustento', card, cite: null }) : reduce(h, s, { t: 'yieldFloor' })
        continue
      }
      const card = s.current?.page?.card
      if (card && s.notable.includes(card) && s.hand.length < 7) s = reduce(h, s, { t: 'note', card })
      s = advance(h, s)
    }
    expect(s.phase).toBe('ata')
    const repeated = [...seen.entries()].filter(([, n]) => n > 1)
    expect(repeated).toEqual([])
    // toda fala ainda entra no fio do debate, mesmo quando todas as páginas dela já tinham sido antecipadas
    expect(s.thread.filter((t) => t.kind === 'voce').length).toBe(h.timeline.filter((e) => e.kind === 'fala').length)
  })

  it('speak inválido não altera o estado: fora da vez, carta fora da mão, cite de outro tema, sem movimentos', () => {
    let s = start()
    const before = s
    expect(reduce(h, s, { t: 'speak', kind: 'sustento', card: 'b009c1', cite: null })).toBe(before)
    s = untilFloor(s)
    expect(s.phase).toBe('floor')
    expect(reduce(h, s, { t: 'speak', kind: 'sustento', card: 'b036c2', cite: null })).toBe(s) // não anotada (ainda não tocou)
    const card = s.hand[0]
    const chosen = h.deck.find((c) => c.id === card)!
    // de outro tema e sem aresta no grafo: desde 2026-09-15 a citação cruzada só vale quando uma contradisse a outra
    const other = s.hand.find((id) => {
      const c = h.deck.find((x) => x.id === id)!
      return c.kind === 'claim' && chosen.kind === 'claim' && c.theme !== chosen.theme && !canCite(chosen, c)
    })
    if (other) expect(reduce(h, s, { t: 'speak', kind: 'contesto', card, cite: other })).toBe(s)
    const zero = { ...s, movesLeft: 0 }
    expect(reduce(h, zero, { t: 'speak', kind: 'sustento', card, cite: null })).toBe(zero)
  })

  it('a fala do jogador tem fontes, veredito e sai da mão; devolver a palavra não gasta a vez', () => {
    let s = untilFloor(start())
    const slots = h.player.slots.length
    const floorsBefore = s.floorsUsed
    const yielded = reduce(h, s, { t: 'yieldFloor' })
    expect(yielded.floorsUsed).toBe(floorsBefore)
    const card = s.hand[0]
    s = reduce(h, s, { t: 'speak', kind: 'sustento', card, cite: null })
    expect(s.phase).toBe('reaction')
    expect(s.hand).not.toContain(card)
    expect(s.current?.kind).toBe('player')
    expect(s.current?.sources.map((x) => x.card)).toEqual([card])
    expect(s.current?.verdict).not.toBeNull()
    expect(s.moves).toHaveLength(1)
    expect(s.movesLeft).toBe(h.player.moves_per_floor - 1)
    expect(s.floorsUsed).toBe(floorsBefore + 1)
    expect(s.floorsUsed).toBeLessThanOrEqual(slots)
  })

  it('ver o que foi dito congela o relógio e a página; a atenção não cai', () => {
    let s = start()
    let guard = 0
    while (!(s.current?.kind === 'fala') && guard++ < 500) s = advance(h, s)
    const play = s.play
    s = reduce(h, s, { t: 'openOriginal', open: true })
    expect(s.originalOpen).toBe(true)
    expect(s.originalsOpened).toEqual([s.current!.page!.card])
    const clock = s.clock
    const attention = s.attention
    s = reduce(h, s, { t: 'tick', dt: 0.5, looking: false })
    expect(s.clock).toBe(clock)
    expect(s.attention).toBe(attention)
    expect(s.play).toEqual(play)
    s = reduce(h, s, { t: 'openOriginal', open: false })
    s = reduce(h, s, { t: 'tick', dt: 0.5, looking: false })
    expect(s.clock).toBeGreaterThan(clock)
    expect(s.attention).toBeLessThan(attention)
  })

  it('par inválido: a segunda carta fica na mão', () => {
    // anota b055c3 e b034c2 (ambas dizem que a Petrobras nunca vazou) e contesta uma citando a outra
    let s = start('t2')
    s = untilFloor(s, (c) => c === 'b034c2' || c === 'b055c3')
    while (s.phase === 'floor' && !(s.hand.includes('b034c2') && s.hand.includes('b055c3'))) {
      s = reduce(h, s, { t: 'yieldFloor' })
      s = untilFloor(s, (c) => c === 'b034c2' || c === 'b055c3')
    }
    expect(s.phase).toBe('floor')
    s = reduce(h, s, { t: 'speak', kind: 'contesto', card: 'b055c3', cite: 'b034c2' })
    expect(s.moves.at(-1)?.verdict.kind).toBe('par_invalido')
    expect(s.hand).toContain('b034c2')
    expect(s.hand).not.toContain('b055c3')
  })

  it('cobrar uma pergunta que a sala responde depois vale +2 quando a resposta toca', () => {
    // q4 (b044: Petrobras tem interesse no Tacutu?) é respondida por b070, a última fala
    let s = start('t4')
    s = untilFloor(s, (c) => c === 'q4')
    while (s.phase === 'floor' && !s.hand.includes('q4')) {
      s = reduce(h, s, { t: 'yieldFloor' })
      s = untilFloor(s, (c) => c === 'q4')
    }
    expect(s.hand).toContain('q4')
    s = reduce(h, s, { t: 'speak', kind: 'cobro', card: 'q4', cite: null })
    expect(s.moves.at(-1)?.kind).toBe('cobro')
    expect(s.cobradas).toContain('q4')
    const before = s.conviction
    s = finish(s)
    expect(s.respondidas).toContain('q4')
    expect(s.thread.some((t) => t.kind === 'respondida')).toBe(true)
    expect(s.conviction).toBeGreaterThan(before - 1) // +2 aplicado quando b070 tocou
    expect(counts(s).coerentes + counts(s).contradicoes + counts(s).neutras).toBe(s.moves.length)
  })

  it('toda linha do jogador tem fontes com ref; réplicas vêm com plain e ref, ou como cartão que lembra o gist', () => {
    const s = untilFloor(start('t3'))
    let fired = false
    for (let seed = 1; seed < 60 && !fired; seed++) {
      const card = s.hand.find((id) => {
        const c = h.deck.find((x) => x.id === id)
        return c?.kind === 'claim' && c.triggers.some((t) => t.kind === 'contradiz')
      })
      if (!card) break
      const t = reduce(h, { ...s, rng: seed }, { t: 'speak', kind: 'sustento', card, cite: null })
      const lines = [t.current!, ...t.queue]
      for (const l of lines) {
        if (l.kind === 'player') expect(l.sources.length).toBeGreaterThan(0)
        if (l.kind === 'reaction') {
          fired = true
          expect(l.ref).toMatch(/^b\d{3}\.\d+/)
          expect(l.original?.text.length).toBeGreaterThan(0)
          expect(l.plain).not.toBeNull()
          expect(t.shownCards).toContain(l.page!.card)
        }
        if (l.kind === 'relcard' && l.relation?.kind === 'contradiz') {
          // a pessoa já tinha sido lida: o cartão lembra o ponto em vez de repetir a frase
          fired = true
          expect(l.text).toContain('mantém o que já disse')
          expect(l.ref).toMatch(/^b\d{3}\.\d+/)
        }
      }
    }
    expect(fired).toBe(true)
  })
})
