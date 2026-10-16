import { copy } from '../copy'
import { ROLE_LABEL, type Role } from '../lib/hearing'
import { actionLabel, KEY_ACTIONS } from '../lib/keys'
import { useSettings } from '../store/useSettings'
import { useSim } from '../store/useSim'
import { Dialog } from './Dialog'
import { RelationIcon } from './RelationBadge'
import { RoleDot } from './RoleDot'
import { TutorialButton } from './Tutorial'

const ROLES: Role[] = ['mesa', 'parlamentar', 'governo', 'sociedade_civil', 'setor_privado', 'convidado']

/**
 * Legenda e ajuda (redesenho, tela 07): painel docado à direita, chassi inteiro, porque é documentação da
 * máquina. Seções com rótulo gravado, item em duas colunas (120 e o resto), teclas em bloco. A lista de teclas sai
 * do mapa de teclas, então mostra as teclas trocadas no painel Acessibilidade.
 */
export function SimLegend() {
  const open = useSim((s) => s.panel === 'help')
  const shortcuts = useSettings((s) => s.shortcuts)
  const keys = useSettings((s) => s.keys)
  if (!open) return null
  const close = () => useSim.getState().togglePanel('help', false)
  return (
    <Dialog labelledBy="legend-title" onEscape={close} keys={['help']} className="sim-dock sim-legend on-chassis" testId="sim-legend">
      <div className="inner dark-scroll" tabIndex={0} role="region" aria-labelledby="legend-title">
        <div className="dock-head">
          <h2 id="legend-title">{copy.legend.title}</h2>
          <button type="button" className="close" onClick={close}>
            {copy.legend.close} <kbd>Esc</kbd>
          </button>
        </div>
        <TutorialButton className="ctl tut-entry" testId="legend-tutorial" />

        <section aria-labelledby="legend-rel">
          <h3 className="engrave" id="legend-rel">{copy.legend.relations}</h3>
          <dl className="rows">
            <div className="row"><dt className="k rel-apoia"><RelationIcon kind="apoia" />{copy.rel.apoia.toLowerCase()}</dt><dd className="d">{copy.legend.apoia}</dd></div>
            <div className="row"><dt className="k rel-responde"><RelationIcon kind="responde" />{copy.rel.responde.toLowerCase()}</dt><dd className="d">{copy.legend.responde}</dd></div>
            <div className="row"><dt className="k rel-contradiz"><RelationIcon kind="contradiz" />{copy.rel.contradiz.toLowerCase()}</dt><dd className="d">{copy.legend.contradiz}</dd></div>
            <div className="row"><dt className="k rel-consenso"><RelationIcon kind="consenso" />{copy.rel.consenso.toLowerCase()}</dt><dd className="d">{copy.legend.consenso}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="legend-verdicts">
          <h3 className="engrave" id="legend-verdicts">{copy.legend.verdicts}</h3>
          <dl className="rows">
            <div className="row"><dt className="k v-coerente"><RelationIcon kind="apoia" />coerente</dt><dd className="d">{copy.legend.coerente}</dd></div>
            <div className="row"><dt className="k v-contradicao"><RelationIcon kind="contradiz" />contradição</dt><dd className="d">{copy.legend.contradicao}</dd></div>
            <div className="row"><dt className="k v-certeiro"><RelationIcon kind="consenso" />certeiro</dt><dd className="d">{copy.legend.certeiro}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="legend-roles">
          <h3 className="engrave" id="legend-roles">{copy.legend.roles}</h3>
          <p className="d note">{copy.legend.roleShapes}</p>
          <ul className="roles">
            {ROLES.map((r) => (
              <li key={r}>
                <RoleDot role={r} size={12} /> {ROLE_LABEL[r]}
              </li>
            ))}
          </ul>
        </section>

        <section className="keys" aria-labelledby="legend-keys">
          <h3 className="engrave" id="legend-keys">{copy.legend.keys}</h3>
          <dl className="rows">
            {copy.legend.fixedKeys.map(([k, what]) => (
              <div className="row" key={k}>
                <dt className="k">
                  <kbd>{k}</kbd>
                </dt>
                <dd className="d">{what}</dd>
              </div>
            ))}
            {shortcuts &&
              KEY_ACTIONS.map((a) => (
                <div className="row" key={a}>
                  <dt className="k">
                    {actionLabel(a, keys)
                      .split(' ')
                      .map((x) => (
                        <kbd key={x}>{x}</kbd>
                      ))}
                  </dt>
                  <dd className="d">{copy.keys[a]}</dd>
                </div>
              ))}
          </dl>
          <p className="d note">{shortcuts ? copy.legend.keysMore : copy.legend.keysOff}</p>
        </section>
      </div>
    </Dialog>
  )
}
