import { Fragment, type ReactNode } from 'react'
import type { GlossaryTerm } from '../lib/hearing'

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface GlossHandlers {
  /** o cursor (ou o foco) entrou num termo: o balão de explicação abre fora da área que rola */
  open: (term: string, plain: string, el: HTMLElement) => void
  close: () => void
}

/**
 * Marca os termos do glossário num texto já digitado: sublinhado pontilhado e a explicação num balão ao passar
 * o mouse ou focar (spec §7.4). O balão não é desenhado aqui: a fala rola dentro do corpo do papel e cortaria
 * qualquer filho absoluto, então quem desenha é o balão, fora da rolagem (decisão de 2026-09-15).
 */
export function glossText(text: string, terms: GlossaryTerm[], on?: GlossHandlers): ReactNode {
  if (!terms.length) return text
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length)
  const re = new RegExp(`(${sorted.map((t) => escapeRe(t.term)).join('|')})`, 'gi')
  const parts = text.split(re)
  if (parts.length === 1) return text
  const seen = new Set<string>()
  return parts.map((part, i) => {
    const t = sorted.find((x) => x.term.toLowerCase() === part.toLowerCase())
    if (!t || seen.has(t.term.toLowerCase())) return <Fragment key={i}>{part}</Fragment>
    seen.add(t.term.toLowerCase())
    return (
      <span
        key={i}
        className="gl"
        tabIndex={0}
        aria-label={`${part}: ${t.plain}`}
        onMouseEnter={(e) => on?.open(part, t.plain, e.currentTarget)}
        onMouseLeave={() => on?.close()}
        onFocus={(e) => on?.open(part, t.plain, e.currentTarget)}
        onBlur={() => on?.close()}
      >
        {part}
      </span>
    )
  })
}
