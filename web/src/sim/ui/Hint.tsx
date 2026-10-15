import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { tipOpened } from '../lib/tips'

/**
 * Uma explicação que aparece ao passar o mouse ou focar um controle (o modo guiado). Segue a WCAG 1.4.13: o ponteiro
 * pode ir até a explicação sem que ela suma, o Esc a fecha sem mover o foco, e ela fica até o ponteiro ou o foco
 * sair. O texto está sempre no DOM, ligado ao controle por `aria-describedby`, então o leitor de tela o ouve.
 */
export function Hint({ text, className, children }: { text: string; className?: string; children: (describedBy: string) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const timer = useRef(0)
  useEffect(() => (open ? tipOpened(() => setOpen(false)) : undefined), [open])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const show = () => {
    window.clearTimeout(timer.current)
    setOpen(true)
  }
  const hideSoon = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(false), 150)
  }
  return (
    <span className={`hint-host${className ? ` ${className}` : ''}`} onMouseEnter={show} onMouseLeave={hideSoon} onFocus={show} onBlur={hideSoon}>
      {children(id)}
      <span id={id} role="tooltip" className={`hint-bubble${open ? ' on' : ''}`}>
        {text}
      </span>
    </span>
  )
}
