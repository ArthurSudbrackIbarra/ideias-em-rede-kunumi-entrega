import { create } from 'zustand'

/**
 * O que o leitor de tela ouve sem que o foco mude: cada mensagem entra como um parágrafo novo numa região viva, e o
 * leitor anuncia cada acréscimo uma vez. Só as três últimas ficam no DOM. "polite" espera a pessoa terminar de ouvir o
 * que estava ouvindo. "assertive" é só para o que pede uma ação agora (a tréplica, que tem prazo).
 */

export interface Message {
  id: number
  text: string
}

interface AnnounceState {
  polite: Message[]
  assertive: Message[]
}

export const useAnnounce = create<AnnounceState>(() => ({ polite: [], assertive: [] }))

let next = 1

export function announce(text: string, mode: 'polite' | 'assertive' = 'polite') {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return
  const list = useAnnounce.getState()[mode]
  useAnnounce.setState({ [mode]: [...list.slice(-2), { id: next++, text: t }] })
}

export function clearAnnouncements() {
  useAnnounce.setState({ polite: [], assertive: [] })
}
