import './sim.css'
import { useEffect, useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { copy } from './copy'
import { MESA_CARD_MS, READ_PAUSE_MAX_MS, READ_PAUSE_MS, READ_PAUSE_PER_CHAR_MS, RELATION_CARD_MS, SPEEDS, VERDICT_CHIP_LONG_MS, VERDICT_CHIP_MS } from './engine/balance'
import { announce, clearAnnouncements } from './lib/announce'
import { actionFor, actionLabel, isCharacterKey, type KeyAction } from './lib/keys'
import type { HearingSim } from './lib/hearing'
import { applause as playApplause } from './lib/sound'
import { holdSpeaking, rateFor, speak as speakAloud, stopSpeaking } from './lib/speech'
import { closeTips } from './lib/tips'
import { typingMs } from './lib/typing'
import { useTitle } from './lib/useTitle'
import { SimScene } from './scene/SimScene'
import { reducedMotion, useSettings } from './store/useSettings'
import { speedFactor, useSim } from './store/useSim'
import { useTutorial } from './store/useTutorial'
import { Ata } from './ui/Ata'
import { Balloon } from './ui/Balloon'
import { announcementOf, voiceOf } from './ui/describe'
import { Desk } from './ui/Desk'
import { focusIfIdle, topDialog } from './lib/dialogs'
import { FloorPanel } from './ui/FloorPanel'
import { GlossaryPanel } from './ui/Glossary'
import { HistoryPanel } from './ui/History'
import { Prelude } from './ui/Prelude'
import { Progress } from './ui/Progress'
import { Rail } from './ui/Rail'
import { RelationCard } from './ui/RelationCard'
import { Safe } from './ui/Safe'
import { SettingsPanel } from './ui/SettingsPanel'
import { SimLegend } from './ui/SimLegend'
import { TeseSelect } from './ui/TeseSelect'
import { Tutorial } from './ui/Tutorial'

// exposto para o teste Playwright e para depuração no console
window.simStore = useSim

/** Atalhos de ajuste, que não mexem no que está atrás de um diálogo: valem com qualquer painel aberto. */
const GLOBAL_KEYS: KeyAction[] = ['autoplay', 'textMode', 'faster', 'slower', 'mute']

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
}

/** Enter e Espaço num botão, link ou carta acionam o próprio elemento, nunca o atalho da sala. */
function isActivatable(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('button, a[href], summary, [role="button"], [role="option"], [role="tab"], [role="switch"]')
}

/** As setas rolam o que rola e mexem no que é delas; só no resto da tela elas viram a câmera. */
function ownsArrows(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest('[role="listbox"], [role="tablist"], [role="radiogroup"], select, input, textarea')) return true
  for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
    const o = getComputedStyle(el).overflowY
    if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight) return true
  }
  return false
}

/** A sala está parada para a pessoa ler outra coisa: um painel de consulta, o caderno, os ajustes ou o tutorial. */
function roomPaused(): boolean {
  const s = useSim.getState()
  return s.panel !== null || s.deskView || useSettings.getState().open || useTutorial.getState().open
}

/**
 * Diretor: quando a linha atual acabou de ser lida (e, com a leitura em voz alta, ouvida), espera a pausa de leitura e
 * avança. No modo manual não faz nada: a pessoa avança com Espaço, Enter ou "continuar". Com o original aberto, um
 * painel de consulta, o caderno, os ajustes ou o tutorial por cima da sala, tudo para (WCAG 2.2.2).
 */
