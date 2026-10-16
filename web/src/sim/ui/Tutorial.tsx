import { Fragment, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { copy, type TutorialKey, type TutorialKeys } from '../copy'
import { announce } from '../lib/announce'
import { actionLabel, type KeyAction } from '../lib/keys'
import { useSettings } from '../store/useSettings'
import { useTutorial } from '../store/useTutorial'
import { Dialog } from './Dialog'
import { Chevron, ChevronLeft } from './Icons'

/**
 * O tutorial "Como jogar": um diálogo com um passo por vez (imagem tirada do próprio jogo, título e um parágrafo
 * curto), e o convite da primeira visita. Os passos são dados, em `copy.tutorial.steps`, agrupados em capítulos que vão
 * do que é o jogo e para que serve até o que fazer em cada momento da sala. Cada tela que oferece o tutorial monta o
 * seu, como o painel Acessibilidade. As setas para os lados trocam de passo, Esc fecha, e nenhum atalho da sala vale
 * com ele aberto. Na sala, a sessão fica parada enquanto ele está aberto.
 */

const STEPS = copy.tutorial.steps
const FIXED = new Map<string, string>(copy.legend.fixedKeys)

const src = (file: string) => `${import.meta.env.BASE_URL}tutorial/${file}`

/** O texto do passo com o destaque, que vem marcado entre asteriscos duplos. */
function rich(text: string): ReactNode {
  return text.split(/\*\*(.+?)\*\*/).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>))
}

const plain = (text: string) => text.replace(/\*\*/g, '')

interface KeyItem {
  id: string
  labels: string[]
  what: string
}

/** As teclas de cada item, lidas do mapa atual. Sem atalhos de uma tecla, sobram só as fixas. */
function useKeyItems(items: TutorialKeys[] | undefined): KeyItem[] {
  const on = useSettings((s) => s.shortcuts)
  const keys = useSettings((s) => s.keys)
  return (items ?? []).flatMap(({ k, what }) => {
    const labels = k.flatMap((x: TutorialKey) => (FIXED.has(x) ? [x] : on ? actionLabel(x as KeyAction, keys).split(' ') : []))
    if (!labels.length) return []
    return [{ id: k.join('-'), labels: [...new Set(labels)], what: what ?? FIXED.get(k[0]) ?? copy.keys[k[0]] }]
  })
}

function Keys({ labels }: { labels: string[] }) {
  return (
    <>
      {labels.map((l) => (
        <kbd key={l}>{l}</kbd>
      ))}
    </>
  )
}

interface Props {
  /** mostra o convite na primeira visita */
  ask?: boolean
  /** o rótulo do botão do último passo: Começar, ou Voltar à sessão dentro da sala */
  startLabel?: string
  /** o que Começar faz além de fechar (no início, ir para o acervo) */
  onStart?: () => void
}

export function Tutorial({ ask = false, startLabel = copy.tutorial.start, onStart }: Props) {
  const open = useTutorial((s) => s.open)
  const answer = useTutorial((s) => s.answer)
  if (open) return <TutorialDialog startLabel={startLabel} onStart={onStart} />
  if (ask && answer === null) return <TutorialAsk />
  return null
}

/** O botão que abre o tutorial, nas telas e na ajuda da sala. */
export function TutorialButton({ className = 'a11y-btn', label = copy.tutorial.open, testId = 'open-tutorial' }: { className?: string; label?: string; testId?: string }) {
  return (
    <button type="button" className={className} onClick={() => useTutorial.getState().show()} data-testid={testId}>
      {label}
    </button>
  )
}

function TutorialAsk() {
  const t = useTutorial.getState()
  return (
    <>
      <div className="sim-backdrop tut-backdrop" aria-hidden="true" />
      <Dialog labelledBy="tut-ask-title" describedBy="tut-ask-text" onEscape={() => t.dismiss()} quiet initialFocus="first" className="sim-tut-ask" testId="tutorial-ask">
        <h2 id="tut-ask-title">{copy.tutorial.ask.title}</h2>
        <p id="tut-ask-text">{copy.tutorial.ask.text}</p>
        <div className="actions">
          <button type="button" className="tut-main" onClick={() => t.show(0)} data-testid="tutorial-yes">
            {copy.tutorial.ask.yes}
          </button>
          <button type="button" className="ctl" onClick={() => t.dismiss()} data-testid="tutorial-no">
            {copy.tutorial.ask.no}
          </button>
        </div>
      </Dialog>
    </>
  )
}

