/**
 * Ponte sem re-render entre a cena e o balão em DOM: a câmera projeta a cabeça de quem fala a cada
 * quadro e escreve aqui; o balão lê num requestAnimationFrame próprio e ajusta o estilo direto.
 */
export interface Anchor {
  /** posição em pixels da cabeça do orador na tela */
  x: number
  y: number
  /** a cabeça está dentro do enquadramento */
  onScreen: boolean
  /** ângulo (rad) da direção do orador em relação ao centro da tela, para a seta quando está fora */
  angle: number
  /** há um orador ancorado (false para linhas do jogador e da interface) */
  active: boolean
  width: number
  height: number
}

export const anchor: Anchor = { x: 0, y: 0, onScreen: false, angle: 0, active: false, width: 1, height: 1 }

/**
 * A altura real do topo e da bancada, medida por ResizeObserver: com texto grande as duas crescem, e o balão precisa
 * saber onde começa e onde acaba o espaço livre. Os valores de partida são as alturas do desenho a 100%.
 */
export const hud = { top: 112, rail: 116 }