function useDirector() {
  const current = useSim((s) => s.run.current)
  const phase = useSim((s) => s.run.phase)
  const originalOpen = useSim((s) => s.run.originalOpen)
  const typingDone = useSim((s) => s.typingDone)
  const voiceDone = useSim((s) => s.voiceDone)
  const speed = useSim((s) => s.speed)
  const autoplay = useSim((s) => s.autoplay)
  const textMode = useSim((s) => s.textMode)
  const panel = useSim((s) => s.panel)
  const deskView = useSim((s) => s.deskView)
  const settingsOpen = useSettings((s) => s.open)
  const tutorialOpen = useTutorial((s) => s.open)
  const advance = useSim((s) => s.advance)

  useEffect(() => {
    if (!current || !autoplay || originalOpen || panel || deskView || settingsOpen || tutorialOpen) return
    if (phase === 'floor' || phase === 'ata' || phase === 'tese' || phase === 'prelude') return
    const card = current.kind === 'relcard'
    if (!card && !typingDone) return
    if (!voiceDone) return
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
    if (!card && reducedMotion()) ms += typingMs(shown)
    const t = setTimeout(advance, ms / f)
    return () => clearTimeout(t)
  }, [current, phase, originalOpen, typingDone, voiceDone, speed, autoplay, textMode, panel, deskView, settingsOpen, tutorialOpen, advance])
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

/**
 * Relógio da sessão: atenção, paciência da mesa. 4 vezes por segundo. O prazo da tréplica fica parado com o ajuste
 * "sem limite de tempo" e enquanto a sala está parada para leitura.
 */
function useClock() {
  const dispatch = useSim((s) => s.dispatch)
  useEffect(() => {
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      if (document.hidden) return
      const s = useSim.getState()
      dispatch({ t: 'tick', dt, looking: s.lookingAtSpeaker || s.deskView, holdOffers: useSettings.getState().noTimeLimits || roomPaused() })
    }, 250)
    return () => clearInterval(id)
  }, [dispatch])
}

/**
 * O que o leitor de tela ouve da sala: cada linha uma vez, inteira, quando entra (o balão digita letra por letra, mas
 * a região viva recebe o texto pronto), os avisos, o original quando abre e a tréplica, que tem prazo e por isso é a
 * única mensagem assertiva.
 */
function useAnnouncements() {
  const hearing = useSim((s) => s.hearing)
  const current = useSim((s) => s.run.current)
  const notice = useSim((s) => s.run.notice)
  const originalOpen = useSim((s) => s.run.originalOpen)
  const offer = useSim((s) => s.run.treplicaOffer)
  const attentionLow = useSim((s) => s.run.attention < 40 && s.run.phase !== 'tese' && s.run.phase !== 'prelude' && s.run.phase !== 'ata')
  const said = useRef<number | null>(null)

  useEffect(() => clearAnnouncements, [])

  useEffect(() => {
    if (!hearing || !current || said.current === current.id) return
    said.current = current.id
    announce(announcementOf(hearing, current, useSim.getState().textMode))
  }, [hearing, current])

  useEffect(() => {
    if (notice) announce(notice.text)
  }, [notice])

  useEffect(() => {
    if (attentionLow) announce(copy.hud.attentionLow)
  }, [attentionLow])

  useEffect(() => {
    if (!originalOpen || !current) return
    if (current.kind === 'player') announce(current.sources.map((s) => copy.sr.original(s.ref, s.text)).join(' '))
    else if (current.original) {
      const verbatim = useSim.getState().textMode === 'verbatim' && current.plain !== null
      announce(verbatim ? copy.sr.plain(current.plain ?? '') : copy.sr.original(current.ref, current.original.text))
    }
  }, [originalOpen, current])

  const offerKey = offer ? `${offer.target}:${offer.card}` : null
  useEffect(() => {
    if (!offerKey) return
    const s = useSettings.getState()
    announce(copy.sr.treplica(s.shortcuts ? actionLabel('treplica', s.keys) : null), 'assertive')
  }, [offerKey])
}

/**
 * Leitura em voz alta (ajuste opcional): cada linha é lida quando entra, e o diretor espera a voz acabar antes de
 * avançar. Para quando o original abre, quando o som é desligado e ao sair da sala, e espera o tutorial fechar.
 */
