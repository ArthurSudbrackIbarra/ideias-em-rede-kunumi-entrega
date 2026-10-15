/**
 * Os atalhos de uma tecla da sala, num lugar só. Toda tecla que é letra, número ou símbolo pode ser trocada ou
 * desligada (WCAG 2.1.4). Enter, Espaço, Esc e as setas ficam fixos: não são atalhos de caractere e têm papel
 * próprio no teclado (ativar, continuar, fechar, virar).
 */

export type KeyAction =
  | 'look'
  | 'desk'
  | 'note'
  | 'original'
  | 'interject'
  | 'treplica'
  | 'autoplay'
  | 'textMode'
  | 'faster'
  | 'slower'
  | 'mute'
  | 'help'
  | 'glossary'
  | 'history'
  | 'sustento'
  | 'contesto'
  | 'cobro'
  | 'clearCite'

/** A ordem em que as ações aparecem na ajuda e no painel de acessibilidade. */
export const KEY_ACTIONS: KeyAction[] = [
  'look', 'desk', 'note', 'original', 'history', 'sustento', 'contesto', 'cobro', 'clearCite', 'treplica', 'interject',
  'autoplay', 'textMode', 'faster', 'slower', 'mute', 'help', 'glossary',
]

export const DEFAULT_KEYS: Record<KeyAction, string[]> = {
  look: ['q', 'e'],
  desk: ['c'],
  note: ['n'],
  original: ['o'],
  interject: ['a'],
  treplica: ['t'],
  autoplay: ['p'],
  textMode: ['v'],
  faster: ['+', '='],
  slower: ['-', '_'],
  mute: ['m'],
  help: ['h', 'l'],
  glossary: ['g'],
  history: ['r'],
  sustento: ['1'],
  contesto: ['2'],
  cobro: ['3'],
  clearCite: ['x'],
}

export type KeyOverrides = Partial<Record<KeyAction, string>>

export function keysOf(action: KeyAction, overrides: KeyOverrides): string[] {
  const o = overrides[action]
  return o ? [o] : DEFAULT_KEYS[action]
}

/** Só letra, número ou símbolo de uma tecla vale como atalho trocável. */
export function isCharacterKey(key: string): boolean {
  return key.length === 1 && key !== ' '
}

export function actionFor(key: string, overrides: KeyOverrides): KeyAction | null {
  const k = key.toLowerCase()
  for (const a of KEY_ACTIONS) if (keysOf(a, overrides).includes(k)) return a
  return null
}

/**
 * Troca a tecla de uma ação. Se outra ação já usava a tecla nova, as duas trocam de lugar, para nenhum atalho ficar
 * com duas ações nem sumir.
 */
export function remap(overrides: KeyOverrides, action: KeyAction, key: string): KeyOverrides {
  const k = key.toLowerCase()
  const next: KeyOverrides = { ...overrides, [action]: k }
  const before = keysOf(action, overrides)[0]
  for (const other of KEY_ACTIONS) {
    if (other === action) continue
    if (keysOf(other, overrides).includes(k)) next[other] = before
  }
  // volta ao padrão quem coincide com ele, para o armazenamento guardar só o que mudou
  for (const a of KEY_ACTIONS) if (next[a] && DEFAULT_KEYS[a].length === 1 && DEFAULT_KEYS[a][0] === next[a]) delete next[a]
  return next
}

/** Como a tecla aparece escrita: letra maiúscula, o sinal de menos tipográfico. */
export function keyLabel(key: string): string {
  if (key === '-' || key === '_') return '−'
  if (key === '=') return '+'
  return key.length === 1 ? key.toUpperCase() : key
}

/** O rótulo de uma ação: "Q E", "N". Os pares "+ =" e "- _" viram um sinal só. */
export function actionLabel(action: KeyAction, overrides: KeyOverrides): string {
  return [...new Set(keysOf(action, overrides).map(keyLabel))].join(' ')
}
