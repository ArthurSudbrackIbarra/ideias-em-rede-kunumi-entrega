/**
 * Tons de pele dos bonecos (pedido do autor em 2026-09-14): a sala é um retrato do país, então os bonecos não
 * têm um tom só. Seis tons, do claro ao retinto, sorteados de forma determinística por pessoa (mesma sessão,
 * mesmo boneco). Continuam sem rosto e sem semelhança com ninguém: é só a cor da esfera. Desde 2026-09-15 o
 * boneco é só tronco e cabeça, então não há mais cor de calça.
 */
export const SKIN_TONES = ['#f3dfcf', '#e6c3a5', '#c9976b', '#a9714b', '#7c4b2e', '#4a2c1c'] as const

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function skinFor(key: string): string {
  return SKIN_TONES[hash(key) % SKIN_TONES.length]
}
