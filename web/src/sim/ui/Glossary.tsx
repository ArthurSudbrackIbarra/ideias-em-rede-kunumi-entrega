import { copy } from '../copy'
import type { GlossaryTerm } from '../lib/hearing'
import { useSim } from '../store/useSim'
import { Dialog } from './Dialog'

/**
 * O glossário (redesenho, tela 08): docado à direita como a legenda, mas com placa de chassi e corpo de papel,
 * porque é conteúdo da audiência. Cada verbete traz a referência da primeira ocorrência. É um diálogo: recebe o
 * foco, prende o Tab, fecha com Esc ou com a mesma tecla que o abriu, e a sala espera enquanto ele está aberto.
 */
export function GlossaryPanel({ terms }: { terms: GlossaryTerm[] }) {
  const open = useSim((s) => s.panel === 'glossary')
  if (!open) return null
  const close = () => useSim.getState().togglePanel('glossary', false)
  return (
    <Dialog labelledBy="glossary-title" onEscape={close} keys={['glossary']} className="sim-dock sim-glossary" testId="glossary">
      <div className="plate dock-head">
        <h2 id="glossary-title">{copy.glossary.title}</h2>
        <button type="button" className="close" onClick={close}>
          {copy.glossary.close} <kbd>Esc</kbd>
        </button>
      </div>
      <div className="paper sim-scroll" tabIndex={0} role="region" aria-labelledby="glossary-title">
        <p className="hint">{copy.glossary.hint}</p>
        <dl>
          {terms.map((t) => (
            <div className="term" key={t.term}>
              <dt className="t">
                <b>{t.term}</b>
                <span className="ref">{t.ref}</span>
              </dt>
              <dd>{t.plain}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Dialog>
  )
}
