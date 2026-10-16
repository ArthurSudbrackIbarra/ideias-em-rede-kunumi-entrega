import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { copy } from '../copy'
import { align } from '../engine/judge'
import type { Line } from '../engine/rules'
import { cardById, castById, displayName, ROLE_COLOR, teseById, type HearingSim } from '../lib/hearing'
import { continuedByKeyboard, continueRef } from '../lib/focusContinue'
import { relation as playRelation } from '../lib/sound'
import { tipOpened } from '../lib/tips'
import { anchor, hud } from '../scene/anchor'
import { useSettings } from '../store/useSettings'
import { speedFactor, useSim } from '../store/useSim'
import { useTutorial } from '../store/useTutorial'
import { glossText, type GlossHandlers } from './glossText'
import { ArrowLeft, ArrowRight, Bookmark, Chevron, ChevronLeft } from './Icons'
import { Key } from './Key'
import { paginate } from './pages'
import { RelationBadge, RelationIcon } from './RelationBadge'
import { RoleDot } from './RoleDot'
import { Typewriter } from './Typewriter'

const MARGIN = 24

/**
 * O balão (redesenho): duas partes, a **placa** de tinta com o nome em serifa (como as plaquinhas da mesa na
 * cena) e o **corpo** de papel com a fala. É a peça que costura a camada 2D à sala. A referência mora na placa
 * e fica sempre visível. "ver o que foi dito", Anotar e continuar moram no rodapé do corpo, no mesmo lugar em
 * todos os estados. Ato da mesa e linha de sistema são só a placa, centrada no topo. A fala do jogador ganha
 * o bloco Fonte e o painel de veredito com o antes e depois da convicção. O balão não é região viva: o leitor de tela
 * recebe cada fala inteira pela camada de anúncios da sala, e no balão o texto que ainda digita fica escondido dele.
 * No modo manual o continuar fica sempre no rodapé: enquanto a página digita, ele a completa.
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
  const stepManual = useSim((s) => s.stepManual)
  const panel = useSim((s) => s.panel)
  const settingsOpen = useSettings((s) => s.open)
  const tutorialOpen = useTutorial((s) => s.open)
  const [origPage, setOrigPage] = useState(0)
  /** o balão do glossário, desenhado fora da fala (que rola e cortaria qualquer filho absoluto) */
  const [tip, setTip] = useState<{ term: string; text: string; left: number; top: number; below: boolean } | null>(null)
  const tipTimer = useRef(0)
  const openTerm = useRef<string | null>(null)
  openTerm.current = tip?.term ?? null
  const linkBtn = useRef<HTMLButtonElement>(null)
  const backBtn = useRef<HTMLButtonElement>(null)
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

  const gloss = useMemo<GlossHandlers>(() => {
    const open = (term: string, plain: string, el: HTMLElement) => {
      window.clearTimeout(tipTimer.current)
      const root = box.current
      if (!root) return
      const a = el.getBoundingClientRect()
      const b = root.getBoundingClientRect()
      // o balão da explicação nunca sai da tela: o centro é preso à janela, e perto do topo ele abre para baixo
      const half = Math.min(320, window.innerWidth * 0.7) / 2
      const center = Math.min(Math.max(a.left + a.width / 2, half + 12), window.innerWidth - half - 12)
      const below = a.top < 150
      setTip({ term, text: plain, left: center - b.left, top: (below ? a.bottom + 10 : a.top - 10) - b.top, below })
    }
    return {
      open,
      close: () => {
        window.clearTimeout(tipTimer.current)
        tipTimer.current = window.setTimeout(() => setTip(null), 150)
      },
      toggle: (term, plain, el) => {
        if (openTerm.current === term) setTip(null)
        else open(term, plain, el)
      },
    }
  }, [])

  // a explicação some quando a linha muda ou o original abre; aberta, o Esc a fecha antes de qualquer outra coisa
  useEffect(() => setTip(null), [line?.id, originalOpen])
  useEffect(() => (tip ? tipOpened(() => setTip(null)) : undefined), [tip])
  useEffect(() => () => window.clearTimeout(tipTimer.current), [])

  // abrir ou fechar o original troca o botão de lugar: o foco vai junto, se tinha caído no vazio
  useEffect(() => {
    if (document.activeElement && document.activeElement !== document.body) return
    ;(originalOpen ? backBtn.current : linkBtn.current)?.focus({ preventScroll: true })
  }, [originalOpen])

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
        // no arranjo estreito o balão não persegue a cabeça de ninguém: fica no alto, na largura da tela
        const narrow = document.documentElement.dataset.layout === 'narrow'
        const docked = narrow || !line || line.kind === 'player' || line.kind === 'system' || line.kind === 'mesa' || !anchor.active
        const topMin = hud.top + 8
        if (docked) {
          place(el, Math.round((anchor.width - w) / 2), line?.kind === 'player' ? hud.top + 14 : topMin)
          el.dataset.dock = line?.kind === 'player' ? 'self' : 'top'
        } else if (anchor.onScreen) {
          const left = Math.round(Math.min(anchor.width - w - MARGIN, Math.max(MARGIN, anchor.x - w * 0.3)))
          const top = Math.round(Math.max(topMin, anchor.y - h - 34))
          place(el, left, top)
          el.dataset.dock = 'head'
          if (ar) {
            ar.style.left = `${Math.round(Math.min(w - 36, Math.max(14, anchor.x - applied.current.left - 12)))}px`
            ar.style.transform = 'none'
          }
        } else {
          // orador fora do quadro: gruda na borda do lado dele, o rabicho aponta a direção
          const right = Math.cos(anchor.angle) > 0
          const top = Math.round(Math.max(topMin, Math.min(anchor.height - h - hud.rail - 44, anchor.height * 0.3)))
          place(el, right ? anchor.width - w - MARGIN : MARGIN, top)
          el.dataset.dock = right ? 'right' : 'left'
          if (ar) {
            ar.style.left = right ? `${w - 6}px` : '-18px'
            ar.style.transform = `rotate(${right ? -90 : 90}deg)`
          }
        }
      }
      // a fala nunca cobre a bancada: a altura disponível vai do topo aplicado até 16px acima dela
      if (el) el.style.maxHeight = `${Math.max(240, anchor.height - applied.current.top - hud.rail - 16)}px`
      const fala = falaEl.current
      if (fala) {
        // a fala que não cabe rola, e então o teclado também precisa conseguir rolar
        const overflow = fala.scrollHeight > fala.clientHeight + 2
        if (overflow && !useSim.getState().typingDone) fala.scrollTop = fala.scrollHeight
        fala.tabIndex = overflow ? 0 : -1
      }
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
  const kindClass = `sim-balloon kind-${line.kind}${originalOpen ? ' original' : ''}${line.relation ? ` rel-${line.relation.kind}` : ''}`
  const showContinue = !autoplay && !originalOpen
  const paused = originalOpen || panel !== null || settingsOpen || tutorialOpen
  const onContinue = (e: { detail: number }) => {
    continuedByKeyboard(e)
    stepManual()
  }
  const continueBtn = showContinue && (
    <button type="button" className={`continue${typingDone ? '' : ' typing'}`} onClick={onContinue} ref={continueRef} data-continue data-testid="continue-balloon">
      {copy.hud.continue} <Chevron />
    </button>
  )

  // ato da mesa e linha de sistema: só a placa, centrada no topo
  if (line.kind === 'mesa' || line.kind === 'system') {
    return (
      <div ref={box} className={kindClass} data-testid="balloon" data-original="0">
        <div className="plate solo on-chassis">
          {line.kind === 'mesa' && <span className="engrave">{copy.balloon.mesa}</span>}
          <p className="fala">
            <Typewriter text={line.text} lineId={line.id} speed={speedFactor(speed)} muted={muted} onDone={onDone} skip={skipNonce} hurry={hurryNonce} paused={paused} />
          </p>
          {(line.ref || showContinue) && (
            <div className="bf">
              {line.ref && <span className="ref">{line.ref}</span>}
              <span className="spacer" />
              {continueBtn}
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
    <div ref={box} className={kindClass} data-testid="balloon" data-original={originalOpen ? '1' : '0'}>
      <header className="plate on-chassis">
        {line.kind === 'player' ? (
          <>
            <RoleDot role="convidado" />
            <span className="name">{copy.balloon.you}</span>
          </>
        ) : member ? (
          <>
            <RoleDot role={member.role} label />
            <span className="name" data-clip>{displayName(hearing, member.id)}</span>
            {(member.byline ?? member.cargo) && <span className="byline" data-clip>{member.byline ?? member.cargo}</span>}
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

        <p ref={falaEl} className="fala sim-scroll" hidden={originalOpen}>
          <Typewriter
            text={typed}
            lineId={`${line.id}:${verbatim ? 'v' : 'p'}`}
            speed={speedFactor(speed)}
            muted={muted}
            onDone={onDone}
            skip={skipNonce}
            hurry={hurryNonce}
            paused={paused}
            render={hasGloss ? (t) => glossText(t, hearing.glossario, gloss) : undefined}
          />
        </p>

        {originalOpen && line.kind !== 'player' && line.original && (
          <div className="orig" data-testid="original">
            <p className="fala sim-scroll" onClick={() => setOrigPage((p) => (p + 1) % Math.max(1, origPages.length))}>
              {origPages[safeOrig]}
            </p>
            {origPages.length > 1 && (
              <div className="pages">
                {origPages.map((_, i) => <i key={i} className={i === safeOrig ? 'on' : i < safeOrig ? 'past' : ''} aria-hidden="true" />)}
                <span className="n">{copy.balloon.pages(safeOrig + 1, origPages.length)}</span>
                <button type="button" className="link" onClick={() => setOrigPage((p) => (p + 1) % origPages.length)} data-testid="original-next">
                  {safeOrig + 1 < origPages.length ? copy.balloon.nextPage : copy.balloon.firstPage}
                </button>
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
              <button type="button" className="link" ref={linkBtn} onClick={() => openOriginal()} data-testid="original-btn">
                {verbatim ? copy.balloon.seePlain : copy.balloon.seeOriginal} <Key action="original" />
              </button>
            )
          )}
          {canNote && card && (
            <button type="button" className={`note-btn${already ? ' done' : ''}`} data-testid="note-btn" disabled={already} onClick={() => note(card.id)}>
              <span className="mark" style={member ? { color: ROLE_COLOR[member.role] } : undefined}>
                <Bookmark filled={already} />
              </span>
              {noteLabel}
              {!already && <Key action="note" />}
            </button>
          )}
          <span className="spacer" />
          {originalOpen && (
            <button type="button" className="continue back" ref={backBtn} onClick={() => openOriginal(false)} data-testid="original-back">
              <ChevronLeft /> {copy.balloon.back}
            </button>
          )}
          {continueBtn}
        </footer>
      </div>
      <div ref={tail} className="tail" />
      {tip && (
        <div
          className={`gl-tip${tip.below ? ' below' : ''}`}
          style={{ left: tip.left, top: tip.top }}
          role="tooltip"
          onMouseEnter={() => window.clearTimeout(tipTimer.current)}
          onMouseLeave={gloss.close}
        >
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
    <div className={`verdict v-${v.kind}`} data-testid="verdict">
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
