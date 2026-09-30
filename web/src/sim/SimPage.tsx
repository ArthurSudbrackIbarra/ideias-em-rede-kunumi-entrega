import './sim.css'
import { useEffect, useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { copy } from './copy'
import { MESA_CARD_MS, READ_PAUSE_MAX_MS, READ_PAUSE_MS, READ_PAUSE_PER_CHAR_MS, RELATION_CARD_MS, VERDICT_CHIP_LONG_MS, VERDICT_CHIP_MS } from './engine/balance'
import { applause as playApplause } from './lib/sound'
import { SimScene } from './scene/SimScene'
import { speedFactor, useSim } from './store/useSim'
import { Ata } from './ui/Ata'
import { Balloon } from './ui/Balloon'
import { Desk } from './ui/Desk'
import { FloorPanel } from './ui/FloorPanel'
import { GlossaryPanel } from './ui/Glossary'
import { Prelude } from './ui/Prelude'
import { Progress } from './ui/Progress'
import { Rail } from './ui/Rail'
import { RelationCard } from './ui/RelationCard'
import { Safe } from './ui/Safe'
import { SimLegend } from './ui/SimLegend'
import { TeseSelect } from './ui/TeseSelect'

// exposto para o teste Playwright e para depuração no console
window.simStore = useSim

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Diretor: quando a linha atual acabou de ser lida, espera a pausa de leitura e avança. No modo manual não faz
 * nada: a pessoa avança com Espaço, Enter ou "continuar". Com o original aberto, tudo para.
 */
function useDirector() {
  const current = useSim((s) => s.run.current)
  const phase = useSim((s) => s.run.phase)
  const originalOpen = useSim((s) => s.run.originalOpen)
  const typingDone = useSim((s) => s.typingDone)
  const speed = useSim((s) => s.speed)
  const autoplay = useSim((s) => s.autoplay)
  const textMode = useSim((s) => s.textMode)
  const advance = useSim((s) => s.advance)

  useEffect(() => {
    if (!current || !autoplay || originalOpen) return
    if (phase === 'floor' || phase === 'ata' || phase === 'tese' || phase === 'prelude') return
    const card = current.kind === 'relcard'
    if (!card && !typingDone) return
    const f = speedFactor(speed)
    // a pausa de leitura acompanha o que foi digitado: o original, no modo verbatim
    const shown = textMode === 'verbatim' && current.kind !== 'player' && current.plain !== null && current.original ? current.original.text : current.text
    const len = shown.length
    let ms: number
    if (current.kind === 'mesa') ms = MESA_CARD_MS
    else if (current.kind === 'system') ms = 1400
    else if (card) ms = RELATION_CARD_MS
    else if (current.kind === 'player') {
      const chip = current.verdict ? (current.verdict.kind === 'contradicao' || current.verdict.kind === 'par_invalido' ? VERDICT_CHIP_LONG_MS : VERDICT_CHIP_MS) : 0
      ms = READ_PAUSE_MS + Math.min(READ_PAUSE_MAX_MS, len * READ_PAUSE_PER_CHAR_MS) + chip
    } else ms = READ_PAUSE_MS + Math.min(READ_PAUSE_MAX_MS, len * READ_PAUSE_PER_CHAR_MS) + (current.applause > 0 ? 1600 : 0)
    const t = setTimeout(advance, ms / f)
    return () => clearTimeout(t)
  }, [current, phase, originalOpen, typingDone, speed, autoplay, textMode, advance])
}

/** Palmas reais: só quando a transcrição registra palmas na fala, uma vez, ao terminar a última página. */
function useApplause() {
  const current = useSim((s) => s.run.current)
  const typingDone = useSim((s) => s.typingDone)
  const muted = useSim((s) => s.muted)
  const played = useRef<number | null>(null)
  useEffect(() => {
    if (!current || current.applause <= 0 || !typingDone || played.current === current.id) return
    played.current = current.id
    if (!muted) playApplause()
  }, [current, typingDone, muted])
}

/** Relógio da sessão: atenção, paciência da mesa. 4 vezes por segundo. */
function useClock() {
  const dispatch = useSim((s) => s.dispatch)
  useEffect(() => {
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      if (document.hidden) return
      dispatch({ t: 'tick', dt, looking: useSim.getState().lookingAtSpeaker || useSim.getState().deskView })
    }, 250)
    return () => clearInterval(id)
  }, [dispatch])
}