function useReadAloud() {
  const hearing = useSim((s) => s.hearing)
  const current = useSim((s) => s.run.current)
  const originalOpen = useSim((s) => s.run.originalOpen)
  const muted = useSim((s) => s.muted)
  const enabled = useSettings((s) => s.readAloud)
  const tutorialOpen = useTutorial((s) => s.open)

  useEffect(() => {
    const st = useSim.getState()
    if (!enabled || muted || !hearing || !current || originalOpen) {
      stopSpeaking()
      st.setVoiceDone(true)
      return
    }
    st.setVoiceDone(false)
    const started = speakAloud(voiceOf(hearing, current, st.textMode), rateFor(SPEEDS[st.speed]), () => {
      if (useSim.getState().run.current?.id === current.id) useSim.getState().setVoiceDone(true)
    })
    if (!started) st.setVoiceDone(true)
  }, [enabled, muted, hearing, current, originalOpen])

  useEffect(() => {
    if (!enabled) return
    holdSpeaking(tutorialOpen)
  }, [enabled, tutorialOpen])

  useEffect(() => stopSpeaking, [])
}

/** Ajuste "virar sozinho para quem fala": a câmera acompanha cada nova fala. */
function useAutoLook() {
  const current = useSim((s) => s.run.current)
  const auto = useSettings((s) => s.autoLook)
  const speaker = current && (current.kind === 'fala' || current.kind === 'reaction' || current.kind === 'mesa') ? current.speaker : null
  useEffect(() => {
    if (auto && speaker) useSim.getState().requestLook()
  }, [auto, speaker, current?.id])
}

/** O título da aba acompanha a fase; ao entrar na sala, o foco vai para o título dela. */
function useRoomTitleAndFocus(id: number) {
  const phase = useSim((s) => s.run.phase)
  const ready = useSim((s) => s.status === 'ready')
  const title = !ready ? null : phase === 'tese' ? copy.titles.tese(id) : phase === 'prelude' ? copy.titles.prelude(id) : phase === 'floor' ? copy.titles.floor(id) : phase === 'ata' ? copy.titles.ata(id) : copy.titles.room(id)
  useTitle(title)
  const prev = useRef(phase)
  useEffect(() => {
    const was = prev.current
    prev.current = phase
    if (was === 'prelude' && phase !== 'prelude') requestAnimationFrame(() => focusIfIdle(document.getElementById('room-title')))
  }, [phase])
}

function runAction(action: KeyAction) {
  const s = useSim.getState()
  const ph = s.run.phase
  switch (action) {
    case 'look':
      return s.requestLook()
    case 'desk':
      return s.requestDesk()
    case 'note': {
      const card = s.run.current?.page?.card
      if (card && s.run.notable.includes(card)) s.note(card)
      return
    }
    case 'original':
      return s.openOriginal()
    case 'interject':
      return s.interject()
    case 'treplica':
      return s.treplica()
    case 'autoplay':
      return s.toggleAutoplay()
    case 'textMode':
      return s.toggleTextMode()
    case 'faster':
      return s.setSpeed(1)
    case 'slower':
      return s.setSpeed(-1)
    case 'mute':
      return s.toggleMute()
    case 'help':
      return s.togglePanel('help')
    case 'glossary':
      return s.togglePanel('glossary')
    case 'history':
      return s.togglePanel('history')
    case 'sustento':
    case 'contesto':
    case 'cobro':
      if (ph === 'floor') s.setMove(action)
      return
    case 'clearCite':
      if (ph === 'floor') s.clearCite()
      return
  }
}

/** O véu sobre a cena: a vez de falar, os painéis de consulta e o texto original escurecem a sala, nunca a interface. */
function Scrim() {
  const phase = useSim((s) => s.run.phase)
  const originalOpen = useSim((s) => s.run.originalOpen)
  const panel = useSim((s) => s.panel)
  if (phase === 'tese' || phase === 'prelude' || phase === 'ata') return null
  const kind = phase === 'floor' ? 'floor' : panel ? 'panel' : originalOpen ? 'original' : ''
  return <div className={`sim-scrim${kind ? ` ${kind}` : ''}`} aria-hidden="true" />
}

