import type { HearingSim } from '../lib/hearing'

/** Pose de um assento: posição do centro da cadeira (no chão) e a direção para onde o corpo olha
 *  (rotY tal que a frente aponta para (sin rotY, 0, cos rotY)). Unidades em metros (spec v1 §6.1). */
export interface Pose {
  x: number
  y: number
  z: number
  rotY: number
  /** altura do tampo à frente deste assento (para os braços e a mesa de anotações) */
  deskY: number
}

export const ROOM = { xMin: -9, xMax: 9, zMin: -10, zMax: 12, ceiling: 5.2 }
export const MESA = { z: -9, seatZ: -9.65, tarima: 0.3, top: 0.78, spacing: 1.5 }
export const BANCADA = { cx: 0, cz: 1.5, r: 6.5, tarima: 0.15, top: 0.75, spanDeg: 110 }
export const DEBATEDORES = { z: -0.5, seatZ: 0.25, top: 0.74, spacing: 0.95 }
export const PLATEIA = { z0: 2.6, dz: 0.85, dx: 0.62, perRow: 12, rise: 0.12, rail: 1.7 }
export const TELAO = { x: 8.85, z: -3, y: 3.0, w: 3.6, h: 2.1 }
/** altura dos olhos sentado e centro da cabeça dos bonecos (spec v2 §19.3: cabeça mais alta) */
export const EYE = 1.24
export const HEAD = 1.3

export interface SceneLayout {
  poses: Map<string, Pose>
  player: Pose
  /** pessoas que participam por vídeo: aparecem no telão */
  remote: string[]
  audience: Pose[]
  bancadaSeats: Pose[]
  debatedoresSeats: Pose[]
  mesaSeats: Pose[]
}

function facing(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(tx - x, tz - z)
}

/** Distribui n assentos no arco da bancada, olhando para o centro do arco. */
function arcSeats(n: number): Pose[] {
  const out: Pose[] = []
  const span = (BANCADA.spanDeg * Math.PI) / 180
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0 : -span / 2 + (span * k) / (n - 1)
    const r = BANCADA.r + 0.55
    const x = BANCADA.cx + r * Math.sin(t)
    const z = BANCADA.cz - r * Math.cos(t)
    out.push({ x, y: BANCADA.tarima, z, rotY: facing(x, z, BANCADA.cx, BANCADA.cz), deskY: BANCADA.tarima + BANCADA.top })
  }
  return out
}

function rowSeats(n: number, z: number, spacing: number, y: number, deskY: number, rotY: number): Pose[] {
  const out: Pose[] = []
  for (let k = 0; k < n; k++) out.push({ x: (k - (n - 1) / 2) * spacing, y, z, rotY, deskY })
  return out
}

/** A sala inteira a partir do elenco: a cadeira vaga fica no meio da mesa de debatedores (spec §8, §20). */
export function buildLayout(h: HearingSim): SceneLayout {
  const poses = new Map<string, Pose>()
  const remote: string[] = []
  const mesa = h.cast.filter((m) => m.seat === 'mesa')
  const bancada = h.cast.filter((m) => m.seat === 'bancada')
  const debatedores = h.cast.filter((m) => m.seat === 'debatedores')
  for (const m of h.cast) if (m.seat === 'remoto') remote.push(m.id)

  // mesa diretora: presidência ao centro, os demais alternando para os lados
  const mesaSeats = rowSeats(Math.max(mesa.length, 3), MESA.seatZ, MESA.spacing, MESA.tarima, MESA.tarima + MESA.top, 0)
  const center = Math.floor(mesaSeats.length / 2)
  mesa.forEach((m, i) => {
    const idx = i === 0 ? center : center + (i % 2 === 1 ? Math.ceil(i / 2) : -Math.ceil(i / 2))
    poses.set(m.id, mesaSeats[Math.min(mesaSeats.length - 1, Math.max(0, idx))])
  })

  // bancada em arco: parlamentares do meio para fora
  const bancadaSeats = arcSeats(Math.max(bancada.length, 5))
  const order = spreadFromCenter(bancadaSeats.length)
  bancada.forEach((m, i) => poses.set(m.id, bancadaSeats[order[i]]))

  // mesa de debatedores: uma fileira; a cadeira vaga no meio, com os debatedores dos dois lados
  // (decisão do autor em 2026-09-13: na ponta, a pessoa ficava longe de tudo)
  const nDeb = debatedores.length + 1
  const debSeats = rowSeats(Math.max(nDeb, 6), DEBATEDORES.seatZ, DEBATEDORES.spacing, 0, DEBATEDORES.top, Math.PI)
  const mid = Math.floor(debSeats.length / 2)
  const playerPose = debSeats[mid]
  const rest = debSeats.filter((_, i) => i !== mid)
  const dOrder = spreadFromCenter(rest.length)
  debatedores.forEach((m, i) => poses.set(m.id, rest[dOrder[i]]))

  // plateia: fileiras elevadas atrás do corrimão
  const audience: Pose[] = []
  const n = h.audience.estimate
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / PLATEIA.perRow)
    const col = i % PLATEIA.perRow
    // desloca as fileiras ímpares meio assento, para não ficar em grade perfeita
    const x = (col - (PLATEIA.perRow - 1) / 2) * PLATEIA.dx + (row % 2 ? PLATEIA.dx / 2 : 0)
    audience.push({ x, y: row * PLATEIA.rise, z: PLATEIA.z0 + row * PLATEIA.dz, rotY: Math.PI, deskY: 0 })
  }

  return { poses, remote, audience, bancadaSeats, debatedoresSeats: debSeats, mesaSeats, player: playerPose }
}

/** [meio, meio+1, meio-1, meio+2, ...] */
function spreadFromCenter(n: number): number[] {
  const c = Math.floor(n / 2)
  const out = [c]
  for (let k = 1; out.length < n; k++) {
    if (c + k < n) out.push(c + k)
    if (c - k >= 0) out.push(c - k)
  }
  return out
}

/** Posição da cabeça (ancoragem do balão) de quem fala. */
export function headOf(layout: SceneLayout, speaker: string): [number, number, number] | null {
  if (layout.remote.includes(speaker)) return [-TELAO.x + 0.2, TELAO.y, TELAO.z]
  const p = layout.poses.get(speaker)
  if (!p) return null
  return [p.x, p.y + HEAD, p.z]
}
