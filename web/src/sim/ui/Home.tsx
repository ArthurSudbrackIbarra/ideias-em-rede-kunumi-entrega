import { Link } from 'react-router-dom'
import '../sim.css'
import { copy } from '../copy'
import { Chevron } from './Icons'

/**
 * A porta de entrada (redesenho, tela 01): apresenta o jogo e tem uma ação só, Jogar. A lista das audiências
 * ganhou tela própria (`Catalog`), porque 206 linhas não cabem ao lado da apresentação.
 */
export function Home() {
  return (
    <main className="sim sim-home" data-testid="home">
      <p className="engrave brand">
        {copy.home.eyebrow}
        <span className="kunumi" role="img" aria-label={copy.home.brand} data-testid="kunumi" />
      </p>
      <h1>
        {copy.home.title}{' '}
        <span className="mark" aria-label={copy.home.titleMark}>
          <span className="a" aria-hidden="true">{copy.home.titleMark}</span>
          <span className="b" aria-hidden="true">{copy.home.titleMarkAlt}</span>
        </span>
      </h1>
      <p className="subtitle">{copy.home.subtitle}</p>
      <p className="lead">{copy.home.lead}</p>
      <Link to="/audiencias" className="play" data-testid="play">
        {copy.home.play} <Chevron size={8} />
      </Link>
      <p className="foot">{copy.home.foot}</p>
    </main>
  )
}
