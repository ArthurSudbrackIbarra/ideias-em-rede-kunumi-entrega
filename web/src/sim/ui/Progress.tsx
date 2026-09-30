import { copy } from '../copy'
import { teseById, type HearingSim } from '../lib/hearing'
import { useSim } from '../store/useSim'

/**
 * O topo da sessão (redesenho): não é mais uma barra, é um véu de 112px com informação. À esquerda a data e o
 * título, à direita a tese que você defende, e a trilha de 5px com as marcas das vezes de falar: passada em
 * `--key`, a próxima em dourado, as futuras apagadas.
 */
export function Progress({ hearing }: { hearing: HearingSim }) {
  const cursor = useSim((s) => s.run.cursor)
  const teseId = useSim((s) => s.run.tese)
  const phase = useSim((s) => s.run.phase)
  if (phase === 'tese' || phase === 'prelude' || phase === 'ata') return null
  const n = hearing.timeline.length
  const pct = Math.min(100, (cursor / n) * 100)
  const floors = hearing.timeline.map((e, i) => (e.kind === 'floor' ? i : -1)).filter((i) => i >= 0)
  const next = floors.find((i) => i >= cursor)
  const tese = teseById(hearing, teseId)
  return (
    <div className="sim-top" data-testid="progress">
      <div className="row">
        <div className="left">
          <span className="engrave">{copy.prelude.date(hearing.date)}</span>
          <span className="title">{hearing.name}</span>
        </div>
        {tese && (
          <div className="right">
            <span className="engrave">{copy.desk.youDefend}</span>
            <span className="tese">{tese.title}</span>
          </div>
        )}
      </div>
      <div className="track">
        <div className="fill" style={{ width: `${pct}%` }} />
        {floors.map((i) => (
          <span key={i} className={`mark${i < cursor ? ' past' : i === next ? ' now' : ''}`} style={{ left: `${(i / n) * 100}%` }} title={copy.floor.title} />
        ))}
      </div>
    </div>
  )
}
