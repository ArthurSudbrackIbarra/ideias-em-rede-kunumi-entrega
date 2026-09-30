import { copy } from '../copy'
import { align } from '../engine/judge'
import { displayName, ROLE_COLOR, teseById, type Card as CardT, type HearingSim } from '../lib/hearing'
import { useSim } from '../store/useSim'

interface Props {
  card: CardT
  hearing: HearingSim
  selected?: boolean
  cited?: boolean
  disabled?: boolean
  onClick?: () => void
  /** trecho travado em três linhas, sem o tema no pé (grade do caderno e da vez de falar) */
  compact?: boolean
  /** a carta dentro de um campo da vez de falar: mostra a instituição no lugar da etiqueta do tipo */
  slot?: boolean
  /** candidata a citação de outro tema: é o grafo (uma respondeu à outra na audiência) que a autoriza */
  cross?: boolean
}

/**
 * Uma anotação do caderno (redesenho): papel da cadeira vaga, raio 8, sombra chapada de 2px que a faz parecer
 * uma folha. Topo com o ponto do papel institucional, o nome numa linha e a etiqueta do tipo. No pé, o tema a
 * que o trecho pertence e a referência: o tema aparece sempre, inclusive na vez de falar, porque é ele que diz
 * de que assunto a anotação trata (pedido do autor em 2026-09-15). Estados: escolhida (anel interno de 2px de
 * tinta), citada (anel dourado), já usada (55%, sem sombra). O lado só aparece em modo guiado.
 */
export function Card({ card, hearing, selected, cited, disabled, onClick, compact, slot, cross }: Props) {
  const guided = useSim((s) => s.run.guided)
  const teseId = useSim((s) => s.run.tese)
  const m = hearing.cast.find((c) => c.id === card.speaker)
  const theme = hearing.themes.find((t) => t.id === card.theme)
  const tese = teseById(hearing, teseId)
  const al = guided && tese ? align(tese, card, hearing) : null
  const Tag = onClick ? 'button' : 'div'
  const cls = `sim-card k-${card.kind}${selected ? ' selected' : ''}${cited ? ' cited' : ''}${disabled ? ' disabled' : ''}${compact ? ' compact' : ''}${slot ? ' slot' : ''}`
  return (
    <Tag type={onClick ? 'button' : undefined} className={cls} onClick={onClick} disabled={onClick ? disabled : undefined} data-testid="card" data-card={card.id}>
      <span className="top">
        {m && <i className="dot" style={{ background: ROLE_COLOR[m.role] }} />}
        <span className="who">{m ? displayName(hearing, m.id) : card.speaker}</span>
        {slot && m?.byline ? <span className="byline">{m.byline}</span> : <span className="kind">{copy.floor.kinds[card.kind]}</span>}
      </span>
      <span className="gist">{card.kind === 'pergunta' ? card.plain : card.gist}</span>
      <span className="foot">
        {theme && <span className="theme">{theme.name}</span>}
        {cross && <span className="cross">{copy.floor.citeCross}</span>}
        {al && al !== 'consenso' && (
          <span className={`side s-${al}`}>
            {copy.floor.sideLabel[card.position] ?? card.position}
            {copy.floor.alignSuffix[al] ?? ''}
          </span>
        )}
        <span className="ref">{card.ref}</span>
      </span>
    </Tag>
  )
}
