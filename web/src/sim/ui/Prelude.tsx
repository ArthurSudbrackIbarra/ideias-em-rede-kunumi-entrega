import { useCallback, useEffect, useState } from 'react'
import { copy } from '../copy'
import { PRELUDE_FADE_MS, PRELUDE_HOLD_MS, PRELUDE_LINE_PAUSE_MS } from '../engine/balance'
import type { HearingSim } from '../lib/hearing'
import { useSim } from '../store/useSim'
import { Typewriter } from './Typewriter'

/**
 * A tela preta antes da sala (spec §19.6): a comissão, o título e a data, digitados com o som real de máquina
 * de escrever, a 1× fixa. Segura 800 ms, espera a cena estar montada e faz fade para a sala. Enter, Esc ou
 * clique pulam para o fim.
 */
export function Prelude({ hearing }: { hearing: HearingSim }) {
  const phase = useSim((s) => s.run.phase)
  const sceneReady = useSim((s) => s.sceneReady)
  const muted = useSim((s) => s.muted)
  const enterRoom = useSim((s) => s.enterRoom)
  const [step, setStep] = useState(0)
  const [fading, setFading] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const lines = [hearing.committee ?? 'Câmara dos Deputados', hearing.name, copy.prelude.date(hearing.date)]
  const active = phase === 'prelude'

  useEffect(() => {
    if (!active) {
      setStep(0)
      setFading(false)
      setSkipped(false)
    }
  }, [active])

  const next = useCallback(() => {
    const t = setTimeout(() => setStep((s) => Math.min(3, s + 1)), PRELUDE_LINE_PAUSE_MS)
    return () => clearTimeout(t)
  }, [])

  // fim: segura, espera a sala estar desenhada, faz o fade e entra
  useEffect(() => {
    if (!active || step < 3 || !sceneReady) return
    const hold = setTimeout(() => setFading(true), skipped ? 0 : PRELUDE_HOLD_MS)
    return () => clearTimeout(hold)
  }, [active, step, sceneReady, skipped])

  useEffect(() => {
    if (!fading) return
    const t = setTimeout(enterRoom, PRELUDE_FADE_MS)
    return () => clearTimeout(t)
  }, [fading, enterRoom])

  const skip = useCallback(() => {
    setSkipped(true)
    setStep(3)
  }, [])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
        e.preventDefault()
        skip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, skip])

  if (!active) return null
  const line = (i: number, cls: string) => {
    if (step < i) return null
    const Tag = i === 1 ? 'h1' : 'p'
    return (
      <Tag className={cls}>
        {step > i ? lines[i] : <Typewriter text={lines[i]} lineId={`prelude-${i}`} speed={1} muted={muted} onDone={next} />}
      </Tag>
    )
  }
  return (
    <div className={`sim-prelude${fading ? ' fade' : ''}`} onClick={skip} data-testid="prelude" role="presentation">
      <div className="lines">
        {line(0, 'kicker')}
        {line(1, 'title')}
        {line(2, 'date')}
      </div>
      <span className="skip">{copy.prelude.skip}</span>
    </div>
  )
}
