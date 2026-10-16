import { COMMA_PAUSE_MS, SENTENCE_PAUSE_MS, TYPE_CPS } from '../engine/balance'

/** a digitação para um pouco depois destes sinais: mais no fim da frase, menos na vírgula */
export const SENTENCE_END = new Set(['.', '?', '!', '…', ':'])
export const CLAUSE_END = new Set([',', ';'])

/**
 * Quanto a digitação deste texto leva na velocidade 1×, com as pausas da pontuação. Com movimento reduzido o texto
 * aparece de uma vez, e o modo automático soma este tempo à pausa de leitura: sem ele, a fala some antes de dar
 * tempo de ler.
 */
export function typingMs(text: string): number {
  let ms = (text.length / TYPE_CPS) * 1000
  for (const ch of text) {
    if (SENTENCE_END.has(ch)) ms += SENTENCE_PAUSE_MS
    else if (CLAUSE_END.has(ch)) ms += COMMA_PAUSE_MS
  }
  return ms
}
