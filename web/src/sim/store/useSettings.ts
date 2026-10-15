import { create } from 'zustand'
import { remap, type KeyAction, type KeyOverrides } from '../lib/keys'

/**
 * Os ajustes de acessibilidade, lembrados neste navegador. Valem na hora, sem recarregar: `applySettings` escreve
 * no `<html>` os atributos e variáveis que o CSS lê, e cada parte do jogo que depende de um ajuste lê esta store.
 * O ritmo da partida (automático ou manual, velocidade, texto do balão) continua na store da sala, que já os lembra.
 */

export type ReadFont = 'libron' | 'lexend'

export interface Volumes {
  master: number
  typewriter: number
  applause: number
  cues: number
}

export interface Settings {
  /** 1 a 2: multiplica o tamanho de todo texto do jogo */
  textScale: number
  readFont: ReadFont
  /** 1, 1.2 ou 1.4: multiplica a entrelinha dos textos de leitura */
  lineSpacing: number
  highContrast: boolean
  /** null segue a preferência do sistema */
  reduceMotion: boolean | null
  /** vinheta da cena e tremor da contradição */
  effects: boolean
  /** a tréplica espera a pessoa, sem os 6 segundos */
  noTimeLimits: boolean
  /** a câmera vira sozinha para quem começa a falar */
  autoLook: boolean
  readAloud: boolean
  confirmSpeak: boolean
  volumes: Volumes
  shortcuts: boolean
  keys: KeyOverrides
  vlibras: boolean
}

export const TEXT_SCALES = [1, 1.25, 1.5, 1.75, 2] as const
export const LINE_SPACINGS = [1, 1.2, 1.4] as const

export const DEFAULT_SETTINGS: Settings = {
  textScale: 1,
  readFont: 'libron',
  lineSpacing: 1,
  highContrast: false,
  reduceMotion: null,
  effects: true,
  noTimeLimits: false,
  autoLook: false,
  readAloud: false,
  confirmSpeak: false,
  volumes: { master: 1, typewriter: 1, applause: 1, cues: 1 },
  shortcuts: true,
  keys: {},
  vlibras: false,
}

const KEY = 'sim.a11y.v1'

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    const v = JSON.parse(raw) as Partial<Settings>
    return { ...DEFAULT_SETTINGS, ...v, volumes: { ...DEFAULT_SETTINGS.volumes, ...v.volumes }, keys: { ...v.keys } }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function write(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

function systemReduced(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

interface SettingsState extends Settings {
  /** o painel está aberto (não é lembrado) */
  open: boolean
  setOpen: (v: boolean) => void
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  setVolume: (channel: keyof Volumes, value: number) => void
  remapKey: (action: KeyAction, key: string) => void
  resetKeys: () => void
  reset: () => void
}

function persist(get: () => SettingsState) {
  const s = get()
  write({
    textScale: s.textScale, readFont: s.readFont, lineSpacing: s.lineSpacing, highContrast: s.highContrast, reduceMotion: s.reduceMotion,
    effects: s.effects, noTimeLimits: s.noTimeLimits, autoLook: s.autoLook, readAloud: s.readAloud, confirmSpeak: s.confirmSpeak,
    volumes: s.volumes, shortcuts: s.shortcuts, keys: s.keys, vlibras: s.vlibras,
  })
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...read(),
  open: false,
  setOpen(v) {
    if (get().open !== v) set({ open: v })
  },
  set(key, value) {
    set({ [key]: value } as Partial<SettingsState>)
    persist(get)
  },
  setVolume(channel, value) {
    set({ volumes: { ...get().volumes, [channel]: Math.min(1, Math.max(0, value)) } })
    persist(get)
  },
  remapKey(action, key) {
    set({ keys: remap(get().keys, action, key) })
    persist(get)
  },
  resetKeys() {
    set({ keys: {} })
    persist(get)
  },
  reset() {
    set({ ...DEFAULT_SETTINGS })
    persist(get)
  },
}))

/** O movimento reduzido de fato: o ajuste do jogo, ou a preferência do sistema quando ele não foi mexido. */
export function reducedMotion(s: Pick<Settings, 'reduceMotion'> = useSettings.getState()): boolean {
  return s.reduceMotion ?? systemReduced()
}

/**
 * Abaixo desta largura, contada em texto de tamanho normal, as telas passam ao arranjo estreito. Com o texto em 200%,
 * uma janela de 1440 px vale 720: é por isso que a conta divide pela escala do texto, e não usa só media query.
 */
const NARROW = 760

/** Escreve no `<html>` o que o CSS precisa saber. */
export function applySettings(s: Settings = useSettings.getState()) {
  const root = document.documentElement
  root.dataset.layout = window.innerWidth / s.textScale < NARROW ? 'narrow' : 'wide'
  root.style.fontSize = s.textScale === 1 ? '' : `${s.textScale * 100}%`
  root.style.setProperty('--lh', String(s.lineSpacing))
  root.dataset.contrast = s.highContrast ? 'high' : 'normal'
  root.dataset.motion = reducedMotion(s) ? 'reduced' : 'full'
  root.dataset.effects = s.effects ? 'on' : 'off'
  root.dataset.readFont = s.readFont
  root.dataset.keys = s.shortcuts ? 'on' : 'off'
}

if (typeof window !== 'undefined') {
  applySettings()
  useSettings.subscribe((s) => applySettings(s))
  window.addEventListener('resize', () => applySettings())
  try {
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => applySettings())
  } catch {
    /* navegador antigo: fica a preferência lida na abertura */
  }
}
