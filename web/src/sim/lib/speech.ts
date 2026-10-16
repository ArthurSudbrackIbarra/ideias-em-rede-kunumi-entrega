/**
 * Leitura em voz alta pela Web Speech API do navegador, com uma voz em português. Lê o texto exatamente como está na
 * tela e não reescreve nada. Sem voz em português (comum em navegadores de Linux), a opção fica indisponível em vez
 * de ler com sotaque de outra língua.
 */

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
}

let cached: SpeechSynthesisVoice | null | undefined

/** A melhor voz disponível: português do Brasil primeiro, depois qualquer português. */
export function ptVoice(): SpeechSynthesisVoice | null {
  const s = synth()
  if (!s) return null
  if (cached) return cached
  const voices = s.getVoices()
  const v = voices.find((x) => x.lang.toLowerCase() === 'pt-br') ?? voices.find((x) => x.lang.toLowerCase().startsWith('pt')) ?? null
  if (voices.length) cached = v
  return v
}

/** As vozes chegam depois de a página abrir em alguns navegadores: avisa quando a lista mudar. */
export function onVoices(cb: () => void): () => void {
  const s = synth()
  if (!s) return () => undefined
  const handler = () => {
    cached = undefined
    cb()
  }
  s.addEventListener('voiceschanged', handler)
  return () => s.removeEventListener('voiceschanged', handler)
}

/** A velocidade do jogo (0,25× a 2×) vira uma fala de 0,85 a 1,65 vez a normal. */
export function rateFor(speed: number): number {
  return Math.min(1.7, Math.max(0.7, 0.75 + 0.45 * speed))
}

let current: SpeechSynthesisUtterance | null = null

/** Lê um texto e chama `onEnd` quando acabar, for interrompido ou falhar. Interrompe o que estava sendo lido. */
export function speak(text: string, rate: number, onEnd: () => void): boolean {
  const s = synth()
  const voice = ptVoice()
  if (!s || !voice || !text.trim()) return false
  stopSpeaking()
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = voice.lang
  u.rate = rate
  let done = false
  const finish = () => {
    if (done) return
    done = true
    if (current === u) current = null
    onEnd()
  }
  u.onend = finish
  u.onerror = finish
  current = u
  s.speak(u)
  return true
}

export function stopSpeaking() {
  const s = synth()
  if (!s) return
  current = null
  s.cancel()
}

/** Segura a leitura no meio da frase e solta de onde parou (o tutorial aberto por cima da sala). */
export function holdSpeaking(hold: boolean) {
  const s = synth()
  if (!s) return
  if (hold) s.pause()
  else s.resume()
}
