/**
 * Ícones pequenos em SVG, para nunca depender de setas ou pontos em unicode (decisão do autor, 2026-09-13).
 * As medidas seguem a folha de componentes do redesenho: chevron 7 × 11, seta 14 × 10, marcador 12 × 14,
 * ícones da bancada em 15px com traço de 1,5.
 */

type P = { size?: number }

export function ArrowLeft({ size = 14 }: P) {
  return (
    <svg viewBox="0 0 14 10" width={size} height={Math.round((size * 10) / 14)} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M13 5H2M5.5 1.5L2 5l3.5 3.5" />
    </svg>
  )
}

export function ArrowRight({ size = 14 }: P) {
  return (
    <svg viewBox="0 0 14 10" width={size} height={Math.round((size * 10) / 14)} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M1 5h11M8.5 1.5L12 5l-3.5 3.5" />
    </svg>
  )
}

/** chevron para a direita, 7 × 11 */
export function Chevron({ size = 7 }: P) {
  return (
    <svg viewBox="0 0 7 11" width={size} height={Math.round((size * 11) / 7)} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M1 1l4.5 4.5L1 10" />
    </svg>
  )
}

export function ChevronLeft({ size = 7 }: P) {
  return (
    <svg viewBox="0 0 7 11" width={size} height={Math.round((size * 11) / 7)} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 1L1.5 5.5 6 10" />
    </svg>
  )
}

export function ChevronDown({ size = 9 }: P) {
  return (
    <svg viewBox="0 0 9 6" width={size} height={Math.round((size * 6) / 9)} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 1l3.5 3.5L8 1" />
    </svg>
  )
}

export function Cross({ size = 11 }: P) {
  return (
    <svg viewBox="0 0 11 11" width={size} height={size} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M1 1l9 9M10 1l-9 9" />
    </svg>
  )
}

export function Check({ size = 11 }: P) {
  return (
    <svg viewBox="0 0 11 9" width={size} height={Math.round((size * 9) / 11)} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 4.6l3 3L10 1.4" />
    </svg>
  )
}

/** marcador de anotação, 12 × 14, cheio quando anotado */
export function Bookmark({ filled, size = 12 }: { filled: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 12 14" width={size} height={Math.round((size * 14) / 12)} aria-hidden="true" className="icon" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M1 0.7h10v12.6l-5-4-5 4z" />
    </svg>
  )
}

export function Eye({ size = 15 }: P) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 8s2.5-4 7-4 7 4 7 4-2.5 4-7 4-7-4-7-4z" />
      <circle cx="8" cy="8" r="1.6" />
    </svg>
  )
}

export function Notebook({ size = 15 }: P) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <path d="M5 6h6M5 9h4" />
    </svg>
  )
}

export function Sound({ size = 15 }: P) {
  return (
    <svg viewBox="0 0 15 14" width={size} height={Math.round((size * 14) / 15)} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 5h3l4-3v10l-4-3H1z" />
      <path d="M11 4.5c1.3 1.4 1.3 3.6 0 5" />
    </svg>
  )
}

export function Muted({ size = 15 }: P) {
  return (
    <svg viewBox="0 0 15 14" width={size} height={Math.round((size * 14) / 15)} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 5h3l4-3v10l-4-3H1z" />
      <path d="M10.5 5l3 4M13.5 5l-3 4" />
    </svg>
  )
}

export function Book({ size = 15 }: P) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 2.5h10v11H3z" />
      <path d="M5.5 5.5h5M5.5 8h3" />
    </svg>
  )
}

export function Help({ size = 15 }: P) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M6.4 6.2c.3-1.5 3-1.4 3 .2 0 1.2-1.5 1.2-1.5 2.4" />
      <path d="M8 11.3v.2" />
    </svg>
  )
}

export function Search({ size = 16 }: P) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="7" cy="7" r="5" />
      <path d="M10.8 10.8L14 14" />
    </svg>
  )
}

/** tréplica: uma seta que volta */
export function Reply({ size = 15 }: P) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 3v4a3 3 0 0 1-3 3H3" />
      <path d="M6 7l-3 3 3 3" />
    </svg>
  )
}
