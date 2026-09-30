import { copy } from '../copy'
import { cardById, teseById, type HearingSim } from '../lib/hearing'
import type { RunState } from './run'

export interface AtaVerdict {
  key: 'coerente' | 'contradicoes' | 'alem' | 'replica' | 'cobrou' | 'press' | 'ata' | 'silent'
  text: string
}

/** Vereditos da ata (spec §7.9): frases factuais, derivadas do estado final, acumuláveis. */
export function verdicts(h: HearingSim, s: RunState): AtaVerdict[] {
  const out: AtaVerdict[] = []
  const tese = teseById(h, s.tese)
  if (!tese) return out
  if (!s.moves.length) {
    out.push({ key: 'silent', text: copy.ata.verdicts.silent })
    return out
  }
  const cards = cardById(h)
  const contradicoes = s.moves.filter((m) => m.verdict.kind === 'contradicao')
  if (contradicoes.length === 0 && s.moves.length >= 3) out.push({ key: 'coerente', text: copy.ata.verdicts.coerente })
  if (contradicoes.length) out.push({ key: 'contradicoes', text: copy.ata.verdicts.contradicoes(contradicoes.length) })
  const roles = new Set(
    s.moves
      .filter((m) => m.kind === 'sustento' && (m.verdict.kind === 'coerente' || m.verdict.kind === 'certeiro'))
      .map((m) => cards.get(m.card)?.role)
      .filter((r): r is NonNullable<typeof r> => r !== undefined),
  )
  if (roles.size >= 3) out.push({ key: 'alem', text: copy.ata.verdicts.alem })
  if (s.moves.some((m) => m.verdict.kind === 'certeiro' || (m.treplica && m.verdict.kind === 'coerente'))) {
    out.push({ key: 'replica', text: copy.ata.verdicts.replica })
  }
  const cobrouAberta = s.moves.some((m) => {
    const c = cards.get(m.card)
    return m.kind === 'cobro' && c?.kind === 'pergunta' && c.answered_by_real === null
  })
  if (cobrouAberta) out.push({ key: 'cobrou', text: copy.ata.verdicts.cobrou })
  if (h.press.themes_covered.includes(tese.core_theme)) out.push({ key: 'press', text: copy.ata.verdicts.press })
  else out.push({ key: 'ata', text: copy.ata.verdicts.ata })
  return out
}

export function counts(s: RunState): { coerentes: number; contradicoes: number; neutras: number } {
  let coerentes = 0
  let contradicoes = 0
  let neutras = 0
  for (const m of s.moves) {
    if (m.verdict.kind === 'coerente' || m.verdict.kind === 'certeiro') coerentes++
    else if (m.verdict.kind === 'contradicao' || m.verdict.kind === 'par_invalido' || m.verdict.kind === 'ja_respondida' || m.verdict.kind === 'repetida') contradicoes++
    else neutras++
  }
  return { coerentes, contradicoes, neutras }
}
