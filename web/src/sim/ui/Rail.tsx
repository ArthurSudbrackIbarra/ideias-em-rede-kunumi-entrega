import { useEffect, useRef, useState } from 'react'
import { copy } from '../copy'
import { DELTA_LABEL_MS, HAND_MAX, SPEEDS } from '../engine/balance'
import type { Delta } from '../engine/rules'
import { interjectChance } from '../engine/run'
import { useSim } from '../store/useSim'
import { Book, Eye, Help, Muted, Notebook, Reply, Sound } from './Icons'

const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** O número conta até o novo valor em 320 ms; com menos movimento, salta. */
function useCountUp(target: number, ms = 320): number {
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    if (reduced) {
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
 * à esquerda, os controles à direita. Nenhum elemento flutua mais em canto próprio. Todo botão tem rótulo
 * escrito e a tecla dentro. O aviso da sala é a pílula de 40px que flutua sobre a bancada, à esquerda (como na
 * peça Barra do mock): com os sete controles, a faixa não tem vão para ele, e some quando não há aviso.
 * Quando a câmera está no caderno, "caderno" vira "voltar à sala" em estado ligado e "aparte" sai. Quando a vez
 * de falar está aberta, "aparte" também sai: o ato está no painel.
 */
export function Rail() {
  const run = useSim((s) => s.run)
  const speed = useSim((s) => s.speed)
  const autoplay = useSim((s) => s.autoplay)
  const textMode = useSim((s) => s.textMode)
  const setTextMode = useSim((s) => s.setTextMode)
  const muted = useSim((s) => s.muted)
  const deskView = useSim((s) => s.deskView)
  const requestDesk = useSim((s) => s.requestDesk)
  const interject = useSim((s) => s.interject)
  const treplica = useSim((s) => s.treplica)
  const toggleLegend = useSim((s) => s.toggleLegend)
  const toggleGlossary = useSim((s) => s.toggleGlossary)
  const toggleAutoplay = useSim((s) => s.toggleAutoplay)
  const toggleMute = useSim((s) => s.toggleMute)
  const setSpeed = useSim((s) => s.setSpeed)
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null)
  const [shown, setShown] = useState<Delta[]>([])

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

  if (run.phase === 'tese' || run.phase === 'prelude' || run.phase === 'ata') return null
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
        <div className="sim-notice" role="status" key={notice?.id ?? 'attention'} data-testid="notice">
          <Eye /> {noticeText}
        </div>
      )}
    <div className="sim-rail" data-testid="rail">
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
            <Reply /> {copy.hud.treplica} <kbd>T</kbd>
          </button>
        )}
        {showInterject && (
          <button type="button" className="ctl raised" onClick={interject} disabled={!canInterject} data-testid="interject">
            {copy.hud.interject} <span className="pct">{p}%</span> <kbd>A</kbd>
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
          <kbd>Tab</kbd>
        </button>
        <span className="divider" aria-hidden="true" />
        <div className="seg" role="group" aria-label={autoplay ? copy.hud.autoTitle : copy.hud.manualTitle} title={autoplay ? copy.hud.autoTitle : copy.hud.manualTitle}>
          <button type="button" className={autoplay ? 'on' : ''} onClick={() => !autoplay && toggleAutoplay()} aria-pressed={autoplay} data-testid="autoplay">
            {copy.hud.auto}
          </button>
          <button type="button" className={autoplay ? '' : 'on'} onClick={() => autoplay && toggleAutoplay()} aria-pressed={!autoplay} data-testid="manual">
            {copy.hud.manual}
          </button>
        </div>
        <div
          className="seg"
          role="group"
          aria-label={textMode === 'plain' ? copy.hud.plainModeTitle : copy.hud.verbatimModeTitle}
          title={textMode === 'plain' ? copy.hud.plainModeTitle : copy.hud.verbatimModeTitle}
        >
          <button type="button" className={textMode === 'plain' ? 'on' : ''} onClick={() => setTextMode('plain')} aria-pressed={textMode === 'plain'} data-testid="text-plain">
            {copy.hud.plainMode}
          </button>
          <button type="button" className={textMode === 'verbatim' ? 'on' : ''} onClick={() => setTextMode('verbatim')} aria-pressed={textMode === 'verbatim'} data-testid="text-verbatim">
            {copy.hud.verbatimMode}
          </button>
        </div>
        <div className="speed">
          <button type="button" onClick={() => setSpeed(-1)} aria-label="mais devagar">−</button>
          <b data-testid="speed">{copy.hud.speed(SPEEDS[speed])}</b>
          <button type="button" onClick={() => setSpeed(1)} aria-label="mais rápido">+</button>
        </div>
        <button type="button" className="ctl" onClick={toggleMute} aria-pressed={muted} data-testid="mute">
          {muted ? <Muted /> : <Sound />} {muted ? copy.hud.muted : copy.hud.sound} <kbd>M</kbd>
        </button>
        <button type="button" className="ctl" onClick={toggleGlossary} data-testid="glossary-btn">
          <Book /> {copy.hud.glossary} <kbd>G</kbd>
        </button>
        <button type="button" className="ctl" onClick={toggleLegend} data-testid="help-btn">
          <Help /> {copy.hud.help} <kbd>H</kbd>
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
      <span className="value">{shown}</span>
      <span className="bar" aria-hidden="true">
        <i style={{ width: `${Math.max(0, Math.min(100, target))}%` }} />
      </span>
      {deltas.slice(-1).map((d) => (
        <span key={d.id} className={`delta ${d.value >= 0 ? 'up' : 'down'}`} role="status">
          {d.value > 0 ? '+' : d.value < 0 ? '−' : ''}{Math.abs(d.value)} {d.cause.toLowerCase()}
        </span>
      ))}
    </div>
  )
}
