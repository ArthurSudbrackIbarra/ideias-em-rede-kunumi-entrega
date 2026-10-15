import { actionLabel, type KeyAction } from '../lib/keys'
import { useSettings } from '../store/useSettings'

/**
 * A tecla de uma ação, escrita dentro do botão. Lê o mapa de teclas, então mostra a tecla trocada no painel
 * Acessibilidade, e some quando os atalhos estão desligados. É só um lembrete visual: o nome do botão não a inclui.
 */
export function Key({ action }: { action: KeyAction }) {
  const on = useSettings((s) => s.shortcuts)
  const keys = useSettings((s) => s.keys)
  if (!on) return null
  return <kbd aria-hidden="true">{actionLabel(action, keys)}</kbd>
}
