import { copy } from '../copy'
import { LOW_CONVICTION, MOVES_PER_INTERJECT } from '../engine/balance'
import { canCite, type MoveKind } from '../engine/judge'
import { sayMove } from '../engine/say'
import { cardById, displayName, teseById, type Card as CardT, type HearingSim } from '../lib/hearing'
import { useSim } from '../store/useSim'
import { Card } from './Card'
import { Check, Cross } from './Icons'

const MOVES: MoveKind[] = ['sustento', 'contesto', 'cobro']
const KEY: Record<MoveKind, string> = { sustento: '1', contesto: '2', cobro: '3' }

type StepState = 'now' | 'done' | 'future'

/**
 * A vez de falar (redesenho): uma folha de papel que sobe do rodapé e encosta na bancada, com a trilha dos
 * três passos no topo. O passo cumprido mostra **o que foi escolhido** (Contestar, Rodrigo Agostinho), não o
 * nome do passo, e é um botão: clicar nele volta àquele passo sem perder o resto (pedido do autor, 2026-09-15).
 * O terceiro se anuncia condicional ("a citação, se contestar"). `Falar` indisponível vem sempre com a frase que
 * explica o que falta, à direita no rodapé. A ordem continua livre: clicar numa anotação antes do movimento
 * também funciona, e cada anotação mostra o tema a que pertence.
 */
