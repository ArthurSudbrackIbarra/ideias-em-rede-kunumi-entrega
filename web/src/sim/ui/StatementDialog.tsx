import { copy } from '../copy'
import { Dialog } from './Dialog'

/**
 * A declaração de acessibilidade aberta do painel Acessibilidade, por cima de qualquer tela. Ler não tira a pessoa de
 * onde ela estava: a partida segue parada atrás, e Esc volta ao painel. A página /acessibilidade usa o mesmo texto.
 */
export function StatementDialog({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="sim-backdrop statement-backdrop" onClick={onClose} aria-hidden="true" />
      <Dialog labelledBy="statement-title" onEscape={onClose} className="sim-dock sim-settings sim-statement-dock" testId="statement-dialog">
        <div className="plate dock-head">
          <h2 id="statement-title">{copy.a11y.statement}</h2>
          <button type="button" className="close" onClick={onClose} data-testid="statement-close">
            {copy.statement.backToSettings} <kbd>Esc</kbd>
          </button>
        </div>
        <div className="paper sim-scroll">
          <p className="hint">{copy.statement.lead}</p>
          <StatementBody heading="h3" />
        </div>
      </Dialog>
    </>
  )
}

/** O texto da declaração, o mesmo na página e no diálogo. */
export function StatementBody({ heading: H }: { heading: 'h2' | 'h3' }) {
  const s = copy.statement
  return (
    <>
      <H>{s.supportedTitle}</H>
      <ul>
        {s.supported.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <H>{s.limitsTitle}</H>
      <ul>
        {s.limits.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <H>{s.standardTitle}</H>
      <p>{s.standard}</p>
      <H>{s.contactTitle}</H>
      <p>
        {s.contact}{' '}
        <a href={`https://${s.contactLink}`} rel="noreferrer" target="_blank">
          {s.contactLink} <span className="sr-only">{s.newTab}</span>
        </a>
      </p>
    </>
  )
}
