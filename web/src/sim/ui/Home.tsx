import { Link } from 'react-router-dom'
import '../sim.css'
import { copy } from '../copy'
import { useTitle } from '../lib/useTitle'
import { useSettings } from '../store/useSettings'
import { Chevron } from './Icons'
import { SettingsPanel } from './SettingsPanel'

/**
 * A porta de entrada (redesenho, tela 01): apresenta o jogo e tem uma ação principal, Jogar. A lista das audiências
 * ganhou tela própria (`Catalog`), porque 206 linhas não cabem ao lado da apresentação. Os ajustes de
 * acessibilidade ficam ao lado de Jogar, para valerem antes da primeira audiência.
 */
export function Home() {
  useTitle(null)
  return (
    <main className="sim sim-home" id="conteudo" tabIndex={-1} data-testid="home">
      <p className="engrave brand">
        {copy.home.eyebrow}
        <span className="kunumi" role="img" aria-label={copy.home.brand} data-testid="kunumi" />
      </p>
      <h1>
        {copy.home.title}{' '}
        <span className="mark">
          <span className="sr-only">{copy.home.titleMark}</span>
          <span className="a" aria-hidden="true">{copy.home.titleMark}</span>
          <span className="b" aria-hidden="true">{copy.home.titleMarkAlt}</span>
        </span>
      </h1>
      <p className="subtitle">{copy.home.subtitle}</p>
      <p className="lead">{copy.home.lead}</p>
      <div className="actions">
        <Link to="/audiencias" className="play" data-testid="play">
          {copy.home.play} <Chevron size={8} />
        </Link>
        <button type="button" className="a11y-btn" onClick={() => useSettings.getState().setOpen(true)} data-testid="open-settings">
          {copy.a11y.open}
        </button>
      </div>
      <p className="foot">
        {copy.home.foot}{' '}
        <Link to="/acessibilidade" className="statement-link">
          {copy.a11y.statement}
        </Link>
      </p>
      <SettingsPanel />
    </main>
  )
}
