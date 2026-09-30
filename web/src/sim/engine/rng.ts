/** mulberry32: gerador determinístico e pequeno. O estado é um inteiro de 32 bits guardado no
 *  estado da partida, para duas partidas com a mesma semente e as mesmas ações darem a mesma ata. */

export function seedFrom(input: string | number | undefined): number {
  if (typeof input === 'number' && Number.isFinite(input)) return input >>> 0
  if (typeof input === 'string' && /^\d+$/.test(input)) return Number(input) >>> 0
  // hash simples de string (FNV-1a) para permitir ?seed=qualquer-coisa
  let h = 0x811c9dc5
  const s = String(input ?? Date.now())
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Devolve [valor em [0,1), novo estado]. */
export function rand(state: number): [number, number] {
  const t = (state + 0x6d2b79f5) | 0
  let r = Math.imul(t ^ (t >>> 15), 1 | t)
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t]
}

export function chance(state: number, p: number): [boolean, number] {
  const [v, s] = rand(state)
  return [v < p, s]
}

/** Escolha ponderada; pesos não negativos. Devolve [índice ou -1, novo estado]. */
export function pickWeighted(state: number, weights: number[]): [number, number] {
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return [-1, state]
  const [v, s] = rand(state)
  let acc = 0
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]
    if (v * total < acc) return [i, s]
  }
  return [weights.length - 1, s]
}
