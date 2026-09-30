/**
 * Sons do simulador (spec §19.10): máquina de escrever e palmas reais, dos mp3 em assets/audio, decodificados
 * uma vez e tocados pelo WebAudio; as marcas de relação continuam sintetizadas e discretas. Tudo passa por um
 * ganho mestre, que `M` zera. O contexto só nasce depois de um gesto do usuário (o clique em Sentar).
 */
import applauseUrl from '../assets/audio/applause.mp3'
import typewriterUrl from '../assets/audio/typewriter.mp3'
import { APPLAUSE_GAIN, TYPEWRITER_GAIN } from '../engine/balance'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false
const buffers: Partial<Record<'typewriter' | 'applause', AudioBuffer>> = {}
const loading: Partial<Record<'typewriter' | 'applause', Promise<AudioBuffer | null>>> = {}
let typewriter: { src: AudioBufferSourceNode; gain: GainNode } | null = null
let wantTypewriter = false

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext()
      master = ctx.createGain()
      master.gain.value = muted ? 0 : 1
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

async function load(name: 'typewriter' | 'applause', url: string): Promise<AudioBuffer | null> {
  const c = ac()
  if (!c) return null
  if (buffers[name]) return buffers[name]!
  if (!loading[name]) {
    loading[name] = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => c.decodeAudioData(b))
      .then((buf) => {
        buffers[name] = buf
        return buf
      })
      .catch(() => null)
  }
  return loading[name]!
}

/** Chamar num gesto do usuário: cria o contexto e começa a decodificar os dois mp3. */
export function unlock(): void {
  if (!ac()) return
  void load('typewriter', typewriterUrl)
  void load('applause', applauseUrl)
}

export function setMuted(m: boolean): void {
  muted = m
  if (master) master.gain.value = m ? 0 : 1
}

export function isMuted(): boolean {
  return muted
}

/** Loop da máquina de escrever enquanto há caracteres aparecendo. Idempotente. */
export function typewriterStart(): void {
  wantTypewriter = true
  const c = ac()
  if (!c || !master || typewriter) return
  void load('typewriter', typewriterUrl).then((buf) => {
    if (!buf || !wantTypewriter || typewriter || !c || !master) return
    const src = c.createBufferSource()
    src.buffer = buf
    src.loop = true
    const gain = c.createGain()
    gain.gain.value = TYPEWRITER_GAIN
    src.connect(gain).connect(master)
    src.start()
    typewriter = { src, gain }
  })
}

/** Para com um fade de 60 ms. */
export function typewriterStop(): void {
  wantTypewriter = false
  const c = ctx
  if (!typewriter || !c) return
  const { src, gain } = typewriter
  typewriter = null
  const t = c.currentTime
  gain.gain.setValueAtTime(gain.gain.value, t)
  gain.gain.linearRampToValueAtTime(0.0001, t + 0.06)
  try {
    src.stop(t + 0.08)
  } catch {
    /* já parado */
  }
}

/** Palmas reais: uma vez por fala aplaudida, nunca por movimento do jogador. */
export function applause(): void {
  const c = ac()
  if (!c || !master) return
  void load('applause', applauseUrl).then((buf) => {
    if (!buf || !c || !master) return
    const src = c.createBufferSource()
    src.buffer = buf
    const gain = c.createGain()
    gain.gain.value = APPLAUSE_GAIN
    src.connect(gain).connect(master)
    src.start()
  })
}

function tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', when = 0) {
  const c = ac()
  if (!c || !master) return
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0, c.currentTime + when)
  g.gain.linearRampToValueAtTime(gain, c.currentTime + when + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + when + dur)
  o.connect(g).connect(master)
  o.start(c.currentTime + when)
  o.stop(c.currentTime + when + dur + 0.02)
}

/** Marcas sonoras das relações e dos vereditos, curtas e discretas (spec §10). */
export function relation(kind: string): void {
  switch (kind) {
    case 'apoia':
    case 'defende':
    case 'concorda':
      tone(523, 0.25, 0.08)
      tone(659, 0.3, 0.08, 'sine', 0.08)
      break
    case 'responde':
    case 'cobra':
      tone(440, 0.18, 0.08)
      tone(440, 0.18, 0.08, 'sine', 0.22)
      break
    case 'contradiz':
    case 'contradicao':
      tone(110, 0.35, 0.14, 'triangle')
      break
    case 'consenso':
    case 'coerente':
    case 'certeiro':
      tone(523, 0.5, 0.07)
      tone(659, 0.5, 0.07, 'sine', 0.05)
      tone(784, 0.6, 0.07, 'sine', 0.1)
      break
    default:
      break
  }
}
