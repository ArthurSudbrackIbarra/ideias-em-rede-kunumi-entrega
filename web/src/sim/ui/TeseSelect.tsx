import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { copy } from '../copy'
import { align } from '../engine/judge'
import { cardById, displayName, isClaim, ROLE_COLOR, ROLE_LABEL, type ClaimCard, type HearingSim, type Role, type Tese } from '../lib/hearing'
import { useSim } from '../store/useSim'
import { Chevron, ChevronLeft } from './Icons'

/** Acima de sete instituições a lista aperta o espaçamento antes de cortar qualquer nome. */
const TIGHT = 7

/**
 * A escolha da tese, em dossiê (pacote handoff-tese, 2026-09-15): uma ideia por vez, em tamanho de leitura,
 * com as duas listas de instituição inteiras e uma fala real da sala que sustenta a ideia. A tira embaixo diz
 * quantas ideias existem e onde você está. Setas, teclas e a tira trocam a ideia em foco, que é estado local
 * desta tela e não entra na store. O modo guiado fica ao lado de Defender esta ideia (decisão do autor), com
 * uma frase que explica o que ele faz.
 */
export function TeseSelect({ hearing }: { hearing: HearingSim }) {
  const phase = useSim((s) => s.run.phase)
  const seed = useSim((s) => s.run.seed)
  const chooseTese = useSim((s) => s.chooseTese)
  const [guided, setGuided] = useState(false)
  const [at, setAt] = useState(0)
  const [orig, setOrig] = useState(false)
  const teses = hearing.teses
  const n = teses.length
  const active = phase === 'tese'

  const go = useCallback(
    (i: number) => {
      setAt(Math.min(n - 1, Math.max(0, i)))
      setOrig(false)
    },
    [n],
  )

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'ArrowRight') go(at + 1)
      else if (e.key === 'ArrowLeft') go(at - 1)
      else if (e.key === 'Enter') chooseTese(teses[at].id, guided)
      else if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) go(Number(e.key) - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, at, go, guided, n, teses, chooseTese])

  const cards = useMemo(() => cardById(hearing), [hearing])
  /** o papel institucional de cada instituição, para o ponto ao lado do nome */
  const roleOfOrg = useMemo(() => {
    const m = new Map<string, Role>()
    for (const c of hearing.cast) if (c.org && !m.has(c.org)) m.set(c.org, c.role)
    return m
  }, [hearing])

  if (!active) return null
  const tese = teses[at]
  const quote = quoteFor(hearing, cards, tese)

  return (
    <section className="sim-tese" data-testid="tese-select">
      <div className="head">
        <div className="what">
          <Link to="/audiencias" className="back-link">
            <ChevronLeft /> {copy.tese.back}
          </Link>
          <span className="engrave">
            {copy.tese.heading(hearing.id, hearing.date)}, semente {seed}
          </span>
          <span className="title">{hearing.name}</span>
        </div>
        <div className="ask">
          <span className="engrave">{copy.tese.question}</span>
          <p>{hearing.central_question_plain}</p>
        </div>
      </div>

      <div className="dossier">
        <button type="button" className="arrow" onClick={() => go(at - 1)} disabled={at === 0} aria-label={copy.tese.prev} data-testid="tese-prev">
          <ChevronLeft size={10} />
        </button>

        <article className="sheet swap" key={tese.id} role="tabpanel" id={`tese-panel-${tese.id}`} aria-live="polite" data-testid={`tese-${tese.id}`}>
          <div className="pos">
            <span className="engrave">{copy.tese.which(at + 1, n)}</span>
            <span className="times">{copy.tese.appears(tese.aligned_cards)}</span>
          </div>
          <h2>{tese.title}</h2>
          <p className="statement">{tese.statement_plain}</p>

          <div className="cols">
            <div className="col">
              <span className="label">{copy.tese.defenders}</span>
              <Orgs orgs={tese.defender_orgs} roleOf={roleOfOrg} />
            </div>
            <div className="col">
              <span className="label">{copy.tese.opponents}</span>
              <Orgs orgs={tese.opponent_orgs} roleOf={roleOfOrg} />
            </div>
            {quote && (
              <div className="said">
                <span className="label">{copy.tese.said}</span>
                <blockquote className="sim-scroll">{orig ? quote.text : quote.plain ?? quote.text}</blockquote>
                <span className="by">
                  {copy.tese.saidBy(displayName(hearing, quote.speaker), hearing.cast.find((c) => c.id === quote.speaker)?.byline ?? null)}{' '}
                  <span className="ref">{quote.ref}</span>
                </span>
                {quote.plain && (
                  <button type="button" className="orig-btn" onClick={() => setOrig((v) => !v)} data-testid="tese-original">
                    {orig ? copy.balloon.back : copy.balloon.seeOriginal}
                  </button>
                )}
              </div>
            )}
          </div>

          <footer>
            <p className="rule">{copy.tese.rule}</p>
            <label className="guided on-paper" data-tip={copy.tese.guidedHint}>
              <input type="checkbox" checked={guided} onChange={(e) => setGuided(e.target.checked)} role="switch" aria-checked={guided} data-testid="guided" />
              <span className="sw" aria-hidden="true" />
              {copy.tese.guided}
            </label>
            <button type="button" className="btn primary defend" onClick={() => chooseTese(tese.id, guided)} data-testid={`choose-${tese.id}`}>
              {copy.tese.defend} <Chevron />
            </button>
          </footer>
        </article>

        <button type="button" className="arrow fwd" onClick={() => go(at + 1)} disabled={at === n - 1} aria-label={copy.tese.next} data-testid="tese-next">
          <Chevron size={10} />
        </button>
      </div>

      <div className="strip" role="tablist" aria-label={copy.tese.choose} data-testid="tese-strip">
        {teses.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={i === at}
            aria-controls={`tese-panel-${t.id}`}
            className={i === at ? 'on' : ''}
            onClick={() => go(i)}
            data-testid={`tese-tab-${t.id}`}
          >
            <span className="n">{i + 1}</span>
            <span className="t">{t.title}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/** Uma instituição por linha, com o ponto do papel institucional e o nome escrito: nunca só a cor. */
function Orgs({ orgs, roleOf }: { orgs: string[]; roleOf: Map<string, Role> }) {
  if (!orgs.length) return <ul className="orgs"><li className="none">{copy.tese.nobody}</li></ul>
  return (
    <ul className={`orgs sim-scroll${orgs.length > TIGHT ? ' tight' : ''}`}>
      {orgs.map((o) => {
        const role = roleOf.get(o) ?? 'convidado'
        return (
          <li key={o}>
            <i style={{ background: ROLE_COLOR[role] }} title={ROLE_LABEL[role]} />
            {o}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * A fala da sala que sustenta a ideia: a primeira das `claims_chave` que esteja do lado da tese. Sem trecho
 * citável, a coluna inteira sai (o pacote é explícito: não inventar citação, não deixar a coluna vazia).
 */
function quoteFor(h: HearingSim, cards: Map<string, ReturnType<typeof cardById> extends Map<string, infer C> ? C : never>, tese: Tese): ClaimCard | null {
  for (const id of tese.claims_chave) {
    const c = cards.get(id)
    if (isClaim(c) && align(tese, c) === 'aliada') return c
  }
  for (const c of h.deck) if (isClaim(c) && align(tese, c) === 'aliada') return c
  return null
}
