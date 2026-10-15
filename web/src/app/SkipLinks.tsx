import { useLocation } from 'react-router-dom'
import { copy } from '../sim/copy'
import { announce } from '../sim/lib/announce'
import { useSim } from '../sim/store/useSim'

/**
 * Os primeiros alvos do Tab em toda tela, invisíveis até receberem o foco: pular direto para o conteúdo e, na sala,
 * ligar o modo manual, que é o jeito confortável de jogar com leitor de tela.
 */
export function SkipLinks() {
  const { pathname } = useLocation()
  const autoplay = useSim((s) => s.autoplay)
  const inRoom = pathname.startsWith('/sim/')
  const skip = (e: React.MouseEvent) => {
    e.preventDefault()
    const main = document.getElementById('conteudo')
    main?.focus()
    main?.scrollIntoView({ block: 'start' })
  }
  return (
    <div className="skip-links">
      <a href="#conteudo" onClick={skip} data-testid="skip-link">
        {copy.sr.skip}
      </a>
      {inRoom && autoplay && (
        <button
          type="button"
          onClick={(e) => {
            useSim.getState().setAutoplay(false)
            announce(copy.sr.manualOn)
            skip(e)
          }}
          data-testid="skip-manual"
        >
          {copy.sr.manual}
        </button>
      )}
    </div>
  )
}
