import { useEffect, useState } from 'react'
import { copy } from '../copy'
import { RELATION_CARD_MS } from '../engine/balance'
import { displayName, ROLE_COLOR, type HearingSim } from '../lib/hearing'
import { relation as playRelation } from '../lib/sound'
import { useSim } from '../store/useSim'
import { Chevron } from './Icons'
import { RelationIcon } from './RelationBadge'

/**
 * O cartão de relação (redesenho): chassi encostado na bancada, 1,8 s quando uma réplica real dispara, e o
 * único lugar onde os cartões sem balão ("X também sustentou isso", "Concorda com você", "X mantém o que já
 * disse") aparecem. Linha de cima centralizada: nome com ponto de papel, a etiqueta da relação com ícone e
 * palavra, o nome do outro lado. A contradição sacode a cena (3px, quatro idas, 260 ms), nunca o papel.
 */
export function RelationCard({ hearing }: { hearing: HearingSim }) {
  const line = useSim((s) => s.run.current)
  const muted = useSim((s) => s.muted)
  const autoplay = useSim((s) => s.autoplay)
  const continueManual = useSim((s) => s.continueManual)
  const [visible, setVisible] = useState<number | null>(null)

  useEffect(() => {
    if (!line?.relation || line.kind === 'player') return
    setVisible(line.id)
    if (!muted) playRelation(line.relation.kind)
    const timers: ReturnType<typeof setTimeout>[] = []
    if (line.relation.kind === 'contradiz') {
      document.body.classList.add('sim-shake')
      timers.push(setTimeout(() => document.body.classList.remove('sim-shake'), 260))
    }
    timers.push(setTimeout(() => setVisible(null), RELATION_CARD_MS * 1.6))
    return () => timers.forEach(clearTimeout)
  }, [line, muted])

  if (!line?.relation || line.kind === 'player') return null
  if (visible !== line.id && line.kind !== 'relcard') return null
  const rel = line.relation
  const who = line.speaker ? hearing.cast.find((m) => m.id === line.speaker) : null
  const other = rel.target ? hearing.cast.find((m) => m.id === rel.target) : null
  const verb = rel.kind === 'defende' ? copy.rel.defende : rel.kind === 'concorda' ? copy.rel.concorda : copy.rel[rel.kind] ?? rel.kind
  const rightName = rel.kind === 'concorda' ? null : other ? displayName(hearing, other.id) : copy.desk.you
  const only = line.kind === 'relcard'

  return (
    <div className={`sim-relcard on-chassis rel-${rel.kind}${only ? ' only' : ''}`} data-testid="relation-card" role="status" aria-live="polite">
      <div className="row">
        {who && (
          <span className="who">
            <i style={{ background: ROLE_COLOR[who.role] }} />
            {displayName(hearing, who.id)}
          </span>
        )}
        <span className={`rel-tag plate rel-${rel.kind}`}>
          <RelationIcon kind={rel.kind} />
          <b>{only && rel.kind === 'apoia' ? copy.rel.apoia : verb}</b>
        </span>
        {rightName && <span className="who">{rightName}</span>}
      </div>
      <p>{only ? line.text : rel.note}</p>
      {rel.anchor === 'fala' && <span className="anchor">{copy.relcard.anchorFala}</span>}
      <div className="refs">
        {line.ref && <span className="ref">{line.ref}</span>}
        {rel.targetRef && <span className="ref">{rel.targetRef}</span>}
        {only && !autoplay && (
          <button type="button" className="continue" onClick={continueManual} data-testid="continue-relcard">
            {copy.hud.continue} <Chevron />
          </button>
        )}
      </div>
    </div>
  )
}
