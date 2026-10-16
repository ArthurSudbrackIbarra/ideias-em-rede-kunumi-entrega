import { Link } from 'react-router-dom'
import '../sim.css'
import { copy } from '../copy'
import { useTitle } from '../lib/useTitle'
import { useSettings } from '../store/useSettings'
import { ChevronLeft } from './Icons'
import { SettingsPanel } from './SettingsPanel'
import { StatementBody } from './StatementDialog'

/** A declaração de acessibilidade (/acessibilidade): o que funciona, o que ainda não funciona e como avisar. */
export function Statement() {
  useTitle(copy.titles.statement)
  const s = copy.statement
  return (
    <main className="sim sim-statement" id="conteudo" tabIndex={-1} data-testid="statement">
      <div className="sheet">
        <Link to="/" className="back-link">
          <ChevronLeft /> {s.back}
        </Link>
        <h1>{s.title}</h1>
        <p className="lead">{s.lead}</p>
        <button type="button" className="btn primary" onClick={() => useSettings.getState().setOpen(true)} data-testid="open-settings">
          {s.open}
        </button>
        <StatementBody heading="h2" />
      </div>
      <SettingsPanel />
    </main>
  )
}
