import { useEffect, useRef, useState } from 'react'
import { copy } from '../copy'
import { DELTA_LABEL_MS, HAND_MAX, SPEEDS } from '../engine/balance'
import type { Delta } from '../engine/rules'
import { interjectChance } from '../engine/run'
import { hud } from '../scene/anchor'
import { reducedMotion } from '../store/useSettings'
import { useSim } from '../store/useSim'
import { Book, Chevron, ChevronLeft, Eye, Help, Muted, Notebook, Reply, Sound } from './Icons'
import { Key } from './Key'

/** O número conta até o novo valor em 320 ms; com menos movimento, salta. */
function useCountUp(target: number, ms = 320): number {
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    if (reducedMotion()) {
      from.current = target
      setShown(target)
      return
    }
    const a = from.current
    if (a === target) return
    const start = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms)
      const e = 1 - Math.pow(1 - k, 3)
      const v = Math.round(a + (target - a) * e)
      from.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return shown
}

/**
 * A bancada (redesenho): uma faixa de 116px no rodapé, sempre presente na sala, do mesmo material. Os medidores
 * à esquerda, os controles à direita. Todo botão tem rótulo escrito e a tecla dentro. O aviso da sala é a pílula de
 * 40px que flutua sobre a bancada, à esquerda, e some quando não há aviso. À direita, sobre a bancada, os três botões
 * que viram a câmera sem arrastar (WCAG 2.5.7). Quando a câmera está no caderno, "caderno" vira "voltar à sala" em
 * estado ligado e "aparte" sai. Quando a vez de falar está aberta, "aparte" também sai: o ato está no painel. A altura
 * real da faixa vai para `--rail-h`, porque com texto grande ela cresce e o resto da sala se ajusta a ela.
 */
