import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { tipOpened } from '../lib/tips'
import '../sim.css'

const DELAY = 250
/** o vão entre o texto e a dica: o ponteiro atravessa sem a dica sumir */
const GRACE = 150
const GAP = 6
const MARGIN = 8

/** cortado pelo CSS, seja com reticências numa linha, seja com line-clamp em várias */
function clipped(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
}

/** `data-clip-from` aponta um descendente quando outro elemento cobre o texto (o <select> transparente dos filtros) */
function sourceOf(host: HTMLElement): HTMLElement | null {
  const from = host.dataset.clipFrom
  return from ? host.querySelector<HTMLElement>(from) : host
}

/** No foco do teclado, o primeiro texto cortado dentro do elemento focado (a linha do acervo, a carta). */
function hostInFocus(el: Element): HTMLElement | null {
  // o foco que o próprio jogo põe num título (tabIndex -1) só marca o lugar: a dica fica para quem navega com Tab
  if (!(el instanceof HTMLElement) || el.tabIndex < 0 || !el.matches(':focus-visible')) return null
  if (el.dataset.clip !== undefined) return el
  for (const h of el.querySelectorAll<HTMLElement>('[data-clip]')) {
    const src = sourceOf(h)
    if (src && clipped(src)) return h
  }
  return null
}

/**
 * Todo elemento marcado com `data-clip` que o CSS cortou mostra o texto inteiro quando o mouse passa por cima ou
 * quando o teclado foca nele. Um só ouvinte no documento, montado uma vez no App. Se o texto coube, nada aparece. A
 * dica segue o elemento a cada quadro, porque o balão de fala desliza pela tela. Ela segue a WCAG 1.4.13: dá para
 * levar o ponteiro até ela sem que suma, o Esc a fecha sem mover o foco, e ela fica até o ponteiro ou o foco sair.
 */
export function ClipTip() {
  const [tip, setTip] = useState<{ text: string; font: string } | null>(null)
  const host = useRef<HTMLElement | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const hideSoon = useRef<() => void>(() => undefined)

  useEffect(() => {
    let timer = 0
    let grace = 0
    const hide = () => {
      window.clearTimeout(timer)
      window.clearTimeout(grace)
      host.current = null
      setTip(null)
    }
    hideSoon.current = () => {
      window.clearTimeout(grace)
      grace = window.setTimeout(hide, GRACE)
    }
    const showFor = (h: HTMLElement) => {
      window.clearTimeout(grace)
      if (h === host.current) return
      hide()
      host.current = h
      timer = window.setTimeout(() => {
        const src = sourceOf(h)
        if (host.current !== h || !src || !h.isConnected || !clipped(src)) return
        const text = (src.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (text) setTip({ text, font: getComputedStyle(src).fontFamily })
      }, DELAY)
    }
    const inTip = (n: EventTarget | null) => n instanceof Node && !!box.current?.contains(n)
    const over = (e: MouseEvent) => {
      if (inTip(e.target)) {
        window.clearTimeout(grace)
        return
      }
      const h = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-clip]') : null
      if (h) showFor(h)
      else if (host.current) hideSoon.current()
    }
    const out = (e: MouseEvent) => {
      const to = e.relatedTarget
      if (!host.current || inTip(to) || (to instanceof Node && host.current.contains(to))) return
      hideSoon.current()
    }
    const focusIn = (e: FocusEvent) => {
      const h = e.target instanceof Element ? hostInFocus(e.target) : null
      if (h) showFor(h)
      else if (host.current) hide()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && host.current) hide()
    }
    // só a rolagem de quem contém o elemento: a fala do balão rola sozinha enquanto digita, e isso não tira a placa do lugar
    const scroll = (e: Event) => {
      if (host.current && e.target instanceof Node && e.target.contains(host.current)) hide()
    }
    const press = (e: MouseEvent) => {
      if (!inTip(e.target)) hide()
    }
    document.addEventListener('mouseover', over)
    document.addEventListener('mouseout', out)
    document.addEventListener('focusin', focusIn)
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', press, true)
    window.addEventListener('wheel', hide, true)
    window.addEventListener('scroll', scroll, true)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(grace)
      document.removeEventListener('mouseover', over)
      document.removeEventListener('mouseout', out)
      document.removeEventListener('focusin', focusIn)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', press, true)
      window.removeEventListener('wheel', hide, true)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [])

  // aberta, a dica entra no registro que o Esc consulta antes de fechar painéis
  useEffect(() => {
    if (!tip) return
    return tipOpened(() => {
      host.current = null
      setTip(null)
    })
  }, [tip])

  useLayoutEffect(() => {
    if (!tip) return
    let raf = 0
    const place = () => {
      const h = host.current
      const b = box.current
      if (!h || !b || !h.isConnected) {
        host.current = null
        setTip(null)
        return
      }
      const r = h.getBoundingClientRect()
      const x = Math.min(Math.max(MARGIN, r.left), window.innerWidth - b.offsetWidth - MARGIN)
      let y = r.bottom + GAP
      if (y + b.offsetHeight > window.innerHeight - MARGIN) y = r.top - GAP - b.offsetHeight
      b.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
      raf = requestAnimationFrame(place)
    }
    place()
    return () => cancelAnimationFrame(raf)
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div
      ref={box}
      className="clip-tip"
      role="tooltip"
      style={{ fontFamily: tip.font }}
      onMouseLeave={(e) => {
        if (!(e.relatedTarget instanceof Node && host.current?.contains(e.relatedTarget))) hideSoon.current()
      }}
    >
      {tip.text}
    </div>,
    // dentro do conteúdo principal, para a dica não ficar fora dos marcos da página
    document.getElementById('conteudo') ?? document.body,
  )
}
