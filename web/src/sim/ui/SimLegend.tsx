import { copy } from '../copy'
import { ROLE_COLOR, ROLE_LABEL, type Role } from '../lib/hearing'
import { useSim } from '../store/useSim'
import { RelationIcon } from './RelationBadge'

const ROLES: Role[] = ['mesa', 'parlamentar', 'governo', 'sociedade_civil', 'setor_privado', 'convidado']

/**
 * Legenda e ajuda (redesenho, tela 07): painel docado à direita, chassi inteiro, porque é documentação da
 * máquina. Seções com rótulo gravado, item em duas colunas (120 e o resto), teclas em bloco.
 */
export function SimLegend() {
  const legend = useSim((s) => s.legend)
  const toggle = useSim((s) => s.toggleLegend)
  if (!legend) return null
  return (
    <aside className="sim-dock sim-legend on-chassis" data-testid="sim-legend" aria-label={copy.legend.title}>
      <div className="inner dark-scroll">
        <div className="dock-head">
          <h3>{copy.legend.title}</h3>
          <button type="button" className="close" onClick={toggle}>
            {copy.legend.close} <kbd>Esc</kbd>
          </button>
        </div>

        <section>
          <span className="engrave">{copy.legend.relations}</span>
          <div className="rows">
            <div className="row"><span className="k rel-apoia"><RelationIcon kind="apoia" />{copy.rel.apoia.toLowerCase()}</span><span className="d">{copy.legend.apoia}</span></div>
            <div className="row"><span className="k rel-responde"><RelationIcon kind="responde" />{copy.rel.responde.toLowerCase()}</span><span className="d">{copy.legend.responde}</span></div>
            <div className="row"><span className="k rel-contradiz"><RelationIcon kind="contradiz" />{copy.rel.contradiz.toLowerCase()}</span><span className="d">{copy.legend.contradiz}</span></div>
            <div className="row"><span className="k rel-consenso"><RelationIcon kind="consenso" />{copy.rel.consenso.toLowerCase()}</span><span className="d">{copy.legend.consenso}</span></div>
          </div>
        </section>

        <section>
          <span className="engrave">{copy.legend.verdicts}</span>
          <div className="rows">
            <div className="row"><span className="k v-coerente">coerente</span><span className="d">{copy.legend.coerente}</span></div>
            <div className="row"><span className="k v-contradicao">contradição</span><span className="d">{copy.legend.contradicao}</span></div>
            <div className="row"><span className="k v-certeiro">certeiro</span><span className="d">{copy.legend.certeiro}</span></div>
          </div>
        </section>

        <section>
          <span className="engrave">{copy.legend.roles}</span>
          <div className="roles">
            {ROLES.map((r) => (
              <div key={r}>
                <i style={{ background: ROLE_COLOR[r] }} /> {ROLE_LABEL[r]}
              </div>
            ))}
          </div>
        </section>

        <section className="keys">
          <span className="engrave">{copy.legend.keys}</span>
          <div className="rows">
            {copy.legend.keyList.map(([k, what]) => (
              <div className="row" key={k}>
                <span className="k">
                  {k.split(' ').map((x) => (
                    <kbd key={x}>{x}</kbd>
                  ))}
                </span>
                <span className="d">{what}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  )
}
