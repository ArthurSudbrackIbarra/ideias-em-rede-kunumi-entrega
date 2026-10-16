import { create } from 'zustand'

/**
 * O tutorial "Como jogar": se está aberto, em que passo, e o que a pessoa respondeu ao convite da primeira visita.
 * A resposta fica neste navegador numa chave com versão: trocar o v1 por v2 depois de uma mudança grande faz o
 * convite aparecer de novo para todo mundo. Sem armazenamento, a resposta vale só nesta visita.
 */

/** seen: abriu e fechou antes do fim. dismissed: disse "agora não". completed: chegou ao último passo e começou. */
export type TutorialAnswer = 'seen' | 'dismissed' | 'completed'

const KEY = 'sim.tutorial.v1'

function readAnswer(): TutorialAnswer | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'seen' || v === 'dismissed' || v === 'completed' ? v : null
  } catch {
    return null
  }
}

function writeAnswer(v: TutorialAnswer) {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    /* sem armazenamento: o convite volta na próxima visita */
  }
}

interface TutorialState {
  open: boolean
  /** o passo atual; fica na memória, então quem fecha no meio volta de onde parou */
  step: number
  answer: TutorialAnswer | null
  show: (step?: number) => void
  go: (step: number) => void
  /** fecha; `completed` quando a pessoa chegou ao fim e apertou Começar */
  close: (completed?: boolean) => void
  /** "Agora não" no convite */
  dismiss: () => void
}

export const useTutorial = create<TutorialState>((set, get) => ({
  open: false,
  step: 0,
  answer: readAnswer(),
  show(step) {
    const answer = get().answer === 'completed' ? 'completed' : 'seen'
    if (answer !== get().answer) writeAnswer(answer)
    set({ open: true, answer, step: step ?? get().step })
  },
  go(step) {
    set({ step })
  },
  close(completed = false) {
    if (completed) writeAnswer('completed')
    set({ open: false, answer: completed ? 'completed' : get().answer, step: completed ? 0 : get().step })
  },
  dismiss() {
    writeAnswer('dismissed')
    set({ answer: 'dismissed' })
  },
}))
