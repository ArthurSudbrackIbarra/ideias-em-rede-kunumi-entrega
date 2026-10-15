import { Link } from 'react-router-dom'
import { copy } from '../copy'
import { SPEEDS, START_CONVICTION } from '../engine/balance'
import { counts, verdicts } from '../engine/scoring'
import { cardById, displayName, ROLE_COLOR, ROLE_LABEL, teseById, type HearingSim, type Role } from '../lib/hearing'
import { useSim } from '../store/useSim'
import { Chevron } from './Icons'
import { RelationIcon } from './RelationBadge'

const ROLES: Role[] = ['mesa', 'parlamentar', 'governo', 'sociedade_civil', 'setor_privado', 'convidado']
const BAD = new Set(['contradicao', 'par_invalido', 'repetida', 'ja_respondida'])

/**
 * A ata (redesenho, tela 14): a tela **é** a folha, sem cartão, sem mesa atrás e sem faixa. Duas colunas
 * separadas por um fio, a convicção final como numeral de exibição alinhado ao título, cada intervenção como
 * uma entrada de documento, e as ações encostadas à direita no rodapé. Documento não tem cartão: destaque vem
 * de tamanho, família, espaço ou de um fio.
 */
export function Ata({ hearing }: { hearing: HearingSim }) {
  const run = useSim((s) => s.run)
  const autoplay = useSim((s) => s.autoplay)
  const speed = useSim((s) => s.speed)
  const restart = useSim((s) => s.restart)
  if (run.phase !== 'ata') return null
  const cards = cardById(hearing)
  const tese = teseById(hearing, run.tese)
  const vs = verdicts(hearing, run)
  const n = counts(run)
  const questions = hearing.deck.filter((c) => c.kind === 'pergunta')
  const falas = hearing.timeline.filter((e) => e.kind === 'fala').length
  const wordsByRole = ROLES.map((r) => [r, hearing.cast.filter((m) => m.role === r).reduce((a, m) => a + m.words, 0)] as const).filter(([, w]) => w > 0)
  const maxWords = Math.max(1, ...wordsByRole.map(([, w]) => w))
  const noDot = (s: string) => s.replace(/\.$/, '')

  const reactionText = (kind: string, from: string, to: string | null) => {
    const who = displayName(hearing, from)
    switch (kind) {
      case 'contradiz':
        return `${who} ${copy.ata.reactions.contradiz}`
      case 'apoia':
        return `${who} ${copy.ata.reactions.apoia}`
      case 'defende':
        return `${who} ${copy.ata.reactions.defende} ${to ? displayName(hearing, to) : ''}`
      case 'concorda':
        return `${who} ${copy.ata.reactions.concorda}`
      case 'responde':
        return `${who} ${copy.ata.reactions.responde}`
      default:
        return null
    }
  }

  return (
    <section className="sim-ata sim-scroll" data-testid="ata">
      <div className="sheet">
        <div className="head">
          <div className="l">
            <span className="label">{copy.ata.eyebrow(hearing.date, run.seed)}</span>
            <h1>{hearing.name}</h1>
            <p className="opening" data-testid="verdicts">
              {vs.map((v) => v.text).join(' ')}
            </p>
          </div>
          <div className="score">
            <span className="label">{copy.ata.finalConviction}</span>
            <div className="n" data-testid="conviction">{Math.round(run.conviction)}</div>
            <div className="facts" data-testid="counts">
              <span>{copy.ata.startedAt(START_CONVICTION)}</span>
              <span>{noDot(copy.ata.counts(n.coerentes, n.contradicoes, n.neutras))}</span>
              <span data-testid="checked">{copy.ata.opened(run.originalsOpened.length, run.pagesSeen)}</span>
              <span>{copy.ata.mode(autoplay, copy.hud.speed(SPEEDS[speed]))}</span>
              {run.guided && <span>{noDot(copy.ata.guided)}</span>}
            </div>
          </div>
        </div>

        <div className="cols">
          <div className="mine">
            {tese && (
              <>
                <span className="label">{copy.ata.yourTese}</span>
                <h2 className="tese-title">{tese.title}</h2>
                <p className="statement">{tese.statement_plain}</p>
                <p className="inroom">{copy.ata.inRoom(tese.defender_orgs.join(', ') || copy.tese.nobody, tese.opponent_orgs.join(', ') || copy.tese.nobody)}</p>
              </>
            )}
            <span className="label mt">{copy.ata.moves}</span>
            {run.moves.length === 0 ? (
              <p className="empty">{copy.ata.noMoves}</p>
            ) : (
              <ol className="played" data-testid="moves-list">
                {run.moves.map((m, i) => {
                  const c = cards.get(m.card)
                  const cite = m.cite ? cards.get(m.cite) : null
                  const k = m.verdict.kind
                  const icon = k === 'coerente' || k === 'certeiro' ? 'apoia' : BAD.has(k) ? 'contradiz' : 'consenso'
                  return (
                    <li key={i} className="entry">
                      <div className="row">
                        <span className="turn">{m.treplica ? copy.ata.treplica : copy.ata.turn(m.turn)}</span>
                        <span className={`v v-${k}`}>
                          <RelationIcon kind={icon} /> {copy.verdict.short(k)}
                        </span>
                        <span className={`delta v-${k}`}>{m.verdict.delta > 0 ? '+' : m.verdict.delta < 0 ? '−' : ''}{Math.abs(m.verdict.delta)}</span>
                      </div>
                      <blockquote className="said">{m.said}</blockquote>
                      {m.verdict.explanation && <p className="why">{m.verdict.explanation}</p>}
                      {m.reactions.length > 0 && (
                        <p className="room">
                          {copy.ata.roomDid} {m.reactions.map((r) => reactionText(r.kind, r.from, r.to)).filter(Boolean).join(', ')}.
                        </p>
                      )}
                      {[c, cite].map((src) =>
                        src ? (
                          <details key={src.id} className="src">
                            <summary>
                              <span>
                                {displayName(hearing, src.speaker)} <span className="ref">{src.ref}</span>
                              </span>
                              <span className="see">{copy.ata.original}</span>
                            </summary>
                            <blockquote>{src.text}</blockquote>
                          </details>
                        ) : null,
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>

          <div className="vr" />

          <div className="real">
            <span className="label">{copy.ata.real}</span>
            <p>{hearing.synopsis_plain}</p>

            <span className="label mt">{copy.ata.openQuestions}</span>
            <ul className="qs">
              {questions.map((q) => (
                <li key={q.id} className={q.answered_by_real ? 'closed' : ''}>
                  <p>
                    <b>{displayName(hearing, q.speaker)}:</b> {q.plain} <span className="ref">{q.ref}</span>
                  </p>
                  <span className="status">
                    {q.answered_by_real ? copy.ata.answeredBy(displayName(hearing, q.answered_by_real.speaker)) : copy.ata.unanswered(ROLE_LABEL[q.addressed_to].toLowerCase())}
                  </span>
                </li>
              ))}
            </ul>

            <span className="label mt">{copy.ata.speakingTime}</span>
            <ul className="bars">
              {wordsByRole.map(([r, w]) => (
                <li key={r}>
                  <span className="name">{ROLE_LABEL[r]}</span>
                  <span className="bar">
                    <i style={{ width: `${(w / maxWords) * 100}%`, background: ROLE_COLOR[r] }} />
                  </span>
                  <span className="n">{w.toLocaleString('pt-BR')}</span>
                </li>
              ))}
            </ul>

            <span className="label mt">{copy.ata.press}</span>
            <p>{hearing.press.angle}</p>
            <p className="muted">{copy.ata.pressQuoted(hearing.press.roles_quoted.map((r) => ROLE_LABEL[r]).join(', '), hearing.press.covered_falas.length, falas)}</p>
            <span className="label mt">{copy.ata.omitted}</span>
            <p>{hearing.press.omitted}</p>
          </div>
        </div>

        <footer>
          <Link to="/audiencias" className="textbtn">{copy.ata.home}</Link>
          <button type="button" className="btn secondary" onClick={() => restart(run.seed)}>{copy.ata.sameSeed}</button>
          <button type="button" className="btn primary" onClick={() => restart()} data-testid="again">
            {copy.ata.again} <Chevron />
          </button>
        </footer>
      </div>
    </section>
  )
}
