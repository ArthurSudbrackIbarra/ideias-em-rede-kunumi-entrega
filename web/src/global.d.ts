import type { useSim } from './sim/store/useSim'

declare global {
  interface Window {
    /** Exposto para o teste Playwright e para depuração no console. */
    simStore?: typeof useSim
  }
}

export {}
