import { copy } from '../copy'
import { spoken } from '../engine/run'
import { cardById, displayName, teseById, type HearingSim } from '../lib/hearing'
import { SPEEDS } from '../engine/balance'
import { rateFor, speak } from '../lib/speech'
import { useSettings } from '../store/useSettings'
import { useSim } from '../store/useSim'
import { Card } from './Card'
import { Dialog } from './Dialog'
import { Key } from './Key'
import { RelationIcon } from './RelationBadge'
import { RoleDot } from './RoleDot'

/**
 * O caderno (redesenho, tela 06): a câmera continua descendo para a mesa, e a folha ocupa o meio da tela.
 * No topo, a tese que você defende em serifa sobre um fio de 2px (o único fio grosso do sistema, e ele só
 * aparece em documento). Duas colunas separadas por um fio: o caderno e as perguntas em aberto à esquerda,
 * o fio do debate à direita. A bancada continua visível, com "voltar à sala" ligado. É um diálogo: recebe o foco ao
 * abrir, prende o Tab, e Esc (ou a tecla do caderno) devolve a câmera à sala.
 */
export function Desk({ hearing }: { hearing: HearingSim }) {
  const run = useSim((s) => s.run)
  const deskView = useSim((s) => s.deskView)
  const readAloud = useSettings((s) => s.readAloud)
  if (!deskView || run.phase === 'tese' || run.phase === 'prelude' || run.phase === 'ata') return null
  const cards = cardById(hearing)
  const tese = teseById(hearing, run.tese)
  const questions = hearing.deck.filter((c) => c.kind === 'pergunta')
  const close = () => useSim.getState().requestDesk(false)

  return (
    <Dialog labelledBy="desk-title" onEscape={close} keys={['desk']} className="sim-desk" testId="desk">
      <div className="paper sim-scroll">
        <div className="head">
          <h2 id="desk-title" className="sr-only">
            {copy.desk.title}
          </h2>
          {tese && (
            <>
              <span className="engrave">{copy.desk.youDefend}</span>
              <b>{tese.title}</b>
            </>
          )}
          <button type="button" className="btn soft close" onClick={close} data-testid="desk-close">
            {copy.desk.close} <Key action="desk" />
          </button>
        </div>
        {tese && <p className="statement">{tese.statement_plain}</p>}
        <div className="cols">
          <div className="col sim-scroll" tabIndex={0} role="region" aria-labelledby="desk-notes">
            <div className="sec">
              <h3 id="desk-notes">{copy.desk.title}</h3>
              <small>{copy.desk.cards(run.hand.length)}</small>
            </div>
            {run.hand.length === 0 ? (
              <p className="empty">{copy.desk.empty}</p>
            ) : (
              <div className="cards">
                {run.hand.map((id) => {
                  const c = cards.get(id)
                  if (!c) return null
                  // a voz lê o que a carta mostra: quem disse e o resumo (ou a pergunta), sem nada a mais
                  const listen = () => speak(`${displayName(hearing, c.speaker)}: ${c.kind === 'pergunta' ? c.plain : c.gist}`, rateFor(SPEEDS[useSim.getState().speed]), () => undefined)
                  return <Card key={id} card={c} hearing={hearing} onListen={readAloud ? listen : undefined} />
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
          <div className="col thread sim-scroll" tabIndex={0} role="region" aria-labelledby="desk-thread">
            <h3 id="desk-thread">{copy.desk.thread}</h3>
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
                      <span className="dot">
                        <RoleDot role={from ? from.role : 'convidado'} label={!!from} />
                      </span>
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
    </Dialog>
  )
}
