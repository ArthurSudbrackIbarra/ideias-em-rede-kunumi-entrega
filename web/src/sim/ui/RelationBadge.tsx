import type { RelationTag } from '../engine/rules'
import type { HearingSim } from '../lib/hearing'
import { relationLabel } from './relationLabel'

/**
 * Ícone + palavra, sempre juntos e nunca só cor (spec §10). Os traços são os da folha de componentes do
 * redesenho: apoia 13 × 9, responde 13 × 11, contradiz 15 × 9, consenso 13 × 13. A cor vem do contexto por CSS
 * (`.rel-*` no papel, a variante clara sobre o chassi).
 */
export function RelationIcon({ kind, size = 1 }: { kind: string; size?: number }) {
  const w = (n: number) => Math.round(n * size)
  switch (kind) {
    case 'apoia':
    case 'defende':
    case 'concorda':
      return (
        <svg viewBox="0 0 13 9" width={w(13)} height={w(9)} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M1 8l5.5-6L12 8" />
        </svg>
      )
    case 'responde':
    case 'respondida':
    case 'cobra':
    case 'cobranca':
      return (
        <svg viewBox="0 0 13 11" width={w(13)} height={w(11)} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 1v5H2.5" />
          <path d="M5 3L2 6l3 3" />
        </svg>
      )
    case 'contradiz':
    case 'contradicao':
      return (
        <svg viewBox="0 0 15 9" width={w(15)} height={w(9)} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M1 5l2.5-3 3 5 3-6 2.5 4h2" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 13 13" width={w(13)} height={w(13)} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="6.5" cy="6.5" r="5.5" />
          <path d="M4 6.8l2 2 3.2-4" />
        </svg>
      )
  }
}

/**
 * A marca de relação. `variant`: "plate" é a etiqueta tingida na placa do balão e no cartão de relação
 * (fundo escuro, tinta clara), "body" é a linha sem fundo no corpo de papel da réplica.
 */
export function RelationBadge({ tag, hearing, variant = 'body' }: { tag: RelationTag; hearing: HearingSim; variant?: 'plate' | 'body' }) {
  return (
    <span className={`rel-tag ${variant} rel-${tag.kind}`}>
      <RelationIcon kind={tag.kind} />
      <b>{relationLabel(tag, hearing)}</b>
    </span>
  )
}
