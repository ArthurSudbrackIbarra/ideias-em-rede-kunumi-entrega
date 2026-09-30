import { copy } from '../copy'
import { bylineOf, displayName, type Card, type ClaimCard, type HearingSim } from '../lib/hearing'
import type { MoveKind } from './judge'
import { rand } from './rng'

/**
 * As únicas frases do jogador em toda a partida (spec §7.5): moldes fixos preenchidos com `cast.name`,
 * `cast.byline`, `deck.gist` e `deck.plain`. Nunca `text`, nunca texto livre. Três variantes por molde,
 * escolhidas pelo RNG semeado. Devolve [frase, novo estado do RNG].
 */
export function sayMove(h: HearingSim, move: MoveKind, card: Card, cite: ClaimCard | null, rng: number): [string, number] {
  const [v, next] = rand(rng)
  const who = (speaker: string) => {
    const byline = bylineOf(h, speaker)
    return byline ? `${displayName(h, speaker)}, ${byline},` : `${displayName(h, speaker)},`
  }
  const whoNoComma = (speaker: string) => who(speaker).replace(/,$/, '')
  let variants: readonly string[]
  if (move === 'cobro') variants = copy.say.cobro
  else if (move === 'contesto' && cite) variants = copy.say.contestoCito
  else if (move === 'contesto') variants = copy.say.contesto
  else variants = copy.say.sustento
  const tpl = variants[Math.min(variants.length - 1, Math.floor(v * variants.length))]
  const gist = card.kind === 'claim' ? card.gist : card.gist
  const plain = card.kind === 'pergunta' ? card.plain : ''
  const said = tpl
    .replace('{quem}', who(card.speaker))
    .replace('{quem-}', whoNoComma(card.speaker))
    .replace('{gist}', gist)
    .replace('{plain}', plain)
    .replace('{quemB}', cite ? who(cite.speaker) : '')
    .replace('{quemB-}', cite ? whoNoComma(cite.speaker) : '')
    .replace('{gistB}', cite ? cite.gist : '')
  return [said.charAt(0).toUpperCase() + said.slice(1), next]
}
