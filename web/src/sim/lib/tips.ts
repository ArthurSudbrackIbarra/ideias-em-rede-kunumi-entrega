/**
 * As dicas que aparecem sobre o texto (texto cortado, termo do glossário) se registram aqui enquanto estão abertas,
 * para o Esc fechar a dica antes de fechar qualquer outra coisa (WCAG 1.4.13: dá para dispensar sem mover o foco).
 */

const open = new Set<() => void>()

export function tipOpened(close: () => void): () => void {
  open.add(close)
  return () => open.delete(close)
}

/** Fecha as dicas abertas. Devolve true se havia alguma. */
export function closeTips(): boolean {
  if (!open.size) return false
  for (const close of [...open]) close()
  open.clear()
  return true
}