function TutorialDialog({ startLabel, onStart }: { startLabel: string; onStart?: () => void }) {
  const step = useTutorial((s) => s.step)
  const n = STEPS.length
  const i = Math.min(Math.max(0, step), n - 1)
  const s = STEPS[i]
  const last = i === n - 1
  const items = useKeyItems(s.keys)
  const prevBtn = useRef<HTMLButtonElement>(null)
  const nextBtn = useRef<HTMLButtonElement>(null)
  const shown = useRef(i)

  const go = (to: number) => useTutorial.getState().go(Math.min(n - 1, Math.max(0, to)))
  const close = () => useTutorial.getState().close()
  const finish = () => {
    useTutorial.getState().close(true)
    onStart?.()
  }

  // ao abrir, o leitor de tela lê o nome e a descrição do diálogo; depois, cada troca de passo é anunciada
  useEffect(() => {
    if (shown.current === i) return
    shown.current = i
    announce(copy.tutorial.announce(i + 1, n, s.part, s.title, plain(s.text)))
    // no primeiro passo Voltar fica desligado, e o foco não pode ficar num botão que não responde
    if (i === 0 && document.activeElement === prevBtn.current) nextBtn.current?.focus()
  }, [i, n, s])

  // a imagem do passo seguinte (e a do anterior) já vem carregada quando a pessoa avança
  useEffect(() => {
    for (const j of [i + 1, i - 1]) {
      const file = STEPS[j]?.image
      if (file) new Image().src = src(file)
    }
  }, [i])

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (e.key === 'ArrowRight' && !last) go(i + 1)
    else if (e.key === 'ArrowLeft') go(i - 1)
    else return
    e.preventDefault()
  }

  return (
    <>
      <div className="sim-backdrop tut-backdrop" onClick={close} aria-hidden="true" />
      <Dialog
        labelledBy="tut-title"
        describedBy="tut-text"
        onEscape={close}
        quiet
        initialFocus="[data-tutorial-next]"
        onKeyDown={onKeyDown}
        className="sim-tutorial"
        testId="tutorial"
      >
        <div className="tut-head">
          <span className="engrave" data-testid="tutorial-part">
            {s.part}
          </span>
          <span className="tut-count" data-testid="tutorial-progress">
            {copy.tutorial.progress(i + 1, n)}
          </span>
          <button type="button" className="close" onClick={close} data-testid="tutorial-close">
            {copy.tutorial.close} <kbd>Esc</kbd>
          </button>
        </div>

        {s.image ? (
          <div className="tut-media">
            <img key={s.id} src={src(s.image)} alt={s.alt} width={1280} height={800} decoding="async" data-testid="tutorial-image" />
          </div>
        ) : (
          <KeyTable />
        )}

        <div className="tut-body" key={s.id} data-testid={`tutorial-step-${s.id}`}>
          <h2 id="tut-title">{s.title}</h2>
          <p id="tut-text">{rich(s.text)}</p>
          {items.length > 0 && (
            <ul className="tut-keys" aria-label={copy.tutorial.keys}>
              {items.map((k) => (
                <li key={k.id}>
                  <Keys labels={k.labels} /> {k.what}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="tut-foot">
          <span className="dots" aria-hidden="true">
            {STEPS.map((x, j) => (
              <i key={x.id} className={`${j === i ? 'on' : j < i ? 'past' : ''}${j > 0 && STEPS[j - 1].part !== x.part ? ' part' : ''}`} />
            ))}
          </span>
          <button ref={prevBtn} type="button" className="ctl" onClick={() => go(i - 1)} disabled={i === 0} data-testid="tutorial-prev">
            <ChevronLeft /> {copy.tutorial.prev}
          </button>
          <button ref={nextBtn} type="button" className="tut-main" onClick={last ? finish : () => go(i + 1)} data-tutorial-next data-testid="tutorial-next">
            {last ? startLabel : copy.tutorial.next} <Chevron />
          </button>
        </div>
      </Dialog>
    </>
  )
}

/** O último passo: as teclas da sala no lugar da imagem, com as teclas trocadas no painel Acessibilidade. */
function KeyTable() {
  const on = useSettings((s) => s.shortcuts)
  const items = useKeyItems(copy.tutorial.table)
  return (
    <div className="tut-media tut-table dark-scroll" tabIndex={0} role="region" aria-label={copy.tutorial.tableLabel} data-testid="tutorial-keys">
      <dl className="rows">
        {items.map((k) => (
          <div className="row" key={k.id}>
            <dt className="k">
              <Keys labels={k.labels} />
            </dt>
            <dd className="d">{k.what}</dd>
          </div>
        ))}
      </dl>
      {!on && <p className="d note">{copy.legend.keysOff}</p>}
    </div>
  )
}
