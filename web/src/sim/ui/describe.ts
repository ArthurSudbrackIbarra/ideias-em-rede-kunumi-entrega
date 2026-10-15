import { copy } from '../copy'
import type { Line } from '../engine/rules'
import { castById, displayName, ROLE_LABEL, type HearingSim } from '../lib/hearing'
import type { TextMode } from '../store/useSim'
import { relationLabel } from './relationLabel'

/**
 * Uma linha do balão em texto corrido, para o leitor de tela, a leitura em voz alta e o histórico. O texto da fala é
 * exatamente o que o balão digita (a versão simples, ou o original no modo original), sem nenhuma reescrita.
 */
export interface Spoken {
  /** quem fala, como a placa mostra: "Rodrigo Agostinho, presidente do Ibama" */
  who: string | null
  /** o papel institucional, só para o leitor de tela */
  role: string | null
  /** a relação da réplica com a fala anterior: "Contradiz você" */
  relation: string | null
  text: string
}

export function spokenOf(h: HearingSim, line: Line, textMode: TextMode): Spoken {
  const cast = castById(h)
  const m = line.speaker ? cast.get(line.speaker) : null
  if (line.kind === 'player') return { who: copy.balloon.you, role: null, relation: null, text: line.text }
  if (line.kind === 'system') return { who: null, role: null, relation: null, text: line.text }
  if (line.kind === 'mesa') return { who: copy.balloon.mesa, role: null, relation: null, text: line.text }
  const verbatim = textMode === 'verbatim' && line.plain !== null && line.original !== null
  const body = verbatim && line.original ? line.original.text : line.text
  const by = m ? m.byline ?? m.cargo ?? null : null
  const who = m ? (by ? `${displayName(h, m.id)}, ${by}` : displayName(h, m.id)) : copy.balloon.room
  const relation = line.relation ? relationLabel(line.relation, h) : null
  const applause = line.applause > 0 ? ` ${copy.balloon.palmas(line.applause)}` : ''
  return { who, role: m ? ROLE_LABEL[m.role].toLowerCase() : null, relation, text: `${body}${applause}` }
}

/** A frase que o leitor de tela anuncia quando a linha entra. */
export function announcementOf(h: HearingSim, line: Line, textMode: TextMode): string {
  const s = spokenOf(h, line, textMode)
  if (line.kind === 'player') {
    const v = line.verdict
    const m = line.meter
    const verdict = v ? ` ${copy.sr.verdict(copy.verdict.short(v.kind), m ? Math.round(m.before) : null, m ? Math.round(m.after) : null, v.explanation)}` : ''
    return `${copy.sr.you(s.text)}${verdict}`
  }
  if (!s.who) return s.text
  if (line.kind === 'mesa') return copy.sr.mesa(s.text)
  const head = [s.who, s.role, s.relation].filter(Boolean).join(', ')
  return copy.sr.line(head, s.text)
}

/** O que a voz lê: quem fala e a fala, sem o papel (que a voz deixaria cansativo). */
export function voiceOf(h: HearingSim, line: Line, textMode: TextMode): string {
  const s = spokenOf(h, line, textMode)
  if (line.kind === 'player' && line.verdict) return `${copy.sr.you(s.text)} ${copy.verdict.short(line.verdict.kind)}.`
  return s.who ? copy.sr.line(s.who, s.text) : s.text
}
