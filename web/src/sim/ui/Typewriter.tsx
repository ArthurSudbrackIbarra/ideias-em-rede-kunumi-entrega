import { useEffect, useRef, useState } from 'react'
import { COMMA_PAUSE_MS, SENTENCE_PAUSE_MS, TYPE_CPS } from '../engine/balance'
import { typewriterStart, typewriterStop } from '../lib/sound'

interface Props {
  text: string
  /** muda quando a linha muda: reinicia a digitação */
  lineId: number | string
  speed: number
  muted: boolean
  onDone: () => void
  /** nonce: completar de imediato */
  skip?: number
  /** nonce: acelerar */
  hurry?: number
  /** congela a digitação (o texto original está aberto) */
  paused?: boolean
  /** renderização do texto pronto (para sublinhar o glossário) */
  render?: (text: string) => React.ReactNode
}

const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Efeito de digitação (spec §9.4): contador de caracteres num ref avançado por requestAnimationFrame, com
 * pausa na pontuação; um setState só quando o texto visível muda de fato. O som real de máquina de
 * escrever toca em loop enquanto há caracteres aparecendo e para com fade quando a página termina.
 */
export function Typewriter({ text, lineId, speed, muted, onDone, skip = 0, hurry = 0, paused = false, render }: Props) {
  const [shown, setShown] = useState(reduced ? text.length : 0)
  const shownRef = useRef(0)
  const acc = useRef(0)
  const pause = useRef(0)
  const hurryRef = useRef(false)
  const doneRef = useRef(false)
  const lastSkip = useRef(skip)
  const lastHurry = useRef(hurry)

  useEffect(() => {
    shownRef.current = reduced ? text.length : 0
    acc.current = 0
    pause.current = 0
    hurryRef.current = false
    doneRef.current = false
    setShown(shownRef.current)
  }, [lineId, text])

  useEffect(() => {
    if (skip !== lastSkip.current) {
      lastSkip.current = skip
      shownRef.current = text.length
      setShown(text.length)
    }
    if (hurry !== lastHurry.current) {
      lastHurry.current = hurry
      hurryRef.current = true
    }
  }, [skip, hurry, text.length])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let sounding = false
    const stopSound = () => {
      if (sounding) {
        sounding = false
        typewriterStop()
      }
    }
    const step = (now: number) => {
      // quadros lentos (WebGL por software) não podem atrasar a digitação: até meio segundo é recuperado de uma vez
      const dt = Math.min(0.5, (now - last) / 1000)
      last = now
      if (shownRef.current >= text.length) {
        stopSound()
        if (!doneRef.current) {
          doneRef.current = true
          onDone()
        }
        return
      }
      if (paused) {
        stopSound()
        raf = requestAnimationFrame(step)
        return
      }
      if (!muted && !sounding) {
        sounding = true
        typewriterStart()
      }
      const factor = speed * (hurryRef.current ? 4 : 1)
      if (pause.current > 0) {
        pause.current -= dt * 1000 * factor
      } else {
        acc.current += dt * TYPE_CPS * factor
        let n = Math.floor(acc.current)
        if (n > 0) {
          acc.current -= n
          while (n-- > 0 && shownRef.current < text.length) {
            const ch = text[shownRef.current]
            shownRef.current++
            if (ch === '.' || ch === '?' || ch === '!' || ch === '…' || ch === ':') {
              pause.current = SENTENCE_PAUSE_MS
              break
            }
            if (ch === ',' || ch === ';') {
              pause.current = COMMA_PAUSE_MS
              break
            }
          }
          setShown(shownRef.current)
        }
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      stopSound()
    }
  }, [lineId, text, speed, muted, onDone, paused])

  const done = shown >= text.length
  return (
    <span className="tw">
      {done && render ? render(text) : text.slice(0, shown)}
      {!done && <span className="tw-cursor" aria-hidden="true" />}
    </span>
  )
}