/** O véu sobre a cena: a vez de falar, os painéis de consulta e o texto original escurecem a sala, nunca a interface. */
function Scrim() {
  const phase = useSim((s) => s.run.phase)
  const originalOpen = useSim((s) => s.run.originalOpen)
  const legend = useSim((s) => s.legend)
  const glossary = useSim((s) => s.glossary)
  if (phase === 'tese' || phase === 'prelude' || phase === 'ata') return null
  const kind = phase === 'floor' ? 'floor' : legend || glossary ? 'panel' : originalOpen ? 'original' : ''
  return <div className={`sim-scrim${kind ? ` ${kind}` : ''}`} aria-hidden="true" />
}

export function SimPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const hearingId = Number(id)
  const status = useSim((s) => s.status)
  const error = useSim((s) => s.error)
  const hearing = useSim((s) => s.hearing)
  const load = useSim((s) => s.load)
  const sceneReady = useSim((s) => s.sceneReady)
  const phase = useSim((s) => s.run.phase)
  const deskView = useSim((s) => s.deskView)

  useEffect(() => {
    if (Number.isInteger(hearingId) && hearingId > 0) void load(hearingId, params.get('seed') ?? undefined)
  }, [hearingId, load, params])

  useEffect(() => {
    document.body.classList.add('sim-body')
    return () => document.body.classList.remove('sim-body')
  }, [])

  useEffect(() => {
    document.body.dataset.simReady = sceneReady ? '1' : '0'
  }, [sceneReady])

  useDirector()
  useApplause()
  useClock()

  // teclas (spec §13)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      const s = useSim.getState()
      const k = e.key
      const ph = s.run.phase
      if (ph === 'tese' || ph === 'prelude' || ph === 'ata') return
      if (k === 'Tab') {
        e.preventDefault()
        s.requestDesk()
        return
      }
      const lower = k.toLowerCase()
      if (lower === 'q' || lower === 'e') s.requestLook()
      else if (lower === 'n') {
        const card = s.run.current?.page?.card
        if (card && s.run.notable.includes(card)) s.note(card)
      } else if (lower === 'o') s.openOriginal()
      else if (lower === 'a') s.interject()
      else if (lower === 't') s.treplica()
      else if (lower === 'p') s.toggleAutoplay()
      else if (lower === 'v') s.toggleTextMode()
      else if (lower === 'l' || lower === 'h') s.toggleLegend()
      else if (lower === 'g') s.toggleGlossary()
      else if (lower === 'm') s.toggleMute()
      else if (k === '+' || k === '=') s.setSpeed(1)
      else if (k === '-' || k === '_') s.setSpeed(-1)
      else if (k === '1' && ph === 'floor') s.setMove('sustento')
      else if (k === '2' && ph === 'floor') s.setMove('contesto')
      else if (k === '3' && ph === 'floor') s.setMove('cobro')
      else if (lower === 'c' && ph === 'floor') s.clearCite()
      else if (k === 'Enter') {
        if (ph === 'floor') s.speak()
        else if (!s.autoplay && s.typingDone) s.continueManual()
        else s.hurryTyping()
      } else if (k === ' ') {
        e.preventDefault()
        if (!s.autoplay) s.continueManual()
      } else if (k === 'Escape') {
        // fecha, nesta ordem: original → caderno → legenda/ajuda → glossário; sem nada aberto, completa a página
        if (s.run.originalOpen) s.openOriginal(false)
        else if (s.deskView) s.requestDesk(false)
        else if (s.legend) s.toggleLegend()
        else if (s.glossary) s.toggleGlossary()
        else s.skipTyping()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (status === 'error') {
    return (
      <main className="sim-error">
        <p>{copy.error.title(hearingId)} {error}</p>
        <p>
          {copy.error.hint} <Link to="/audiencias">{copy.error.back}</Link>
        </p>
      </main>
    )
  }
  if (!hearing) return <main className="sim-error"><p>{copy.error.preparing}</p></main>

  return (
    <div className="sim" data-phase={phase} data-desk={deskView ? '1' : '0'}>
      <div className="sim-canvas">
        <SimScene />
      </div>
      <Safe name="véu"><Scrim /></Safe>
      <Safe name="topo"><Progress hearing={hearing} /></Safe>
      <Safe name="balão"><Balloon hearing={hearing} /></Safe>
      <Safe name="relação"><RelationCard hearing={hearing} /></Safe>
      <Safe name="bancada"><Rail /></Safe>
      <Safe name="mesa"><Desk hearing={hearing} /></Safe>
      <Safe name="palavra"><FloorPanel hearing={hearing} /></Safe>
      <Safe name="legenda"><SimLegend /></Safe>
      <Safe name="glossário"><GlossaryPanel terms={hearing.glossario} /></Safe>
      <Safe name="prelúdio"><Prelude hearing={hearing} /></Safe>
      <Safe name="tese"><TeseSelect hearing={hearing} /></Safe>
      <Safe name="ata"><Ata hearing={hearing} /></Safe>
    </div>
  )
}

export default SimPage
