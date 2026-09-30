/** Todas as constantes de calibragem do simulador, num só lugar (spec v2 §14). */

export const HAND_MAX = 7
export const START_CONVICTION = 50
export const START_PATIENCE = 70
export const START_ATTENTION = 100

export const MOVES_PER_FLOOR = 2
export const MOVES_PER_INTERJECT = 1
export const MAX_INTERJECTS = 2
export const INTERJECT_FAIL_PATIENCE = 10
export const LOW_CONVICTION = 30
export const LOW_PATIENCE = 30

/** vereditos de coerência (spec §7.6) */
export const COERENTE = 8
export const CONTRADICAO = -12
export const NEUTRO = 2
/** sustentar um consenso da sala num tema em que a tese não toma lado (2026-09-15: era 2, igual a NEUTRO) */
export const CONSENSO = 5
/** sustentar ou contestar uma carta que apoia com ressalvas num tema da tese: movimento honesto, ganho pequeno */
export const RESSALVA = 4
/** carta que só informa, mas que o grafo liga ao lado da tese (ou ao outro lado) */
export const EVIDENCIA = 6
export const EVIDENCIA_CONTRA = -6
export const CONSENSO_CONTESTADO = -6
export const CERTEIRO = 6
export const PAR_INVALIDO = -6
export const REPETIDA = -4
export const ALEM_DO_BLOCO = 3
export const COBRO = 6
export const COBRO_CONTRA = -8
export const COBRO_NEUTRO = 3
export const COBRO_JA_RESPONDIDA = -6
export const SALA_RESPONDEU = 2
export const TREPLICA = 5

/** probabilidade de o autor de uma relação reagir de fato (spec §7.7) */
export const REACT_CHANCE: Record<'forte' | 'media', number> = { forte: 0.85, media: 0.6 }
export const APOIO_CARD_CHANCE = 0.5
export const DEFENDE_CHANCE = 0.6
export const CONCORDA_CHANCE = 0.5
export const TREPLICA_WINDOW_S = 6

export const ATTENTION_GAIN = 25 // por segundo, olhando para quem fala
export const ATTENTION_LOSS = 6 // por segundo, olhando para outro lado (~12 s até não conseguir anotar)
export const ATTENTION_MIN_TO_NOTE = 25
export const PATIENCE_RECOVER = 0.6 // por segundo

/** ritmo da digitação e das pausas (spec §9.4) */
export const TYPE_CPS = 38
export const SENTENCE_PAUSE_MS = 240
export const COMMA_PAUSE_MS = 90
export const READ_PAUSE_MS = 600
export const READ_PAUSE_PER_CHAR_MS = 3
export const READ_PAUSE_MAX_MS = 1200
export const MESA_CARD_MS = 1600
export const RELATION_CARD_MS = 1800
export const VERDICT_CHIP_MS = 1800
export const VERDICT_CHIP_LONG_MS = 3000
export const DELTA_LABEL_MS = 1200

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const
export const DEFAULT_SPEED_INDEX = 1 // 0,5× (decisão do autor, 2026-09-13)
export const AUTOPLAY_DEFAULT = true
/** o balão digita a versão em palavras simples por padrão; 'verbatim' digita o original (a outra fica a um clique) */
export const TEXT_MODE_DEFAULT: 'plain' | 'verbatim' = 'plain'

/** sons e prelúdio (spec §19.6, §19.10) */
export const TYPEWRITER_GAIN = 0.15
export const APPLAUSE_GAIN = 0.5
export const PRELUDE_HOLD_MS = 800
export const PRELUDE_FADE_MS = 600
export const PRELUDE_LINE_PAUSE_MS = 350