export function Rail() {
  const run = useSim((s) => s.run)
  const speed = useSim((s) => s.speed)
  const autoplay = useSim((s) => s.autoplay)
  const textMode = useSim((s) => s.textMode)
  const setTextMode = useSim((s) => s.setTextMode)
  const muted = useSim((s) => s.muted)
  const deskView = useSim((s) => s.deskView)
  const panel = useSim((s) => s.panel)
  const requestDesk = useSim((s) => s.requestDesk)
  const interject = useSim((s) => s.interject)
  const treplica = useSim((s) => s.treplica)
  const togglePanel = useSim((s) => s.togglePanel)
  const toggleAutoplay = useSim((s) => s.toggleAutoplay)
  const toggleMute = useSim((s) => s.toggleMute)
  const setSpeed = useSim((s) => s.setSpeed)
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null)
  const [shown, setShown] = useState<Delta[]>([])
  const rail = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!run.notice) return
    setNotice(run.notice)
    const t = setTimeout(() => setNotice(null), 2200)
    return () => clearTimeout(t)
  }, [run.notice])

  useEffect(() => {
    const latest = run.deltas.slice(-3)
    if (!latest.length) return
    setShown(latest)
    const t = setTimeout(() => setShown([]), DELTA_LABEL_MS)
    return () => clearTimeout(t)
  }, [run.deltas])

  const hidden = run.phase === 'tese' || run.phase === 'prelude' || run.phase === 'ata'
  useEffect(() => {
    const el = rail.current
    if (!el) return
    const root = el.closest<HTMLElement>('.sim')
    const ro = new ResizeObserver(() => {
      hud.rail = Math.round(el.offsetHeight)
      root?.style.setProperty('--rail-h', `${hud.rail}px`)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [hidden])

  if (hidden) return null
  const inFala = run.phase === 'session' && run.current?.kind === 'fala'
  const showInterject = inFala && !deskView && run.phase !== 'floor'
  const canInterject = inFala && run.hand.length > 0
  const p = Math.round(interjectChance(run) * 100)
  const offer = run.treplicaOffer !== null && run.treplicaOffer.until >= run.clock
  const noticeText = notice?.text ?? (run.attention < 40 ? copy.hud.attentionLow : null)
  const deltasOf = (meter: Delta['meter']) => shown.filter((d) => d.meter === meter)

  return (
    <>
      {noticeText && (
        <div className="sim-notice" key={notice?.id ?? 'attention'} data-testid="notice">
          <Eye /> {noticeText}
        </div>
      )}
      <div className="sim-view" role="group" aria-label={copy.view.group} data-testid="view-controls">
        <button type="button" className="ctl" onClick={() => useSim.getState().turn(-1)} data-testid="turn-left">
          <ChevronLeft /> <span className="sr-only">{copy.view.left}</span>
        </button>
        <button type="button" className="ctl" onClick={() => useSim.getState().requestLook()} data-testid="look">
          <Eye /> {copy.view.speaker} <Key action="look" />
        </button>
        <button type="button" className="ctl" onClick={() => useSim.getState().turn(1)} data-testid="turn-right">
          <span className="sr-only">{copy.view.right}</span> <Chevron />
        </button>
      </div>
      <div className="sim-rail" ref={rail} data-testid="rail" role="region" aria-label={copy.hud.railLabel}>
        <div className="meters" data-testid="meters">
          <Meter name={copy.meters.conviction} value={run.conviction} deltas={deltasOf('conviccao')} low={run.conviction < 30} />
          <Meter name={copy.meters.attention} value={run.attention} deltas={deltasOf('atencao')} low={run.attention < 25} />
          <Meter name={copy.meters.mesa} value={run.mesaPatience} deltas={deltasOf('mesa')} low={run.mesaPatience < 30} />
          <div className="meter">
            <span className="name">{copy.meters.hand}</span>
            <span className="value">
              {run.hand.length}
              <small>/{HAND_MAX}</small>
            </span>
            <span className="segs" aria-hidden="true">
              {Array.from({ length: HAND_MAX }, (_, i) => <i key={i} className={i < run.hand.length ? 'on' : ''} />)}
            </span>
          </div>
        </div>

        <div className="controls" data-testid="actions">
          {offer && (
            <button type="button" className="ctl raised" onClick={treplica} data-testid="treplica">
              <Reply /> {copy.hud.treplica} <Key action="treplica" />
            </button>
          )}
          {showInterject && (
            <button type="button" className="ctl raised" onClick={interject} disabled={!canInterject} data-testid="interject">
              {copy.hud.interject} <span className="pct">{p}%</span> <Key action="interject" />
            </button>
          )}
          <button type="button" className="ctl" onClick={() => requestDesk()} aria-pressed={deskView} data-testid="desk-btn">
            {deskView ? (
              copy.hud.room
            ) : (
              <>
                <Notebook /> {copy.hud.desk} <span className="n">{run.hand.length}</span>
              </>
            )}
            <Key action="desk" />
          </button>
          <span className="divider" aria-hidden="true" />
          <div className="seg" role="group" aria-label={copy.hud.advanceGroup} title={autoplay ? copy.hud.autoTitle : copy.hud.manualTitle}>
            <button type="button" className={autoplay ? 'on' : ''} onClick={() => !autoplay && toggleAutoplay()} aria-pressed={autoplay} data-testid="autoplay">
              {copy.hud.auto}
            </button>
            <button type="button" className={autoplay ? '' : 'on'} onClick={() => autoplay && toggleAutoplay()} aria-pressed={!autoplay} data-testid="manual">
              {copy.hud.manual}
            </button>
          </div>
          <div className="seg" role="group" aria-label={copy.hud.textGroup} title={textMode === 'plain' ? copy.hud.plainModeTitle : copy.hud.verbatimModeTitle}>
            <button type="button" className={textMode === 'plain' ? 'on' : ''} onClick={() => setTextMode('plain')} aria-pressed={textMode === 'plain'} data-testid="text-plain">
              {copy.hud.plainMode}
            </button>
            <button type="button" className={textMode === 'verbatim' ? 'on' : ''} onClick={() => setTextMode('verbatim')} aria-pressed={textMode === 'verbatim'} data-testid="text-verbatim">
              {copy.hud.verbatimMode}
            </button>
          </div>
          <div className="speed" role="group" aria-label={copy.hud.speedLabel}>
            <button type="button" onClick={() => setSpeed(-1)} aria-label={copy.hud.slower} disabled={speed === 0}>
              −
            </button>
            <b data-testid="speed" aria-live="polite">
              {copy.hud.speed(SPEEDS[speed])}
            </b>
            <button type="button" onClick={() => setSpeed(1)} aria-label={copy.hud.faster} disabled={speed === SPEEDS.length - 1}>
              +
            </button>
          </div>
          <button type="button" className="ctl" onClick={toggleMute} aria-pressed={muted} data-testid="mute">
            {muted ? <Muted /> : <Sound />} {muted ? copy.hud.muted : copy.hud.sound} <Key action="mute" />
          </button>
          <button type="button" className="ctl" onClick={() => togglePanel('glossary')} aria-pressed={panel === 'glossary'} data-testid="glossary-btn">
            <Book /> {copy.hud.glossary} <Key action="glossary" />
          </button>
          <button type="button" className="ctl" onClick={() => togglePanel('help')} aria-pressed={panel === 'help'} data-testid="help-btn">
            <Help /> {copy.hud.help} <Key action="help" />
          </button>
        </div>
      </div>
    </>
  )
}

function Meter({ name, value, deltas, low }: { name: string; value: number; deltas: Delta[]; low: boolean }) {
  const target = Math.round(value)
  const shown = useCountUp(target)
  return (
    <div className={`meter${low ? ' low' : ''}`}>
      <span className="name">{name}</span>
      <span className="value">
        {shown}
        {low && <span className="low-tag">{copy.meters.low}</span>}
      </span>
      <span className="bar" aria-hidden="true">
        <i style={{ width: `${Math.max(0, Math.min(100, target))}%` }} />
      </span>
      {deltas.slice(-1).map((d) => (
        <span key={d.id} className={`delta ${d.value >= 0 ? 'up' : 'down'}`} aria-hidden="true">
          {d.value > 0 ? '+' : d.value < 0 ? '−' : ''}{Math.abs(d.value)} {d.cause.toLowerCase()}
        </span>
      ))}
    </div>
  )
}
