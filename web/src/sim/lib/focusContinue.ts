/**
 * O botão continuar troca de lugar entre a placa da mesa, o balão e o cartão de relação. Quem avança pelo teclado
 * perderia o foco a cada troca. Quando um continuar é acionado pelo teclado, o próximo que aparecer recebe o foco, se
 * o foco tiver caído no vazio.
 */
let pending = false

export function continuedByKeyboard(e: { detail: number }) {
  if (e.detail === 0) pending = true
}

export function continueRef(el: HTMLElement | null) {
  if (!el || !pending) return
  const active = document.activeElement
  if (active && active !== document.body && active !== el && active.isConnected) {
    pending = false
    return
  }
  pending = false
  el.focus({ preventScroll: true })
}