export function FloorPanel({ hearing }: { hearing: HearingSim }) {
  const run = useSim((s) => s.run)
  const selection = useSim((s) => s.selection)
  const select = useSim((s) => s.select)
  const setMove = useSim((s) => s.setMove)
  const clearMove = useSim((s) => s.clearMove)
  const clearCite = useSim((s) => s.clearCite)
  const speak = useSim((s) => s.speak)
  const yieldFloor = useSim((s) => s.yieldFloor)
  if (run.phase !== 'floor') return null
  const cards = cardById(hearing)
  const tese = teseById(hearing, run.tese)
  const kind = selection.kind
  const chosen = selection.card ? cards.get(selection.card) : null
  const cite = selection.cite ? cards.get(selection.cite) : null
  const interject = run.floorKind === 'interject'
  const total = interject ? MOVES_PER_INTERJECT : run.conviction < LOW_CONVICTION ? 1 : hearing.player.moves_per_floor
  const made = Math.max(0, total - run.movesLeft)
  const ready = !!chosen && !!kind && (kind === 'cobro' ? chosen.kind === 'pergunta' : chosen.kind === 'claim')
  const preview = ready ? sayMove(hearing, kind, chosen, kind === 'contesto' && cite?.kind === 'claim' ? cite : null, run.rng)[0] : null
  const hand = run.hand.map((id) => cards.get(id)).filter((c): c is CardT => !!c)
  const wanted = kind === 'cobro' ? 'pergunta' : kind ? 'claim' : null
  const citing = kind === 'contesto' && chosen?.kind === 'claim'
  // a citação: cartas do mesmo tema, ou de outro tema que o grafo liga à contestada (2026-09-15)
  const candidates = citing
    ? hand.filter((c) => c.kind === 'claim' && canCite(chosen, c))
    : hand.filter((c) => !wanted || c.kind === wanted)

  // a trilha é uma leitura da seleção: o movimento, a anotação e, só ao contestar, a citação
  const s1: StepState = kind ? 'done' : 'now'
  const s2: StepState = kind && chosen && ready ? 'done' : kind ? 'now' : 'future'
  const s3: StepState = citing ? 'now' : 'future'
  const steps: { n: number; state: StepState; label: string; back?: () => void }[] = [
    { n: 1, state: s1, label: kind ? copy.floor[kind] : copy.floor.steps.move, back: kind ? clearMove : undefined },
    {
      n: 2,
      state: s2,
      label: s2 === 'done' && chosen ? displayName(hearing, chosen.speaker) : copy.floor.steps.pick,
      back: chosen ? () => select(chosen.id) : undefined,
    },
    { n: 3, state: s3, label: kind === 'contesto' ? copy.floor.steps.cite : copy.floor.steps.citeIf, back: cite ? clearCite : undefined },
  ]

  // o que o rodapé explica, à direita
  const why = run.hand.length === 0 ? null : !kind ? copy.floor.unlockMove : !chosen ? copy.floor.unlockPick : citing && !cite ? copy.floor.canCite : cite ? null : copy.floor.ready

  return (
    <section className={`sim-floor${interject ? ' interject' : ''}`} data-testid="floor" aria-label={copy.floor.title}>
      <header>
        <div className="titles">
          <h2>{interject ? copy.floor.interject : copy.floor.title}</h2>
          <span className="counter">{copy.floor.counter(Math.min(total, made + 1), total)}</span>
        </div>
        {tese && (
          <div className="defend">
            <span className="label">{copy.desk.youDefend}</span>
            <b>{tese.title}</b>
          </div>
        )}
      </header>

      <ol className="trail" data-testid="trail">
        {steps.map((st) =>
          st.back ? (
            <li key={st.n} className={st.state} data-step={st.n}>
              <button type="button" onClick={st.back} title={copy.floor.backToStep(st.label)} data-testid={`step-${st.n}`}>
                <span className="mark">{st.state === 'done' ? <Check /> : st.n}</span>
                <span>{st.label}</span>
              </button>
            </li>
          ) : (
            <li key={st.n} className={st.state} data-step={st.n}>
              <span>
                <span className="mark">{st.state === 'done' ? <Check /> : st.n}</span>
                <span>{st.label}</span>
              </span>
            </li>
          ),
        )}
      </ol>

      <div className="body sim-scroll">
        {run.hand.length === 0 ? (
          <p className="empty">{copy.floor.empty}</p>
        ) : !kind ? (
          /* passo 1: o movimento, e o caderno inteiro embaixo */
          <>
            <span className="q">{copy.floor.step1}</span>
            <div className="moves" data-testid="moves">
              {MOVES.map((m) => (
                <button key={m} type="button" className={kind === m ? 'on' : ''} onClick={() => setMove(m)} data-testid={`move-${m}`}>
                  <kbd>{KEY[m]}</kbd>
                  <span>
                    <span className="t">{copy.floor[m]}</span>
                    <small>{copy.floor.moveHint[m]}</small>
                  </span>
                </button>
              ))}
            </div>
            <p className="hint">{chosen ? copy.floor.pickMove : copy.floor.pickAny}</p>
            {chosen && (
              <div className="split" data-testid="slots">
                <div className="field">
                  <span className="label">{copy.floor.chosenNoMove}</span>
                  <Card card={chosen} hearing={hearing} selected slot />
                  <button type="button" className="remove" onClick={() => select(chosen.id)}>
                    <Cross /> {copy.floor.remove}
                  </button>
                </div>
              </div>
            )}
            <div className="hand">
              {hand.map((c) => (
                <Card key={c.id} card={c} hearing={hearing} selected={selection.card === c.id} onClick={() => select(c.id)} />
              ))}
            </div>
          </>
        ) : !chosen ? (
          /* passo 2: a anotação, com o caderno filtrado para o que serve */
          <>
            <span className="q">{copy.floor.pickFor[kind]}</span>
            {candidates.length === 0 ? (
              <p className="hint">{copy.floor.noneFor[kind]}</p>
            ) : (
              <div className="hand">
                {candidates.map((c) => (
                  <Card key={c.id} card={c} hearing={hearing} onClick={() => select(c.id)} />
                ))}
              </div>
            )}
          </>
        ) : citing ? (
          /* passo 3: a citação, opcional, e a prévia da frase exata */
          <>
            <div className="fields" data-testid="slots">
              <div className="field">
                <span className="label">{copy.floor.chosen[kind]}</span>
                <Card card={chosen} hearing={hearing} selected slot />
                <button type="button" className="remove" onClick={() => select(chosen.id)}>
                  <Cross /> {copy.floor.remove}
                </button>
              </div>
              <div className="field cite">
                <span className="label">{copy.floor.cited}</span>
                {cite ? (
                  <>
                    <Card card={cite} hearing={hearing} cited slot />
                    <button type="button" className="remove" onClick={clearCite} data-testid="clear-cite">
                      <Cross /> {copy.floor.remove}
                    </button>
                  </>
                ) : candidates.length === 0 ? (
                  <p className="hint">{copy.floor.citeNone}</p>
                ) : (
                  <>
                    <p className="hint">{copy.floor.citeHint}</p>
                    <div className="cands hand two">
                      {candidates.map((c) => (
                        <Card key={c.id} card={c} hearing={hearing} onClick={() => select(c.id)} cross={c.theme !== chosen.theme} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            {preview && (
              <div className="preview" data-testid="preview">
                <span className="label">{copy.floor.preview}</span>
                <p>{preview}</p>
              </div>
            )}
            {cite && <p className="hint">{copy.floor.citeRole(displayName(hearing, cite.speaker))}</p>}
          </>
        ) : (
          /* sustentar ou cobrar com a anotação escolhida: o campo e a prévia */
          <>
            <div className="split" data-testid="slots">
              <div className="field">
                <span className="label">{ready ? copy.floor.chosen[kind] : copy.floor.chosenNoMove}</span>
                <Card card={chosen} hearing={hearing} selected slot />
                <button type="button" className="remove" onClick={() => select(chosen.id)}>
                  <Cross /> {copy.floor.remove}
                </button>
              </div>
              <div className="rest">
                {preview ? (
                  <div className="preview" data-testid="preview">
                    <span className="label">{copy.floor.preview}</span>
                    <p>{preview}</p>
                  </div>
                ) : (
                  <p className="hint">{copy.floor.pickFor[kind]}</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <footer>
        <button type="button" className="btn primary" onClick={speak} disabled={!preview} data-testid="speak">
          {copy.floor.speak}
        </button>
        <button type="button" className="btn secondary" onClick={yieldFloor} data-testid="yield">
          {copy.floor.yield}
        </button>
        {cite ? (
          <button type="button" className="why" onClick={clearCite} data-testid="clear-cite-footer">
            <Cross /> {copy.floor.removeCite} <kbd>C</kbd>
          </button>
        ) : (
          why && <span className="why">{why}</span>
        )}
      </footer>
    </section>
  )
}