/** A descrição da sala 3D para quem não a vê; o canvas em si fica fora da árvore de acessibilidade. */
function roomDescription(h: HearingSim): string {
  const debaters = h.cast.filter((m) => m.seat === 'debatedores').length
  const bancada = h.cast.filter((m) => m.seat === 'bancada').length
  const remote = h.cast.filter((m) => m.seat === 'remoto').length
  return copy.sr.room(debaters, bancada, h.audience.estimate, remote)
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
  useAnnouncements()
  useReadAloud()
  useAutoLook()
  useRoomTitleAndFocus(hearingId)

  // teclas (spec §13): Tab é do foco; os atalhos de uma tecla podem ser trocados ou desligados no painel Acessibilidade
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || isTyping(e.target)) return
      const s = useSim.getState()
      const ph = s.run.phase
      if (ph === 'tese' || ph === 'prelude' || ph === 'ata') return
      const top = topDialog()
      const k = e.key
      if (k === 'Escape') {
        if (closeTips()) return
        if (s.run.originalOpen) s.openOriginal(false)
        else if (s.deskView) s.requestDesk(false)
        else s.skipTyping()
        return
      }
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        if (top || ownsArrows(e.target)) return
        e.preventDefault()
        s.turn(k === 'ArrowLeft' ? -1 : 1)
        return
      }
      if (k === 'Enter' || k === ' ') {
        if (isActivatable(e.target)) return
        if (top && (ph !== 'floor' || top.quiet)) return
        e.preventDefault()
        if (k === 'Enter') {
          // passa pelo botão Falar, que pede confirmação quando o ajuste está ligado
          if (ph === 'floor') document.querySelector<HTMLButtonElement>('[data-speak]:not(:disabled)')?.click()
          else if (!s.autoplay && s.typingDone) s.continueManual()
          else s.hurryTyping()
        } else if (!s.autoplay) s.stepManual()
        return
      }
      const settings = useSettings.getState()
      if (!settings.shortcuts || !isCharacterKey(k)) return
      const action = actionFor(k, settings.keys)
      if (!action) return
      if (top && !top.keys.includes(action) && (top.quiet || !GLOBAL_KEYS.includes(action))) return
      e.preventDefault()
      runAction(action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (status === 'error') {
    return (
      <main className="sim-error" id="conteudo" tabIndex={-1}>
        <p>{copy.error.title(hearingId)} {error}</p>
        <p>
          {copy.error.hint} <Link to="/audiencias">{copy.error.back}</Link>
        </p>
      </main>
    )
  }
  if (!hearing) return <main className="sim-error" id="conteudo" tabIndex={-1}><p role="status">{copy.error.preparing}</p></main>

  return (
    <main className="sim" id="conteudo" tabIndex={-1} data-phase={phase} data-desk={deskView ? '1' : '0'}>
      <div className="sim-canvas" role="img" aria-label={roomDescription(hearing)}>
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
      <Safe name="histórico"><HistoryPanel hearing={hearing} /></Safe>
      <Safe name="prelúdio"><Prelude hearing={hearing} /></Safe>
      <Safe name="tese"><TeseSelect hearing={hearing} /></Safe>
      <Safe name="ata"><Ata hearing={hearing} /></Safe>
      <Safe name="acessibilidade"><SettingsPanel /></Safe>
      {/* o convite da primeira visita só aparece no dossiê, antes de a sessão começar a tocar */}
      <Safe name="tutorial"><Tutorial ask={phase === 'tese'} startLabel={phase === 'tese' ? copy.tutorial.start : copy.tutorial.resume} /></Safe>
    </main>
  )
}

export default SimPage
