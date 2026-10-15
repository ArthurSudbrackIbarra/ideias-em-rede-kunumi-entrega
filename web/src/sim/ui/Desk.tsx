import { copy } from '../copy'
import { spoken } from '../engine/run'
import { cardById, displayName, ROLE_COLOR, ROLE_LABEL, teseById, type HearingSim } from '../lib/hearing'
import { useSim } from '../store/useSim'
import { Card } from './Card'
import { RelationIcon } from './RelationBadge'

/**
 * O caderno (redesenho, tela 06): a câmera continua descendo para a mesa, e a folha ocupa o meio da tela.
 * No topo, a tese que você defende em serifa sobre um fio de 2px (o único fio grosso do sistema, e ele só
 * aparece em documento). Duas colunas separadas por um fio: o caderno e as perguntas em aberto à esquerda,
 * o fio do debate à direita. A bancada continua visível, com "voltar à sala" ligado.
 */
export function Desk({ hearing }: { hearing: HearingSim }) {
  const run = useSim((s) => s.run)
  const deskView = useSim((s) => s.deskView)
  if (!deskView || run.phase === 'tese' || run.phase === 'prelude' || run.phase === 'ata') return null
  const cards = cardById(hearing)
  const tese = teseById(hearing, run.tese)
  const questions = hearing.deck.filter((c) => c.kind === 'pergunta')

  return (
    <section className="sim-desk" data-testid="desk" aria-label={copy.desk.title}>
      <div className="paper sim-scroll">
        {tese && (
          <>
            <div className="head">
              <span className="engrave">{copy.desk.youDefend}</span>
              <b>{tese.title}</b>
            </div>
            <p className="statement">{tese.statement_plain}</p>
          </>
        )}
        <div className="cols">
          <div className="col sim-scroll">
            <div className="sec">
              <h3>{copy.desk.title}</h3>
              <small>{copy.desk.cards(run.hand.length)}</small>
            </div>
            {run.hand.length === 0 ? (
              <p className="empty">{copy.desk.empty}</p>
            ) : (
              <div className="cards">
                {run.hand.map((id) => {
                  const c = cards.get(id)
                  return c ? <Card key={id} card={c} hearing={hearing} /> : null
                })}
              </div>
            )}
            <div className="sec mt">
              <h3>{copy.desk.questions}</h3>
            </div>
            <ul className="questions">
              {questions.map((q) => {
                const answered = q.answered_by_real && spoken(hearing, run, q.answered_by_real.fala)
                return (
                  <li key={q.id} className={answered ? 'closed' : ''}>
                    <b>{displayName(hearing, q.speaker)}:</b> {q.plain} <span className="ref">{q.ref}</span>
                    {answered && q.answered_by_real && <span className="status">{copy.ata.answeredBy(displayName(hearing, q.answered_by_real.speaker))}</span>}
                    {run.cobradas.includes(q.id) && <span className="status mine">{copy.floor.cobro.toLowerCase()}</span>}
                  </li>
                )
              })}
              {questions.length === 0 && <li className="empty">{copy.desk.questionsEmpty}</li>}
            </ul>
          </div>
          <div className="vr" />
          <div className="col thread sim-scroll">
            <h3>{copy.desk.thread}</h3>
            {run.thread.length === 0 ? (
              <p className="empty">{copy.desk.threadEmpty}</p>
            ) : (
              <ol>
                {run.thread.slice(-16).map((t) => {
                  const from = t.from === 'player' ? null : hearing.cast.find((m) => m.id === t.from)
                  const to = t.to && t.to !== 'player' ? hearing.cast.find((m) => m.id === t.to) : null
                  const rel = t.kind === 'apoia' || t.kind === 'responde' || t.kind === 'contradiz' || t.kind === 'consenso' || t.kind === 'defende' || t.kind === 'concorda' || t.kind === 'cobranca' || t.kind === 'respondida'
                  return (
                    <li key={t.id} className={`k-${t.kind}`}>
                      <span className="dot" style={{ background: from ? ROLE_COLOR[from.role] : ROLE_COLOR.convidado }} title={from ? ROLE_LABEL[from.role] : copy.desk.you} />
                      <div>
                        <div className="head">
                          <span className="who">{from ? displayName(hearing, from.id) : copy.desk.you}</span>
                          {rel && (
                            <span className={`rel rel-${t.kind}`}>
                              <RelationIcon kind={t.kind} />
                              {t.kind === 'cobranca' ? copy.rel.cobra : t.kind === 'respondida' ? copy.rel.responde : copy.rel[t.kind] ?? ''}{' '}
                              {to ? displayName(hearing, to.id) : t.to === 'player' ? copy.rel.you : ''}
                            </span>
                          )}
                        </div>
                        <span className="note">{t.note}</span>
                        {t.ref && <span className="ref">{t.ref}</span>}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
