import type { KeyAction } from './keys'
import { closeTips } from './tips'

/**
 * A pilha dos diálogos abertos. Só o de cima responde ao Esc e prende o Tab. Os atalhos de uma tecla da sala
 * consultam `topDialog` para saber se podem agir.
 */

export interface DialogEntry {
  el: HTMLElement
  modal: boolean
  keys: KeyAction[]
  onEscape: () => void
}

const stack: DialogEntry[] = []

export function topDialog(): DialogEntry | null {
  return stack[stack.length - 1] ?? null
}

export function pushDialog(entry: DialogEntry): () => void {
  stack.push(entry)
  return () => {
    const i = stack.indexOf(entry)
    if (i >= 0) stack.splice(i, 1)
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0 && !el.closest('[inert]'))
}

/** Para onde o foco vai quando quem abriu o diálogo já não existe: o botão de continuar, ou o começo do conteúdo. */
export function fallbackFocus() {
  const target = document.querySelector<HTMLElement>('[data-continue]') ?? document.getElementById('conteudo')
  target?.focus({ preventScroll: true })
}

function onKeyDown(e: KeyboardEvent) {
  const top = topDialog()
  if (!top) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopImmediatePropagation()
    if (!closeTips()) top.onEscape()
    return
  }
  if (e.key !== 'Tab' || !top.modal) return
  const f = focusables(top.el)
  const active = document.activeElement
  if (!f.length) {
    e.preventDefault()
    top.el.focus()
    return
  }
  const first = f[0]
  const last = f[f.length - 1]
  const outside = !(active instanceof Node) || !top.el.contains(active)
  if (e.shiftKey && (outside || active === first || active === top.el)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (outside || active === last)) {
    e.preventDefault()
    first.focus()
  }
}

if (typeof window !== 'undefined') window.addEventListener('keydown', onKeyDown, true)

/**
 * Leva o foco para um lugar novo (o título da sala, o conteúdo de outra rota) só se ele não estiver em outro lugar
 * útil: num quadro lento, a pessoa pode já ter aberto um painel ou ido para um botão antes de o foco chegar.
 */
export function focusIfIdle(target: HTMLElement | null) {
  if (!target || topDialog()) return
  const active = document.activeElement
  const idle = !active || active === document.body || active.id === 'conteudo' || !active.isConnected
  if (idle) target.focus({ preventScroll: true })
}
