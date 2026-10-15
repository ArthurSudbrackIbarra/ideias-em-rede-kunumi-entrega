import { useEffect, useRef } from 'react'
import { copy } from '../copy'
import { teseById, type HearingSim } from '../lib/hearing'
import { hud } from '../scene/anchor'
import { useSettings } from '../store/useSettings'
import { useSim } from '../store/useSim'
import { Key } from './Key'

/**
 * O topo da sessão (redesenho): não é mais uma barra, é um véu de 112px com informação. À esquerda a data e o
 * título (o `h1` da sala), à direita a tese que você defende, e a trilha de 5px com as marcas das vezes de falar:
 * passada em `--key`, a próxima em dourado, as futuras apagadas. A trilha também diz em texto onde a sessão está e
 * quantas vezes a palavra ainda vem, e cada marca tem forma própria (cheia, com anel, vazia), não só cor.
 */
export function Progress({ hearing }: { hearing: HearingSim }) {
  const cursor = useSim((s) => s.run.cursor)
  const teseId = useSim((s) => s.run.tese)
  const phase = useSim((s) => s.run.phase)
  const floorsUsed = useSim((s) => s.run.floorsUsed)
  const panel = useSim((s) => s.panel)
  const top = useRef<HTMLElement>(null)
  const hidden = phase === 'tese' || phase === 'prelude' || phase === 'ata'
  // a altura real do topo, para o balão e o caderno começarem abaixo dele mesmo com texto grande
  useEffect(() => {
    const el = top.current
    if (!el) return
    const root = el.closest<HTMLElement>('.sim')
    const ro = new ResizeObserver(() => {
      hud.top = Math.max(112, Math.round(el.offsetHeight))
      root?.style.setProperty('--top-h', `${hud.top}px`)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [hidden])
  if (hidden) return null
  const n = hearing.timeline.length
  const pct = Math.min(100, Math.round((cursor / n) * 100))
  const floors = hearing.timeline.map((e, i) => (e.kind === 'floor' ? i : -1)).filter((i) => i >= 0)
  const next = floors.find((i) => i >= cursor)
  const ahead = floors.filter((i) => i >= cursor).length
  const left = Math.max(0, Math.min(ahead, hearing.player.slots.length - floorsUsed))
  const tese = teseById(hearing, teseId)
  const where = `${copy.progress.where(pct)}, ${copy.progress.floors(left)}`
  return (
    <header className="sim-top" ref={top} data-testid="progress">
      <div className="row">
        <div className="left">
          <span className="engrave">{copy.prelude.date(hearing.date)}</span>
          <h1 className="title" id="room-title" tabIndex={-1} data-clip>
            {hearing.name}
          </h1>
        </div>
        {tese && (
          <div className="right">
            <span className="engrave">{copy.desk.youDefend}</span>
            <span className="tese">{tese.title}</span>
          </div>
        )}
        <div className="top-actions" role="group" aria-label={copy.hud.topLabel}>
          <button type="button" className="ctl" onClick={() => useSim.getState().togglePanel('history')} aria-pressed={panel === 'history'} data-testid="history-btn">
            {copy.hud.history} <Key action="history" />
          </button>
          <button type="button" className="ctl" onClick={() => useSettings.getState().setOpen(true)} data-testid="open-settings">
            {copy.hud.a11y}
          </button>
        </div>
      </div>
      <div className="track" role="progressbar" aria-label={copy.progress.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={where}>
        <div className="fill" style={{ width: `${pct}%` }} />
        {floors.map((i) => {
          const state = i < cursor ? 'past' : i === next ? 'now' : 'later'
          return (
            <span
              key={i}
              className={`mark ${state}`}
              style={{ left: `${(i / n) * 100}%` }}
              title={state === 'past' ? copy.progress.floorPast : state === 'now' ? copy.progress.floorNext : copy.progress.floorLater}
            />
          )
        })}
      </div>
      <p className="where" data-testid="progress-text">
        {where}
      </p>
    </header>
  )
}
