import { copy } from '../copy'
import type { GlossaryTerm } from '../lib/hearing'
import { useSim } from '../store/useSim'

/**
 * O glossário (redesenho, tela 08): docado à direita como a legenda, mas com placa de chassi e corpo de papel,
 * porque é conteúdo da audiência. Cada verbete traz a referência da primeira ocorrência.
 */
export function GlossaryPanel({ terms }: { terms: GlossaryTerm[] }) {
  const open = useSim((s) => s.glossary)
  const toggle = useSim((s) => s.toggleGlossary)
  if (!open) return null
  return (
    <aside className="sim-dock sim-glossary" data-testid="glossary" aria-label={copy.glossary.title}>
      <div className="plate dock-head">
        <h3>{copy.glossary.title}</h3>
        <button type="button" className="close" onClick={toggle}>
          {copy.glossary.close} <kbd>Esc</kbd>
        </button>
      </div>
      <div className="paper sim-scroll">
        <p className="hint">{copy.glossary.hint}</p>
        {terms.map((t) => (
          <div className="term" key={t.term}>
            <div className="t">
              <b>{t.term}</b>
              <span className="ref">{t.ref}</span>
            </div>
            <p>{t.plain}</p>
          </div>
        ))}
      </div>
    </aside>
  )
}
