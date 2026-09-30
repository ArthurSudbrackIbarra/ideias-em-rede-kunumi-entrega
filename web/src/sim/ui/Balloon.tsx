import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { copy } from '../copy'
import { align } from '../engine/judge'
import type { Line } from '../engine/rules'
import { cardById, castById, displayName, ROLE_COLOR, teseById, type HearingSim } from '../lib/hearing'
import { relation as playRelation } from '../lib/sound'
import { anchor } from '../scene/anchor'
import { speedFactor, useSim } from '../store/useSim'
import { glossText, type GlossHandlers } from './glossText'
import { ArrowLeft, ArrowRight, Bookmark, Chevron, ChevronLeft } from './Icons'
import { paginate } from './pages'
import { RelationBadge, RelationIcon } from './RelationBadge'
import { Typewriter } from './Typewriter'

const MARGIN = 24
/** o topo do balão nunca invade o véu do topo */
const TOP_MIN = 120
const PLAYER_TOP = 126
/** a bancada, que o balão nunca cobre */
const RAIL = 116

/**
 * O balão (redesenho): duas partes, a **placa** de tinta com o nome em serifa (como as plaquinhas da mesa na
 * cena) e o **corpo** de papel com a fala. É a peça que costura a camada 2D à sala. A referência mora na placa
 * e fica sempre visível. "ver o que foi dito", Anotar e continuar moram no rodapé do corpo, no mesmo lugar em
 * todos os estados. Ato da mesa e linha de sistema são só a placa, centrada no topo. A fala do jogador ganha
 * o bloco Fonte e o painel de veredito com o antes e depois da convicção.
 */
