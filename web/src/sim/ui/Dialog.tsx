import { useEffect, useRef, type ReactNode } from 'react'
import { fallbackFocus, focusables, pushDialog, type DialogEntry } from '../lib/dialogs'
import type { KeyAction } from '../lib/keys'

/**
 * Diálogo acessível, usado por todos os painéis: recebe o foco ao abrir, prende o Tab enquanto está aberto (quando é
 * modal), fecha com Esc e devolve o foco a quem o abriu. Os diálogos abertos formam uma pilha, e só o de cima
 * responde. Os atalhos de uma tecla da sala ficam mudos com um diálogo aberto, menos os que ele declara em `keys`
 * (a tecla que o abriu, para fechar, e os movimentos na vez de falar).
 */

interface Props {
  /** id do título visível que nomeia o diálogo */
  labelledBy: string
  describedBy?: string
  /** Esc: fecha, ou, na vez de falar, volta um passo */
  onEscape: () => void
  modal?: boolean
  /** "container" põe o foco no próprio painel (para quem vai ler), "first" no primeiro controle; ou um seletor */
  initialFocus?: 'container' | 'first' | string
  keys?: KeyAction[]
  as?: 'section' | 'aside' | 'div'
  className?: string
  testId?: string
  children: ReactNode
}

export function Dialog({ labelledBy, describedBy, onEscape, modal = true, initialFocus = 'container', keys = [], as: Tag = 'section', className, testId, children }: Props) {
  const ref = useRef<HTMLElement>(null)
  const latest = useRef({ onEscape, keys })
  latest.current = { onEscape, keys }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const entry: DialogEntry = {
      el,
      modal,
      get keys() {
        return latest.current.keys
      },
      onEscape: () => latest.current.onEscape(),
    }
    const pop = pushDialog(entry)
    const target =
      initialFocus === 'first' ? focusables(el)[0] : initialFocus !== 'container' ? el.querySelector<HTMLElement>(initialFocus) : null
    ;(target ?? el).focus({ preventScroll: true })
    return () => {
      pop()
      const active = document.activeElement
      if (active && active !== document.body && active.isConnected && !el.contains(active)) return
      if (returnTo && returnTo.isConnected && returnTo !== document.body) returnTo.focus({ preventScroll: true })
      else fallbackFocus()
    }
    // o foco inicial e a devolução valem para a vida do diálogo, não para cada renderização
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Tag
      ref={ref as never}
      className={className}
      role="dialog"
      aria-modal={modal ? 'true' : undefined}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      tabIndex={-1}
      data-testid={testId}
    >
      {children}
    </Tag>
  )
}
