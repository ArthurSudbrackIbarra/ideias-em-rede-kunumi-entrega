import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import '../sim.css'

const DELAY = 250
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

/**
 * Todo elemento marcado com `data-clip` que o CSS cortou mostra o texto inteiro quando o mouse passa por cima.
 * Um só ouvinte no documento, montado uma vez no App. Se o texto coube, nada aparece. O balão segue o elemento a
 * cada quadro, porque o balão de fala desliza pela tela, e some quando o elemento sai da página.
 */
export function ClipTip() {
  const [tip, setTip] = useState<{ text: string; font: string } | null>(null)
  const host = useRef<HTMLElement | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timer = 0
    const hide = () => {
      window.clearTimeout(timer)
      host.current = null
      setTip(null)
    }
    const over = (e: MouseEvent) => {
      const h = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-clip]') : null
      if (h === host.current) return
      hide()
      if (!h) return
      host.current = h
      timer = window.setTimeout(() => {
        const src = sourceOf(h)
        if (host.current !== h || !src || !h.isConnected || !clipped(src)) return
        const text = (src.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (text) setTip({ text, font: getComputedStyle(src).fontFamily })
      }, DELAY)
    }
    const out = (e: MouseEvent) => {
      if (host.current && !(e.relatedTarget instanceof Node && host.current.contains(e.relatedTarget))) hide()
    }
    // só a rolagem de quem contém o elemento: a fala do balão rola sozinha enquanto digita, e isso não tira a placa do lugar
    const scroll = (e: Event) => {
      if (host.current && e.target instanceof Node && e.target.contains(host.current)) hide()
    }
    document.addEventListener('mouseover', over)
    document.addEventListener('mouseout', out)
    const dismiss = ['mousedown', 'keydown', 'wheel'] as const
    for (const ev of dismiss) window.addEventListener(ev, hide, true)
    window.addEventListener('scroll', scroll, true)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mouseover', over)
      document.removeEventListener('mouseout', out)
      for (const ev of dismiss) window.removeEventListener(ev, hide, true)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [])

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
    <div ref={box} className="clip-tip" role="tooltip" style={{ fontFamily: tip.font }}>
      {tip.text}
    </div>,
    document.body,
  )
}