export function Balloon({ hearing }: { hearing: HearingSim }) {
  const line = useSim((s) => s.run.current)
  const notable = useSim((s) => s.run.notable)
  const noted = useSim((s) => s.run.noted)
  const phase = useSim((s) => s.run.phase)
  const teseId = useSim((s) => s.run.tese)
  const guided = useSim((s) => s.run.guided)
  const originalOpen = useSim((s) => s.run.originalOpen)
  const deskView = useSim((s) => s.deskView)
  const speed = useSim((s) => s.speed)
  const autoplay = useSim((s) => s.autoplay)
  const textMode = useSim((s) => s.textMode)
  const muted = useSim((s) => s.muted)
  const typingDone = useSim((s) => s.typingDone)
  const skipNonce = useSim((s) => s.skipNonce)
  const hurryNonce = useSim((s) => s.hurryNonce)
  const setTypingDone = useSim((s) => s.setTypingDone)
  const note = useSim((s) => s.note)
  const openOriginal = useSim((s) => s.openOriginal)
  const continueManual = useSim((s) => s.continueManual)
  const [origPage, setOrigPage] = useState(0)
  /** o balão do glossário, desenhado fora da fala (que rola e cortaria qualquer filho absoluto) */
  const [tip, setTip] = useState<{ text: string; left: number; top: number; below: boolean } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const tail = useRef<HTMLDivElement>(null)
  const falaEl = useRef<HTMLParagraphElement>(null)
  // última posição aplicada: só move com deslocamento real, para o balanço da câmera não fazer o balão tremer
  const applied = useRef({ left: -1, top: -1 })
  const seen = useRef(new Set<string>())
  const [showOrg, setShowOrg] = useState(false)
  const soundedFor = useRef<number | null>(null)
  const cast = useMemo(() => castById(hearing), [hearing])
  const cards = useMemo(() => cardById(hearing), [hearing])

  const onDone = useCallback(() => setTypingDone(true), [setTypingDone])

  const gloss = useMemo<GlossHandlers>(
    () => ({
      open: (_term, plain, el) => {
        const root = box.current
        if (!root) return
        const a = el.getBoundingClientRect()
        const b = root.getBoundingClientRect()
        // o balão da explicação nunca sai da tela: o centro é preso à janela, e perto do topo ele abre para baixo
        const half = Math.min(320, window.innerWidth * 0.7) / 2
        const center = Math.min(Math.max(a.left + a.width / 2, half + 12), window.innerWidth - half - 12)
        const below = a.top < 150
        setTip({ text: plain, left: center - b.left, top: (below ? a.bottom + 10 : a.top - 10) - b.top, below })
      },
      close: () => setTip(null),
    }),
    [],
  )

  // a explicação some quando a linha muda ou o original abre
  useEffect(() => setTip(null), [line?.id, originalOpen])

  // primeira fala de cada orador: uma linha a mais com o que é a instituição
  useEffect(() => {
    if (!line?.speaker || (line.kind !== 'fala' && line.kind !== 'reaction')) {
      setShowOrg(false)
      return
    }
    const first = !seen.current.has(line.speaker)
    seen.current.add(line.speaker)
    setShowOrg(first)
    setOrigPage(0)
  }, [line?.id, line?.speaker, line?.kind])

  // o som do veredito, uma vez por linha do jogador
  useEffect(() => {
    if (!line || line.kind !== 'player' || !line.verdict || !typingDone || soundedFor.current === line.id) return
    soundedFor.current = line.id
    if (!muted) playRelation(line.verdict.kind)
  }, [line, typingDone, muted])

  // posicionamento: lê a âncora a cada quadro e escreve no estilo; numa fala longa, rola o texto junto da digitação
  useEffect(() => {
    let raf = 0
    const place = (el: HTMLDivElement, left: number, top: number) => {
      const a = applied.current
      // um elemento recém-montado (o balão volta do caderno, ou troca de ato da mesa para fala) ainda não tem posição
      if (!el.style.left || Math.abs(a.left - left) >= 4 || Math.abs(a.top - top) >= 4) {
        a.left = left
        a.top = top
        el.style.left = `${left}px`
        el.style.top = `${top}px`
      }
    }
    const tick = () => {
      const el = box.current
      const ar = tail.current
      if (el) {
        const w = el.offsetWidth
        const h = el.offsetHeight
        const docked = !line || line.kind === 'player' || line.kind === 'system' || line.kind === 'mesa' || !anchor.active
        if (docked) {
          place(el, Math.round((anchor.width - w) / 2), line?.kind === 'player' ? PLAYER_TOP : TOP_MIN)
          el.dataset.dock = line?.kind === 'player' ? 'self' : 'top'
        } else if (anchor.onScreen) {
          const left = Math.round(Math.min(anchor.width - w - MARGIN, Math.max(MARGIN, anchor.x - w * 0.3)))
          const top = Math.round(Math.max(TOP_MIN, anchor.y - h - 34))
          place(el, left, top)
          el.dataset.dock = 'head'
          if (ar) {
            ar.style.left = `${Math.round(Math.min(w - 36, Math.max(14, anchor.x - applied.current.left - 12)))}px`
            ar.style.transform = 'none'
          }
        } else {
          // orador fora do quadro: gruda na borda do lado dele, o rabicho aponta a direção
          const right = Math.cos(anchor.angle) > 0
          const top = Math.round(Math.min(anchor.height - h - 160, Math.max(TOP_MIN, anchor.height * 0.3)))
          place(el, right ? anchor.width - w - MARGIN : MARGIN, top)
          el.dataset.dock = right ? 'right' : 'left'
          if (ar) {
            ar.style.left = right ? `${w - 6}px` : '-18px'
            ar.style.transform = `rotate(${right ? -90 : 90}deg)`
          }
        }
      }
      // a fala nunca cobre a bancada: a altura disponível vai do topo aplicado até 16px acima dela
      if (el) el.style.maxHeight = `${Math.max(240, anchor.height - applied.current.top - RAIL - 16)}px`
      const fala = falaEl.current
      if (fala && fala.scrollHeight > fala.clientHeight + 2) fala.scrollTop = fala.scrollHeight
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [line])

  if (!line || phase === 'tese' || phase === 'prelude' || phase === 'ata' || deskView || line.kind === 'relcard') return null

  const member = line.speaker ? cast.get(line.speaker) : null
  const pageCard = line.page?.card ?? null
  const card = pageCard ? cards.get(pageCard) : null
  const canNote = pageCard !== null && notable.includes(pageCard)
  const already = pageCard !== null && noted.includes(pageCard)
  const tese = teseById(hearing, teseId)
  const side = guided && tese && card ? align(tese, card, hearing) : null
  // modo "original" (2026-09-15): o balão digita o verbatim e a versão simples fica a um clique, no lugar do original
  const verbatim = textMode === 'verbatim' && line.kind !== 'player' && line.plain !== null && line.original !== null
  const typed = verbatim && line.original ? line.original.text : line.text
  const alt = verbatim ? line.plain ?? '' : line.original?.text ?? ''
  const long = typed.length > 180
  const veryLong = typed.length > 320
  const sizeClass = veryLong ? ' verylong' : long ? ' long' : ''
  const kindClass = `sim-balloon kind-${line.kind}${originalOpen ? ' original' : ''}${line.relation ? ` rel-${line.relation.kind}` : ''}`
  const showContinue = !autoplay && typingDone && !originalOpen

  // ato da mesa e linha de sistema: só a placa, centrada no topo
  if (line.kind === 'mesa' || line.kind === 'system') {
    return (
      <div ref={box} className={kindClass} data-testid="balloon" data-original="0" role="status" aria-live="polite">
        <div className="plate solo on-chassis">
          {line.kind === 'mesa' && <span className="engrave">{copy.balloon.mesa}</span>}
          <p className="fala">
            <Typewriter text={line.text} lineId={line.id} speed={speedFactor(speed)} muted={muted} onDone={onDone} skip={skipNonce} hurry={hurryNonce} paused={originalOpen} />
          </p>
          {(line.ref || showContinue) && (
            <div className="bf">
              {line.ref && <span className="ref">{line.ref}</span>}
              <span className="spacer" />
              {showContinue && (
                <button type="button" className="continue" onClick={continueManual} data-testid="continue-balloon">
                  {copy.hud.continue} <Chevron />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const hasOriginalLink = line.kind === 'player' ? line.sources.length > 0 : line.original !== null && line.plain !== null
  const origPages = line.original ? paginate(alt) : []
  const altLabel = verbatim ? copy.balloon.plainLabel : copy.balloon.originalLabel
  const safeOrig = Math.min(origPage, Math.max(0, origPages.length - 1))
  const hasGloss = line.kind === 'fala' || line.kind === 'reaction'
  const noteLabel = already ? copy.balloon.noted : line.page?.kind === 'pergunta' ? copy.balloon.noteQuestion : copy.balloon.note
  const plateRef = line.kind === 'player' ? line.sources[0]?.ref ?? null : line.ref

  return (
    <div ref={box} className={`${kindClass}${sizeClass}`} data-testid="balloon" data-original={originalOpen ? '1' : '0'} role="status" aria-live="polite">
      <header className="plate on-chassis">
        {line.kind === 'player' ? (
          <>
            <i className="dot" style={{ background: ROLE_COLOR.convidado }} />
            <span className="name">{copy.balloon.you}</span>
          </>
        ) : member ? (
          <>
            <i className="dot" style={{ background: ROLE_COLOR[member.role] }} />
            <span className="name">{displayName(hearing, member.id)}</span>
            {(member.byline ?? member.cargo) && <span className="byline">{member.byline ?? member.cargo}</span>}
          </>
        ) : (
          <span className="name">{copy.balloon.room}</span>
        )}
        {line.retomada && <span className="side">{copy.balloon.retomada}</span>}
        {side && side !== 'consenso' && card && (
          <span className={`side s-${side}`}>
            {copy.floor.sideLabel[card.position]}
            {copy.floor.alignSuffix[side] ?? ''}
          </span>
        )}
        <span className="spacer" />
        {line.kind === 'player' && line.relation && <RelationBadge tag={line.relation} hearing={hearing} variant="plate" />}
        {originalOpen && line.kind !== 'player' ? <span className="tag">{altLabel}</span> : plateRef && <span className="ref">{plateRef}</span>}
      </header>

      <div className="body">
        {showOrg && member?.org_plain && !originalOpen && <div className="orgplain">{member.org_plain}</div>}
        {line.kind === 'reaction' && line.relation && <RelationBadge tag={line.relation} hearing={hearing} variant="body" />}

        <p ref={falaEl} className={`fala sim-scroll${sizeClass}`} hidden={originalOpen}>
          <Typewriter
            text={typed}
            lineId={`${line.id}:${verbatim ? 'v' : 'p'}`}
            speed={speedFactor(speed)}
            muted={muted}
            onDone={onDone}
            skip={skipNonce}
            hurry={hurryNonce}
            paused={originalOpen}
            render={hasGloss ? (t) => glossText(t, hearing.glossario, gloss) : undefined}
          />
        </p>

        {originalOpen && line.kind !== 'player' && line.original && (
          <div className="orig" data-testid="original">
            <p className={`fala sim-scroll${origPages[safeOrig].length > 180 ? ' long' : ''}`} onClick={() => setOrigPage((p) => (p + 1) % Math.max(1, origPages.length))}>
              {origPages[safeOrig]}
            </p>
            {origPages.length > 1 && (
              <div className="pages" aria-label={copy.balloon.pages(safeOrig + 1, origPages.length)}>
                {origPages.map((_, i) => <i key={i} className={i === safeOrig ? 'on' : i < safeOrig ? 'past' : ''} />)}
                <span className="n">{copy.balloon.pages(safeOrig + 1, origPages.length)}</span>
              </div>
            )}
          </div>
        )}
        {originalOpen && line.kind === 'player' && (
          <div className="orig sim-scroll" data-testid="original">
            {line.sources.map((s) => (
              <blockquote key={s.card}>
                <span className="who">{displayName(hearing, s.speaker)}</span>
                <span className="text">{s.text}</span>
                <span className="ref">{s.ref}</span>
              </blockquote>
            ))}
          </div>
        )}

        {line.kind === 'player' && line.sources.length > 0 && !originalOpen && (
          <div className="fonte">
            <span className="label">{copy.balloon.source}</span>
            {line.sources.map((s) => (
              <span key={s.card} className="src">
                <b>{displayName(hearing, s.speaker)}:</b> {s.gist} <span className="ref">{s.ref}</span>
              </span>
            ))}
          </div>
        )}

        {line.kind === 'player' && line.verdict && typingDone && !originalOpen && <VerdictPanel line={line} />}
        {line.applause > 0 && typingDone && <div className="applause">{copy.balloon.palmas(line.applause)}</div>}

        <footer className="bf">
          {originalOpen ? (
            <span className="orig-label">
              {line.kind === 'player' ? copy.balloon.originalLabel : altLabel}
              {line.kind !== 'player' && line.ref ? `, ${line.ref}` : ''}
            </span>
          ) : (
            hasOriginalLink && (
              <button type="button" className="link" onClick={() => openOriginal()} data-testid="original-btn">
                {verbatim ? copy.balloon.seePlain : copy.balloon.seeOriginal} <kbd>O</kbd>
              </button>
            )
          )}
          {canNote && card && (
            <button
              type="button"
              className={`note-btn${already ? ' done' : ''}`}
              data-testid="note-btn"
              disabled={already}
              onClick={() => note(card.id)}
              style={member ? { color: ROLE_COLOR[member.role] } : undefined}
            >
              <Bookmark filled={already} />
              {noteLabel}
              {!already && <kbd>N</kbd>}
            </button>
          )}
          <span className="spacer" />
          {originalOpen && (
            <button type="button" className="continue back" onClick={() => openOriginal(false)} data-testid="original-back">
              <ChevronLeft /> {copy.balloon.back}
            </button>
          )}
          {showContinue && (
            <button type="button" className="continue" onClick={continueManual} data-testid="continue-balloon">
              {copy.hud.continue} <Chevron />
            </button>
          )}
        </footer>
      </div>
      <div ref={tail} className="tail" />
      {tip && (
        <div className={`gl-tip${tip.below ? ' below' : ''}`} style={{ left: tip.left, top: tip.top }} role="tooltip">
          {tip.text}
        </div>
      )}
    </div>
  )
}

const BAD = new Set(['contradicao', 'par_invalido', 'repetida', 'ja_respondida'])

/**
 * O veredito no pé do balão da cadeira vaga: ícone e palavra, o antes e depois da convicção (número antigo
 * apagado, flecha, número novo, a variação numa etiqueta) e a barra em que o trecho ganho ou perdido aparece
 * encostado ao que já havia. É o único lugar do jogo em que um número aparece duas vezes, de propósito.
 */
function VerdictPanel({ line }: { line: Line }) {
  const v = line.verdict!
  const m = line.meter
  const icon = v.kind === 'coerente' || v.kind === 'certeiro' ? 'apoia' : BAD.has(v.kind) ? 'contradiz' : 'consenso'
  const before = m ? Math.round(m.before) : null
  const after = m ? Math.round(m.after) : null
  const lo = before !== null && after !== null ? Math.min(before, after) : 0
  const span = before !== null && after !== null ? Math.abs(after - before) : 0
  return (
    <div className={`verdict v-${v.kind}`} role="status" aria-live="polite" data-testid="verdict">
      <div className="top">
        <span className="kind">
          <RelationIcon kind={icon} /> {copy.verdict.short(v.kind)}
        </span>
        {before !== null && after !== null && (
          <span className="change">
            <span className="m">{copy.verdict.meter}</span>
            <span className="nums">
              <span className="old">{before}</span>
              {v.delta < 0 ? <ArrowLeft /> : <ArrowRight />}
              <span>{after}</span>
            </span>
            <span className="badge">{v.delta > 0 ? `+${v.delta}` : v.delta < 0 ? `−${Math.abs(v.delta)}` : '0'}</span>
          </span>
        )}
      </div>
      {before !== null && after !== null && (
        <div className="bar" aria-hidden="true">
          <i className="base" style={{ width: `${lo}%` }} />
          <i className="step" style={{ left: `${lo}%`, width: `${span}%` }} />
        </div>
      )}
      {v.explanation && <p className="why">{v.explanation}</p>}
    </div>
  )
}
